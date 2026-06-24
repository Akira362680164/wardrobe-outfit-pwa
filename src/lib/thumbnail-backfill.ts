// src/lib/thumbnail-backfill.ts
// ============================================================
// 缩略图后台回填队列 (v0.9.43-dev, 批次 4 老数据回填)
// ------------------------------------------------------------
// 用途: 为已录入但没有 thumbnail 的衣物和参考图建立后台回填队列。
//
// 设计 (按批次 4 提示词包 §3):
// - 内存单例队列 (本批不建 Dexie jobs 表, 避免 schema 升级)
// - 一次只处理 1 张, 串行 (避免并发生成多张炸内存)
// - 每张之间 sleep 200-500ms (默认 300ms, 移动端可调)
// - document.hidden 时暂停 (App 切后台节能)
// - 失败写 status="failed", 本 session 内不再重试 (除非调 retryFailed)
// - 队列去重 (按 itemId+refId+kind 唯一标识)
// - 写回 Dexie 不动业务 updatedAt (只 update 缩略图字段)
// - 不依赖 React, 模块级单例, 组件用 subscribe() 订阅 state
//
// v1.1.16 commit3 提示词 §5.4.2:
// - state 新增 failedItems 数组 (id / name / kind / errorMessage / failedAt)
// - failed 计数恒等于 failedItems.length
// - 新增 retryFailed() 只重试失败项
// - reset() 清空失败明细
// ============================================================

import {
  CURRENT_THUMBNAIL_VERSION,
  type ReferenceOutfitImage,
  type ThumbnailStatus,
  type WardrobeItem,
} from "@/lib/types";
import { generateThumbnailSafe } from "@/lib/thumbnail-runtime";
import { getWardrobeDb } from "@/lib/db";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";

export type ThumbnailJob =
  | { kind: "item"; itemId: number; sourceDataUrl: string; enqueuedAt: number }
  | { kind: "reference"; itemId: number; refId: string; sourceDataUrl: string; enqueuedAt: number };

export type BackfillStatus = "idle" | "running" | "paused" | "cancelling" | "done";

export interface BackfillFailedItem {
  /** 唯一键: item:<id> 或 ref:<itemId>:<refId> */
  key: string;
  /** 衣物 id (主图 = itemId; 参考图 = 所属 itemId) */
  id: number;
  /** 衣物名称 (UI 展示) */
  name: string;
  /** 主图 (main) 或 灵感图/参考图 (reference) */
  kind: "main" | "reference";
  /** 用户可读的失败原因 */
  errorMessage: string;
  /** 失败时间 (ISO 字符串) */
  failedAt: string;
}

export interface BackfillState {
  status: BackfillStatus;
  /** 队列里剩余待处理 + 当前正在处理的 (1) = 总数 */
  total: number;
  /** 已处理 (包括失败) 累计 */
  processed: number;
  /** 失败累计 (恒等于 failedItems.length) */
  failed: number;
  /** 当前正在处理的 job (无则 null) */
  currentJob: ThumbnailJob | null;
  /** 本次 backfill 起始时间 ISO 字符串 (用于 UI 显示) */
  startedAt: string | null;
  /** 本次 (含历史) 失败明细 (UI 展示前 3 条 + 总数) */
  failedItems: BackfillFailedItem[];
}

const INITIAL_STATE: BackfillState = {
  status: "idle",
  total: 0,
  processed: 0,
  failed: 0,
  currentJob: null,
  startedAt: null,
  failedItems: [],
};

