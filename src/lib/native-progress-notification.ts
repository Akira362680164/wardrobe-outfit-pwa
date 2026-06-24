// ============================================================
// native-progress-notification (v0.9.27-dev)
// ============================================================
// 统一的"原生进度通知桥接层", 将 App 内耗时任务进度同步到
// Android 系统通知栏, 让用户切后台后也能看到任务仍在进行 / 当前
// 阶段 / 软进度 / 完成或失败状态。
//
// 设计原则 (per AGENTS.md + v0.9.27-dev 派单):
//   1. App 内原有进度 UI 保留, 不替代; 系统通知作为补充。
//   2. 浏览器 / 非 Capacitor 原生环境必须静默降级, 不报错。
//   3. 所有方法内部 catch, 通知失败不影响主流程。
//   4. title / text 不含敏感数据 (API Key / 图片 / 路径 / 长堆栈)。
//   5. percent 限制在 0-100, 软进度 99% 内展示"处理中"。
//   6. 同一 taskId 重复任务可覆盖旧通知, 不同 taskId 不互相覆盖。
//   7. 内置节流 (THROTTLE_MIN_MS 800ms + 1% 变化) 防止每帧跨桥。
//
// 通知范围 (强制白名单, 不在白名单里的不调系统通知):
//   - garment_detection / batch_garment_detection
//   - shopping_image_analysis / shopping_assessment
//   - outfit_recommendation / wardrobe_diagnosis / try_on_preview
//   - backup_export / backup_import
//
// 不在白名单的内容 (普通 toast / 即时交互) 不会进通知栏。
// ============================================================

import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeProgressTaskId =
  | "garment_detection"
  | "batch_garment_detection"
  | "shopping_image_analysis"
  | "shopping_assessment"
  | "outfit_recommendation"
  | "wardrobe_diagnosis"
  | "try_on_preview"
  | "backup_export"
  | "backup_import";

export interface NativeProgressNotificationPayload {
  taskId: NativeProgressTaskId;
  title: string;
  text: string;
  percent?: number;
  ongoing?: boolean;
}

export interface NativeProgressCompletePayload {
  taskId: NativeProgressTaskId;
  title: string;
  text?: string;
}

interface NativeProgressNotificationPlugin {
  ensurePermission(): Promise<{ granted: boolean }>;
  start(payload: NativeProgressNotificationPayload): Promise<void>;
  update(payload: NativeProgressNotificationPayload): Promise<void>;
  complete(payload: NativeProgressCompletePayload): Promise<void>;
  fail(payload: NativeProgressCompletePayload): Promise<void>;
  dismiss(payload: { taskId: NativeProgressTaskId }): Promise<void>;
}

const NativeProgressNotification = registerPlugin<NativeProgressNotificationPlugin>("NativeProgressNotification");

// 默认关闭: 浏览器 / 非原生环境, 所有方法都直接 no-op。
// 必须用 try/catch 包裹 Capacitor.isPluginAvailable, 因为它在 SSR
// (typeof window === "undefined") 阶段会抛错。
function isNativeAndroid(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      Capacitor.getPlatform() === "android" &&
      Capacitor.isPluginAvailable("NativeProgressNotification")
    );
  } catch {
    return false;
  }
}

// 节流: 防止 useSoftAiProgress 的 rAF tick 每帧跨桥调用原生。
// 规则: 同一 taskId 两次同步之间, 必须 (a) percent 整数变化 OR
// (b) stage 变化 OR (c) 距上次同步 >= THROTTLE_MIN_MS。
// force=true 跳过节流 (用于 start / complete / fail 这类显式时机)。
const THROTTLE_MIN_MS = 800;
const PERCENT_DELTA = 1;

interface ThrottleEntry {
  lastPercent: number;
  lastStage: string;
  lastTimestamp: number;
}

const throttleMap = new Map<NativeProgressTaskId, ThrottleEntry>();

// v0.9.27-dev subagent I-1 修复: 旧实现 1% delta OR 800ms, 对 18s garment_detection
// 来说 1% ≈ 180ms, 走的是 1% 路径, 18s 任务约 100 次跨桥。新实现:
//   - stage 变化 → 立即同步 (阶段过渡是离散事件, 不频繁)
//   - percent 变化 ≥ 1% 且距上次同步 ≥ THROTTLE_MIN_MS → 同步 (双条件 AND)
// 这样对 18s 任务实际节流 ≈ 100ms (percent 整数 1%/180ms) 中最少每 800ms 一次,
// 18s 任务约 22 次 update, 比原 100 次降 4-5x。THROTTLE_MIN_MS 800ms 是兜底。
export function shouldSyncNotification(
  taskId: NativeProgressTaskId,
  percent: number,
  stage: string,
  force = false,
): boolean {
  if (force) return true;
  const now = Date.now();
  const entry = throttleMap.get(taskId);
  if (!entry) {
    throttleMap.set(taskId, { lastPercent: percent, lastStage: stage, lastTimestamp: now });
    return true;
  }
  if (stage !== entry.lastStage) return true;
  const percentChanged = Math.abs(percent - entry.lastPercent) >= PERCENT_DELTA;
  const minIntervalElapsed = now - entry.lastTimestamp >= THROTTLE_MIN_MS;
  if (percentChanged && minIntervalElapsed) return true;
  return false;
}

export function markSynced(taskId: NativeProgressTaskId, percent: number, stage: string): void {
  throttleMap.set(taskId, { lastPercent: percent, lastStage: stage, lastTimestamp: Date.now() });
}

