import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { lineColumn, listFiles, relativePosix } from "../lib/fs";
import { slug } from "../lib/ids";
import type {
  ActionInventoryItem,
  InventoryBundle,
  OverlayInventoryItem,
  ScreenInventoryItem,
  SideEffectInventoryItem,
  SideEffectType,
  TransitionInventoryItem,
  TransitionType,
  UnresolvedInventoryItem,
} from "../types";
import { callName, dedupeById, expressionText, inferScriptKind, screenIdForFile, sourceId, tsLocation } from "./shared";

const WXML_EVENT_PATTERN = /^(?:bind|catch):?[a-z][a-z0-9-]*$/u;

function miniTransitionType(name: string): TransitionType | undefined {
  if (name === "wx.navigateTo") return "push";
  if (name === "wx.redirectTo") return "replace";
  if (name === "wx.switchTab") return "tab";
  if (name === "wx.reLaunch") return "reset";
  if (name === "wx.navigateBack") return "pop";
  return undefined;
}

function miniSideEffectType(name: string): SideEffectType | undefined {
  if (name === "wx.uploadFile" || /upload|asset.*create/i.test(name)) return "OBJECT_UPLOAD";
  if (/diagnos|generate|recogn|suggest|advice|job|ai/i.test(name)) return "ASYNC_JOB";
  if (name === "wx.request") return "BACKEND_READ";
  if (/create|update|delete|remove|archive|restore|save|submit|mutate/i.test(name)) return "BACKEND_WRITE";
  return undefined;
}

function pageScreenId(route: string): string {
  return `mini.route.${slug(route)}`;
}

async function registeredPages(root: string): Promise<Array<{ route: string; sourceFile: string }>> {
  const appJsonPath = path.join(root, "app.json");
  const appJson = JSON.parse(await fs.readFile(appJsonPath, "utf8")) as {
    pages?: string[];
    subPackages?: Array<{ root: string; pages: string[] }>;
  };
  const pages = (appJson.pages ?? []).map((route) => ({ route, sourceFile: "app.json" }));
  for (const subPackage of appJson.subPackages ?? []) {
    for (const page of subPackage.pages) {
      pages.push({ route: `${subPackage.root.replace(/\/$/u, "")}/${page}`, sourceFile: "app.json" });
    }
  }
  return pages;
}

function routeForFile(miniRoot: string, file: string): string | undefined {
  const relative = relativePosix(miniRoot, file);
  const match = relative.match(/^(.*)\/index\.(?:wxml|ts)$/u);
  return match?.[1];
}

function extractOpeningTags(text: string): Array<{ index: number; raw: string; tag: string; attributesText: string }> {
  const output: Array<{ index: number; raw: string; tag: string; attributesText: string }> = [];
  for (let start = text.indexOf("<"); start >= 0; start = text.indexOf("<", start + 1)) {
    if (text.startsWith("<!--", start)) {
      const commentEnd = text.indexOf("-->", start + 4);
      if (commentEnd < 0) break;
      start = commentEnd + 2;
      continue;
    }
    const next = text[start + 1];
    if (!next || next === "/" || next === "!" || next === "?") continue;
    let quote = "";
    let end = start + 1;
    for (; end < text.length; end += 1) {
      const character = text[end];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }
    if (end >= text.length) break;
    const raw = text.slice(start, end + 1);
    const match = raw.match(/^<([\w-]+)\b([\s\S]*?)\/?\s*>$/u);
    if (match) output.push({ index: start, raw, tag: match[1], attributesText: match[2] });
    start = end;
  }
  return output;
}

