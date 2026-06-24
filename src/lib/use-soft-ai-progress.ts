// ============================================================
// useSoftAiProgress (v0.8.14+ 软进度 hook)
// ============================================================
// 核心规则 (per 用户决策):
//   1. 软进度最多 99%, 真实完成跳 100% 保留 600ms
//   2. 默认时长用 2026-06-04 Claude Code M3 live timing 校准
//   3. localStorage 维护滚动平均, 5 次样本, 用 P75 防 outliers
//   4. 失败态: "X 失败 0%" 保留 2s 后清空
//   5. 不可精确估算时不要给用户"模型内部百分比"的暗示
//
// v0.9.27-dev: 接入 native-progress-notification 桥接层, 把软进度
// 同步到 Android 系统通知栏 (切后台也能看到)。保留 App 内进度
// UI, 不替代。所有 bridge 调用走 shouldSyncNotification 节流,
// 严禁每帧跨桥。
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeProgressNotification,
  dismissProgressNotification,
  ensureProgressNotificationPermission,
  failProgressNotification,
  isNativeProgressNotificationSupported,
  markSynced,
  resetThrottle,
  shouldSyncNotification,
  startProgressNotification,
  summarizeErrorMessage,
  updateProgressNotification,
  type NativeProgressTaskId,
} from "@/lib/native-progress-notification";

export type AiTaskType =
  | "garment_detection"
  | "batch_garment_detection"
  | "shopping_image_analysis"
  | "shopping_assessment"
  | "outfit_recommendation"
  | "wardrobe_diagnosis"
  | "try_on_preview";

const TASK_TYPE_TO_NATIVE_ID: Record<AiTaskType, NativeProgressTaskId> = {
  garment_detection: "garment_detection",
  batch_garment_detection: "batch_garment_detection",
  shopping_image_analysis: "shopping_image_analysis",
  shopping_assessment: "shopping_assessment",
  outfit_recommendation: "outfit_recommendation",
  wardrobe_diagnosis: "wardrobe_diagnosis",
  try_on_preview: "try_on_preview",
};

// 默认 soft duration (per 2026-06-04 Claude Code M3 live timing)
// 继续配合 localStorage P75 + 3s 自适应，避免一次性 outlier 主导后续体验。
export const DEFAULT_DURATIONS_MS: Record<AiTaskType, number> = {
  garment_detection: 18000,        // M3 P75 ~= 21s; app 压缩后图片更小
  batch_garment_detection: 50000,  // M3 N=2-3 P75 ~= 42s; N=5 需动态 95s
  shopping_image_analysis: 20000,  // M3 P75 ~= 26s; maxTokens 更高
  shopping_assessment: 20000,      // M3 P75 ~= 23s
  outfit_recommendation: 35000,    // M3 P75 ~= 39s
  wardrobe_diagnosis: 15000,       // M3 P75 ~= 15s
  try_on_preview: 60000,           // 串行三连调用: planOutfitPreviewPrompt 25s + image_generation 60s + reviewOutfitPreview 60s; P75 累加 ~50s, 60s + buffer
};

const STORAGE_KEY = "wardrobe-ai-progress-history-v1";
const HISTORY_LIMIT = 5;
const COMPLETE_HOLD_MS = 600;
const FAIL_HOLD_MS = 2000;

export interface SoftProgressState {
  visible: boolean;
  percent: number;
  stage: string;
  label: string;
}

export interface UseSoftAiProgressOptions {
  label?: string;
  /** 阶段文字, 数组长度 2-4 个, 按 ratio 切分 */
  stageLabels?: [string, string] | [string, string, string] | [string, string, string, string];
  /**
   * 是否把进度同步到 Android 系统通知栏. 默认 true (非原生环境自动 no-op).
   * 关闭后 hook 仍维护 App 内进度, 但不跨桥调用原生。
   */
  nativeNotification?: boolean;
  /**
   * 通知栏 task id override; 不传时按 taskType 推导。
   * 主要给"同一 in-app task 共用 hook 但底层调 batch / 整套识别"这类场景用。
   * 例: tagProgress 复用 garment_detection, 但 batch 模式期间改 batch_garment_detection。
   */
  notificationTaskId?: NativeProgressTaskId;
}

export interface UseSoftAiProgressReturn extends SoftProgressState {
  start: () => void;
  complete: (success?: boolean) => void;
  fail: (errorMsg?: string) => void;
  /**
   * 切换当前通知 task id (仅影响系统通知, App 内 label 不变).
   * 在 start() 之前调用生效, start() 之后切换会随下次 start() 应用。
   * 用于"共用一个 hook, 但底层可能切到 batch / 整套识别"的场景。
   */
  setNotificationTaskId: (taskId: NativeProgressTaskId) => void;
}

