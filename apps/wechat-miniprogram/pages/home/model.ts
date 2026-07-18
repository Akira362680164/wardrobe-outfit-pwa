import { wardoraBusinessDate } from "@wardrobe/cloud-contracts";

export interface HomeBusinessWindow {
  today: string;
  tomorrow: string;
  dates: string[];
}

export interface HomeDateItem {
  date: string;
  relativeLabel: string;
  shortDate: string;
  weekday: string;
}

export function homeBusinessWindow(now: Date): HomeBusinessWindow {
  const today = wardoraBusinessDate(now);
  const dates = Array.from({ length: 7 }, (_, index) => addBusinessDays(today, index));
  return { today, tomorrow: dates[1]!, dates };
}

export function buildHomeDateStrip(window: HomeBusinessWindow): HomeDateItem[] {
  return window.dates.map((date, index) => ({
    date,
    relativeLabel: index === 0 ? "今天" : index === 1 ? "明天" : weekday(date),
    shortDate: date.slice(5).replace("-", "/"),
    weekday: weekday(date),
  }));
}

export function buildHomeGreeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai", hour: "2-digit", hourCycle: "h23",
  }).format(now));
  if (hour < 11) return "早上好，今天穿得轻松一点";
  if (hour < 14) return "中午好，今天穿得自在一点";
  if (hour < 18) return "下午好，今天穿得从容一点";
  return "晚上好，明天也穿得轻松一点";
}

export function formatHomeBusinessDate(date: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "short",
  }).format(new Date(`${date}T12:00:00+08:00`));
}

export function buildHomeLocationLabel(location?: { displayName: string; source: "travel" | "temporary_override" | "home_city" }): string {
  if (!location) return "未设置城市";
  const source = location.source === "travel" ? "行程" : location.source === "temporary_override" ? "临时" : "常驻";
  return `${location.displayName} · ${source}`;
}

export interface HomeGenerationTicket {
  readonly generation: number;
  readonly accountId: string;
  readonly date: string;
  readonly signal: AbortSignal;
}

export class HomeGenerationGate {
  private generation = 0;
  private accountId = "";
  private controller: AbortController | null = null;

  begin(accountId: string, date: string): HomeGenerationTicket {
    this.controller?.abort();
    this.controller = new AbortController();
    this.accountId = accountId;
    return { generation: ++this.generation, accountId, date, signal: this.controller.signal };
  }

  reset(accountId = ""): void {
    this.controller?.abort();
    this.controller = null;
    this.accountId = accountId;
    this.generation += 1;
  }

  isCurrent(ticket: HomeGenerationTicket): boolean {
    return ticket.generation === this.generation && ticket.accountId === this.accountId;
  }
}

export interface StableMutationSession<T extends object> {
  idFor(draft: T): string;
  confirm(draft: T): void;
  clear(): void;
}

export function createStableMutationSession<T extends object>(createId: () => string = createUuid): StableMutationSession<T> {
  const pending = new Map<string, string>();
  const keyOf = (draft: T) => stableStringify(draft);
  return {
    idFor(draft) {
      const key = keyOf(draft);
      const current = pending.get(key);
      if (current) return current;
      const created = createId();
      pending.set(key, created);
      return created;
    },
    confirm(draft) { pending.delete(keyOf(draft)); },
    clear() { pending.clear(); },
  };
}

export function shouldRequestMiniLocationPermission(input: {
  sheetOpened: boolean;
  purposeSeen: boolean;
  userTappedUseCurrent: boolean;
}): boolean {
  return input.sheetOpened && input.purposeSeen && input.userTappedUseCurrent;
}

function addBusinessDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return wardoraBusinessDate(value);
}

function weekday(date: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" })
    .format(new Date(`${date}T12:00:00+08:00`));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function createUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 3) | 8).toString(16);
  });
}