export async function scanMini(options: {
  root: string;
  ref: string;
  sha: string;
  treeHash: string;
}): Promise<InventoryBundle> {
  const miniRoot = path.join(options.root, "apps", "wechat-miniprogram");
  const screens: ScreenInventoryItem[] = [];
  const actions: ActionInventoryItem[] = [];
  const overlays: OverlayInventoryItem[] = [];
  const transitions: TransitionInventoryItem[] = [];
  const sideEffects: SideEffectInventoryItem[] = [];
  const unresolved: UnresolvedInventoryItem[] = [];

  for (const page of await registeredPages(miniRoot)) {
    screens.push({
      id: pageScreenId(page.route),
      platform: "mini",
      kind: "route",
      source: { file: `apps/wechat-miniprogram/${page.sourceFile}`, line: 1, column: 1 },
      routeHint: `/${page.route}`,
      evidence: "app.json registered page",
    });
  }

  const wxmlFiles = await listFiles(miniRoot, new Set([".wxml"]));
  for (const file of wxmlFiles) {
    const text = await fs.readFile(file, "utf8");
    const route = routeForFile(miniRoot, file);
    const screenId = route ? pageScreenId(route) : screenIdForFile("mini", options.root, file);
    for (const tagMatch of extractOpeningTags(text)) {
      const tag = tagMatch.tag;
      const attributesText = tagMatch.attributesText;
      const tagOffset = tagMatch.index;
      const attributes = new Map<string, string>();
      const attributePattern = /([:\w-]+)\s*=\s*(["'])(.*?)\2/gu;
      for (const attributeMatch of attributesText.matchAll(attributePattern)) {
        attributes.set(attributeMatch[1], attributeMatch[3]);
      }
      const parityId = attributes.get("data-parity-id");
      for (const [event, handler] of attributes) {
        if (!WXML_EVENT_PATTERN.test(event)) continue;
        const eventOffset = tagOffset + tagMatch.raw.indexOf(event);
        const position = lineColumn(text, eventOffset);
        const source = { file: relativePosix(options.root, file), ...position };
        actions.push({
          id: parityId || sourceId("mini.action", source, `${event}:${handler}`),
          platform: "mini",
          screenId,
          event,
          handler,
          parityId,
          source,
          visibleWhen: attributes.get("wx:if") || attributes.get("hidden"),
          evidence: `<${tag}> ${event}="${handler}"`,
        });
      }
      if (tag === "navigator") {
        const openType = attributes.get("open-type") ?? "navigate";
        const url = attributes.get("url") ?? "";
        const position = lineColumn(text, tagOffset);
        const source = { file: relativePosix(options.root, file), ...position };
        actions.push({
          id: parityId || sourceId("mini.action", source, `navigator:${openType}:${url}`),
          platform: "mini",
          screenId,
          event: "navigator",
          handler: openType,
          parityId,
          source,
          transitionHint: openType === "navigateBack" ? "pop" : "push",
          evidence: tagMatch.raw.slice(0, 240),
        });
        transitions.push({
          id: sourceId("mini.transition", source, `navigator:${openType}:${url}`),
          platform: "mini",
          screenId,
          type: openType === "navigateBack" ? "pop" : "push",
          targetHint: url,
          source,
          evidence: tagMatch.raw.slice(0, 240),
        });
      }
      const className = attributes.get("class") ?? "";
      if (/modal|dialog|sheet|popup|overlay|toast|lightbox|preview/i.test(`${tag} ${className}`)) {
        const position = lineColumn(text, tagOffset);
        const source = { file: relativePosix(options.root, file), ...position };
        overlays.push({
          id: parityId || sourceId("mini.overlay", source, `${tag}:${className}`),
          platform: "mini",
          screenId,
          kind: className || tag,
          source,
          triggerHint: attributes.get("wx:if") || attributes.get("hidden"),
          evidence: tagMatch.raw.slice(0, 240),
        });
      }
    }
  }

  const scriptFiles = await listFiles(miniRoot, new Set([".ts", ".js"]));
  for (const file of scriptFiles) {
    const text = await fs.readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, inferScriptKind(file));
    const route = routeForFile(miniRoot, file);
    const screenId = route ? pageScreenId(route) : screenIdForFile("mini", options.root, file);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = callName(node.expression);
        const location = tsLocation(options.root, sourceFile, node);
        const target = expressionText(node.arguments[0], sourceFile);
        const transition = miniTransitionType(name);
        if (transition) {
          transitions.push({
            id: sourceId("mini.transition", location, name),
            platform: "mini",
            screenId,
            type: transition,
            targetHint: target,
            source: location,
            evidence: `${name}(${target ?? ""})`,
          });
          if (target && !/url\s*:\s*["'`]/u.test(target) && name !== "wx.navigateBack") {
            unresolved.push({
              id: sourceId("mini.unresolved.transition", location, name),
              platform: "mini",
              category: "transition",
              source: location,
              reason: "dynamic wx navigation target requires manifest review",
              evidence: `${name}(${target})`,
            });
          }
        }
        if (/^wx\.(showModal|showActionSheet|showToast|showLoading|previewImage)$/u.test(name)) {
          overlays.push({
            id: sourceId("mini.overlay", location, name),
            platform: "mini",
            screenId,
            kind: name,
            source: location,
            evidence: `${name}(${target ?? ""})`,
          });
        }
        const sideEffect = miniSideEffectType(name);
        if (sideEffect) {
          sideEffects.push({
            id: sourceId("mini.side-effect", location, name),
            platform: "mini",
            screenId,
            type: sideEffect,
            methodHint: name,
            targetHint: target,
            source: location,
            evidence: `${name}(${target ?? ""})`,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platform: "mini",
    ref: options.ref,
    sha: options.sha,
    treeHash: options.treeHash,
    root: options.root,
    screens: dedupeById(screens),
    actions: dedupeById(actions),
    overlays: dedupeById(overlays),
    transitions: dedupeById(transitions),
    sideEffects: dedupeById(sideEffects),
    unresolved: dedupeById(unresolved),
  };
}
