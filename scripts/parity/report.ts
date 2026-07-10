import { promises as fs } from "node:fs";
import path from "node:path";
import type { DomainManifest, InventoryBundle, ScreenManifest, ScreenMapManifest, StaticDefect } from "./types";

type ResultStatus = "PASS" | "DEFECT" | "ALLOWED_PLATFORM_DIFFERENCE" | "BLOCKED" | "NOT_EXECUTED";

interface ExecutionResult {
  schemaVersion: number;
  platform: "app" | "mini";
  screenId: string;
  stateId: string;
  actionId: string;
  status: ResultStatus;
  transition?: string;
  evidenceFiles?: string[];
}

const statuses = new Set<ResultStatus>(["PASS", "DEFECT", "ALLOWED_PLATFORM_DIFFERENCE", "BLOCKED", "NOT_EXECUTED"]);
const secretKey = /(?:password|secret|token|authorization|cookie|api.?key|credential|session)/iu;
const secretText = /(?:Bearer\s+)[A-Za-z0-9._~+\/-]+|([?&](?:token|key|code|secret)=)[^&\s"']+|("?(?:password|secret|token|authorization|cookie|api.?key)"?\s*[:=]\s*")[^"]+/giu;

function redactText(value: string): string {
  return value.replace(secretText, (match, queryPrefix: string | undefined, jsonPrefix: string | undefined) =>
    queryPrefix ? `${queryPrefix}***` : jsonPrefix ? `${jsonPrefix}***` : "Bearer ***");
}

function redact(value: unknown, key = ""): unknown {
  if (secretKey.test(key)) return "***";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  return value;
}

function html(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

async function readJson<T>(file: string): Promise<T> {
  let parsed: unknown;
  try { parsed = JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { throw new Error(`Invalid JSON input ${file}: ${error instanceof Error ? error.message : String(error)}`); }
  return parsed as T;
}

async function listFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== "report") await visit(absolute);
      else if (entry.isFile()) output.push(absolute);
    }
  }
  await visit(root);
  return output.sort();
}

async function loadManifests(cwd: string): Promise<ScreenManifest[]> {
  const directory = path.join(cwd, "scripts", "parity", "manifests");
  const files = (await fs.readdir(directory)).filter((name) => name.endsWith(".yaml") && name !== "screen-map.yaml");
  const screens: ScreenManifest[] = [];
  for (const file of files) {
    const manifest = await readJson<DomainManifest>(path.join(directory, file));
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.screens)) throw new Error(`Invalid domain manifest ${file}`);
    screens.push(...manifest.screens);
  }
  return screens;
}

function sourceLines(screen: ScreenManifest, platform: "app" | "mini"): string {
  return screen[platform].sourceFiles.join(", ") || "未登记";
}

function stylesheet(): string {
  return `<style>:root{color-scheme:light;--ink:#18211b;--muted:#66736b;--line:#d9e2dc;--paper:#f6f7f2;--card:#fff;--accent:#176b4d;--bad:#a93232}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.55 system-ui,-apple-system,sans-serif}header,main{max-width:1180px;margin:auto;padding:24px}header{padding-bottom:8px}h1{font-size:28px}h2{margin-top:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}.metric{font-size:26px;font-weight:750}.muted{color:var(--muted)}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:9px;border:1px solid var(--line);text-align:left;vertical-align:top}a{color:var(--accent)}.P0,.P1,.DEFECT,.BLOCKED{color:var(--bad);font-weight:700}.PASS,.VERIFIED{color:var(--accent);font-weight:700}.shots{display:grid;grid-template-columns:1fr 1fr;gap:8px}.shots img{width:100%;border:1px solid var(--line);border-radius:8px}</style>`;
}

