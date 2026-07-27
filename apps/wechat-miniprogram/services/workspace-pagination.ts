export const WORKSPACE_PAGE_LIMIT = 200;
const MAX_WORKSPACE_PAGES = 1_000;

export type WorkspacePage<T> = {
  items?: T[];
  nextCursor?: string;
};

export type WorkspacePageLoader<T> = (input: {
  limit: number;
  cursor: string;
}) => Promise<WorkspacePage<T>>;

export function normalizeWorkspacePageLimit(requestedLimit: number): number {
  if (!Number.isFinite(requestedLimit) || requestedLimit <= 0) {
    return WORKSPACE_PAGE_LIMIT;
  }
  return Math.min(Math.max(1, Math.floor(requestedLimit)), WORKSPACE_PAGE_LIMIT);
}

export async function collectWorkspacePages<T extends { id: string }>(
  requestedLimit: number,
  loadPage: WorkspacePageLoader<T>,
): Promise<T[]> {
  const limit = normalizeWorkspacePageLimit(requestedLimit);
  const items: T[] = [];
  const entityIds = new Set<string>();
  const visitedCursors = new Set<string>();
  let cursor = "";

  for (let pageCount = 0; pageCount < MAX_WORKSPACE_PAGES; pageCount += 1) {
    const response = await loadPage({ limit, cursor });
    for (const item of response.items ?? []) {
      if (entityIds.has(item.id)) {
        throw new Error("云端列表分页异常：返回了重复数据，请稍后重试");
      }
      entityIds.add(item.id);
      items.push(item);
    }

    const nextCursor = response.nextCursor?.trim() ?? "";
    if (!nextCursor) return items;
    if (nextCursor === cursor || visitedCursors.has(nextCursor)) {
      throw new Error("云端列表分页异常：游标重复，请稍后重试");
    }
    visitedCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error("云端列表分页异常：页数超出限制，请稍后重试");
}
