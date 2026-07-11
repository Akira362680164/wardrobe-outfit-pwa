import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

export async function writeJson(target: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson<T>(target: string): Promise<T> {
  return JSON.parse(await fs.readFile(target, "utf8")) as T;
}

export async function sha256File(target: string): Promise<string> {
  const content = await fs.readFile(target);
  return createHash("sha256").update(content).digest("hex");
}

export async function listFiles(
  root: string,
  extensions: ReadonlySet<string>,
  ignoredNames = new Set([".git", "node_modules", ".next", "out", "dist", "build"]),
): Promise<string[]> {
  const output: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (ignoredNames.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
        output.push(absolute);
      }
    }
  }

  await visit(root);
  return output;
}

export function relativePosix(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}

export function lineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}
