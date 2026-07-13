"use client";

import { AlertCircle, ChevronLeft, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmActionSheet } from "@/components/dialogs";
import { OverlayPortal, useOverlayLayer } from "@/components/overlay-root";
import type { OverlayDismissReason } from "@/lib/overlay-stack";
import { useScrollLock } from "@/lib/use-scroll-lock";

export interface IntakeFlowStep {
  id: string;
  label: string;
}

export type IntakeSubmitState =
  | { status: "idle" }
  | { status: "submitting"; message: string; completed?: number; total?: number }
  | { status: "failed"; message: string; retryLabel: string }
  | { status: "succeeded"; message: string };

export interface IntakeFlowShellProps {
  title: string;
  steps: IntakeFlowStep[];
  currentStepIndex: number;
  isProcessing?: boolean;
  processingText?: string;
  submitState?: IntakeSubmitState;
  error?: string;
  hasUnsavedDraft?: boolean;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  backDisabled?: boolean;
  rootBackOverridesExit?: boolean;
  immersiveContent?: boolean;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  onExit?: () => void;
  onStopWaiting?: () => void;
}

export function IntakeFlowShell({
  title,
  steps,
  currentStepIndex,
  isProcessing = false,
  processingText,
  submitState = { status: "idle" },
  error,
  hasUnsavedDraft = false,
  nextLabel = "继续",
  backLabel = "上一步",
  nextDisabled = false,
  backDisabled = false,
  rootBackOverridesExit = false,
  immersiveContent = false,
  children,
  onBack,
  onNext,
  onExit,
  onStopWaiting,
}: IntakeFlowShellProps) {
  const [confirmExit, setConfirmExit] = useState(false);
  const [blockedAnnouncement, setBlockedAnnouncement] = useState("");
  const shellRef = useRef<HTMLDivElement | null>(null);
  const didInitialFocusRef = useRef(false);
  const safeIndex = Math.min(Math.max(currentStepIndex, 0), Math.max(steps.length - 1, 0));
  const currentStep = steps[safeIndex];
  const isSubmitting = submitState.status === "submitting";
  const busy = isProcessing || isSubmitting;
  const progress = steps.length === 0 ? 0 : ((safeIndex + 1) / steps.length) * 100;

  useScrollLock(true);

  const handleDismiss = useCallback((reason: OverlayDismissReason) => {
    if (reason !== "backdrop" && (safeIndex > 0 || rootBackOverridesExit) && onBack && !backDisabled) {
      onBack();
      return;
    }
    if (hasUnsavedDraft) {
      setConfirmExit(true);
      return;
    }
    onExit?.();
  }, [backDisabled, hasUnsavedDraft, onBack, onExit, rootBackOverridesExit, safeIndex]);

  const handleDismissBlocked = useCallback(() => {
    setBlockedAnnouncement("操作进行中，暂时无法退出录入");
  }, []);

  const { overlayId, isTopmost, requestDismiss } = useOverlayLayer({
    kind: "fullscreen",
    dismissible: !busy,
    onDismiss: handleDismiss,
    onDismissBlocked: handleDismissBlocked,
  });

  const requestExit = useCallback(() => {
    requestDismiss("backdrop");
  }, [requestDismiss]);

  useEffect(() => {
    if (!isTopmost || didInitialFocusRef.current) return;
    didInitialFocusRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      const shell = shellRef.current;
      if (!shell) return;
      const focusable = shell.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? shell).focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isTopmost]);

  useEffect(() => {
    if (!isTopmost) return;
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const shell = shellRef.current;
      if (!shell) return;
      const focusable = Array.from(
        shell.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.tabIndex !== -1);
      if (focusable.length === 0) {
        event.preventDefault();
        shell.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleTab, true);
    return () => document.removeEventListener("keydown", handleTab, true);
  }, [isTopmost]);

  return (
    <OverlayPortal>
      <>
        <div
          ref={shellRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          data-overlay-layer={overlayId}
          data-overlay-kind="fullscreen"
          data-overlay-topmost={isTopmost ? "true" : "false"}
          aria-hidden={isTopmost ? undefined : "true"}
          inert={isTopmost ? undefined : true}
          className="app-ambient-bg fixed inset-0 z-[90] flex h-[100dvh] flex-col overflow-hidden outline-none"
        >
      <header className="app-glass-top sticky top-0 z-30 px-4 pb-3" style={{ paddingTop: "calc(max(env(safe-area-inset-top, 0px), var(--android-safe-area-top, 0px)) + 0.5rem)" }}>
        <div className="flex h-10 items-center justify-between gap-2">
          <button
            type="button"
            data-parity-id="parity.app.app.src.components.intake.flow.shell.d60ca7f723" onClick={onBack}
            disabled={backDisabled || busy || !onBack}
            className="grid h-10 w-10 shrink-0 place-items-center ui-control-radius bg-transparent text-ink/70 active:scale-95 disabled:opacity-35"
            aria-label="返回上一步"
          >
            <ChevronLeft size={21} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
            <p className="truncate text-[11px] text-ink/50">
              步骤 {safeIndex + 1} / {Math.max(steps.length, 1)} · {currentStep?.label ?? "录入"}
            </p>
          </div>
          <button
            type="button"
            data-parity-id="parity.app.app.src.components.intake.flow.shell.ef4e5e19ad" onClick={requestExit}
            disabled={busy}
            className="grid h-10 w-10 shrink-0 place-items-center ui-control-radius bg-transparent text-ink/60 active:scale-95"
            aria-label="退出录入"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist">
          <div className="h-full rounded-full bg-denim transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 hidden min-w-0 items-center gap-1 text-[10px] text-ink/45 sm:flex">
          {steps.map((step, index) => (
            <span key={step.id} className={index === safeIndex ? "font-semibold text-denim" : undefined}>
              {step.label}{index < steps.length - 1 ? " ->" : ""}
            </span>
          ))}
        </div>
      </header>

      {error ? (
        <div className="mx-auto mt-3 flex w-full max-w-md items-start gap-2 ui-control-radius border border-clay/20 bg-clay/5 px-3 py-2 text-xs text-clay">
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 leading-relaxed">{error}</p>
        </div>
      ) : null}

      {busy ? (
        <div className="mx-auto mt-3 flex w-full max-w-md items-center gap-2 ui-control-radius bg-denim/5 px-3 py-2 text-xs text-ink/65">
          <Loader2 size={14} className="animate-spin text-denim" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {submitState.status === "submitting" ? submitState.message : processingText || "正在处理，请稍候……"}
          </span>
          {isSubmitting && onStopWaiting ? (
            <button data-parity-id={`parity.app.app.src.components.intake.flow.shell.4917285019.${submitState.status}`} type="button" onClick={onStopWaiting} className="shrink-0 font-semibold text-denim">停止等待</button>
          ) : null}
        </div>
      ) : null}

      <main
        className={[
          "mx-auto min-h-0 w-full max-w-md flex-1 px-4 pt-3",
          immersiveContent
            ? "flex flex-col overflow-hidden pb-3"
            : "overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+104px)]",
        ].join(" ")}
        style={immersiveContent ? undefined : { paddingBottom: "calc(max(env(safe-area-inset-bottom, 0px), var(--android-safe-area-bottom, 0px)) + 104px)" }}
      >
        {children}
      </main>

      {!immersiveContent ? (
        <footer className="app-glass-bottom fixed inset-x-0 bottom-0 z-40 px-4 pt-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px), var(--android-safe-area-bottom, 0px))" }}>
          <div className="mx-auto grid max-w-md grid-cols-[1fr_1.6fr] gap-2">
            <button
              data-parity-id={`parity.app.app.src.components.intake.flow.shell.6f2810e509.${backLabel}`}
              type="button"
              onClick={onBack}
              disabled={backDisabled || busy || !onBack}
              className="h-12 ui-control-radius border border-ink/10 bg-white/76 text-sm font-semibold text-ink/70 disabled:opacity-35"
            >
              {backLabel}
            </button>
            <button
              type="button"
              data-parity-id="parity.app.app.src.components.intake.flow.shell.ee3fa5c0d6" onClick={onNext}
              disabled={nextDisabled || busy || !onNext}
              className="h-12 ui-control-radius bg-denim text-sm font-semibold text-white disabled:opacity-35"
            >
              {nextLabel}
            </button>
          </div>
        </footer>
      ) : null}

          <span className="sr-only" role="status" aria-live="polite">{blockedAnnouncement}</span>
        </div>
        <ConfirmActionSheet
          open={confirmExit}
          title="退出本次录入？"
          description="当前草稿尚未保存，退出后会丢失本次录入进度。"
          confirmLabel="退出"
          cancelLabel="继续录入"
          tone="danger"
          onConfirm={() => {
            setConfirmExit(false);
            onExit?.();
          }}
          onClose={() => setConfirmExit(false)}
        />
      </>
    </OverlayPortal>
  );
}