export function useSoftAiProgress(
  taskType: AiTaskType,
  options: UseSoftAiProgressOptions = {},
): UseSoftAiProgressReturn {
  const defaultLabel = options.label ?? defaultLabelForTask(taskType);
  const stages = (options.stageLabels ?? defaultStagesForTask(taskType)) as string[];
  const nativeEnabled = options.nativeNotification !== false && isNativeProgressNotificationSupported();
  const defaultNativeTaskId = TASK_TYPE_TO_NATIVE_ID[taskType];
  const nativeTaskIdRef = useRef<NativeProgressTaskId>(
    options.notificationTaskId ?? defaultNativeTaskId,
  );

  const [state, setState] = useState<SoftProgressState>({
    visible: false,
    percent: 0,
    stage: stages[0],
    label: defaultLabel,
  });

  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(DEFAULT_DURATIONS_MS[taskType]);
  const rafRef = useRef<number>(0);
  const completedRef = useRef<boolean>(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 标记 taskId 切换后是否需要重新发 start (setNotificationTaskId 在 start() 之后
  // 改变时, 下一次 rAF 同步会先发一次 start 把新 taskId 注册成新通知)。
  const nativeNeedsRestartRef = useRef<boolean>(false);

  // 加载 localStorage 历史 P75 + buffer (v0.9.8: P90+5s buffer 仍太慢, 实际 AI 16s 就完但进度条 65%, 改 P75+3s 更接近真实)
  const loadDuration = useCallback((): number => {
    if (typeof window === "undefined") return DEFAULT_DURATIONS_MS[taskType];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_DURATIONS_MS[taskType];
      const history = JSON.parse(raw) as Partial<Record<AiTaskType, number[]>>;
      const samples = history[taskType] ?? [];
      if (samples.length < 2) return DEFAULT_DURATIONS_MS[taskType];
      // P75: 比 P50 慢 25% 样本, 比 P90 快 25% — 平衡估算
      const sorted = [...samples].sort((a, b) => a - b);
      const p75 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))];
      // 不低于 DEFAULT 80% (之前 0.9 偏慢, 改 0.8 更接近真实分布)
      const base = Math.max(DEFAULT_DURATIONS_MS[taskType] * 0.8, p75);
      // 3s buffer (之前 5s 偏多, 改 3s)
      return base + 3000;
    } catch {
      return DEFAULT_DURATIONS_MS[taskType];
    }
  }, [taskType]);

  const recordHistory = useCallback((realMs: number) => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY) || "{}";
      const history = JSON.parse(raw) as Record<string, number[]>;
      const arr = history[taskType] ?? [];
      arr.push(realMs);
      if (arr.length > HISTORY_LIMIT) arr.shift();
      history[taskType] = arr;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch { /* quota / private mode / etc. — ignore */ }
  }, [taskType]);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const start = useCallback(() => {
    clearHideTimer();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startTimeRef.current = Date.now();
    durationRef.current = loadDuration();
    completedRef.current = false;
    setState({ visible: true, percent: 0, stage: stages[0], label: defaultLabel });

    // 通知栏: 申请权限 (fire-and-forget) + 发 start 通知 + 重置节流。
    if (nativeEnabled) {
      const taskId = nativeTaskIdRef.current;
      resetThrottle(taskId);
      // 权限请求是异步的, 不 await, 避免拖慢主流程 (用户点"开始"立刻看到 App 内进度)。
      void ensureProgressNotificationPermission();
      void startProgressNotification({
        taskId,
        title: defaultLabel,
        text: stages[0] || "处理中",
        percent: 0,
        ongoing: true,
      });
      markSynced(taskId, 0, stages[0] || "");
    }
    nativeNeedsRestartRef.current = false;

    const tick = () => {
      if (completedRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      const ratio = Math.min(0.99, elapsed / durationRef.current);
      const percent = Math.round(ratio * 100);
      const stageIdx = Math.min(stages.length - 1, Math.floor(ratio * stages.length));
      const stage = stages[stageIdx] ?? stages[stages.length - 1] ?? "";
      setState((prev) =>
        prev.percent === percent && prev.stage === stage
          ? prev
          : { visible: true, percent, stage, label: defaultLabel },
      );
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [defaultLabel, loadDuration, nativeEnabled, stages]);

  // 软进度更新时同步通知 (rAF 节流由 shouldSyncNotification 控制)。
  // 仅在 visible 期间同步; 完成 / 失败由 complete / fail 显式处理。
  useEffect(() => {
    if (!nativeEnabled) return;
    if (!state.visible) return;
    if (completedRef.current) return;
    const taskId = nativeTaskIdRef.current;
    const percent = Math.max(0, Math.min(100, Math.round(state.percent)));
    const stage = state.stage || "处理中";
    if (nativeNeedsRestartRef.current) {
      // setNotificationTaskId 在 start() 之后改变: 重发 start 占新 taskId 的通知槽,
      // 旧 taskId 由 complete / dismiss 显式清理 (start 不应跨 taskId 覆盖, 否则
      // 同时跑 batch + single 时旧 single 通知会被覆盖成 batch)。
      resetThrottle(taskId);
      void startProgressNotification({
        taskId,
        title: state.label,
        text: `${stage} · ${percent}%`,
        percent,
        ongoing: true,
      });
      markSynced(taskId, percent, stage);
      nativeNeedsRestartRef.current = false;
      return;
    }
    if (!shouldSyncNotification(taskId, percent, stage)) return;
    markSynced(taskId, percent, stage);
    void updateProgressNotification({
      taskId,
      title: state.label,
      text: `${stage} · ${percent}%`,
      percent,
      ongoing: true,
    });
  }, [nativeEnabled, state.visible, state.percent, state.stage, state.label]);

  const complete = useCallback((success: boolean = true) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    completedRef.current = true;
    const realMs = Date.now() - startTimeRef.current;
    if (success) recordHistory(realMs);
    setState({
      visible: true,
      percent: 100,
      stage: success ? "完成" : "失败",
      label: defaultLabel,
    });
    if (nativeEnabled) {
      const taskId = nativeTaskIdRef.current;
      void completeProgressNotification(taskId, defaultLabel, success ? "已完成" : "失败");
      resetThrottle(taskId);
    }
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setState((prev) =>
        prev.percent === 100
          ? { visible: false, percent: 0, stage: "", label: "" }
          : prev,
      );
    }, COMPLETE_HOLD_MS);
  }, [defaultLabel, nativeEnabled, recordHistory]);

  const fail = useCallback((errorMsg?: string) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    completedRef.current = true;
    setState({
      visible: true,
      percent: 0,
      stage: "失败",
      label: errorMsg || `${defaultLabel} 失败`,
    });
    if (nativeEnabled) {
      const taskId = nativeTaskIdRef.current;
      const summary = summarizeErrorMessage(errorMsg, "请稍后重试");
      void failProgressNotification(taskId, defaultLabel, summary);
      resetThrottle(taskId);
    }
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setState({ visible: false, percent: 0, stage: "", label: "" });
    }, FAIL_HOLD_MS);
  }, [defaultLabel, nativeEnabled]);

  // 卸载兜底: 清理 in-flight 通知 (用户切走页面 / 关闭浏览器标签 / 切其他 view)。
  // 短任务 (start 后立刻 complete) 也安全: complete 会先把 taskId 的通知收掉。
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (nativeEnabled && !completedRef.current) {
        // 仅在 hook 还没收到 complete/fail 时清理 (避免覆盖完成态)
        const taskId = nativeTaskIdRef.current;
        void dismissProgressNotification(taskId);
        resetThrottle(taskId);
      }
    };
  }, [nativeEnabled]);

  const setNotificationTaskId = useCallback((taskId: NativeProgressTaskId) => {
    if (nativeTaskIdRef.current === taskId) return;
    const prev = nativeTaskIdRef.current;
    nativeTaskIdRef.current = taskId;
    // 旧 taskId 的通知 (可能还在 1.5s/2.5s auto-dismiss 窗口里展示) 立即 dismiss,
    // 避免 "上一轮 AI 拆分多件衣物 已完成" + "新一轮 AI 识别衣物 处理中" 短暂共存。
    // completedRef.current === true (上一轮已 complete) 时也照 dismiss — complete
    // 只解 ongoing + 1.5s 自动消失, 没有立即取消。
    void dismissProgressNotification(prev);
    resetThrottle(prev);
    // start() 之后切换: state.visible 仍为 true, 下一帧 useEffect 会发新 taskId 的 start。
    if (state.visible && !completedRef.current) {
      nativeNeedsRestartRef.current = true;
    }
  }, [state.visible]);

  return { ...state, start, complete, fail, setNotificationTaskId };
}

function defaultLabelForTask(task: AiTaskType): string {
  switch (task) {
    case "garment_detection": return "AI 识别衣物";
    case "batch_garment_detection": return "AI 拆分多件衣物";
    case "shopping_image_analysis": return "AI 分析购物图片";
    case "shopping_assessment": return "AI 评估是否值得买";
    case "outfit_recommendation": return "AI 生成套装推荐";
    case "wardrobe_diagnosis": return "AI 衣橱诊断";
    case "try_on_preview": return "AI 生成试穿预览";
  }
}

function defaultStagesForTask(task: AiTaskType): [string, string, string, string] {
  switch (task) {
    case "garment_detection":
    case "batch_garment_detection":
    case "shopping_image_analysis":
      return ["准备图片", "发送识别", "等待 AI", "整理结果"];
    case "shopping_assessment":
    case "outfit_recommendation":
    case "wardrobe_diagnosis":
      return ["准备数据", "发送 AI", "等待分析", "整理结果"];
    case "try_on_preview":
      return ["规划试穿画面", "生成图片", "质检图片", "完成"];
  }
}
