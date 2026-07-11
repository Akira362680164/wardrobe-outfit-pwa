import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./lib/fs";
import type { ActionInventoryItem } from "./types";

export type InstrumentationDisposition =
  | "INSERT"
  | "EXISTING"
  | "DYNAMIC_LOOP"
  | "CONFLICT"
  | "UNLOCATABLE";

export interface InstrumentationPlanItem {
  platform: "app" | "mini";
  parityId: string;
  disposition: InstrumentationDisposition;
  source: ActionInventoryItem["source"];
  screenId: string;
  actionIds: string[];
  events: string[];
  handlers: string[];
  tag: string;
  openingTagLine: number;
  insertionColumn: number;
  existingParityId?: string;
  loopEvidence?: string;
  reason?: string;
}

export interface InstrumentationPlan {
  schemaVersion: 1;
  generatedAt: string;
  inventoryFile: string;
  roots: { app: string; mini: string };
  applyRequested: boolean;
  appliedFiles: string[];
  counts: Record<InstrumentationDisposition, number>;
  items: InstrumentationPlanItem[];
  conflicts: InstrumentationPlanItem[];
  dynamicLoops: InstrumentationPlanItem[];
}

interface OpeningTag {
  start: number;
  end: number;
  tag: string;
  raw: string;
}

interface LocatedAction {
  action: ActionInventoryItem;
  file: string;
  text: string;
  offset: number;
  opening: OpeningTag;
}

function offsetAt(text: string, line: number, column: number): number | undefined {
  if (line < 1 || column < 1) return undefined;
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const newline = text.indexOf("\n", offset);
    if (newline < 0) return undefined;
    offset = newline + 1;
  }
  const result = offset + column - 1;
  return result <= text.length ? result : undefined;
}

