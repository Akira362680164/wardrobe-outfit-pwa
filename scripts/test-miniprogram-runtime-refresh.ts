import assert from "node:assert/strict";
import {
  getRuntimeRefreshSnapshot,
  markRuntimeDomainDirty,
  resetRuntimeRefreshState,
  runRuntimeDomainRefresh,
  shouldRefreshRuntimeDomain,
} from "../apps/wechat-miniprogram/utils/runtime-refresh";

async function main() {
resetRuntimeRefreshState();
assert.equal(shouldRefreshRuntimeDomain("garments", { hasData: false, now: 1 }), true);

let calls = 0;
let release!: (value: string) => void;
const loader = () => {
  calls += 1;
  return new Promise<string>((resolve) => { release = resolve; });
};
const first = runRuntimeDomainRefresh("garments", loader, { hasData: false, now: 10 });
const duplicate = runRuntimeDomainRefresh("garments", loader, { hasData: false, now: 10 });
assert.equal(calls, 1, "concurrent refreshes share one request");
release("ready");
assert.deepEqual(await first, { status: "fulfilled", accepted: true, value: "ready" });
assert.deepEqual(await duplicate, { status: "fulfilled", accepted: true, value: "ready" });
assert.equal(shouldRefreshRuntimeDomain("garments", { hasData: true, now: 20 }), false);

markRuntimeDomainDirty("garments");
assert.equal(shouldRefreshRuntimeDomain("garments", { hasData: true, now: 20 }), true);
await runRuntimeDomainRefresh("garments", async () => "updated", { hasData: true, now: 30 });
assert.equal(getRuntimeRefreshSnapshot("garments").dirty, false);

let finishStale!: (value: string) => void;
const stale = runRuntimeDomainRefresh("outfits", () => new Promise((resolve) => { finishStale = resolve; }), { hasData: false, now: 40 });
resetRuntimeRefreshState();
finishStale("stale");
assert.deepEqual(await stale, { status: "fulfilled", accepted: false, value: "stale" });

console.log("miniprogram runtime refresh passed");
}

void main();
