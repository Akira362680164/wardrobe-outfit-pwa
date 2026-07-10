import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { listFiles, relativePosix } from "../lib/fs";
import { slug, stableId } from "../lib/ids";
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
import {
  callName,
  dedupeById,
  expressionText,
  inferScriptKind,
  screenIdForFile,
  sourceId,
  tsLocation,
} from "./shared";

const ACTION_EVENTS = new Set([
  "onClick", "onSubmit", "onChange", "onInput", "onKeyDown", "onPointerDown",
  "onPointerUp", "onTouchStart", "onTouchMove", "onTouchEnd", "onContextMenu",
  "onDrag", "onDrop",
]);

const OVERLAY_NAMES = /(?:Dialog|Modal|Sheet|ActionSheet|BottomSheet|Popover|Menu|Lightbox|Portal|Confirm|Toast|Snackbar|DatePicker|ImagePreview)$/u;
const SCREEN_TYPE_NAMES = /(?:Route|Screen|SubPage|View|Mode)$/u;

function transitionType(name: string): TransitionType | undefined {
  const leaf = name.split(".").at(-1) ?? name;
  if (["navigateBack", "back", "goBack"].includes(leaf)) return "pop";
  if (["switchTab", "setMainTab", "setActiveTab"].includes(leaf)) return "tab";
  if (leaf === "redirectTo" || (leaf === "replace" && /router|navigation|history/iu.test(name))) return "replace";
  if (["reLaunch", "resetNavigation"].includes(leaf)) return "reset";
  if (["setSubPage", "setView", "setInternalView"].includes(leaf)) return "state-change";
  if (["navigate", "navigateTo", "setRoute"].includes(leaf) || (leaf === "push" && /router|navigation|history/iu.test(name))) return "push";
  return undefined;
}

function sideEffectType(name: string): SideEffectType | undefined {
  const isRemoteCandidate = /^(?:repo|online|fetch|request|api|http)|wardrobeRepository|workspaceRepository|Server|diagnos|upload|asset|MiniMax|Ai|AI/iu.test(name);
  if (!isRemoteCandidate) return undefined;
  if (/upload|asset.*create|create.*asset/u.test(name)) return "OBJECT_UPLOAD";
  if (/diagnos|generate|recogn|suggest|advice|job|ai/i.test(name)) return "ASYNC_JOB";
  if (/\.(post|put|patch|delete)$|create|update|remove|archive|restore|save|submit|mutate/i.test(name)) return "BACKEND_WRITE";
  if (/\.(get|fetch)$|load|list|read|query/i.test(name)) return "BACKEND_READ";
  return undefined;
}

function jsxTagName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText();
}

function jsxAttribute(node: ts.JsxOpeningLikeElement, name: string, sourceFile: ts.SourceFile): string | undefined {
  const attribute = node.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );
  if (!attribute?.initializer) return undefined;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer)) return expressionText(attribute.initializer.expression, sourceFile);
  return attribute.initializer.getText(sourceFile);
}