function jobKey(job: ThumbnailJob): string {
  return job.kind === "item"
    ? `item:${job.itemId}`
    : `ref:${job.itemId}:${job.refId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.setTimeout === "function") {
      globalThis.setTimeout(resolve, ms);
      return;
    }
    resolve();
  });
}

class ThumbnailBackfill {
  private queue: ThumbnailJob[] = [];
  private pendingKeys = new Set<string>();
  /** 失败的 job key 本 session 内不再重试 (避免无限循环), retryFailed() 时清空 */
  private failedThisSession = new Set<string>();
  /** 失败明细: job key → 失败信息 (供 UI 展示) */
  private failedItemsByKey = new Map<string, BackfillFailedItem>();
  private state: BackfillState = { ...INITIAL_STATE };
  private listeners = new Set<(state: BackfillState) => void>();
  private runPromise: Promise<void> | null = null;
  private pauseRequested = false;
  private cancelRequested = false;
  private sleepMs = 300;
  /** 衣物 id → 名称 的快照 (失败时用于 UI 展示衣物名) */
  private itemNameById = new Map<number, string>();

  /** 当前 state (快照) */
  getState(): BackfillState {
    return { ...this.state, failedItems: [...this.state.failedItems] };
  }

  /** 订阅 state 变化 */
  subscribe(listener: (state: BackfillState) => void): () => void {
    this.listeners.add(listener);
    // 立即推一次当前 state
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // 监听器异常不影响主流程
      }
    }
  }

  /**
   * 入队一个 job。已经在队列 / 已失败过 / 已完成 → 跳过。
   */
  enqueue(job: ThumbnailJob): void {
    const key = jobKey(job);
    if (this.pendingKeys.has(key)) return;
    if (this.failedThisSession.has(key)) return;
    this.pendingKeys.add(key);
    this.queue.push(job);
    this.state = {
      ...this.state,
      total: this.state.processed + this.queue.length,
    };
    this.notify();
  }

  /**
   * 扫描一批衣物, 对所有缺缩略图的主图 + 参考图入队。
   * - 不会重复入队 (enqueue 内部 dedupe)
   * - 不会触发自动 start (caller 决定何时启动)
   * - 会同时建立 itemNameById 快照, 供失败 UI 展示衣物名
   */
  enqueueVisibleItems(items: ReadonlyArray<WardrobeItem>): void {
    for (const item of items) {
      if (!item || typeof item.id !== "number") continue;
      // 记录衣物名快照, 供失败时 UI 展示
      this.itemNameById.set(item.id, item.name ?? "未命名衣物");
      if (!item.thumbnailDataUrl
        || item.thumbnailVersion !== CURRENT_THUMBNAIL_VERSION
        || item.thumbnailStatus === "failed") {
        this.enqueue({
          kind: "item",
          itemId: item.id,
          sourceDataUrl: item.imageDataUrl,
          enqueuedAt: Date.now(),
        });
      }
      const refs = Array.isArray(item.referenceOutfitImages) ? item.referenceOutfitImages : [];
      for (const ref of refs) {
        if (!ref || !ref.imageDataUrl) continue;
        if (!ref.thumbnailDataUrl
          || ref.thumbnailVersion !== CURRENT_THUMBNAIL_VERSION
          || ref.thumbnailStatus === "failed") {
          this.enqueue({
            kind: "reference",
            itemId: item.id,
            refId: ref.id,
            sourceDataUrl: ref.imageDataUrl,
            enqueuedAt: Date.now(),
          });
        }
      }
    }
  }

  /**
   * 启动后台 worker 处理队列 (如果未启动)。
   * - 如果已经在 running, no-op
   * - 如果是 idle / done, 重置 processed/failed/start 字段, 重新计数
   * - 注意: startBackfillAll() **不**清空 failedItems 列表 (用户需要看历史失败明细);
   *         新增的失败会追加到 failedItems 末尾; 若想清空请先调 reset()。
   */
  startBackfillAll(items: ReadonlyArray<WardrobeItem>): void {
    if (this.state.status === "running") return;
    // 重置失败表 (新一次 backfill 允许重试上次失败的)
    this.failedThisSession.clear();
    this.queue = [];
    this.pendingKeys.clear();
    this.enqueueVisibleItems(items);
    if (this.queue.length === 0) {
      // 没东西可做
      this.state = {
        ...this.state,
        status: "done",
        total: 0,
        processed: 0,
        failed: this.state.failedItems.length,
        currentJob: null,
        startedAt: new Date().toISOString(),
      };
      this.notify();
      return;
    }
    this.state = {
      ...INITIAL_STATE,
      status: "running",
      total: this.queue.length,
      startedAt: new Date().toISOString(),
      // 保留历史失败明细 (例如上一次跑剩下没成功的)
      failedItems: [...this.state.failedItems],
    };
    this.pauseRequested = false;
    this.cancelRequested = false;
    this.notify();
    this.runPromise = this.runLoop();
  }

  /**
   * v1.1.16 commit3 §5.4.2: 只重试失败项。
   * 把 failedItems 全部重新入队, 启动 worker。
   * 若当前已是 running, 入队但不起新 loop (runLoop 会消费)。
   * 衣物名 snapshot 来自 itemNameById; 若没有, 给 "未命名衣物" 兜底。
   */
  retryFailed(items: ReadonlyArray<WardrobeItem>): void {
    // 先用最新 items 更新衣物名 snapshot (用户可能改了名)
    for (const item of items) {
      if (item && typeof item.id === "number") {
        this.itemNameById.set(item.id, item.name ?? "未命名衣物");
      }
    }
    const failedKeys = Array.from(this.failedItemsByKey.keys());
    if (failedKeys.length === 0) {
      // 没有失败项, 直接当 done
      this.state = {
        ...this.state,
        status: "done",
        total: 0,
        processed: 0,
        failed: 0,
        currentJob: null,
        startedAt: new Date().toISOString(),
      };
      this.notify();
      return;
    }
    // 清空失败明细, 把对应 job 重新入队
    this.failedItemsByKey.clear();
    this.failedThisSession.clear();
    this.queue = [];
    this.pendingKeys.clear();
    for (const key of failedKeys) {
      const rec = this.findJobRecordByKey(key, items);
      if (rec) {
        this.enqueue(rec);
      }
    }
    if (this.queue.length === 0) {
      this.state = {
        ...this.state,
        status: "done",
        total: 0,
        processed: 0,
        failed: 0,
        currentJob: null,
        startedAt: new Date().toISOString(),
      };
      this.notify();
      return;
    }
    this.state = {
      ...this.state,
      status: "running",
      total: this.queue.length,
      processed: 0,
      failed: 0,
      currentJob: null,
      startedAt: new Date().toISOString(),
      failedItems: [],
    };
    this.pauseRequested = false;
    this.cancelRequested = false;
    if (!this.runPromise) {
      this.runPromise = this.runLoop();
    }
    this.notify();
  }

  retryFailedKey(items: ReadonlyArray<WardrobeItem>, key: string): void {
    const failed = this.failedItemsByKey.get(key);
    if (!failed) return;
    for (const item of items) {
      if (item && typeof item.id === "number") {
        this.itemNameById.set(item.id, item.name ?? "未命名衣物");
      }
    }
    const rec = this.findJobRecordByKey(key, items);
    if (!rec) return;
    this.failedItemsByKey.delete(key);
    this.failedThisSession.delete(key);
    this.queue = [];
    this.pendingKeys.clear();
    this.enqueue(rec);
    this.state = {
      ...INITIAL_STATE,
      status: "running",
      total: this.queue.length,
      startedAt: new Date().toISOString(),
      failedItems: Array.from(this.failedItemsByKey.values()),
      failed: this.failedItemsByKey.size,
    };
    this.pauseRequested = false;
    this.cancelRequested = false;
    this.notify();
    this.runPromise = this.runLoop();
  }

  /** 通过 job key 从 items 列表里找到对应的 ThumbnailJob */
  private findJobRecordByKey(key: string, items: ReadonlyArray<WardrobeItem>): ThumbnailJob | null {
    if (key.startsWith("item:")) {
      const id = Number(key.slice("item:".length));
      if (!Number.isFinite(id)) return null;
      const item = items.find((i) => i.id === id);
      if (!item) return null;
      return {
        kind: "item",
        itemId: id,
        sourceDataUrl: item.imageDataUrl,
        enqueuedAt: Date.now(),
      };
    }
    if (key.startsWith("ref:")) {
      const rest = key.slice("ref:".length);
      const colonIdx = rest.indexOf(":");
      if (colonIdx < 0) return null;
      const itemId = Number(rest.slice(0, colonIdx));
      const refId = rest.slice(colonIdx + 1);
      if (!Number.isFinite(itemId)) return null;
      const item = items.find((i) => i.id === itemId);
      if (!item || !Array.isArray(item.referenceOutfitImages)) return null;
      const ref = item.referenceOutfitImages.find((r) => r.id === refId);
      if (!ref || !ref.imageDataUrl) return null;
      return {
        kind: "reference",
        itemId,
        refId,
        sourceDataUrl: ref.imageDataUrl,
        enqueuedAt: Date.now(),
      };
    }
    return null;
  }

  pause(): void {
    if (this.state.status !== "running") return;
    this.pauseRequested = true;
    this.state = { ...this.state, status: "paused" };
    this.notify();
  }

  resume(): void {
    if (this.state.status !== "paused") return;
    this.pauseRequested = false;
    this.state = { ...this.state, status: "running" };
    this.notify();
  }

  cancel(): void {
    if (this.state.status === "idle" || this.state.status === "done") return;
    this.cancelRequested = true;
    this.state = { ...this.state, status: "cancelling" };
    this.notify();
  }

  /**
   * v1.1.16 commit3 §5.4.2: UI 主动调, 提示"已完成, 可以重置"。
   * 同时清空失败明细 (reset 语义 = 完全清空, 含 failedItems)。
   */
  reset(): void {
    this.queue = [];
    this.pendingKeys.clear();
    this.failedThisSession.clear();
    this.failedItemsByKey.clear();
    this.itemNameById.clear();
    this.state = { ...INITIAL_STATE };
    this.notify();
  }

  private async runLoop(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        if (this.cancelRequested) {
          this.queue = [];
          break;
        }
        if (this.pauseRequested) {
          await sleep(500);
          continue;
        }
        if (typeof document !== "undefined" && document.hidden) {
          // App 切后台 → 暂停 + 降低频率
          this.pauseRequested = true;
          this.state = { ...this.state, status: "paused" };
          this.notify();
          continue;
        }
        const job = this.queue.shift()!;
        this.pendingKeys.delete(jobKey(job));
        this.state = { ...this.state, currentJob: job };
        this.notify();
        const result = await this.processJob(job);
        const ok = result.ok;
        if (!ok) {
          // 记录失败明细 (用于 UI 展示)
          const key = jobKey(job);
          const failedAt = new Date().toISOString();
          const name = this.itemNameById.get(job.itemId) ?? "未命名衣物";
          const failedItem: BackfillFailedItem = {
            key,
            id: job.itemId,
            name,
            kind: job.kind === "item" ? "main" : "reference",
            errorMessage: result.errorMessage,
            failedAt,
          };
          // 同 key 已存在时替换 (不重复计数)
          this.failedItemsByKey.set(key, failedItem);
          this.failedThisSession.add(key);
          const failedItems = Array.from(this.failedItemsByKey.values());
          this.state = {
            ...this.state,
            processed: this.state.processed + 1,
            failed: failedItems.length,
            currentJob: null,
            failedItems,
          };
        } else {
          // 成功: 如果之前在失败列表里, 这次成功了就移除 (UI 不再显示)
          const key = jobKey(job);
          if (this.failedItemsByKey.has(key)) {
            this.failedItemsByKey.delete(key);
            this.failedThisSession.delete(key);
          }
          const failedItems = Array.from(this.failedItemsByKey.values());
          this.state = {
            ...this.state,
            processed: this.state.processed + 1,
            failed: failedItems.length,
            currentJob: null,
            failedItems,
          };
        }
        this.notify();
        await sleep(this.sleepMs);
      }
      this.state = {
        ...this.state,
        status: this.cancelRequested ? "idle" : "done",
        currentJob: null,
        total: this.state.processed,
      };
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[ThumbnailBackfill] runLoop 异常:", err);
      }
      this.state = { ...this.state, status: "idle", currentJob: null };
    } finally {
      this.runPromise = null;
      this.pauseRequested = false;
      this.cancelRequested = false;
      this.notify();
    }
  }

  private async processJob(job: ThumbnailJob): Promise<{ ok: boolean; errorMessage: string }> {
    try {
      if (typeof job.sourceDataUrl !== "string" || !job.sourceDataUrl) {
        return { ok: false, errorMessage: "源图 dataURL 为空" };
      }
      const thumb = await generateThumbnailSafe(job.sourceDataUrl);
      if (thumb.thumbnailStatus !== "ready" || !thumb.thumbnailDataUrl) {
        await this.markJobFailed(job);
        recordDiagnosticEvent("thumbnail_backfill_failed", {
          key: jobKey(job),
          itemId: job.itemId,
          kind: job.kind,
          error: thumb.errorMessage ?? "缩略图生成失败",
        });
        return {
          ok: false,
          errorMessage: thumb.errorMessage ?? "缩略图生成失败",
        };
      }
      const url = thumb.thumbnailDataUrl;
      const now = new Date().toISOString();
      const db = getWardrobeDb();
      const patch: Partial<WardrobeItem> = {
        thumbnailDataUrl: url,
        thumbnailVersion: thumb.thumbnailVersion ?? CURRENT_THUMBNAIL_VERSION,
        thumbnailUpdatedAt: thumb.thumbnailUpdatedAt ?? now,
        thumbnailStatus: "ready" as ThumbnailStatus,
      };
      if (job.kind === "item") {
        // v0.9.43-dev 批次 4 §4: 写回不改变业务 updatedAt (Dexie update 只覆盖传入字段)
        await db.items.update(job.itemId, patch);
        return { ok: true, errorMessage: "" };
      }
      // reference: 重新读最新 item, 替换对应 ref, 写回数组
      // 避免覆盖用户同时编辑的其他字段
      const item = await db.items.get(job.itemId);
      if (!item) return { ok: false, errorMessage: "衣物已被删除, 无法写回" };
      const refs: ReferenceOutfitImage[] = Array.isArray(item.referenceOutfitImages)
        ? [...item.referenceOutfitImages]
        : [];
      let updated = false;
      for (let i = 0; i < refs.length; i++) {
        if (refs[i] && refs[i]!.id === job.refId) {
          refs[i] = {
            ...refs[i]!,
            thumbnailDataUrl: url,
            thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
            thumbnailUpdatedAt: now,
            thumbnailStatus: "ready" as ThumbnailStatus,
          };
          updated = true;
          break;
        }
      }
      if (!updated) return { ok: false, errorMessage: "参考图已被删除, 无法写回" };
      await db.items.update(job.itemId, { referenceOutfitImages: refs });
      return { ok: true, errorMessage: "" };
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn(`[ThumbnailBackfill] job 失败 (${job.kind} ${job.itemId}):`, err);
      }
      await this.markJobFailed(job);
      recordDiagnosticEvent("thumbnail_backfill_failed", {
        key: jobKey(job),
        itemId: job.itemId,
        kind: job.kind,
        error: err instanceof Error ? err.message : String(err),
      });
      // 转成用户可读错误 (不含完整 stack)
      const raw = err instanceof Error ? err.message : String(err);
      const firstLine = raw.split("\n")[0]?.trim() ?? "未知错误";
      const tag = classifyJobError(firstLine);
      const errorMessage = tag === "decode"
        ? `图片解码失败 (${firstLine})`
        : tag === "draw"
          ? `画布绘制失败 (${firstLine})`
          : tag === "encode"
            ? `图片编码失败 (${firstLine})`
            : `缩略图生成失败 (${firstLine})`;
      return { ok: false, errorMessage };
    }
  }

  private async markJobFailed(job: ThumbnailJob): Promise<void> {
    try {
      const db = getWardrobeDb();
      if (job.kind === "item") {
        await db.items.update(job.itemId, { thumbnailStatus: "failed" as ThumbnailStatus });
        return;
      }
      const item = await db.items.get(job.itemId);
      if (item && Array.isArray(item.referenceOutfitImages)) {
        const refs = item.referenceOutfitImages.map((r) => r.id === job.refId
          ? { ...r, thumbnailStatus: "failed" as ThumbnailStatus }
          : r);
        await db.items.update(job.itemId, { referenceOutfitImages: refs });
      }
    } catch {
      // 写回失败不影响队列继续处理下一项。
    }
  }
}

function classifyJobError(msg: string): "decode" | "draw" | "encode" | "other" {
  if (/image-variants:\s*无法获取 canvas|drawImage|encodeVariant.*draw/i.test(msg)) {
    return "draw";
  }
  if (/image-variants:\s*目标尺寸|image-variants:\s*不支持|image-variants:\s*当前环境|ImageBitmap|createImageBitmap|HTMLImageElement|HTMLCanvasElement|image-variants:\s*未提供/i.test(msg)) {
    return "decode";
  }
  if (/image-variants:\s*输出|encodeVariant|toBlob|toDataURL|image-variants:\s*画布|image-variants:\s*转换|webp/i.test(msg)) {
    return "encode";
  }
  return "other";
}

/** 模块级单例, 整个 App 共享一个回填队列 */
export const backfill = new ThumbnailBackfill();

/** 给 React 组件用的 hook (放这里方便未来加; 当前 wardrobe-app.tsx 内联实现) */
export function useBackfillState(): BackfillState {
  // 注: React useState 必须在 React 组件内调用, 这里只是占位类型注解
  // 实际使用: const [state, setState] = useState(backfill.getState());
  //          useEffect(() => backfill.subscribe(setState), []);
  return INITIAL_STATE;
}
