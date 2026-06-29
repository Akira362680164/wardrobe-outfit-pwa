"use client";

import { useEffect } from "react";

/**
 * useScrollLock — 锁定 window 滚动，防止移动端 WebView 软键盘弹起 / 触摸拖动时的滚动穿透
 *
 * 触发场景（v0.9.16 修复）：
 *   Android WebView (Capacitor) 中，底部弹窗打开后，软键盘弹起时浏览器
 *   自动 scrollIntoView 把背景推着滚。这是 iOS 经典 scroll-lock 缺失
 *   的典型表现。
 *
 * 实现策略（CSS-first，对 Android WebView + iOS Safari 都生效）：
 *   1. body 设为 `position: fixed; top: -scrollY; overflow: hidden`（iOS 经典
 *      scroll-lock 配方）。
 *   2. html 加 `overflow: hidden`，防止部分 Android WebView 不响应 body fixed。
 *   3. html / body 加 `overscroll-behavior: contain`，阻断 rubber-band / pull-to-refresh
 *      触发的链式滚动。
 *   4. capture 阶段拦截 `focus` 事件并 preventDefault，等价于全局强制
 *      `el.focus({ preventScroll: true })`，阻止软键盘弹起时浏览器自动
 *      `scrollIntoView` 引起的背景滚动。
 *
 * 注意（v0.9.16 审查后精简）：
 *   - 不再在 document 级 capture 拦截 touchmove。MotionSheet 自身已经
 *     通过 CSS 三件套（backdrop `touch-action: none` + panel
 *     `overscroll-behavior: contain` + 父级 `position: fixed`）覆盖
 *     Android / iOS 的触摸穿透；额外加 document 级 touchmove capture
 *     会把 panel 内部滚动也吞掉（v0.9.16 审查 C1）。
 *
 * 安全：
 *   - 模块级 ref 计数：多个 useScrollLock 实例同时 active 不会反复 lock / unlock，
 *     最后一个 close 才释放。配合 MotionSheet 跨多个弹窗共享同一个 hook 时安全。
 *   - SSR 安全：仅在 `typeof window !== "undefined"` 时操作 DOM。
 *   - cleanup 时恢复原样式，下一帧 `scrollTo(0, savedY)` 恢复原滚动位置。
 *   - 不引入新依赖，仅使用原生 DOM API。
 */
const FOCUSABLE_EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable], [contenteditable='true']";

type SavedStyles = {
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyHeight: string;
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
};

let lockCount = 0;
let saved: SavedStyles | null = null;
let savedScrollY = 0;

function applyLock(): void {
  if (typeof window === "undefined") return;
  // 只由第一个锁调用；后续嵌套锁只增加 lockCount，避免覆盖原始页面样式。
  const html = document.documentElement;
  const body = document.body;

  savedScrollY = window.scrollY || window.pageYOffset || 0;
  saved = {
    htmlOverflow: html.style.overflow,
    htmlOverscrollBehavior: html.style.overscrollBehavior,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyHeight: body.style.height,
    bodyOverflow: body.style.overflow,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
  };

  // 1 + 2: iOS 风格 fixed-body lock + html overflow 锁
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
  html.style.overflow = "hidden";
  // 3: 阻止 rubber-band / pull-to-refresh 链式滚动
  body.style.overscrollBehavior = "contain";
  html.style.overscrollBehavior = "contain";

  // 4: capture 阶段全局拦截 focus（仅输入控件，阻止软键盘弹起时
  // 自动 scrollIntoView 把背景推着滚；不影响 input 自身 focus 行为）
  document.addEventListener("focus", onFocusCapture, true);
}

function releaseLock(): void {
  if (typeof window === "undefined") return;
  if (!saved) return;

  document.removeEventListener("focus", onFocusCapture, true);

  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = saved.htmlOverflow;
  html.style.overscrollBehavior = saved.htmlOverscrollBehavior;
  body.style.position = saved.bodyPosition;
  body.style.top = saved.bodyTop;
  body.style.left = saved.bodyLeft;
  body.style.right = saved.bodyRight;
  body.style.width = saved.bodyWidth;
  body.style.height = saved.bodyHeight;
  body.style.overflow = saved.bodyOverflow;
  body.style.overscrollBehavior = saved.bodyOverscrollBehavior;

  const restoreY = savedScrollY;
  saved = null;
  savedScrollY = 0;

  // 恢复滚动位置：必须在 body 复位为 static 之后下一帧再 scrollTo，
  // 否则 position: fixed 期间 window.scrollTo 无效。
  requestAnimationFrame(() => {
    window.scrollTo(0, restoreY);
  });
}

function onFocusCapture(event: FocusEvent): void {
  const target = event.target as HTMLElement | null;
  if (
    target &&
    typeof target.closest === "function" &&
    target.closest(FOCUSABLE_EDITABLE_SELECTOR)
  ) {
    // 阻止软键盘弹起时浏览器自动 scrollIntoView 引起的背景滚动
    // 不影响 input 自身 focus 行为（仅阻止 default action）
    event.preventDefault();
  }
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;
    lockCount += 1;
    if (lockCount === 1) {
      try {
        applyLock();
      } catch (err) {
        window.console.error("[useScrollLock] applyLock failed:", err);
      }
    }
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        try {
          releaseLock();
        } catch (err) {
          window.console.error("[useScrollLock] releaseLock failed:", err);
        }
      }
    };
  }, [active]);
}
