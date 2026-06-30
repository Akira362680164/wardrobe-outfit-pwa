import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const appRoot = read("src/components/app-root.tsx");
const provider = read("src/components/auth/auth-provider.tsx");
const account = read("src/components/auth/account-views.tsx");

assert.doesNotMatch(appRoot, /NEXT_PUBLIC_CLOUD_AUTH_ENABLED|NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED|workspace-registry|AccountWorkspaceRecord/);
assert.match(appRoot, /<AuthProvider>[\s\S]*<AuthGate>[\s\S]*<WorkspaceGate session=\{auth\.session\}>/);
assert.doesNotMatch(provider, /workspace-registry|account-workspace-db|isWorkspaceOfflineAuthorized|canUseCachedSession|bindLocalOwnerIfNeeded/);
assert.match(provider, /cloud !== "cloud_ready"\) return current\.user \? current : null/);
assert.doesNotMatch(account, /AccountWorkspaceRecord|本机衣橱数据不会删除/);
assert.match(account, /清空当前登录会话；重新登录后会从服务器读取衣橱数据/);

console.log("online auth shell checks passed");
