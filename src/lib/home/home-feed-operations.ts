import type { WeatherLocationRef } from "@wardrobe/cloud-contracts";

import { OnlineRequestError, onlineErrorMessage } from "@/lib/online/online-error";

export type HomeLocationAction = "home" | "temporary" | "clear_home" | "clear_temporary";

export interface HomeLocationCommand {
  accountId: string;
  sessionId: string;
  action: HomeLocationAction;
  locationId?: string;
  expectedRevision: number;
}

export interface HomeLocationMutationTicket {
  readonly command: HomeLocationCommand;
  readonly clientMutationId: string;
  readonly generation: number;
}

export class HomeLocationMutationSession {
  private generation = 0;
  private pending: HomeLocationMutationTicket | null = null;

  constructor(private readonly createId: () => string = defaultMutationId) {}

  begin(command: HomeLocationCommand): HomeLocationMutationTicket {
    if (this.pending && commandKey(this.pending.command) === commandKey(command)) return this.pending;
    this.pending = { command: { ...command }, clientMutationId: this.createId(), generation: ++this.generation };
    return this.pending;
  }

  isCurrent(ticket: HomeLocationMutationTicket): boolean {
    return this.pending === ticket && ticket.generation === this.generation;
  }

  complete(command: HomeLocationCommand): void {
    if (this.pending && commandKey(this.pending.command) === commandKey(command)) {
      this.pending = null;
      this.generation += 1;
    }
  }

  reset(): void {
    this.pending = null;
    this.generation += 1;
  }
}

export async function commitHomeLocation<T>({ session, command, mutate, readLatest, signal }: {
  session: HomeLocationMutationSession;
  command: HomeLocationCommand;
  mutate: (clientMutationId: string, signal: AbortSignal) => Promise<T>;
  readLatest: (signal: AbortSignal) => Promise<T>;
  signal: AbortSignal;
}): Promise<{ status: "committed" | "conflict"; snapshot: T } | { status: "conflict_unresolved"; error: unknown } | { status: "stale" }> {
  const ticket = session.begin(command);
  try {
    const snapshot = await mutate(ticket.clientMutationId, signal);
    if (signal.aborted || !session.isCurrent(ticket)) return { status: "stale" };
    session.complete(command);
    return { status: "committed", snapshot };
  } catch (error) {
    if (signal.aborted || !session.isCurrent(ticket)) return { status: "stale" };
    if (!(error instanceof OnlineRequestError) || error.status !== 409) throw error;
    let snapshot: T;
    try {
      snapshot = await readLatest(signal);
    } catch (readError) {
      if (signal.aborted || !session.isCurrent(ticket)) return { status: "stale" };
      return { status: "conflict_unresolved", error: readError };
    }
    if (signal.aborted || !session.isCurrent(ticket)) return { status: "stale" };
    session.complete(command);
    return { status: "conflict", snapshot };
  }
}

export type HomeCitySearchState =
  | { status: "idle"; query: string; candidates: readonly WeatherLocationRef[] }
  | { status: "loading"; query: string; candidates: readonly WeatherLocationRef[] }
  | { status: "ready"; query: string; candidates: readonly WeatherLocationRef[]; cached: boolean }
  | { status: "error"; query: string; candidates: readonly WeatherLocationRef[]; message: string }
  | { status: "rate_limited"; query: string; candidates: readonly WeatherLocationRef[]; message: string; retryAfterSeconds?: number };

interface HomeCitySearchOptions {
  request: (query: string, signal: AbortSignal) => Promise<readonly WeatherLocationRef[]>;
  onState: (state: HomeCitySearchState) => void;
  delayMs?: number;
}

export class HomeCitySearchSession {
  private accountId = "";
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private cache = new Map<string, readonly WeatherLocationRef[]>();
  private composing = false;
  private latestRawQuery = "";

  constructor(private readonly options: HomeCitySearchOptions) {}

  update(accountId: string, rawQuery: string, composing = this.composing): void {
    if (accountId !== this.accountId) this.reset(accountId);
    this.latestRawQuery = rawQuery;
    this.composing = composing;
    this.cancelPending();
    const query = normalizeHomeCityQuery(rawQuery);
    if (!query) this.cache.clear();
    if (composing || Array.from(query).length < 2) {
      this.options.onState({ status: "idle", query, candidates: [] });
      return;
    }
    const cached = this.cache.get(query);
    if (cached) {
      this.options.onState({ status: "ready", query, candidates: cached, cached: true });
      return;
    }
    const generation = ++this.generation;
    this.timer = setTimeout(() => void this.run(query, generation), this.options.delayMs ?? 400);
  }

  startComposition(): void {
    this.composing = true;
    this.cancelPending();
  }

  endComposition(accountId: string, rawQuery = this.latestRawQuery): void {
    this.composing = false;
    this.update(accountId, rawQuery, false);
  }

  reset(accountId = ""): void {
    this.cancelPending();
    this.accountId = accountId;
    this.latestRawQuery = "";
    this.composing = false;
    this.cache.clear();
    this.generation += 1;
    this.options.onState({ status: "idle", query: "", candidates: [] });
  }

  dispose(): void {
    this.cancelPending();
    this.cache.clear();
    this.generation += 1;
  }

  private cancelPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
    this.generation += 1;
  }

  private async run(query: string, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    this.timer = null;
    const controller = new AbortController();
    this.controller = controller;
    this.options.onState({ status: "loading", query, candidates: [] });
    try {
      const candidates = await this.options.request(query, controller.signal);
      if (controller.signal.aborted || generation !== this.generation) return;
      this.cache.set(query, candidates);
      this.options.onState({ status: "ready", query, candidates, cached: false });
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) return;
      if (error instanceof OnlineRequestError && error.status === 429) {
        this.options.onState({ status: "rate_limited", query, candidates: [], message: error.message, retryAfterSeconds: error.retryAfterSeconds });
      } else {
        this.options.onState({ status: "error", query, candidates: [], message: onlineErrorMessage(error) });
      }
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }
}

export async function loadHomeWeatherDates<T>(
  dates: readonly string[],
  read: (date: string) => Promise<T>,
  onSettled?: (date: string, result: { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown }) => void,
): Promise<{
  values: Map<string, T>;
  errors: Map<string, unknown>;
}> {
  const settled = await Promise.allSettled(dates.map(async (date) => {
    try {
      const value = await read(date);
      onSettled?.(date, { status: "fulfilled", value });
      return [date, value] as const;
    } catch (reason) {
      onSettled?.(date, { status: "rejected", reason });
      throw reason;
    }
  }));
  const values = new Map<string, T>();
  const errors = new Map<string, unknown>();
  settled.forEach((result, index) => {
    const date = dates[index]!;
    if (result.status === "fulfilled") values.set(result.value[0], result.value[1]);
    else errors.set(date, result.reason);
  });
  return { values, errors };
}

export function normalizeHomeCityQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function commandKey(command: HomeLocationCommand): string {
  return JSON.stringify([command.accountId, command.sessionId, command.action, command.locationId ?? null, command.expectedRevision]);
}

function defaultMutationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${String(Date.now()).padStart(12, "0").slice(-12)}`;
}
