import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
const [accountView, deletionView, routeSource, apiSource, minimaxSource] = await Promise.all([
  readFile("src/components/auth/account-views.tsx", "utf8"),
  readFile("src/components/auth/account-deletion-view.tsx", "utf8").catch(() => ""),
  readFile("src/lib/app-route.ts", "utf8"),
  readFile("src/lib/cloud-auth-api.ts", "utf8"),
  readFile("src/lib/device-minimax.ts", "utf8"),
]);

assert.match(accountView, /注销账号/);
assert.match(accountView, /underline/);
assert.match(accountView, /onDeleteAccount/);
assert.match(deletionView, /我已了解，继续注销/);
assert.match(deletionView, /使用邮箱验证码验证/);
assert.match(deletionView, /使用当前密码验证/);
assert.doesNotMatch(deletionView, /使用微信身份验证/);
assert.match(deletionView, /验证并继续/);
assert.match(deletionView, /永久注销账号/);
assert.match(deletionView, /useStableBackHandler\(/);
assert.match(deletionView, /stage === "processing" \|\| stage === "completed" \|\| stage === "failed"/);
assert.match(deletionView, /variant="destructive"/);
assert.match(deletionView, /dismissible=\{!busy\}/);
assert.match(apiSource, /DELETE_ACCOUNT/);
assert.match(routeSource, /account_deletion/);
assert.match(apiSource, /confirmAccountDeletion/);
assert.match(apiSource, /getAccountDeletionStatus/);
assert.match(minimaxSource, /clearMiniMaxSettings/);

console.log("App account deletion contract: ok");
}

void main();
