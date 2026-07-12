import { getSession, isLoggedIn } from "../stores/session";
import { buildAuthHeaders, getConfiguredApiBaseUrl, HttpError, request } from "./http";
import { fetchWorkspaceSummary } from "./workspace";

type DiagnosticPhase = "building" | "authorizing" | "uploading";

export interface DiagnosticProgress {
  phase: DiagnosticPhase;
  message: string;
  caseId?: string;
}

export interface DiagnosticUploadResult {
  caseId: string;
  uploadedAt: string;
  expiresAt: string;
}

interface DiagnosticCaseResponse {
  caseId: string;
  status: "pending_upload";
}

interface DiagnosticContentResponse {
  caseId: string;
  status: "uploaded";
  uploadedAt: string;
  expiresAt: string;
}

const MAX_DIAGNOSTIC_BYTES = 10 * 1024 * 1024;
const MINI_APP_VERSION = "0.1.0";
// This source snapshot is the locked formal wechat/miniprogram baseline for
// this repair batch; release builds can replace it with generated metadata.
const MINI_GIT_COMMIT = "62e35eb70287e097591ca1840a2654ab32050236";

export async function uploadMiniProgramDiagnostic(
  problemDescription: string,
  onProgress: (progress: DiagnosticProgress) => void,
): Promise<DiagnosticUploadResult> {
  const session = getSession();
  if (!isLoggedIn() || !session?.token || !session.deviceId) {
    throw new DiagnosticUploadError("NOT_LOGGED_IN", "登录后才能上传诊断数据", "build");
  }

  onProgress({ phase: "building", message: "正在整理诊断数据…" });
  const summary = await fetchWorkspaceSummary().catch((error) => {
    throw normalizeDiagnosticError(error, "build");
  });
  const clientRequestId = createUuid();
  const buildTime = new Date().toISOString();
  const diagnostic = sanitizeDiagnosticValue({
    schemaVersion: 1,
    clientRequestId,
    generatedAt: buildTime,
    platform: "wechat-miniprogram",
    build: {
      appVersion: MINI_APP_VERSION,
      gitCommit: MINI_GIT_COMMIT,
      buildChannel: "internal",
    },
    userReport: { description: problemDescription },
    appState: {
      route: currentRoute(),
      auth: { loggedIn: true, expiresAt: session.expiresAt ?? null },
      workspace: {
        serverRevision: summary.serverRevision,
        requestId: summary.requestId ?? null,
        counts: {
          items: summary.garmentCount,
          outfits: summary.outfitCount,
          wishlistItems: summary.wishlistCount,
        },
      },
      system: safeSystemInfo(),
    },
    recentEvents: [],
  });
  const bytes = encodeUtf8(JSON.stringify(diagnostic));
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_DIAGNOSTIC_BYTES) {
    throw new DiagnosticUploadError("SIZE_EXCEEDED", "诊断数据超过上传限制", "build");
  }
  const sha256 = sha256Hex(bytes);

  onProgress({ phase: "authorizing", message: "正在创建诊断工单…" });
  const created = await request<DiagnosticCaseResponse>({
    method: "POST",
    path: "/api/diagnostics/cases",
    toast: false,
    data: {
      clientRequestId,
      schemaVersion: 1,
      appVersion: MINI_APP_VERSION,
      versionCode: 1,
      clientGitCommit: MINI_GIT_COMMIT,
      buildTime,
      buildChannel: "internal",
      problemDescription,
      sha256,
      sizeBytes: bytes.byteLength,
      eventCount: 0,
      itemCount: summary.garmentCount,
      outfitCount: summary.outfitCount,
      wishlistCount: summary.wishlistCount,
      recentRequestIds: summary.requestId && isUuid(summary.requestId) ? [summary.requestId] : [],
    },
  }).catch((error) => {
    throw normalizeDiagnosticError(error, "authorize");
  });

  onProgress({ phase: "uploading", message: "正在上传诊断数据…", caseId: created.caseId });
  return uploadContent(created.caseId, clientRequestId, sha256, bytes).catch((error) => {
    throw normalizeDiagnosticError(error, "upload", created.caseId);
  });
}

class DiagnosticUploadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly stage: "build" | "authorize" | "upload",
    public readonly caseId?: string,
  ) {
    super(message);
  }
}

