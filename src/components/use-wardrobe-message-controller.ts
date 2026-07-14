// src/components/use-wardrobe-message-controller.ts
// v1.1.9 4C: 从 wardrobe-app.tsx 迁移消息状态与控制。

import { useState, useEffect, useCallback, useRef } from "react";

const SUCCESS_AUTO_DISMISS_MS = 2800;
const INFO_AUTO_DISMISS_MS = 4000;

export type WardrobeMessageType = "success" | "error" | "info" | "action";

export function resolveWardrobeMessageDurationMs(type: WardrobeMessageType): number | null {
  if (type === "success") return SUCCESS_AUTO_DISMISS_MS;
  if (type === "info") return INFO_AUTO_DISMISS_MS;
  return null;
}

export function useWardrobeMessageController() {
  const nextMessageIdRef = useRef(0);
  const pauseReasonsRef = useRef(new Set<string>());
  const pauseCountdownRef = useRef<() => void>(() => {});
  const resumeCountdownRef = useRef<() => void>(() => {});
  const [messageState, setMessageState] = useState<{
    id: number;
    text: string;
    type: WardrobeMessageType;
  } | null>(null);

  const showMessage = useCallback(
    (text: string, type: WardrobeMessageType = "success") => {
      nextMessageIdRef.current += 1;
      setMessageState({ id: nextMessageIdRef.current, text, type });
    },
    [],
  );

  const clearMessage = useCallback(() => {
    pauseReasonsRef.current.clear();
    setMessageState(null);
  }, []);

  const pauseMessageDismiss = useCallback((reason = "interaction") => {
    pauseReasonsRef.current.add(reason);
    pauseCountdownRef.current();
  }, []);

  const resumeMessageDismiss = useCallback((reason = "interaction") => {
    pauseReasonsRef.current.delete(reason);
    if (pauseReasonsRef.current.size === 0) resumeCountdownRef.current();
  }, []);

  useEffect(() => {
    if (!messageState) return;
    const durationMs = resolveWardrobeMessageDurationMs(messageState.type);
    if (durationMs === null) return;

    const messageId = messageState.id;
    let remainingMs = durationMs;
    let startedAt = 0;
    let timeoutId: number | null = null;

    const isPageActive = () => document.visibilityState === "visible" &&
      (typeof document.hasFocus !== "function" || document.hasFocus());

    const dismissThisMessage = () => {
      setMessageState((current) => current?.id === messageId ? null : current);
    };

    const pauseCountdown = () => {
      if (timeoutId === null) return;
      remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
      window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    const resumeCountdown = () => {
      if (timeoutId !== null || !isPageActive() || pauseReasonsRef.current.size > 0) return;
      if (remainingMs <= 0) {
        dismissThisMessage();
        return;
      }
      startedAt = Date.now();
      timeoutId = window.setTimeout(dismissThisMessage, remainingMs);
    };

    const handleVisibilityChange = () => {
      if (isPageActive()) resumeCountdown();
      else pauseCountdown();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", resumeCountdown);
    window.addEventListener("blur", pauseCountdown);
    pauseCountdownRef.current = pauseCountdown;
    resumeCountdownRef.current = resumeCountdown;
    resumeCountdown();

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", resumeCountdown);
      window.removeEventListener("blur", pauseCountdown);
      pauseCountdownRef.current = () => {};
      resumeCountdownRef.current = () => {};
    };
  }, [messageState]);

  return {
    message: messageState?.text ?? null,
    messageType: messageState?.type ?? "success",
    showMessage,
    clearMessage,
    pauseMessageDismiss,
    resumeMessageDismiss,
  };
}