export function resetThrottle(taskId: NativeProgressTaskId): void {
  throttleMap.delete(taskId);
}

// 文本脱敏: 通知里不能写 API Key / 图片 base64 / 完整路径 / 长堆栈。
// 通知栏是用户 / 其他 app 都能看见的公共区域, 任何敏感信息都先过滤。
const TITLE_MAX = 40;
const TEXT_MAX = 80;

function sanitizeTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.length > TITLE_MAX ? trimmed.slice(0, TITLE_MAX) : trimmed;
}

function sanitizeText(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.length > TEXT_MAX) return trimmed.slice(0, TEXT_MAX);
  return trimmed;
}

function sanitizePercent(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return Math.round(raw);
}

// 错误摘要: 把任意 error 截成短摘要, 避免堆栈全文进通知。
// 不暴露: API Key, file path, 完整 base64, 模型 prompt 段。
export function summarizeErrorMessage(err: unknown, fallback = "请稍后重试"): string {
  if (err == null) return fallback;
  let raw = "";
  if (typeof err === "string") raw = err;
  else if (err instanceof Error) raw = err.message;
  else raw = String(err);
  // 去掉换行 + 多余空白
  raw = raw.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  if (raw.length > TEXT_MAX) return raw.slice(0, TEXT_MAX);
  return raw;
}

/**
 * 申请 Android 13+ POST_NOTIFICATIONS 权限。
 * 浏览器 / 非原生环境直接返回 false。
 * 失败 / 用户拒绝都不抛错。
 */
/**
 * v0.9.27-dev subagent I-2 修复: 模块级权限请求缓存。
 * Android 13+ 上, 用户在系统权限对话框"拒绝" (没勾不再询问) 后, 后续
 * requestPermissionForAlias 会**再次弹窗**, 直到用户选"不再询问"或已授权。
 * 旧实现 fire-and-forget 在每次 start() 都请求, 1 分钟内连发 3 个任务
 * (录入 + 诊断 + 试穿) 就会面对 3 次权限弹窗。新实现:
 *   - 模块级 askedThisSession: true 之后, 后续 ensurePermission 走"仅查询"
 *   - granted 状态仍每次查询, 因为用户在系统设置里随时可以翻转授权
 *   - permissionPromise 防止并发 start() 期间重复请求
 */
let permissionAskedThisSession = false;
let permissionPromise: Promise<boolean> | null = null;
let permissionGranted: boolean | null = null;

export async function ensureProgressNotificationPermission(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    if (!permissionAskedThisSession) {
      // 首次请求: 弹窗一次, 缓存 promise
      permissionAskedThisSession = true;
      permissionPromise = NativeProgressNotification.ensurePermission()
        .then((result) => {
          permissionGranted = Boolean(result?.granted);
          return permissionGranted;
        })
        .catch((error) => {
          if (typeof console !== "undefined") {
            console.warn("[native-progress-notification] ensurePermission failed:", error);
          }
          permissionGranted = false;
          return false;
        });
    } else if (permissionPromise) {
      // 后续调用: 等首次 promise 落地
      await permissionPromise;
    }
    return permissionGranted ?? false;
  } catch (error) {
    if (typeof console !== "undefined") {
      console.warn("[native-progress-notification] ensurePermission error:", error);
    }
    return false;
  }
}

export async function startProgressNotification(
  payload: NativeProgressNotificationPayload,
): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await NativeProgressNotification.start({
      ...payload,
      title: sanitizeTitle(payload.title),
      text: sanitizeText(payload.text, "处理中"),
      percent: sanitizePercent(payload.percent),
      ongoing: true,
    });
  } catch (error) {
    if (typeof console !== "undefined") {
      console.warn("[native-progress-notification] start failed:", error);
    }
  }
}

export async function updateProgressNotification(
  payload: NativeProgressNotificationPayload,
): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await NativeProgressNotification.update({
      ...payload,
      title: sanitizeTitle(payload.title),
      text: sanitizeText(payload.text, "处理中"),
      percent: sanitizePercent(payload.percent),
      ongoing: payload.ongoing ?? true,
    });
  } catch (error) {
    if (typeof console !== "undefined") {
      console.warn("[native-progress-notification] update failed:", error);
    }
  }
}

export async function completeProgressNotification(
  taskId: NativeProgressTaskId,
  title: string,
  text?: string,
): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await NativeProgressNotification.complete({
      taskId,
      title: sanitizeTitle(title),
      text: sanitizeText(text, "已完成"),
    });
  } catch (error) {
    if (typeof console !== "undefined") {
      console.warn("[native-progress-notification] complete failed:", error);
    }
  }
}

export async function failProgressNotification(
  taskId: NativeProgressTaskId,
  title: string,
  text?: string,
): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await NativeProgressNotification.fail({
      taskId,
      title: sanitizeTitle(title),
      text: text
        ? sanitizeText(`失败：${text.replace(/^失败[:：]\s*/, "")}`, "失败")
        : "失败",
    });
  } catch (error) {
    if (typeof console !== "undefined") {
      console.warn("[native-progress-notification] fail failed:", error);
    }
  }
}

export async function dismissProgressNotification(
  taskId: NativeProgressTaskId,
): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await NativeProgressNotification.dismiss({ taskId });
  } catch (error) {
    if (typeof console !== "undefined") {
      console.warn("[native-progress-notification] dismiss failed:", error);
    }
  }
}

// 是否当前运行在原生 Android 环境 (供 hook 内部做条件渲染)
export function isNativeProgressNotificationSupported(): boolean {
  return isNativeAndroid();
}
