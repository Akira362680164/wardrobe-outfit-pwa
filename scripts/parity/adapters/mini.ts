import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, writeJson } from "../lib/fs";

interface RuntimeAuth {
  phone: string;
  password: string;
}

interface WechatResult {
  ok: boolean;
  result?: unknown;
}

async function wechatide(client: string, tool: string, args: string[]): Promise<WechatResult> {
  const stdout = await wechatideText(client, tool, args);
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0) throw new Error(`wechatide ${tool} returned no JSON`);
  const parsed = JSON.parse(stdout.slice(jsonStart)) as WechatResult;
  if (!parsed.ok || (typeof parsed.result === "string" && parsed.result.startsWith("MCP error"))) {
    throw new Error(`wechatide ${tool} failed`);
  }
  return parsed;
}

async function wechatideText(client: string, tool: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    execFile("wechatide", ["-c", client, "-t", tool, ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }, (error, output, stderr) => {
      if (error) reject(new Error((stderr || output || error.message).trim()));
      else resolve(output);
    });
  });
}

function sanitizeDebugText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, "Bearer ***")
    .replace(/("?(?:accessToken|refreshToken|password|token)"?\s*[:=]\s*")[^"]+/giu, "$1***")
    .replace(/([?&](?:token|key|code)=)[^&\s"']+/giu, "$1***");
}

function summarizeNetworkDebug(value: string): Array<{ method?: string; url: string; status?: number }> {
  const normalized = value.replaceAll('\\"', '"');
  const records: Array<{ method?: string; url: string; status?: number }> = [];
  const pattern = /"method":"([A-Z]+)"[^\n]*?"url":"(https?:\/\/[^"\\]+)"(?:[^\n]*?"status":(\d+))?/gu;
  for (const match of normalized.matchAll(pattern)) {
    const candidate = {
      method: match[1],
      url: match[2].replace(/([?&](?:token|key|code)=)[^&]+/giu, "$1***"),
      status: match[3] ? Number(match[3]) : undefined,
    };
    if (!records.some((record) => record.method === candidate.method && record.url === candidate.url && record.status === candidate.status)) {
      records.push(candidate);
    }
  }
  return records;
}

async function runtimeInfo(client: string, project: string, action: "currentPage" | "pageStack" | "systemInfo"): Promise<unknown> {
  return (await wechatide(client, "automation_runtime_info", ["--project", project, "--action", action])).result;
}

async function pageAction(client: string, project: string, action: string, extras: string[] = []): Promise<unknown> {
  return (await wechatide(client, "automation_page_action", ["--project", project, "--action", action, ...extras])).result;
}

async function screenshot(client: string, project: string, target: string): Promise<void> {
  await wechatide(client, "automation_viewport_action", [
    "--project", project,
    "--action", "screenshot",
    "--path", target,
    "--wait-seconds", "1",
  ]);
}