function openingTagAt(text: string, offset: number): OpeningTag | undefined {
  for (let start = text.lastIndexOf("<", offset); start >= 0; start = text.lastIndexOf("<", start - 1)) {
    if (!/[A-Za-z]/u.test(text[start + 1] ?? "")) continue;
    let quote = "";
    let braces = 0;
    for (let index = start + 1; index < text.length; index += 1) {
      const character = text[index];
      if (quote) {
        if (character === quote && text[index - 1] !== "\\") quote = "";
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      else if (character === "{") braces += 1;
      else if (character === "}") braces = Math.max(0, braces - 1);
      else if (character === ">" && braces === 0) {
        const raw = text.slice(start, index + 1);
        const tag = raw.match(/^<\s*([\w.-]+)/u)?.[1];
        if (tag && offset <= index) return { start, end: index + 1, tag, raw };
        break;
      }
    }
  }
  return undefined;
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function screenSlug(screenId: string): string {
  const value = screenId.replace(/^(?:app|mini)\.(?:route|internal|component)\./u, "");
  return value.replace(/[^a-zA-Z0-9]+/gu, ".").replace(/^\.|\.$/gu, "").toLowerCase() || "unknown";
}

function normalizedTagSignature(opening: OpeningTag, actions: ActionInventoryItem[]): string {
  const eventSignature = actions
    .map((action) => `${action.event}:${action.handler ?? "unknown"}`)
    .sort()
    .join("|");
  return `${opening.tag}|${eventSignature}`;
}

function existingParityId(raw: string): string | undefined {
  return raw.match(/\bdata-parity-id\s*=\s*["']([^"']+)["']/u)?.[1];
}

function dynamicLoop(platform: "app" | "mini", text: string, opening: OpeningTag): string | undefined {
  if (platform === "mini") {
    if (/\bwx:for\s*=/u.test(opening.raw)) return opening.raw.match(/\bwx:for\s*=\s*["'][^"']+["']/u)?.[0] ?? "wx:for";
    const before = text.slice(Math.max(0, opening.start - 4000), opening.start);
    const loopStart = before.lastIndexOf("wx:for=");
    const close = Math.max(before.lastIndexOf("</"), before.lastIndexOf("/>"));
    if (loopStart > close) return "ancestor wx:for (conservative detection)";
    return undefined;
  }
  const before = text.slice(Math.max(0, opening.start - 2000), opening.start);
  const mapIndex = Math.max(before.lastIndexOf(".map("), before.lastIndexOf(".map(("));
  const closeIndex = before.lastIndexOf("})");
  return mapIndex > closeIndex ? ".map(...) JSX body (conservative detection)" : undefined;
}

async function locateActions(actions: ActionInventoryItem[], roots: { app: string; mini: string }): Promise<{
  located: LocatedAction[];
  missing: ActionInventoryItem[];
}> {
  const cache = new Map<string, string>();
  const located: LocatedAction[] = [];
  const missing: ActionInventoryItem[] = [];
  for (const action of actions) {
    const root = action.platform === "app" ? roots.app : roots.mini;
    const file = path.join(root, action.source.file);
    let text = cache.get(file);
    try {
      text ??= await fs.readFile(file, "utf8");
      cache.set(file, text);
    } catch {
      missing.push(action);
      continue;
    }
    const offset = offsetAt(text, action.source.line, action.source.column);
    const opening = offset === undefined ? undefined : openingTagAt(text, offset);
    if (offset === undefined || !opening) missing.push(action);
    else located.push({ action, file, text, offset, opening });
  }
  return { located, missing };
}

/**
 * Produces an auditable, deterministic insertion plan. `apply` is deliberately
 * opt-in; dynamic loop entries are never modified because a constant DOM id
 * would be duplicated at runtime and requires a domain key chosen by a human.
 */
export async function generateInstrumentationPlan(options: {
  inventoryFile: string;
  appRoot: string;
  miniRoot: string;
  outputFile: string;
  apply?: boolean;
}): Promise<InstrumentationPlan> {
  const actions = await readJson<ActionInventoryItem[]>(options.inventoryFile);
  const roots = { app: path.resolve(options.appRoot), mini: path.resolve(options.miniRoot) };
  const { located, missing } = await locateActions(actions, roots);
  const groups = new Map<string, LocatedAction[]>();
  for (const item of located) {
    const key = `${item.action.platform}:${item.file}:${item.opening.start}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const signatureOrdinals = new Map<string, number>();
  const items: InstrumentationPlanItem[] = [];
  for (const group of [...groups.values()].sort((a, b) => a[0].file.localeCompare(b[0].file) || a[0].opening.start - b[0].opening.start)) {
    const first = group[0];
    const groupedActions = group.map((entry) => entry.action).sort((a, b) => a.id.localeCompare(b.id));
    const signature = normalizedTagSignature(first.opening, groupedActions);
    const ordinalKey = `${first.action.platform}:${first.file}:${signature}`;
    const ordinal = (signatureOrdinals.get(ordinalKey) ?? 0) + 1;
    signatureOrdinals.set(ordinalKey, ordinal);
    const relativeFile = path.relative(first.action.platform === "app" ? roots.app : roots.mini, first.file).split(path.sep).join("/");
    const parityId = `parity.${first.action.platform}.${screenSlug(first.action.screenId)}.${shortHash(`${relativeFile}:${signature}:${ordinal}`)}`;
    const existingIds = [...new Set(groupedActions.map((action) => action.parityId).filter((value): value is string => Boolean(value)))];
    const sourceExisting = existingParityId(first.opening.raw);
    if (sourceExisting && !existingIds.includes(sourceExisting)) existingIds.push(sourceExisting);
    const loopEvidence = dynamicLoop(first.action.platform, first.text, first.opening);
    let disposition: InstrumentationDisposition = "INSERT";
    let reason: string | undefined;
    if (existingIds.length > 1) {
      disposition = "CONFLICT";
      reason = `opening tag has multiple inventory parity ids: ${existingIds.join(", ")}`;
    } else if (existingIds.length === 1) {
      disposition = "EXISTING";
    } else if (loopEvidence) {
      disposition = "DYNAMIC_LOOP";
      reason = "constant parity id would be duplicated; add an explicit stable domain key";
    }
    const beforeOpening = first.text.slice(0, first.opening.start);
    const openingTagLine = beforeOpening.split("\n").length;
    const openingLineStart = beforeOpening.lastIndexOf("\n") + 1;
    items.push({
      platform: first.action.platform,
      parityId: existingIds[0] ?? parityId,
      disposition,
      source: first.action.source,
      screenId: first.action.screenId,
      actionIds: groupedActions.map((action) => action.id),
      events: [...new Set(groupedActions.map((action) => action.event))].sort(),
      handlers: [...new Set(groupedActions.map((action) => action.handler ?? "unknown"))].sort(),
      tag: first.opening.tag,
      openingTagLine,
      insertionColumn: first.opening.start - openingLineStart + first.opening.raw.indexOf(first.action.event) + 1,
      existingParityId: existingIds[0],
      loopEvidence,
      reason,
    });
  }
  for (const action of missing) {
    items.push({
      platform: action.platform,
      parityId: `parity.${action.platform}.${screenSlug(action.screenId)}.${shortHash(`${action.source.file}:${action.source.line}:${action.event}:${action.handler ?? "unknown"}`)}`,
      disposition: "UNLOCATABLE",
      source: action.source,
      screenId: action.screenId,
      actionIds: [action.id],
      events: [action.event],
      handlers: [action.handler ?? "unknown"],
      tag: "unknown",
      openingTagLine: action.source.line,
      insertionColumn: action.source.column,
      reason: "inventory source location no longer resolves to an opening tag",
    });
  }

  const duplicateIds = new Map<string, InstrumentationPlanItem[]>();
  for (const item of items) {
    const duplicates = duplicateIds.get(item.parityId) ?? [];
    duplicates.push(item);
    duplicateIds.set(item.parityId, duplicates);
  }
  for (const duplicates of duplicateIds.values()) {
    if (duplicates.length < 2) continue;
    for (const item of duplicates) {
      item.disposition = "CONFLICT";
      item.reason = `parity id is shared by ${duplicates.length} opening tags`;
    }
  }

  const appliedFiles: string[] = [];
  if (options.apply) {
    const insertionsByFile = new Map<string, Array<{ offset: number; value: string }>>();
    for (const group of groups.values()) {
      const first = group[0];
      const planned = items.find((item) => item.actionIds.includes(first.action.id));
      if (planned?.disposition !== "INSERT") continue;
      const insertionOffset = Math.min(...group.map((entry) => entry.offset));
      const edits = insertionsByFile.get(first.file) ?? [];
      edits.push({ offset: insertionOffset, value: `data-parity-id="${planned.parityId}" ` });
      insertionsByFile.set(first.file, edits);
    }
    for (const [file, edits] of insertionsByFile) {
      let text = await fs.readFile(file, "utf8");
      for (const edit of edits.sort((a, b) => b.offset - a.offset)) text = `${text.slice(0, edit.offset)}${edit.value}${text.slice(edit.offset)}`;
      await fs.writeFile(file, text, "utf8");
      appliedFiles.push(file);
    }
  }

  items.sort((a, b) => a.platform.localeCompare(b.platform) || a.source.file.localeCompare(b.source.file) || a.source.line - b.source.line || a.source.column - b.source.column);
  const dispositions: InstrumentationDisposition[] = ["INSERT", "EXISTING", "DYNAMIC_LOOP", "CONFLICT", "UNLOCATABLE"];
  const counts = Object.fromEntries(dispositions.map((value) => [value, items.filter((item) => item.disposition === value).length])) as Record<InstrumentationDisposition, number>;
  const plan: InstrumentationPlan = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inventoryFile: path.resolve(options.inventoryFile),
    roots,
    applyRequested: Boolean(options.apply),
    appliedFiles: appliedFiles.sort(),
    counts,
    items,
    conflicts: items.filter((item) => item.disposition === "CONFLICT"),
    dynamicLoops: items.filter((item) => item.disposition === "DYNAMIC_LOOP"),
  };
  await writeJson(options.outputFile, plan);
  return plan;
}