export function describeDiagnosticError(error: unknown): {
  code: string;
  message: string;
  stage: "build" | "authorize" | "upload";
  caseId?: string;
} {
  const normalized = error instanceof DiagnosticUploadError ? error : normalizeDiagnosticError(error, "build");
  return { code: normalized.code, message: normalized.message, stage: normalized.stage, caseId: normalized.caseId };
}

function uploadContent(
  caseId: string,
  clientRequestId: string,
  sha256: string,
  bytes: ArrayBuffer,
): Promise<DiagnosticUploadResult> {
  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) return Promise.reject(new DiagnosticUploadError("MISSING_API", "后端 API 尚未配置", "upload", caseId));

  return new Promise((resolve, reject) => {
    wx.request<DiagnosticContentResponse>({
      url: `${baseUrl}/api/diagnostics/cases/${encodeURIComponent(caseId)}/content`,
      method: "PUT",
      data: bytes,
      header: {
        ...buildAuthHeaders(),
        "Content-Type": "application/octet-stream",
        "X-Diagnostic-Client-Request-Id": clientRequestId,
        "X-Diagnostic-Sha256": sha256,
        "X-Diagnostic-Size-Bytes": String(bytes.byteLength),
      },
      timeout: 60000,
      success(result) {
        if (result.statusCode < 400 && result.data?.status === "uploaded") {
          resolve(result.data);
          return;
        }
        const body = result.data as unknown as { code?: string; message?: string };
        reject(new DiagnosticUploadError(
          body?.code ?? "DIAGNOSTIC_UPLOAD_FAILED",
          body?.message ?? "诊断数据上传失败",
          "upload",
          caseId,
        ));
      },
      fail() {
        reject(new DiagnosticUploadError("NO_NETWORK", "网络连接失败，请联网后重试", "upload", caseId));
      },
    });
  });
}

function normalizeDiagnosticError(
  error: unknown,
  stage: "build" | "authorize" | "upload",
  caseId?: string,
): DiagnosticUploadError {
  if (error instanceof DiagnosticUploadError) return error;
  if (error instanceof HttpError) {
    const code = error.statusCode === 0 ? "NO_NETWORK" : stage === "authorize" ? "AUTHORIZE_FAILED" : error.code;
    return new DiagnosticUploadError(code, error.message, stage, caseId);
  }
  return new DiagnosticUploadError("UNKNOWN", error instanceof Error ? error.message : "诊断上传失败", stage, caseId);
}

function currentRoute(): string {
  const pages = getCurrentPages() as Array<{ route?: string }>;
  return pages[pages.length - 1]?.route ?? "pages/settings/diagnostics/index";
}

function safeSystemInfo(): Record<string, unknown> {
  const info = wx.getSystemInfoSync();
  return {
    platform: info.platform ?? "unknown",
    system: info.system ?? "unknown",
    model: info.model ?? "unknown",
    screenHeight: info.screenHeight ?? null,
  };
}

function sanitizeDiagnosticValue(value: unknown, key = "", depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (/token|password|secret|authorization|cookie|api.?key|image|photo|base64|filePath/i.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, "[JWT_REDACTED]")
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL_REDACTED]")
      .replace(/1\d{10}/g, "[PHONE_REDACTED]");
  }
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeDiagnosticValue(item, key, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      out[entryKey] = sanitizeDiagnosticValue(entryValue, entryKey, depth + 1);
    }
    return out;
  }
  return value;
}

function createUuid(): string {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function encodeUtf8(value: string): ArrayBuffer {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let point = value.charCodeAt(index);
    if (point >= 0xd800 && point <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(++index);
      point = 0x10000 + ((point - 0xd800) << 10) + (next - 0xdc00);
    }
    if (point < 0x80) bytes.push(point);
    else if (point < 0x800) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    else if (point < 0x10000) bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    else bytes.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 0x3f), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
  }
  return new Uint8Array(bytes).buffer;
}

function sha256Hex(buffer: ArrayBuffer): string {
  const input = new Uint8Array(buffer);
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const constants = SHA256_CONSTANTS;
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      words[index] = (words[index - 16] + (rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3)) + words[index - 7] + (rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = Array.from(state);
    for (let index = 0; index < 64; index += 1) {
      const t1 = (h + (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) + ((e & f) ^ (~e & g)) + constants[index] + words[index]) >>> 0;
      const t2 = ((rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, h];
    for (let index = 0; index < 8; index += 1) state[index] = (state[index] + next[index]) >>> 0;
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
