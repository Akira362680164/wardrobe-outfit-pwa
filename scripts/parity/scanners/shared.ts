import path from "node:path";
import ts from "typescript";
import { relativePosix } from "../lib/fs";
import { slug, stableId } from "../lib/ids";
import type { SourceLocation } from "../types";

export function tsLocation(root: string, sourceFile: ts.SourceFile, node: ts.Node): SourceLocation {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    file: relativePosix(root, sourceFile.fileName),
    line: position.line + 1,
    column: position.character + 1,
  };
}

export function screenIdForFile(platform: "app" | "mini", root: string, file: string): string {
  return `${platform}.${slug(relativePosix(root, file))}`;
}

export function sourceId(prefix: string, location: SourceLocation, evidence: string): string {
  return stableId(prefix, location.file, location.line, location.column, evidence);
}

export function expressionText(node: ts.Node | undefined, sourceFile: ts.SourceFile): string | undefined {
  if (!node) return undefined;
  const value = node.getText(sourceFile).replace(/\s+/g, " ").trim();
  return value.length > 240 ? `${value.slice(0, 237)}...` : value;
}

export function callName(expression: ts.LeftHandSideExpression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return `${callName(expression.expression)}.${expression.name.text}`;
  return expression.getText();
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function inferScriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function absoluteFrom(root: string, relativeOrAbsolute: string): string {
  return path.isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : path.join(root, relativeOrAbsolute);
}
