import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";

/**
 * Stable Android back button handler.
 *
 * Registers App.addListener("backButton") only once.
 * The handler function is stored in a ref so that callers can update it
 * without re-registering the listener.
 *
 * @param handler - returning `true` means the event was consumed (no default back behavior).
 * @param enabled - whether to activate the handler.
 */
export function useStableBackHandler(handler: () => boolean | void, enabled = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    let removed = false;
    let handle: { remove: () => void } | null = null;

    App.addListener("backButton", () => {
      if (removed) return;
      const consumed = handlerRef.current();
      if (consumed === true) return;
    }).then((h) => {
      if (!removed) handle = h;
    });

    return () => {
      removed = true;
      handle?.remove();
    };
  }, [enabled]);
}