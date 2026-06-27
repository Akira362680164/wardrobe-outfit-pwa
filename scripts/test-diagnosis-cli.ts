#!/usr/bin/env tsx
// scripts/test-diagnosis-cli.ts
// 诊断 CLI 工具结构测试（不依赖实际网络）

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${message}`);
  } else {
    fail++;
    console.error(`  ❌ ${message}`);
  }
}

function readScript(name: string): string {
  return readFileSync(join("scripts", name), "utf8");
}

console.log("=== 诊断 CLI 工具测试 ===\n");

// 1. 四个脚本文件存在
assert(existsSync("scripts/diagnosis-list.ts"), "diagnosis-list.ts 存在");
assert(existsSync("scripts/diagnosis-latest.ts"), "diagnosis-latest.ts 存在");
assert(existsSync("scripts/diagnosis-pull.ts"), "diagnosis-pull.ts 存在");
assert(existsSync("scripts/diagnosis-inspect.ts"), "diagnosis-inspect.ts 存在");

// 2. 都使用 tsx shebang
for (const name of ["diagnosis-list.ts", "diagnosis-latest.ts", "diagnosis-pull.ts", "diagnosis-inspect.ts"]) {
  const content = readScript(name);
  assert(content.startsWith("#!/usr/bin/env tsx"), `${name} 有 tsx shebang`);
}

// 3. 都读取 DIAGNOSTIC_READER_TOKEN
for (const name of ["diagnosis-list.ts", "diagnosis-latest.ts", "diagnosis-pull.ts"]) {
  const content = readScript(name);
  assert(content.includes("DIAGNOSTIC_READER_TOKEN"), `${name} 读取 DIAGNOSTIC_READER_TOKEN`);
}

// 4. 都设置 X-Diagnostic-Actor header
for (const name of ["diagnosis-list.ts", "diagnosis-latest.ts", "diagnosis-pull.ts"]) {
  const content = readScript(name);
  assert(content.includes("x-diagnostic-actor"), `${name} 设置 X-Diagnostic-Actor`);
}

// 5. list 调用 GET /api/admin/diagnostics/cases
const listContent = readScript("diagnosis-list.ts");
assert(listContent.includes("/api/admin/diagnostics/cases"), "list 调用正确端点");
assert(listContent.includes("limit"), "list 支持 limit 参数");

// 6. latest 调用 GET /api/admin/diagnostics/cases/latest
const latestContent = readScript("diagnosis-latest.ts");
assert(latestContent.includes("/api/admin/diagnostics/cases/latest"), "latest 调用正确端点");

// 7. pull 通过自有 API 流式下载内容
const pullContent = readScript("diagnosis-pull.ts");
assert(pullContent.includes("/content"), "pull 调用 content 端点");
assert(pullContent.includes("arrayBuffer"), "pull 直接读取二进制响应");
assert(pullContent.includes("sha256"), "pull 进行 SHA-256 校验");
assert(pullContent.includes(".diagnostics"), "pull 保存到 .diagnostics/");
assert(pullContent.includes("mkdirSync"), "pull 自动创建目录");

// 8. inspect 读取本地文件
const inspectContent = readScript("diagnosis-inspect.ts");
assert(inspectContent.includes(".diagnostics"), "inspect 从 .diagnostics/ 读取");
assert(inspectContent.includes("readFileSync"), "inspect 使用 readFileSync");
assert(inspectContent.includes("JSON.parse"), "inspect 解析 JSON");
assert(inspectContent.includes("build"), "inspect 展示构建信息");
assert(inspectContent.includes("counts"), "inspect 展示数据量");
assert(inspectContent.includes("recentEvents"), "inspect 展示最近事件");

// 9. package.json 包含 diagnosis:* scripts
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
assert(pkg.scripts["diagnosis:list"] === "tsx scripts/diagnosis-list.ts", "package.json 有 diagnosis:list");
assert(pkg.scripts["diagnosis:latest"] === "tsx scripts/diagnosis-latest.ts", "package.json 有 diagnosis:latest");
assert(pkg.scripts["diagnosis:pull"] === "tsx scripts/diagnosis-pull.ts", "package.json 有 diagnosis:pull");
assert(pkg.scripts["diagnosis:inspect"] === "tsx scripts/diagnosis-inspect.ts", "package.json 有 diagnosis:inspect");

// 10. .gitignore 排除 .diagnostics/
const gitignore = readFileSync(".gitignore", "utf8");
assert(gitignore.includes(".diagnostics/"), ".gitignore 排除 .diagnostics/");

// 11. AGENTS.md 包含远程诊断隐私说明
const agents = readFileSync("AGENTS.md", "utf8");
assert(agents.includes("远程诊断与隐私边界"), "AGENTS.md 有远程诊断隐私章节");
assert(agents.includes("diagnosis:list"), "AGENTS.md 提到 diagnosis:list");
assert(agents.includes("DIAGNOSTIC_READER_TOKEN"), "AGENTS.md 提到 DIAGNOSTIC_READER_TOKEN");
assert(agents.includes("sanitizeValue"), "AGENTS.md 提到 sanitizeValue");

console.log("\n=== 结果 ===");
console.log(`通过: ${pass} / 失败: ${fail}`);
if (fail > 0) process.exit(1);
