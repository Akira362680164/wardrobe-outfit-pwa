import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { RecommendationJobErrorCode, RecommendationJobRunSummary } from "@wardrobe/cloud-contracts";
import { BoundedAsyncQueue } from "./bounded-queue.js";
import { RecommendationGenerationService, RECOMMENDATION_ALGORITHM_VERSION } from "./generation-service.js";
import { RecommendationJobRepository } from "./job-repository.js";

export interface RecommendationTask { userId: string; targetDate: string; asOfDate: string; timezone: string; homePair: boolean; }
export interface WorkerRunResult { acquired: boolean; job: RecommendationJobRunSummary | null; peakQueueSize: number; peakRssBytes: number; }

export class RecommendationWorker {
  private readonly jobs: RecommendationJobRepository;
  private readonly generation: RecommendationGenerationService;
  constructor(private readonly pool: Pool, private readonly capacity = 64) { this.jobs = new RecommendationJobRepository(pool); this.generation = new RecommendationGenerationService(pool); }

  async runOnce(scheduledFor = new Date().toISOString()): Promise<WorkerRunResult> {
    const lock = await this.jobs.tryAcquireGlobalLock();
    if (!lock) return { acquired: false, job: null, peakQueueSize: 0, peakRssBytes: process.memoryUsage().rss };
    const jobId = await this.jobs.start(scheduledFor, RECOMMENDATION_ALGORITHM_VERSION);
    let peakRssBytes = process.memoryUsage().rss;
    const counts = { targetTaskCount: 0, readyCount: 0, fallbackCount: 0, failedCount: 0, errorCodeCounts: {} as Partial<Record<RecommendationJobErrorCode, number>> };
    const queue = new BoundedAsyncQueue<RecommendationTask>(this.capacity);
    try {
      const tasks = await this.selectTasks(new Date(scheduledFor));
      counts.targetTaskCount = tasks.length;
      const homeByUser = new Map<string, RecommendationTask[]>();
      for (const task of tasks.filter((value) => value.homePair)) (homeByUser.get(task.userId) ?? homeByUser.set(task.userId, []).get(task.userId)!).push(task);
      for (const pair of homeByUser.values()) {
        pair.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
        if (pair.length !== 2) { for (const task of pair) await queue.push(task); continue; }
        try {
          const batchId = randomUUID();
          const prepared = await Promise.all(pair.map((task) => this.generation.prepare(task.userId, task.targetDate, task.asOfDate, task.timezone, batchId)));
          if (prepared.some((value) => value.skipReason)) continue;
          const records = await this.generation.persistence.publishHomePair([prepared[0]!.command!, prepared[1]!.command!]);
          for (const record of records) record.readiness === "ready" ? counts.readyCount++ : counts.fallbackCount++;
        } catch { counts.failedCount += 2; increment(counts.errorCodeCounts, "persistence_failed", 2); }
      }
      const consumer = (async () => { for (;;) { const task = await queue.shift(); if (!task) break; try { const record = await this.generation.generateAndPublish(task.userId, task.targetDate, task.asOfDate, task.timezone); if (record) record.readiness === "ready" ? counts.readyCount++ : counts.fallbackCount++; } catch (error) { counts.failedCount++; increment(counts.errorCodeCounts, classify(error)); } peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); } })();
      for (const task of tasks.filter((value) => !value.homePair)) await queue.push(task);
      queue.close();
      await consumer;
      await this.generation.persistence.cleanupExpiredNonCurrent(new Date().toISOString());
      await this.jobs.finish(jobId, counts);
      return { acquired: true, job: await this.jobs.get(jobId), peakQueueSize: queue.peakSize, peakRssBytes };
    } catch { counts.failedCount = Math.max(1, counts.failedCount); increment(counts.errorCodeCounts, "unknown"); await this.jobs.finish(jobId, { ...counts, fatal: true }); return { acquired: true, job: await this.jobs.get(jobId), peakQueueSize: queue.peakSize, peakRssBytes }; }
    finally { await this.jobs.releaseGlobalLock(lock); }
  }

  async selectTasks(now: Date): Promise<RecommendationTask[]> {
    const users = await this.generation.adapter.listEnabledUsers();
    const tasks: RecommendationTask[] = [];
    for (const user of users) {
      const today = dateInZone(now, user.timezone);
      const dates = new Set<string>();
      for (let offset = 0; offset <= 6; offset++) dates.add(addDays(today, offset));
      const trips = await this.pool.query<{ start_date: string; end_date: string }>("select start_date, end_date from trip_plans where user_id = $1 and deleted_at is null and end_date > $2 and start_date is not null and end_date is not null", [user.userId, addDays(today, 6)]);
      for (const trip of trips.rows) for (let date = trip.start_date; date <= trip.end_date && dates.size < 400; date = addDays(date, 1)) dates.add(date);
      for (const targetDate of [...dates].sort()) {
        const context = await this.generation.adapter.load(user.userId, targetDate, today, user.timezone, deterministicTaskId(user.userId, targetDate));
        if (!context.skipReason) tasks.push({ userId: user.userId, targetDate, asOfDate: today, timezone: user.timezone, homePair: targetDate === today || targetDate === addDays(today, 1) });
      }
    }
    return tasks;
  }
}

export function nextShanghaiSchedule(now = new Date()): Date { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now); const map = Object.fromEntries(parts.map((p) => [p.type, p.value])); let target = new Date(`${map.year}-${map.month}-${map.day}T03:30:00+08:00`); if (target <= now) target = new Date(target.getTime() + 86_400_000); return target; }
function dateInZone(value: Date, timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function addDays(date: string, count: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); }
function deterministicTaskId(userId: string, date: string) { return `${userId.slice(0, 8)}-${date.replaceAll("-", "").slice(0, 4)}-5000-8000-${userId.replaceAll("-", "").slice(8, 20)}`; }
function increment(target: Partial<Record<RecommendationJobErrorCode, number>>, code: RecommendationJobErrorCode, amount = 1) { target[code] = (target[code] ?? 0) + amount; }
function classify(error: unknown): RecommendationJobErrorCode { const message = error instanceof Error ? error.message : ""; if (message.includes("weather")) return "weather_unavailable"; if (message.includes("persist") || message.includes("recommendation")) return "persistence_failed"; return "candidate_generation_failed"; }
