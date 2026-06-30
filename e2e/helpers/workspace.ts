import type { Page } from "@playwright/test";

export interface E2EWorkspaceOverview {
  garments: Array<{ id: string; revision: number; payload: Record<string, unknown>; assetRefs?: Record<string, unknown> }>;
  outfits: Array<{ id: string; revision: number; payload: Record<string, unknown> }>;
  wishlistItems: Array<{ id: string; revision: number; payload: Record<string, unknown> }>;
  locations: Array<{ id: string; revision: number; payload: Record<string, unknown> }>;
  outfitPlans: Array<{ id: string; revision: number; payload: Record<string, unknown> }>;
  wearEvents: Array<{ id: string; revision: number; payload: Record<string, unknown> }>;
}

export async function getWorkspaceOverview(page: Page): Promise<E2EWorkspaceOverview> {
  return page.evaluate(async () => {
    const raw = sessionStorage.getItem("wardrobe-cloud-auth-session-v1");
    if (!raw) throw new Error("missing E2E auth session");
    const session = JSON.parse(raw) as { accessToken?: string; deviceId?: string };
    const response = await fetch("http://127.0.0.1:3100/api/workspace/overview", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "X-Wardrobe-Device-Id": session.deviceId ?? "",
      },
    });
    if (!response.ok) throw new Error(`workspace overview failed: ${response.status}`);
    return response.json();
  });
}

export async function workspaceRequest<T>(page: Page, path: string, method = "GET", body?: unknown): Promise<T> {
  return page.evaluate(async ({ path, method, body }) => {
    const raw = sessionStorage.getItem("wardrobe-cloud-auth-session-v1");
    if (!raw) throw new Error("missing E2E auth session");
    const session = JSON.parse(raw) as { accessToken?: string; deviceId?: string };
    const response = await fetch(`http://127.0.0.1:3100${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "X-Wardrobe-Device-Id": session.deviceId ?? "",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${path} failed: ${response.status} ${JSON.stringify(result)}`);
    return result;
  }, { path, method, body }) as Promise<T>;
}

export async function expectSingleDefaultLocation(page: Page): Promise<void> {
  const overview = await getWorkspaceOverview(page);
  const defaults = overview.locations.filter((location) => location.payload.dexieId === "home" && location.payload.name === "默认衣橱");
  if (defaults.length !== 1) throw new Error(`expected one server default location, got ${defaults.length}`);
}