export async function scanApp(options: {
  root: string;
  ref: string;
  sha: string;
  treeHash: string;
}): Promise<InventoryBundle> {
  const scanRoot = path.join(options.root, "src");
  const files = await listFiles(scanRoot, new Set([".ts", ".tsx"]));
  const screens: ScreenInventoryItem[] = [];
  const actions: ActionInventoryItem[] = [];
  const overlays: OverlayInventoryItem[] = [];
  const transitions: TransitionInventoryItem[] = [];
  const sideEffects: SideEffectInventoryItem[] = [];
  const unresolved: UnresolvedInventoryItem[] = [];

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, inferScriptKind(file));
    const fileScreenId = screenIdForFile("app", options.root, file);
    const fileLocation = { file: relativePosix(options.root, file), line: 1, column: 1 };

    if (/components\//u.test(fileLocation.file) && /(?:page|view|screen|app|detail|settings|calendar|statistics|intake)/iu.test(fileLocation.file)) {
      screens.push({
        id: fileScreenId,
        platform: "app",
        kind: "component",
        source: fileLocation,
        evidence: "screen-like component source file",
      });
    }

    const visit = (node: ts.Node): void => {
      if (ts.isTypeAliasDeclaration(node) && SCREEN_TYPE_NAMES.test(node.name.text) && ts.isUnionTypeNode(node.type)) {
        for (const member of node.type.types) {
          if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
            const location = tsLocation(options.root, sourceFile, member);
            screens.push({
              id: `app.internal.${slug(node.name.text)}.${slug(member.literal.text)}`,
              platform: "app",
              kind: "internal",
              source: location,
              stateHint: member.literal.text,
              evidence: `${node.name.text} union member`,
            });
          }
          if (ts.isTypeLiteralNode(member)) {
            const nameProperty = member.members.find(
              (candidate): candidate is ts.PropertySignature => ts.isPropertySignature(candidate) && candidate.name?.getText(sourceFile) === "name",
            );
            if (nameProperty?.type && ts.isLiteralTypeNode(nameProperty.type) && ts.isStringLiteral(nameProperty.type.literal)) {
              const routeName = nameProperty.type.literal.text;
              const location = tsLocation(options.root, sourceFile, member);
              screens.push({
                id: `app.route.${slug(routeName)}`,
                platform: "app",
                kind: "route",
                source: location,
                routeHint: routeName,
                evidence: `${node.name.text} discriminated union member`,
              });
            }
          }
        }
      }

      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const tag = jsxTagName(node);
        const parityId = jsxAttribute(node, "data-parity-id", sourceFile);
        for (const property of node.attributes.properties) {
          if (!ts.isJsxAttribute(property)) continue;
          const event = property.name.getText(sourceFile);
          if (!ACTION_EVENTS.has(event)) continue;
          const location = tsLocation(options.root, sourceFile, property);
          const handler = property.initializer && ts.isJsxExpression(property.initializer)
            ? expressionText(property.initializer.expression, sourceFile)
            : expressionText(property.initializer, sourceFile);
          actions.push({
            id: parityId || sourceId("app.action", location, `${event}:${handler ?? "unknown"}`),
            platform: "app",
            screenId: fileScreenId,
            event,
            handler,
            parityId,
            source: location,
            evidence: `<${tag}> ${event}`,
          });
        }
        if (OVERLAY_NAMES.test(tag)) {
          const location = tsLocation(options.root, sourceFile, node);
          overlays.push({
            id: parityId || sourceId("app.overlay", location, tag),
            platform: "app",
            screenId: fileScreenId,
            kind: tag,
            source: location,
            evidence: `<${tag}>`,
          });
        }
      }

      if (ts.isCallExpression(node)) {
        const name = callName(node.expression);
        const location = tsLocation(options.root, sourceFile, node);
        const target = expressionText(node.arguments[0], sourceFile);
        const inferredTransition = transitionType(name);
        if (inferredTransition) {
          transitions.push({
            id: sourceId("app.transition", location, name),
            platform: "app",
            screenId: fileScreenId,
            type: inferredTransition,
            targetHint: target,
            source: location,
            evidence: `${name}(${target ?? ""})`,
          });
          if (node.arguments.length > 0 && target && !/^["'`]|^[A-Za-z0-9_.]+$/u.test(target)) {
            unresolved.push({
              id: sourceId("app.unresolved.transition", location, name),
              platform: "app",
              category: "transition",
              source: location,
              reason: "dynamic transition target requires manifest review",
              evidence: `${name}(${target})`,
            });
          }
        }
        const inferredSideEffect = sideEffectType(name);
        if (inferredSideEffect) {
          sideEffects.push({
            id: sourceId("app.side-effect", location, name),
            platform: "app",
            screenId: fileScreenId,
            type: inferredSideEffect,
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
    platform: "app",
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
