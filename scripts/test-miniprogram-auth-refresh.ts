import assert from "node:assert/strict";
import fs from "node:fs";

const http = fs.readFileSync("apps/wechat-miniprogram/services/http.ts", "utf8");
const assets = fs.readFileSync("apps/wechat-miniprogram/services/assets.ts", "utf8");
const workspace = fs.readFileSync("apps/wechat-miniprogram/services/workspace.ts", "utf8");

assert.match(http, /let refreshPromise: Promise<SessionState> \| null = null/);
assert.match(http, /recoverSession\(true\)/);
assert.match(http, /performRequest<T>\(options, true\)/);
assert.match(http, /performUpload<T>\(options, true\)/);
assert.match(assets, /uploadTemporaryBytesWithRefresh\(sessionId, assetId, data, mimeType, true\)/);
assert.match(assets, /await recoverSession\(true\)/);
assert.doesNotMatch(workspace, /wx\.request/);
console.log("miniprogram auth refresh contract passed");
