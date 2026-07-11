import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const appRoot = read("src/components/app-root.tsx");
const provider = read("src/components/auth/auth-provider.tsx");
const account = read("src/components/auth/account-views.tsx");
const workspaceGate = read("src/components/auth/workspace-gate.tsx");
const onlineAssetImage = read("src/components/online/online-asset-image.tsx");
const onlineRepository = read("src/lib/online/online-repository.ts");

assert.doesNotMatch(appRoot, /NEXT_PUBLIC_CLOUD_AUTH_ENABLED|NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED|workspace-registry|AccountWorkspaceRecord/);
assert.match(appRoot, /<AuthProvider>[\s\S]*<AuthGate>[\s\S]*<WorkspaceGate session=\{auth\.session\}/);
assert.match(appRoot, /onRecoverSession=\{auth\.refreshSession\}/);
assert.doesNotMatch(provider, /workspace-registry|account-workspace-db|isWorkspaceOfflineAuthorized|canUseCachedSession|bindLocalOwnerIfNeeded/);
assert.match(provider, /cloud !== "cloud_ready"\) return current\.user \? current : null/);
assert.match(provider, /if \(!options\.force && isAccessTokenFresh\(current\)\) return current/);
assert.match(provider, /registerAuthSessionRecovery\(\(\{ force \}\) => refreshSession\(\{ force \}\)\)/);
assert.match(provider, /document\.visibilityState !== "visible"[\s\S]*!isAccessTokenFresh\(session\)[\s\S]*refreshSession\(\)/);
assert.doesNotMatch(account, /AccountWorkspaceRecord|本机衣橱数据不会删除/);
assert.match(account, /清空当前登录会话；重新登录后会从服务器读取衣橱数据/);
assert.match(workspaceGate, /imageRefreshVersion/);
assert.match(workspaceGate, /recoverImages/);
assert.match(workspaceGate, /recoverImages = useCallback\(async \(force = false\)/);
assert.match(workspaceGate, /!force && now - lastRecoveryAtRef\.current < 3_000/);
assert.match(workspaceGate, /repositoryRef\.current\?\.images\.clear\(\)/);
assert.match(workspaceGate, /document\.addEventListener\("visibilitychange", handleVisibility\)/);
assert.match(onlineAssetImage, /error instanceof OnlineRequestError && error\.status === 401 && await gate\.recoverImages\(\)/);
assert.match(onlineAssetImage, /gate\?\.imageRefreshVersion/);
assert.match(onlineAssetImage, /void gate\.recoverImages\(true\)/);
assert.match(onlineRepository, /this\.images = new OnlineImageClient\(\)/);
assert.doesNotMatch(onlineRepository, /this\.images = new OnlineImageClient\(\{ session \}\)/);

console.log("online auth shell checks passed");