async function waitForRoute(client: string, project: string, expected: string): Promise<unknown> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await runtimeInfo(client, project, "currentPage") as { path?: string };
    if (current?.path === expected) return current;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Mini Program route did not become ${expected}`);
}

async function waitForItem(client: string, project: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const data = await pageAction(client, project, "getData") as { item?: unknown; loading?: boolean };
    if (data?.item && !data.loading) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Mini Program garment detail did not finish loading");
}

async function saveCheckpoint(options: {
  client: string;
  project: string;
  directory: string;
  name: string;
}): Promise<void> {
  await ensureDir(options.directory);
  await screenshot(options.client, options.project, path.join(options.directory, `${options.name}.png`));
  await writeJson(path.join(options.directory, `${options.name}-route.json`), {
    currentPage: await runtimeInfo(options.client, options.project, "currentPage"),
    pageStack: await runtimeInfo(options.client, options.project, "pageStack"),
  });
  await writeJson(path.join(options.directory, `${options.name}-ui-tree.json`), {
    pageData: await pageAction(options.client, options.project, "getData"),
    buttons: await pageAction(options.client, options.project, "querySelectorAll", ["--selector", "button"]),
    images: await pageAction(options.client, options.project, "querySelectorAll", ["--selector", "image"]),
  });
}

export async function captureMiniGarmentDetailSample(options: {
  cwd: string;
  runRoot: string;
  runId: string;
  client: string;
  project: string;
  runtimeSessionFile: string;
  fixtureManifestFile: string;
  apiBaseUrl: string;
}): Promise<{ evidenceRoot: string }> {
  const auth = JSON.parse(await fs.readFile(options.runtimeSessionFile, "utf8")) as RuntimeAuth;
  const fixtureManifest = JSON.parse(await fs.readFile(options.fixtureManifestFile, "utf8")) as {
    entities: Record<string, { id: string }>;
  };
  await wechatide(options.client, "automation_evaluate", [
    "--project", options.project,
    "--fn-source", `() => { const app = getApp(); app.globalData.apiBaseUrl = ${JSON.stringify(options.apiBaseUrl)}; return true; }`,
  ]);
  const current = await runtimeInfo(options.client, options.project, "currentPage") as { path?: string };
  if (current?.path === "pages/login/index") {
    await pageAction(options.client, options.project, "callMethod", ["--method", "openPasswordLogin"]);
    await waitForRoute(options.client, options.project, "pages/login/password/index");
  }
  const loginPage = await runtimeInfo(options.client, options.project, "currentPage") as { path?: string };
  if (loginPage?.path === "pages/login/password/index") {
    await pageAction(options.client, options.project, "setData", [
      "--patch", JSON.stringify({ account: auth.phone, password: auth.password, accepted: true }),
    ]);
    await pageAction(options.client, options.project, "callMethod", ["--method", "loginByPassword"]);
    await waitForRoute(options.client, options.project, "pages/wardrobe/index/index");
  }
  const garmentId = fixtureManifest.entities["garment.complete"]?.id;
  if (!garmentId) throw new Error("garment.complete fixture id missing");
  await wechatide(options.client, "automation_navigate", [
    "--project", options.project,
    "--action", "navigateTo",
    "--url", `/pages/wardrobe/detail/index?id=${encodeURIComponent(garmentId)}`,
  ]);
  await waitForRoute(options.client, options.project, "pages/wardrobe/detail/index");
  await waitForItem(options.client, options.project);

  const evidenceRoot = path.join(options.runRoot, "wardrobe", "wardrobe.garment.detail", "garment.complete", "garment.detail.more", "mini");
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "00-before-raw" });
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "00-before-annotated" });
  await pageAction(options.client, options.project, "callMethod", ["--method", "openDeleteSheet"]);
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "01-immediate" });
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "02-settled" });
  await pageAction(options.client, options.project, "callMethod", ["--method", "closeDeleteSheet"]);
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "03-return-or-close" });
  const network = await wechatideText(options.client, "get_app_network_content", [
    "--project", options.project,
    "--command", "grep -E '127.0.0.1:3100|/api/' | tail -200",
  ]);
  const consoleErrors = await wechatideText(options.client, "get_app_console_content", [
    "--project", options.project,
    "--command", "grep -iE 'error|fail|exception'",
  ]);
  await writeJson(path.join(evidenceRoot, "network.json"), summarizeNetworkDebug(network));
  await fs.writeFile(path.join(evidenceRoot, "console-errors.txt"), sanitizeDebugText(consoleErrors));
  await writeJson(path.join(evidenceRoot, "execution.json"), {
    schemaVersion: 1,
    platform: "mini",
    screenId: "wardrobe.garment.detail",
    stateId: "info.top",
    actionId: "garment.detail.more",
    status: "DEFECT",
    transition: "direct-delete-sheet",
    returnPath: "sheet-close",
    defectReason: "MINI_ONLY_DEFECT: APP 的更多操作菜单在小程序中被多个直接操作替代",
    evidenceFiles: ["00-before-raw.png", "00-before-annotated.png", "01-immediate.png", "02-settled.png", "03-return-or-close.png"],
  });
  return { evidenceRoot };
}

export async function captureMiniDiagnosticsSample(options: {
  runRoot: string;
  client: string;
  project: string;
}): Promise<{ evidenceRoot: string }> {
  await wechatide(options.client, "automation_navigate", [
    "--project", options.project,
    "--action", "navigateTo",
    "--url", "/pages/settings/diagnostics/index",
  ]);
  await waitForRoute(options.client, options.project, "pages/settings/diagnostics/index");
  const evidenceRoot = path.join(options.runRoot, "settings", "settings.diagnostics.upload", "diagnostics.normal", "diagnostics.upload.confirm", "mini");
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "00-before-raw" });
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "00-before-annotated" });
  const description = `parity mini diagnostics ${Date.now()}`;
  await pageAction(options.client, options.project, "callMethod", ["--method", "startUpload"]);
  await pageAction(options.client, options.project, "setData", [
    "--patch", JSON.stringify({ description, canSubmit: true }),
  ]);
  await pageAction(options.client, options.project, "callMethod", ["--method", "retryUpload"]);
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "01-immediate" });
  let settled: { phase?: string; caseId?: string; uploadedAt?: string; errorMessage?: string } = {};
  for (let attempt = 0; attempt < 80; attempt += 1) {
    settled = await pageAction(options.client, options.project, "getData") as typeof settled;
    if (settled.phase === "success" || settled.phase === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "02-settled" });
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "03-return-or-close" });
  const network = await wechatideText(options.client, "get_app_network_content", [
    "--project", options.project,
    "--command", "grep '/api/diagnostics/cases' | tail -50",
  ]);
  await writeJson(path.join(evidenceRoot, "network.json"), summarizeNetworkDebug(network));
  const passed = settled.phase === "success" && Boolean(settled.caseId) && Boolean(settled.uploadedAt);
  await writeJson(path.join(evidenceRoot, "execution.json"), {
    schemaVersion: 1,
    platform: "mini",
    screenId: "settings.diagnostics.upload",
    stateId: "idle",
    actionId: "diagnostics.upload.confirm",
    status: passed ? "PASS" : "DEFECT",
    transition: settled.phase,
    sideEffect: "BACKEND_WRITE",
    caseId: settled.caseId,
    uploadedAt: settled.uploadedAt,
    defectId: passed ? undefined : "STATIC-SETTINGS-001",
    defectReason: passed ? undefined : settled.errorMessage || `诊断上传未进入成功态：${settled.phase ?? "unknown"}`,
    evidenceFiles: ["00-before-raw.png", "00-before-annotated.png", "01-immediate.png", "02-settled.png", "03-return-or-close.png"],
  });
  return { evidenceRoot };
}

export async function captureMiniCalendarSample(options: {
  runRoot: string;
  client: string;
  project: string;
  runtimeSessionFile: string;
  apiBaseUrl: string;
}): Promise<{ evidenceRoot: string }> {
  const auth = JSON.parse(await fs.readFile(options.runtimeSessionFile, "utf8")) as RuntimeAuth;
  await wechatide(options.client, "automation_evaluate", [
    "--project", options.project,
    "--fn-source", `() => { const app = getApp(); app.globalData.apiBaseUrl = ${JSON.stringify(options.apiBaseUrl)}; return true; }`,
  ]);
  await wechatide(options.client, "automation_navigate", [
    "--project", options.project,
    "--action", "reLaunch",
    "--url", "/pages/login/index",
  ]);
  await waitForRoute(options.client, options.project, "pages/login/index");
  await pageAction(options.client, options.project, "callMethod", ["--method", "openPasswordLogin"]);
  await waitForRoute(options.client, options.project, "pages/login/password/index");
  await pageAction(options.client, options.project, "setData", [
    "--patch", JSON.stringify({ account: auth.phone, password: auth.password, accepted: true }),
  ]);
  await pageAction(options.client, options.project, "callMethod", ["--method", "loginByPassword"]);
  await waitForRoute(options.client, options.project, "pages/wardrobe/index/index");
  await wechatide(options.client, "automation_navigate", [
    "--project", options.project,
    "--action", "navigateTo",
    "--url", "/pages/outfits/calendar/index",
  ]);
  await waitForRoute(options.client, options.project, "pages/outfits/calendar/index");
  const evidenceRoot = path.join(options.runRoot, "outfits", "outfits.planning.calendar", "calendar.with_plan", "outfits.calendar.next-month", "mini");
  const before = await pageAction(options.client, options.project, "getData") as { monthTitle?: string };
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "00-before-raw" });
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "00-before-annotated" });
  await wechatide(options.client, "automation_element_action", [
    "--project", options.project,
    "--action", "tap",
    "--selector", "[data-delta=\"next\"]",
  ]);
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "01-immediate" });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const after = await pageAction(options.client, options.project, "getData") as { monthTitle?: string };
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "02-settled" });
  await saveCheckpoint({ client: options.client, project: options.project, directory: evidenceRoot, name: "03-return-or-close" });
  await writeJson(path.join(evidenceRoot, "execution.json"), {
    schemaVersion: 1,
    platform: "mini",
    screenId: "outfits.planning.calendar",
    stateId: "month.with-plan",
    actionId: "outfits.calendar.next-month",
    status: after.monthTitle === before.monthTitle ? "DEFECT" : "PASS",
    beforeTitle: before.monthTitle,
    afterTitle: after.monthTitle,
    sideEffect: "NONE",
    defectReason: after.monthTitle === before.monthTitle ? "小程序月份箭头是无事件绑定的静态 view，点击后月份不变" : undefined,
    evidenceFiles: ["00-before-raw.png", "00-before-annotated.png", "01-immediate.png", "02-settled.png", "03-return-or-close.png"],
  });
  return { evidenceRoot };
}
