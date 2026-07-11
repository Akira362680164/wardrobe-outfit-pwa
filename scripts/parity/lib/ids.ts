import { createHash } from "node:crypto";

export function stableId(prefix: string, ...parts: Array<string | number | undefined>): string {
  const source = parts.filter((part) => part !== undefined).join(":");
  const suffix = createHash("sha1").update(source).digest("hex").slice(0, 10);
  return `${prefix}.${suffix}`;
}

export function slug(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/\.[^.\/]+$/u, "")
    .replace(/[^a-zA-Z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "")
    .toLowerCase();
}