export async function generateParityReport(options: { cwd: string; runRoot: string }): Promise<{ reportRoot: string; coverage: unknown }> {
  const { cwd, runRoot } = options;
  const reportRoot = path.join(runRoot, "report");
  const [appInventory, miniInventory, screenMap, staticDefects, screens, allFiles] = await Promise.all([
    readJson<InventoryBundle>(path.join(runRoot, "inventory", "app-inventory.json")),
    readJson<InventoryBundle>(path.join(runRoot, "inventory", "mini-inventory.json")),
    readJson<ScreenMapManifest>(path.join(cwd, "scripts", "parity", "manifests", "screen-map.yaml")),
    readJson<StaticDefect[]>(path.join(cwd, "scripts", "parity", "config", "static-defects.json")),
    loadManifests(cwd),
    listFiles(runRoot),
  ]);
  if (appInventory.platform !== "app" || miniInventory.platform !== "mini") throw new Error("Inventory platform mismatch");
  const screenIds = new Set(screenMap.screens.map((item) => item.id));
  if (screenIds.size !== screenMap.screens.length) throw new Error("Duplicate screen ID in screen-map.yaml");
  const defectIds = new Set<string>();
  for (const defect of staticDefects) {
    if (defectIds.has(defect.defectId)) throw new Error(`Duplicate defect ID ${defect.defectId}`);
    if (!/^(?:OPEN|FIXED_UNVERIFIED|VERIFIED|WAIVED_BY_HUMAN)$/u.test(defect.status)) throw new Error(`Invalid defect status ${defect.defectId}`);
    defectIds.add(defect.defectId);
  }
  const executionFiles = allFiles.filter((file) => file.endsWith(`${path.sep}execution.json`));
  const executions: Array<ExecutionResult & { file: string }> = [];
  for (const file of executionFiles) {
    const result = await readJson<ExecutionResult>(file);
    if (!statuses.has(result.status) || !result.screenId || !result.actionId || !result.platform) throw new Error(`Invalid execution result ${file}`);
    executions.push({ ...result, file });
  }
  const executedKeys = new Set(executions.map((item) => `${item.screenId}:${item.actionId}:${item.platform}`));
  const detailedActions = screens.flatMap((screen) => screen.requiredActions.map((action) => ({ screen, action })));
  const expectedExecutions = detailedActions.reduce((sum, { action }) => sum + action.requiredOn.length, 0);
  const imageFiles = allFiles.filter((file) => /\.(?:png|webp|jpe?g)$/iu.test(file));
  const requiredScreenshots = screens.reduce((sum, screen) => sum + screen.states.filter((state) => state.checkpoint).reduce((count, state) => count + state.expectedOn.length, 0) + screen.requiredActions.reduce((count, action) => count + action.requiredOn.length * 4, 0), 0);
  const writeActions = detailedActions.filter(({ action }) => ["BACKEND_WRITE", "ASYNC_JOB", "OBJECT_UPLOAD"].includes(action.sideEffect));
  const coverage = redact({
    schemaVersion: 1, runId: path.basename(runRoot), generatedAt: new Date().toISOString(),
    auditCompleteness: {
      appScreens: appInventory.screens.length, miniScreens: miniInventory.screens.length,
      mappedScreens: screenMap.screens.filter((item) => item.mappingStatus !== "UNMAPPED").length,
      unmappedScreens: screenMap.screens.filter((item) => item.mappingStatus === "UNMAPPED").length,
      totalStates: screens.reduce((sum, screen) => sum + screen.states.length, 0), executedStates: new Set(executions.map((item) => `${item.screenId}:${item.stateId}:${item.platform}`)).size,
      staticActions: appInventory.actions.length + miniInventory.actions.length, executedStaticActions: executions.length,
      runtimeAddedActions: 0, unclassifiedRuntimeActions: 0,
      overlays: appInventory.overlays.length + miniInventory.overlays.length, openedOverlays: executions.filter((item) => item.transition === "overlay-open").length,
      overlayExitPaths: screens.reduce((sum, screen) => sum + screen.requiredActions.filter((action) => action.expectedTransition === "overlay-close").length, 0),
      executedOverlayExitPaths: executions.filter((item) => item.transition === "overlay-close").length,
      transitions: appInventory.transitions.length + miniInventory.transitions.length, verifiedTransitions: executions.filter((item) => Boolean(item.transition)).length,
      writeActions: writeActions.length, writesWithServerAssertions: writeActions.filter(({ action }) => Boolean(action.serverAssertion)).length,
      requiredScreenshots, actualScreenshots: imageFiles.length,
      blocked: executions.filter((item) => item.status === "BLOCKED").length,
      notExecuted: Math.max(appInventory.actions.length + miniInventory.actions.length - executions.length, Math.max(0, expectedExecutions - executedKeys.size)) + executions.filter((item) => item.status === "NOT_EXECUTED").length,
      unclassifiedDifferences: 0,
    },
    productConsistency: {
      PASS: executions.filter((item) => item.status === "PASS").length,
      DEFECT: executions.filter((item) => item.status === "DEFECT").length,
      ALLOWED_PLATFORM_DIFFERENCE: executions.filter((item) => item.status === "ALLOWED_PLATFORM_DIFFERENCE").length,
      ...Object.fromEntries(["P0", "P1", "P2", "P3"].map((severity) => [severity, staticDefects.filter((item) => item.severity === severity).length])),
      fixed: staticDefects.filter((item) => item.status === "FIXED_UNVERIFIED").length,
      pendingVerification: staticDefects.filter((item) => item.status === "FIXED_UNVERIFIED").length,
      verified: staticDefects.filter((item) => item.status === "VERIFIED").length,
      humanWaived: staticDefects.filter((item) => item.status === "WAIVED_BY_HUMAN").length,
    },
    domains: Object.fromEntries([...new Set(screenMap.screens.map((item) => item.domain))].sort().map((domain) => {
      const domainScreens = screenMap.screens.filter((item) => item.domain === domain);
      return [domain, { screens: domainScreens.length, defects: staticDefects.filter((item) => domainScreens.some((screen) => screen.id === item.screenId)).length, executions: executions.filter((item) => domainScreens.some((screen) => screen.id === item.screenId)).length }];
    })),
  });
  const defects = redact(staticDefects.map((defect) => ({
    ...defect, stateId: "static.discovery", actionPath: defect.actionId ? [defect.actionId] : [], elementId: defect.actionId ?? null,
    platformExceptionId: null, evidence: { app: "", mini: "", overlay: "", diff: "" },
    sourceLocations: { app: defect.sourceEvidence.filter((item) => !item.startsWith("apps/wechat-miniprogram")), mini: defect.sourceEvidence.filter((item) => item.startsWith("apps/wechat-miniprogram")) },
    affectedScreens: [defect.screenId], rerunCommand: `npm run parity:rerun -- --defect ${defect.defectId}`,
  })));
  await fs.mkdir(path.join(reportRoot, "domains"), { recursive: true });
  await fs.mkdir(path.join(reportRoot, "screens"), { recursive: true });
  await fs.writeFile(path.join(reportRoot, "coverage.json"), `${JSON.stringify(coverage, null, 2)}\n`);
  await fs.writeFile(path.join(reportRoot, "defects.json"), `${JSON.stringify(defects, null, 2)}\n`);
  await fs.writeFile(path.join(reportRoot, "results.json"), `${JSON.stringify(redact({ schemaVersion: 1, executions }), null, 2)}\n`);
  await fs.writeFile(path.join(reportRoot, "baseline-lock.json"), `${JSON.stringify(redact(await readJson<unknown>(path.join(runRoot, "baseline-lock.json"))), null, 2)}\n`);
  const severityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;
  const sortedDefects = [...staticDefects].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.defectId.localeCompare(b.defectId));
  const repair = [`# Parity repair plan`, "", `Run: ${path.basename(runRoot)}`, "", "> Generated from defects.json. OPEN items remain release-blocking according to the execution plan.", ""];
  for (const defect of sortedDefects) repair.push(`## ${defect.severity} ${defect.defectId}`, "", `- Screen: \`${defect.screenId}\``, `- Category: \`${defect.category}\``, `- Expected: ${redactText(defect.expected)}`, `- Actual: ${redactText(defect.actual)}`, `- Suspected files: ${defect.suspectedFiles.map((item) => `\`${item}\``).join(", ")}`, `- Acceptance: ${defect.acceptanceCriteria.join("; ")}`, `- Rerun: \`npm run parity:rerun -- --defect ${defect.defectId}\``, "");
  await fs.writeFile(path.join(reportRoot, "repair-plan.md"), `${repair.join("\n")}\n`);
  const junitCases = sortedDefects.map((defect) => `<testcase classname="parity.${html(defect.screenId)}" name="${html(defect.defectId)}">${defect.status === "OPEN" ? `<failure type="${html(defect.severity)}" message="${html(redactText(defect.actual))}">${html(redactText(defect.expected))}</failure>` : defect.status === "WAIVED_BY_HUMAN" ? `<skipped message="WAIVED_BY_HUMAN"/>` : ""}</testcase>`).join("");
  await fs.writeFile(path.join(reportRoot, "junit.xml"), `<?xml version="1.0" encoding="UTF-8"?><testsuite name="parity" tests="${sortedDefects.length}" failures="${sortedDefects.filter((item) => item.status === "OPEN").length}" timestamp="${new Date().toISOString()}">${junitCases}</testsuite>\n`);

  const executionByScreen = new Map<string, typeof executions>();
  for (const execution of executions) executionByScreen.set(execution.screenId, [...(executionByScreen.get(execution.screenId) ?? []), execution]);
  for (const mapScreen of screenMap.screens) {
    const detail = screens.find((item) => item.id === mapScreen.id);
    const screenExecutions = executionByScreen.get(mapScreen.id) ?? [];
    const screenDefects = sortedDefects.filter((item) => item.screenId === mapScreen.id);
    const screenImages = imageFiles.filter((file) => file.includes(`${path.sep}${mapScreen.id}${path.sep}`));
    const relativeImage = (file: string): string => path.relative(path.join(reportRoot, "screens"), file);
    const shots = screenImages.slice(0, 12).map((file) => `<a target="_blank" download href="${html(relativeImage(file))}"><img loading="lazy" src="${html(relativeImage(file))}" alt="evidence"></a>`).join("");
    const appShot = screenImages.find((file) => file.includes(`${path.sep}app${path.sep}`) && file.endsWith("02-settled.png"));
    const miniShot = screenImages.find((file) => file.includes(`${path.sep}mini${path.sep}`) && file.endsWith("02-settled.png"));
    const diffShot = screenImages.find((file) => file.includes(`${path.sep}diff${path.sep}`) && /pixel|diff/iu.test(path.basename(file)));
    const geometryShot = screenImages.find((file) => file.includes(`${path.sep}diff${path.sep}`) && /geometr/iu.test(path.basename(file)));
    const comparison = appShot && miniShot ? `<div class="shots"><figure><figcaption>APP</figcaption><a target="_blank" href="${html(relativeImage(appShot))}"><img src="${html(relativeImage(appShot))}" alt="APP"></a></figure><figure><figcaption>小程序</figcaption><a target="_blank" href="${html(relativeImage(miniShot))}"><img src="${html(relativeImage(miniShot))}" alt="小程序"></a></figure></div><h3>透明叠加</h3><input id="opacity" type="range" min="0" max="100" value="50" aria-label="小程序透明度"><div style="position:relative;max-width:520px"><img style="width:100%" src="${html(relativeImage(appShot))}" alt="APP overlay base"><img id="overlay" style="position:absolute;inset:0;width:100%;opacity:.5" src="${html(relativeImage(miniShot))}" alt="Mini overlay"></div><script>document.getElementById('opacity').addEventListener('input',e=>document.getElementById('overlay').style.opacity=String(e.target.value/100))</script>` : `<p>NOT_EXECUTED：APP/小程序成对截图尚未齐备。</p>`;
    const actionRows = detail?.requiredActions.map((action) => `<tr id="action-${html(action.id)}"><td>${html(action.id)}</td><td>${html(action.event)}</td><td>${html(action.expectedTransition)}</td><td>${html(action.sideEffect)}</td><td>${html(action.serverAssertion ?? "NA")}</td><td>${html(screenExecutions.filter((item) => item.actionId === action.id).map((item) => `${item.platform}:${item.status}`).join(", ") || "NOT_EXECUTED")}</td></tr>`).join("") ?? "";
    const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${html(mapScreen.id)}</title>${stylesheet()}<header><a href="../index.html">← 总览</a><h1>${html(mapScreen.id)}</h1><p>${html(mapScreen.notes)}</p></header><main><div class="grid"><div class="card"><b>映射</b><div>${html(mapScreen.mappingStatus)}</div></div><div class="card"><b>APP 源码</b><div>${html(detail ? sourceLines(detail, "app") : mapScreen.appInventoryIds.join(", "))}</div></div><div class="card"><b>小程序源码</b><div>${html(detail ? sourceLines(detail, "mini") : mapScreen.miniInventoryIds.join(", "))}</div></div><div class="card"><b>Fixture</b><div>${html(detail?.fixtures.join(", ") ?? "未细化")}</div></div></div><h2>Actions</h2><table><tr><th>Action ID</th><th>事件</th><th>路由/状态</th><th>副作用</th><th>服务端断言</th><th>结果</th></tr>${actionRows || `<tr><td colspan="6">NOT_EXECUTED / manifest 未细化</td></tr>`}</table><h2>缺陷</h2>${screenDefects.map((item) => `<article class="card" id="defect-${html(item.defectId)}"><b class="${item.severity}">${html(item.severity)} ${html(item.defectId)}</b><p>${html(item.actual)}</p></article>`).join("") || "<p>无已登记缺陷</p>"}<h2>截图对比</h2>${comparison}<h3>像素 diff</h3>${diffShot ? `<a target="_blank" href="${html(relativeImage(diffShot))}"><img style="max-width:520px" src="${html(relativeImage(diffShot))}" alt="pixel diff"></a>` : "<p>NOT_EXECUTED</p>"}<h3>几何 diff</h3>${geometryShot ? `<a target="_blank" href="${html(relativeImage(geometryShot))}"><img style="max-width:520px" src="${html(relativeImage(geometryShot))}" alt="geometry diff"></a>` : "<p>NOT_EXECUTED</p>"}<h2>全部原始截图</h2><div class="shots">${shots || "尚无截图"}</div></main></html>`;
    await fs.writeFile(path.join(reportRoot, "screens", `${mapScreen.id}.html`), page);
  }
  const domains = [...new Set(screenMap.screens.map((item) => item.domain))].sort();
  for (const domain of domains) {
    const rows = screenMap.screens.filter((item) => item.domain === domain).map((item) => `<li><a href="../screens/${html(item.id)}.html">${html(item.id)}</a> — ${html(item.mappingStatus)}</li>`).join("");
    await fs.writeFile(path.join(reportRoot, "domains", `${domain}.html`), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${html(domain)}</title>${stylesheet()}<header><a href="../index.html">← 总览</a><h1>${html(domain)}</h1></header><main><ul>${rows}</ul></main></html>`);
  }
  const audit = (coverage as { auditCompleteness: Record<string, number> }).auditCompleteness;
  const product = (coverage as { productConsistency: Record<string, number> }).productConsistency;
  const metrics = Object.entries(audit).map(([key, value]) => `<div class="card"><div class="metric">${value}</div><div class="muted">${html(key)}</div></div>`).join("");
  const productMetrics = Object.entries(product).map(([key, value]) => `<div class="card"><div class="metric">${value}</div><div class="muted">${html(key)}</div></div>`).join("");
  const domainLinks = domains.map((domain) => `<a class="card" href="domains/${html(domain)}.html">${html(domain)}</a>`).join("");
  await fs.writeFile(path.join(reportRoot, "index.html"), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Parity ${html(path.basename(runRoot))}</title>${stylesheet()}<header><h1>APP / 小程序一致性审计</h1><p class="muted">${html(path.basename(runRoot))} · 静态文件报告</p></header><main><h2>审计完整性</h2><div class="grid">${metrics}</div><h2>产品一致性</h2><div class="grid">${productMetrics}</div><h2>业务域</h2><div class="grid">${domainLinks}</div><h2>产物</h2><p><a href="coverage.json">coverage.json</a> · <a href="defects.json">defects.json</a> · <a href="repair-plan.md">repair-plan.md</a> · <a href="junit.xml">junit.xml</a></p></main></html>`);
  const reportFiles = await listFiles(reportRoot);
  for (const file of reportFiles.filter((item) => item.endsWith(".json"))) await readJson(file);
  for (const file of reportFiles.filter((item) => item.endsWith(".html"))) {
    const markup = await fs.readFile(file, "utf8");
    for (const match of markup.matchAll(/(?:href|src)="([^"]+)"/gu)) {
      const reference = match[1];
      if (/^(?:https?:|#|javascript:)/u.test(reference)) continue;
      const target = path.resolve(path.dirname(file), reference.split("#", 1)[0]);
      await fs.access(target).catch(() => { throw new Error(`Broken report link in ${file}: ${reference}`); });
    }
  }
  const leaked = (await Promise.all(reportFiles.filter((item) => /\.(?:html|json|md|xml)$/u.test(item)).map((item) => fs.readFile(item, "utf8")))).join("\n");
  if (/Bearer\s+(?!\*\*\*)[A-Za-z0-9]/iu.test(leaked) || /"(?:password|accessToken|refreshToken)"\s*:\s*"(?!\*\*\*)/iu.test(leaked)) throw new Error("Secret scan failed for generated report");
  return { reportRoot, coverage };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (name: string): string | undefined => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const cwd = path.resolve(value("--cwd") ?? process.cwd());
  const runId = value("--run-id");
  const runRoot = path.resolve(value("--run-root") ?? (runId ? path.join(cwd, "artifacts", "parity", runId) : ""));
  if (!runId && !value("--run-root")) throw new Error("Usage: tsx scripts/parity/report.ts --run-id <runId> [--cwd <repo>]");
  const result = await generateParityReport({ cwd, runRoot });
  process.stdout.write(`${JSON.stringify({ ok: true, reportRoot: result.reportRoot })}\n`);
}

if ((process.argv[1] ?? "").replaceAll("\\", "/").endsWith("/scripts/parity/report.ts")) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
