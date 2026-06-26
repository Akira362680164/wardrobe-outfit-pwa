import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyProbeStatus, isCloudReady } from "../src/lib/cloud-sync/connectivity";
import { computeOfflineAccessUntil } from "../src/lib/auth-session-store";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const connectivity = read("src/lib/cloud-sync/connectivity.ts");
const authProvider = read("src/components/auth/auth-provider.tsx");
const authGate = read("src/components/auth/auth-gate.tsx");
const workspaceGate = read("src/components/auth/workspace-gate.tsx");
const syncEngine = read("src/lib/cloud-sync/sync-engine.ts");
const workspaceRegistry = read("src/lib/workspace-registry.ts");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("\n=== Cloud Connectivity State ===");
check("ConnectivityState 包含 B6 六态", /unknown/.test(connectivity) && /probing/.test(connectivity) && /offline/.test(connectivity) && /cloud_unreachable/.test(connectivity) && /cloud_degraded/.test(connectivity) && /cloud_ready/.test(connectivity));
check("health/ready 均参与 cloud_ready 判定", /\/api\/health/.test(connectivity) && /\/api\/ready/.test(connectivity) && /health !== "ok"/.test(connectivity) && /ready === "ok"/.test(connectivity));
check("502/503/504 映射 cloud_degraded", classifyProbeStatus(502) === "cloud_degraded" && classifyProbeStatus(503) === "cloud_degraded" && classifyProbeStatus(504) === "cloud_degraded");
check("200 映射 cloud_ready 前置 ok", classifyProbeStatus(200) === "ok" && isCloudReady("cloud_ready") && !isCloudReady("cloud_degraded"));
check("探测失败不降级 HTTP", !/http:\/\//.test(connectivity.replace(/NEXT_PUBLIC_WARDROBE_API_BASE_URL/g, "")));

console.log("\n=== Auth B6 Rules ===");
check("离线授权最长 30 天且不超过 refresh 过期", computeOfflineAccessUntil("2026-08-01T00:00:00.000Z", new Date("2026-06-26T00:00:00.000Z")) === "2026-07-26T00:00:00.000Z");
check("refresh 401/403 才清认证凭证", /isAuthInvalidError/.test(authProvider) && /error\.status === 401 \|\| error\.status === 403/.test(authProvider) && /clearAuthTokens\(loaded\)/.test(authProvider) && /clearAuthTokens\(current\)/.test(authProvider));
check("refresh 网络失败/降级可保留 cached session", /canUseCachedSession\(loaded\)/.test(authProvider) && /setPhase\("authenticated"\)/.test(authProvider));
// v2.0.1: login/register no longer require cloud_ready
check("登录/注册不依赖 ensureCloudReady", !/ensureCloudReady/.test(authProvider));
check("登录/注册按钮不依赖 connectivity 禁用", !/auth.connectivity !== "cloud_ready"/.test(authGate));

console.log("\n=== Workspace B6 Rules ===");
check("主动退出递增 generation 并失效离线授权", /activeWorkspaceGeneration: current\.activeWorkspaceGeneration \+ 1/.test(workspaceRegistry) && /offlineAccessUntil: undefined/.test(workspaceRegistry));
check("WorkspaceGate 有缓存且离线授权有效时先进入", /isWorkspaceOfflineAuthorized\(existing\)/.test(workspaceGate) && /setState\(\{ status: "ready", workspace \}\)/.test(workspaceGate));
check("WorkspaceGate 无缓存必须云端可用", /首次打开账号衣橱需要连接云端/.test(workspaceGate) && /cloud !== "cloud_ready"/.test(workspaceGate));
check("首次工作区执行 bootstrap，失败不进入", /runBootstrap/.test(workspaceGate) && /云端衣橱初始化失败/.test(workspaceGate) && /云端同步未开启，无法首次准备账号衣橱/.test(workspaceGate));
check("前台恢复和网络变化重新探测", /visibilitychange/.test(workspaceGate) && /subscribeNetworkChanges/.test(workspaceGate) && /probeAndSync/.test(workspaceGate));
check("同步重试使用 B4 退避阶梯", /computeBackoffMs/.test(workspaceGate) && /attemptCount\+\+/.test(workspaceGate));
check("runSyncOnce/runBootstrap 必须 cloud_ready", /probeCloudConnectivity/.test(syncEngine) && /connectivity !== "cloud_ready"/.test(syncEngine));

console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
