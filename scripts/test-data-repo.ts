import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

assert.equal(existsSync(join(root, "src/lib/data-repo.ts")), false, "空快照 data-repo Stub 必须删除");
assert.equal(
  existsSync(join(root, "src/components/use-wardrobe-capture-queue-controller.ts")),
  false,
  "未接入 WardrobeApp 的旧图片队列控制器必须删除",
);

const outfitWearSync = read("src/lib/outfit-wear-sync.ts");
assert.match(outfitWearSync, /OnlineWorkspaceSnapshot/, "穿着同步必须使用线上 Repository 快照类型");
assert.doesNotMatch(outfitWearSync, /data-repo/, "穿着同步不得读取 data-repo Stub");

for (const directory of ["src/components", "src/lib"]) {
  const output = spawnSync("rg", ["-n", "@/lib/data-repo", directory], { cwd: root });
  assert.equal(output.status, 1, `${directory} 不得残留 data-repo 运行时导入`);
}

const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
assert.match(packageJson.scripts["test:logic:all"] ?? "", /test:logic:data-repo/, "全量逻辑测试必须执行线上数据层断言");

for (const testFile of [
  "scripts/test-auth-client-shell.ts",
  "scripts/test-catalog-multi-select-integration.ts",
  "scripts/test-delete-cascade-regression.ts",
]) {
  const source = read(testFile);
  assert.doesNotMatch(source, /assert\.ok\(\s*true\b/, `${testFile} 不得使用 assert.ok(true)`);
  assert.doesNotMatch(source, /\|\|\s*true\b/, `${testFile} 不得使用 || true`);
  assert.doesNotMatch(source, /check\([^\n]+,\s*true\s*\)/, `${testFile} 不得使用无条件 check(..., true)`);
}

console.log("online-only runtime data assertions passed");
