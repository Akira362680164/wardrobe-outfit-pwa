"use client";

/**
 * useKeyboardAwareEditable — Android WebView 软键盘 / 中文 IME 候选词栏变化时
 * 主动保持当前聚焦输入框可见的 hook。
 *
 * ------------------------------------------------------------------
 *  为什么 v0.9.21-dev 的单次 scrollIntoView 不够
 * ------------------------------------------------------------------
 *  v0.9.21-dev (commit abaabfa) 只在 `onFocus` 触发一次 200ms 延迟的
 *  `scrollIntoView({ block: "center" })`, 但 Android 中文 IME 候选词栏
 *  弹起/收起会多次触发 `visualViewport.resize` (候选词栏高度 200-300px
 *  反复变), 且 IME composition 期间浏览器会自己 scrollIntoView。
 *  单次 focus 滚动被后续 IME 状态变化 + 浏览器自动滚动覆盖,
 *  备注框再次被顶出可视区。v0.9.21-dev-fix (commit 7b3731d) 只修了
 *  useImageAspect race + null/square maxWidth, 没改键盘核心逻辑。
 *
 * ------------------------------------------------------------------
 *  修法
 * ------------------------------------------------------------------
 *  - focusin/focusout document 级追踪当前 active editable
 *  - visualViewport.resize + scroll 都触发 ensureVisible
 *  - compositionend 触发 ensureVisible (中文输入法上屏一次就触发)
 *  - 主动用 `getBoundingClientRect` + visualViewport.height/offsetTop
 *    计算 delta, `window.scrollBy` 必要距离, 不依赖浏览器自动 scrollIntoView
 *  - delta < MIN_DELTA_PX (8px) 时短路, 避免小幅抖动
 *  - 触发点 3 个 useEffect (v0.9.26-dev subagent M-3):
 *    1. focusin 追踪当前活动 editable (双 rAF + 50ms setTimeout 等浏览器 focus-scroll 落定)
 *    2. vv.resize 监听 (键盘开/关/IME 候选词栏 toggle/地址栏变化, **不**监听 vv.scroll, 避免
 *       与用户主动滑动冲突; subagent I-1)
 *    3. compositionend 监听 (中文 IME 上屏一字精确触发)
 *  - 主动 scrollBy 用 `behavior: "auto"` (instant), 避免多次 smooth scrollBy 互相打断
 *    (subagent I-5)
 *  - focusout 监听保留但**故意不 clear ref**: focusOut 后键盘仍开着, 后续 vv.resize /
 *    compositionend 仍能命中最后活动 editable 保可见
 *
 *  不在每次 onChange/input 都强制滚动, 避免边输入边跳 (input 期间由
 *  compositionend 接管, 拼音/英文直接输入靠 vv.resize 自动响应)。
 *
 * ------------------------------------------------------------------
 *  API
 * ------------------------------------------------------------------
 *  const { keyboard, activeEditableRef, ensureVisible } = useKeyboardAwareEditable();
 *  - keyboard.isOpen: 键盘是否打开 (visualViewport diff > 120px)
 *  - keyboard.height: 键盘高度 (px)
 *  - keyboard.viewportHeight / viewportOffsetTop: visualViewport 状态
 *  - activeEditableRef: 当前 focus 的 editable 元素, 供父组件手动接管
 *  - ensureVisible(): 主动跑一次保证当前 active editable 可见
 *
 *  父组件使用:
 *  - 用 `keyboard.isOpen` 条件渲染 fixed 底部按钮
 *  - 用 `keyboard.height` 调整容器 padding (避免被键盘挡)
 *  - 备注 textarea 不需要再 onFocus 调 scrollIntoView (hook 自动接管)
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface KeyboardState {
  isOpen: boolean;
  height: number;
  viewportHeight: number;
  viewportOffsetTop: number;
}

const KEYBOARD_OPEN_THRESHOLD_PX = 120;
const SAFE_TOP_PADDING_PX = 12;
const SAFE_BOTTOM_PADDING_PX = 16;
const MIN_DELTA_PX = 8; // 抖动抑制阈值 (subagent M-2: 真机 IME 候选词栏 toggle delta 30~100px, 4px 偏小, 升到 8px 避免小抖动)

function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type.toLowerCase();
    // 排除纯按钮型 input, 这些不会弹键盘
    return !["button", "submit", "reset", "checkbox", "radio", "file", "image", "color", "range"].includes(type);
  }
  return false;
}

export function useKeyboardAwareEditable() {
  const [keyboard, setKeyboard] = useState<KeyboardState>({
    isOpen: false,
    height: 0,
    viewportHeight: 0,
    viewportOffsetTop: 0,
  });
  const activeEditableRef = useRef<HTMLElement | null>(null);

  // ensureVisible: 主动计算并 scrollBy 必要距离
  // v0.9.26-dev: 用 behavior: "auto" (instant) 而非 "smooth", 避免多次 IME 候选词栏 toggle
  // 触发的多次 smooth scrollBy 互相打断, 最终位置不可预测。instant 多次调用每次都从当前
  // scrollY 累加 delta, 最终位置 = sum(deltas), 稳定可预测。
  // v0.9.21-dev 单次调 smooth 无此问题, 新 hook 多次调用把 latent 问题放大了 (subagent I-5)
  const ensureVisible = useCallback(() => {
    if (typeof window === "undefined") return;
    const el = activeEditableRef.current;
    if (!el || !el.isConnected) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const viewportTop = vv.offsetTop ?? 0;
    const viewportBottom = viewportTop + vv.height;
    const safeTop = viewportTop + SAFE_TOP_PADDING_PX;
    const safeBottom = viewportBottom - SAFE_BOTTOM_PADDING_PX;

    const rect = el.getBoundingClientRect();
    if (rect.bottom > safeBottom) {
      const delta = rect.bottom - safeBottom + SAFE_BOTTOM_PADDING_PX;
      if (Math.abs(delta) >= MIN_DELTA_PX) {
        window.scrollBy({ top: delta, behavior: "auto" });
      }
    } else if (rect.top < safeTop) {
      const delta = rect.top - safeTop - SAFE_TOP_PADDING_PX;
      if (Math.abs(delta) >= MIN_DELTA_PX) {
        window.scrollBy({ top: delta, behavior: "auto" });
      }
    }
  }, []);

  // 1) focusin/focusout 追踪当前活动 editable
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!isEditableElement(t)) return;
      activeEditableRef.current = t;
      // v0.9.26-dev subagent I-2: focus 事件触发时浏览器会自动 scrollIntoView, 这个自动滚动
      // 在某些 Android WebView + 中文 IME 组合下是 smooth (异步), 下一帧 getBoundingClientRect
      // 读到的还是 pre-scroll 位置, ensureVisible 算出的 delta 偏小。修法: 用 双 rAF + 50ms
      // setTimeout 等浏览器自动滚动完全 settle, 再读 rect + scrollBy。
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.setTimeout(() => ensureVisible(), 50);
        });
      });
    };
    // focusout: 故意不 clear ref (subagent I-3 建议删除死代码 rAF, 但保留 focusout 监听本身)。
    // 原因: focusOut 后键盘仍开着, 候选词栏还在变化, 后续 vv.resize / compositionend 触发
    // ensureVisible 时, ref 仍指向最后活动 editable 才能继续保可见; 如果 clear, 后续回调
    // 拿到 null 就 no-op, 用户的 textarea 在 IME 持续 toggle 时可能跑出可视区。
    const onFocusOut = (_e: FocusEvent) => {
      /* no-op by design: ref is cleared by hook unmount only, see comment above */
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [ensureVisible]);

  // 2) visualViewport.resize 监听
  // v0.9.26-dev subagent I-1: 移除 vv.scroll 监听。vv.scroll 会被用户主动滑动手势触发,
  // 若我们确保 textarea 可见, 用户向上滑动想看 "穿搭属性" 时会被 ensureVisible 拉回,
  // 永远滑不上去。只保留 vv.resize (IME 候选词栏/键盘/地址栏高度变化触发), 已经够覆盖
  // IME 行为, compositionend 监听补充中文上屏精确触发点。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const evaluate = () => {
      const diff = window.innerHeight - vv.height;
      // v0.9.26-dev subagent I-4: 阈值从 v0.9.21-dev/v0.9.24-dev 的 150 降到 120, 让键盘刚弹起
      // 时更快响应 isOpen 状态切换 (用户从 focus 到键盘完全弹起 ~80-150ms, 120 阈值能在
      // 100-120ms 时立即判为开, 提前挂上 save bar 隐藏 + 减 pb); 保留 30px buffer 避免
      // iOS Safari URL bar 收起 (50-80px) / Android 分屏 (100-200px) 误判。如果 iPad /
      // 折叠屏 split-view 误判出现, 后续升回 150 即可。
      const isOpen = diff > KEYBOARD_OPEN_THRESHOLD_PX;
      setKeyboard((prev) => {
        if (
          prev.isOpen === isOpen &&
          prev.height === diff &&
          prev.viewportHeight === vv.height &&
          prev.viewportOffsetTop === vv.offsetTop
        ) {
          return prev;
        }
        return {
          isOpen,
          height: diff,
          viewportHeight: vv.height,
          viewportOffsetTop: vv.offsetTop,
        };
      });
      // 每次 vv resize 都跑一次 ensure (键盘开/关、候选词栏高度变化、地址栏隐藏都会触发)
      // 不判 diff, 确保 IME 候选词栏任意小变化都能保证输入框可见
      requestAnimationFrame(() => ensureVisible());
    };
    vv.addEventListener("resize", evaluate);
    // v0.9.26-dev subagent I-1: 不监听 vv.scroll, 避免用户主动滑动手势被 ensureVisible 拉回
    evaluate();
    return () => {
      vv.removeEventListener("resize", evaluate);
    };
  }, [ensureVisible]);

  // 3) compositionend (中文 IME 上屏一字) 后主动 ensure
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onCompositionEnd = () => {
      // compositionend 后 IME 候选词栏通常会收起, visualViewport 变化
      // 由监听 (2) 自动处理; 这里再补一次以防 vv 没及时更新
      requestAnimationFrame(() => ensureVisible());
    };
    document.addEventListener("compositionend", onCompositionEnd);
    return () => {
      document.removeEventListener("compositionend", onCompositionEnd);
    };
  }, [ensureVisible]);

  return { keyboard, activeEditableRef, ensureVisible };
}
