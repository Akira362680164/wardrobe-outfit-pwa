"use client";

import { App } from "@capacitor/app";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { BackHandlerStore, coordinateBackRequest, type BackHandler } from "@/lib/back-coordinator";
import {
  OverlayStackStore,
  type OverlayDismissReason,
  type OverlayFocusTarget,
  type OverlayKind,
} from "@/lib/overlay-stack";

interface OverlayRuntime {
  overlayStack: OverlayStackStore;
  backHandlers: BackHandlerStore;
  portalTarget: HTMLElement | null;
}

const OverlayRuntimeContext = createContext<OverlayRuntime | null>(null);
const fallbackOverlayStack = new OverlayStackStore();
const fallbackBackHandlers = new BackHandlerStore();
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.hasAttribute("disabled") && node.getAttribute("aria-disabled") !== "true" && node.tabIndex !== -1,
  );
}

function useOverlayRuntime(): OverlayRuntime {
  const runtime = useContext(OverlayRuntimeContext);
  if (runtime) return runtime;
  return {
    overlayStack: fallbackOverlayStack,
    backHandlers: fallbackBackHandlers,
    portalTarget: typeof document === "undefined" ? null : document.body,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function BackCoordinator({ overlayStack, backHandlers }: Pick<OverlayRuntime, "overlayStack" | "backHandlers">) {
  useEffect(() => {
    let removed = false;
    let nativeHandle: { remove: () => void } | null = null;

    App.addListener("backButton", () => {
      if (removed) return;
      coordinateBackRequest(overlayStack, backHandlers, "android-back");
    }).then((handle) => {
      if (removed) {
        handle.remove();
        return;
      }
      nativeHandle = handle;
    });

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!overlayStack.getTopmost() && isEditableTarget(event.target)) return;
      const result = coordinateBackRequest(overlayStack, backHandlers, "escape");
      if (!result.handled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("keydown", handleEscape, true);

    return () => {
      removed = true;
      nativeHandle?.remove();
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [backHandlers, overlayStack]);

  return null;
}

export function OverlayRoot({ children }: { children: ReactNode }) {
  const overlayStackRef = useRef<OverlayStackStore | null>(null);
  const backHandlersRef = useRef<BackHandlerStore | null>(null);
  overlayStackRef.current ??= new OverlayStackStore();
  backHandlersRef.current ??= new BackHandlerStore();
  const overlayStack = overlayStackRef.current;
  const backHandlers = backHandlersRef.current;
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const snapshot = useSyncExternalStore(
    overlayStack.subscribe,
    overlayStack.getSnapshot,
    overlayStack.getServerSnapshot,
  );

  useLayoutEffect(() => {
    const existing = document.getElementById("wardrobe-overlay-root");
    const root = existing ?? document.createElement("div");
    const ownsRoot = existing === null;
    if (ownsRoot) {
      root.id = "wardrobe-overlay-root";
      root.dataset.overlayRoot = "true";
      document.body.appendChild(root);
    }
    setPortalTarget(root);
    return () => {
      if (ownsRoot) root.remove();
    };
  }, []);

  const runtime = useMemo<OverlayRuntime>(
    () => ({ overlayStack, backHandlers, portalTarget }),
    [backHandlers, overlayStack, portalTarget],
  );
  const hasOverlay = snapshot.entries.length > 0;

  return (
    <OverlayRuntimeContext.Provider value={runtime}>
      <BackCoordinator overlayStack={overlayStack} backHandlers={backHandlers} />
      <div
        className="contents"
        data-overlay-app-content="true"
        aria-hidden={hasOverlay ? "true" : undefined}
        inert={hasOverlay ? true : undefined}
      >
        {children}
      </div>
    </OverlayRuntimeContext.Provider>
  );
}

export function OverlayPortal({ children }: { children: ReactNode }) {
  const { portalTarget } = useOverlayRuntime();
  return portalTarget ? createPortal(children, portalTarget) : null;
}

/**
 * Gives the topmost overlay its initial focus and keeps keyboard navigation
 * inside it. Focus restoration is owned separately by OverlayStack.
 */
export function useOverlayFocusScope(
  scopeRef: RefObject<HTMLElement | null>,
  isTopmost: boolean,
  initialFocusSelector?: string,
): void {
  const didInitialFocusRef = useRef(false);

  useLayoutEffect(() => {
    if (!isTopmost || didInitialFocusRef.current) return;
    const scope = scopeRef.current;
    if (!scope) return;
    didInitialFocusRef.current = true;
    const preferred = initialFocusSelector
      ? scope.querySelector<HTMLElement>(initialFocusSelector)
      : null;
    (preferred ?? getFocusableElements(scope)[0] ?? scope).focus({ preventScroll: true });
  });

  useEffect(() => {
    if (!isTopmost) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const scope = scopeRef.current;
      if (!scope) return;
      const focusable = getFocusableElements(scope);
      if (focusable.length === 0) {
        event.preventDefault();
        scope.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isTopmost, scopeRef]);
}

type FocusTargetSource = OverlayFocusTarget | RefObject<OverlayFocusTarget | null> | null;

function resolveFocusTarget(source: FocusTargetSource | undefined): OverlayFocusTarget | null {
  if (!source) return null;
  if ("current" in source) return source.current;
  return source;
}

interface UseOverlayLayerOptions {
  id?: string;
  kind: OverlayKind;
  dismissible?: boolean;
  onDismiss: (reason: OverlayDismissReason) => void;
  canDismiss?: (reason: OverlayDismissReason) => boolean;
  onDismissBlocked?: (reason: OverlayDismissReason) => void;
  restoreFocusTo?: FocusTargetSource;
}

export function useOverlayLayer({
  id,
  kind,
  dismissible = true,
  onDismiss,
  canDismiss,
  onDismissBlocked,
  restoreFocusTo,
}: UseOverlayLayerOptions) {
  const generatedId = useId();
  const overlayId = id ?? `overlay-${generatedId.replaceAll(":", "")}`;
  const { overlayStack } = useOverlayRuntime();
  const snapshot = useSyncExternalStore(
    overlayStack.subscribe,
    overlayStack.getSnapshot,
    overlayStack.getServerSnapshot,
  );
  const onDismissRef = useRef(onDismiss);
  const canDismissRef = useRef(canDismiss);
  const onDismissBlockedRef = useRef(onDismissBlocked);
  onDismissRef.current = onDismiss;
  canDismissRef.current = canDismiss;
  onDismissBlockedRef.current = onDismissBlocked;

  useLayoutEffect(() => {
    const explicitFocusTarget = resolveFocusTarget(restoreFocusTo);
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return overlayStack.register({
      id: overlayId,
      kind,
      dismissible,
      onDismiss: (reason) => onDismissRef.current(reason),
      canDismiss: (reason) => canDismissRef.current?.(reason) ?? true,
      onDismissBlocked: (reason) => onDismissBlockedRef.current?.(reason),
      restoreFocusTo: explicitFocusTarget ?? activeElement,
    });
  }, [kind, overlayId, overlayStack, restoreFocusTo]);

  useLayoutEffect(() => {
    overlayStack.update(overlayId, { dismissible, kind });
  }, [dismissible, kind, overlayId, overlayStack]);

  const requestDismiss = useCallback(
    (reason: OverlayDismissReason) => overlayStack.requestDismiss(reason, overlayId),
    [overlayId, overlayStack],
  );

  return {
    overlayId,
    isTopmost: snapshot.topmostId === overlayId,
    requestDismiss,
  };
}

export function useBackHandlerRegistration(
  handler: BackHandler,
  enabled = true,
  priority = 0,
): void {
  const generatedId = useId();
  const handlerRef = useRef(handler);
  const { backHandlers } = useOverlayRuntime();
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    return backHandlers.register({
      id: `back-${generatedId.replaceAll(":", "")}`,
      priority,
      handler: () => handlerRef.current(),
    });
  }, [backHandlers, enabled, generatedId, priority]);
}
