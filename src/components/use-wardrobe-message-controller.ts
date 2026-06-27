// src/components/use-wardrobe-message-controller.ts
// v1.1.9 4C: 从 wardrobe-app.tsx 迁移消息状态与控制。

import { useState, useEffect, useCallback } from "react";

const MESSAGE_AUTO_DISMISS_MS = 5000;

export function useWardrobeMessageController() {
  const [messageState, setMessageState] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showMessage = useCallback(
    (text: string, type: "success" | "error" | "info" = "success") => {
      setMessageState({ text, type });
    },
    [],
  );

  const clearMessage = useCallback(() => {
    setMessageState(null);
  }, []);

  useEffect(() => {
    if (!messageState) return;
    const timeoutId = window.setTimeout(clearMessage, MESSAGE_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeoutId);
  }, [messageState, clearMessage]);

  return {
    message: messageState?.text ?? null,
    messageType: messageState?.type ?? "success",
    showMessage,
    clearMessage,
  };
}
