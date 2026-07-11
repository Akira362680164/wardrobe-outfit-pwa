import assert from "node:assert/strict";

async function testAppConcurrentRecovery() {
  process.env.NEXT_PUBLIC_WARDROBE_API_BASE_URL = "https://example.test";
  const { registerAuthSessionRecovery } = await import("../src/lib/auth-session-recovery");
  const { onlineRequest } = await import("../src/lib/online/online-request");
  let refreshCount = 0;
  let oldRequests = 0;
  let newRequests = 0;
  registerAuthSessionRecovery(async () => {
    refreshCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { deviceId: "device-a", deviceLabel: "Android", accessToken: "new-access" };
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const authorization = new Headers(init?.headers).get("Authorization");
    if (authorization === "Bearer old-access") {
      oldRequests += 1;
      return new Response(JSON.stringify({ code: "AUTH_TOKEN_INVALID", message: "Invalid access token" }), { status: 401 });
    }
    newRequests += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const session = { deviceId: "device-a", accessToken: "old-access" };
    const results = await Promise.all(Array.from({ length: 10 }, () => onlineRequest<{ ok: boolean }>("/api/workspace/overview", { session })));
    assert.equal(results.every((item) => item.ok), true);
    assert.equal(refreshCount, 1, "10 concurrent 401 responses must share one refresh");
    assert.equal(oldRequests, 10);
    assert.equal(newRequests, 10, "each request may replay only once");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testMiniConcurrentRecoveryAndPersistence() {
  const storage = new Map<string, unknown>();
  let refreshCount = 0;
  let oldRequests = 0;
  let newRequests = 0;
  (globalThis as any).getApp = () => ({ globalData: { apiBaseUrl: "https://example.test" } });
  (globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key) ?? "",
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    redirectTo: () => undefined,
    showToast: () => undefined,
    request: (options: any) => {
      queueMicrotask(() => {
        if (options.url.endsWith("/api/auth/refresh")) {
          refreshCount += 1;
          options.success({ statusCode: 200, data: { accessToken: "new-access", accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(), refreshToken: "new-refresh-token", refreshTokenExpiresAt: new Date(Date.now() + 2_592_000_000).toISOString(), user: { id: "user-a" } }, header: {} });
          return;
        }
        if (options.header.Authorization === "Bearer old-access") {
          oldRequests += 1;
          options.success({ statusCode: 401, data: { code: "AUTH_TOKEN_INVALID", message: "Invalid access token" }, header: {} });
          return;
        }
        newRequests += 1;
        options.success({ statusCode: 200, data: { ok: true }, header: {} });
      });
    },
  };
  const store = await import("../apps/wechat-miniprogram/stores/session");
  const http = await import("../apps/wechat-miniprogram/services/http");
  store.setSession({ token: "old-access", refreshToken: "old-refresh-token", deviceId: "device-a", expiresAt: Date.now() + 900_000, user: { id: "user-a" } });
  const results = await Promise.all(Array.from({ length: 10 }, () => http.request<{ ok: boolean }>({ path: "/api/workspace/overview", toast: false })));
  assert.equal(results.every((item) => item.ok), true);
  assert.equal(refreshCount, 1);
  assert.equal(oldRequests, 10);
  assert.equal(newRequests, 10);
  assert.equal(store.hydrateSession()?.refreshToken, "new-refresh-token", "rotated credentials must survive process hydration");
  store.setSession({ token: "expired-access", refreshToken: "still-valid-refresh", deviceId: "device-a", expiresAt: Date.now() - 1, refreshTokenExpiresAt: Date.now() + 60_000, user: { id: "user-a" } });
  assert.equal(store.isLoggedIn(), true, "a refreshable cold-start session must not flash logged-out UI");
}

async function main() {
  await testAppConcurrentRecovery();
  await testMiniConcurrentRecoveryAndPersistence();
  console.log("long-lived device session tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
