import assert from "node:assert/strict";
import {
  collectWorkspacePages,
  WORKSPACE_PAGE_LIMIT,
} from "../services/workspace-pagination";

type Entity = { id: string };

async function main(): Promise<void> {
  const requestedLimits: number[] = [];
  const pages = new Map<string, { items: Entity[]; nextCursor?: string }>([
    ["", { items: [{ id: "g-1" }, { id: "g-2" }], nextCursor: "page-2" }],
    ["page-2", { items: [{ id: "g-3" }, { id: "g-4" }], nextCursor: "page-3" }],
    ["page-3", { items: [{ id: "g-5" }] }],
  ]);
  const all = await collectWorkspacePages(500, async ({ limit, cursor }) => {
    requestedLimits.push(limit);
    return pages.get(cursor) ?? { items: [] };
  });
  assert.deepEqual(requestedLimits, [
    WORKSPACE_PAGE_LIMIT,
    WORKSPACE_PAGE_LIMIT,
    WORKSPACE_PAGE_LIMIT,
  ]);
  assert.deepEqual(all.map((item) => item.id), ["g-1", "g-2", "g-3", "g-4", "g-5"]);
  assert.equal(new Set(all.map((item) => item.id)).size, all.length);

  await assert.rejects(
    collectWorkspacePages(60, async ({ cursor }) =>
      cursor ? { items: [], nextCursor: "loop" } : { items: [], nextCursor: "loop" },
    ),
    /分页异常：游标重复/,
  );

  await assert.rejects(
    collectWorkspacePages(60, async ({ cursor }) =>
      cursor
        ? { items: [{ id: "g-1" }] }
        : { items: [{ id: "g-1" }], nextCursor: "page-2" },
    ),
    /分页异常：返回了重复数据/,
  );

  console.log("workspace pagination: bounded requests, complete traversal, and visible cursor failures passed");
}

void main();
