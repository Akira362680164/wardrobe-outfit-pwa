"use client";

import { App } from "@capacitor/app";
import { AlertCircle, ChevronLeft, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface IntakeFlowStep {
  id: string;
  label: string;
}

export interface IntakeFlowShellProps {
  title: string;
  steps: IntakeFlowStep[];
  currentStepIndex: number;
  isProcessing?: boolean;
  processingText?: string;
  error?: string;
  hasUnsavedDraft?: boolean;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  backDisabled?: boolean;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  onExit?: () => void;
}

export function IntakeFlowShell({
  title,
  steps,
  currentStepIndex,
  isProcessing = false,
  processingText,
  error,
  hasUnsavedDraft = false,
  nextLabel = "继续",
  backLabel = "上一步",
  nextDisabled = false,
  backDisabled = false,
  children,
  onBack,
  onNext,
  onExit,
}: IntakeFlowShellProps) {
  const [confirmExit, setConfirmExit] = useState(false);
  const [mounted, setMounted] = useState(false);
  const safeIndex = Math.min(Math.max(currentStepIndex, 0), Math.max(steps.length - 1, 0));
  const currentStep = steps[safeIndex];
  const progress = steps.length === 0 ? 0 : ((safeIndex + 1) / steps.length) * 100;

  useEffect(() => {
    setMounted(true);
  }, []);

  // v1.1.31 commit1: 锁定 body 滚动 + 还原。Portal 期间禁止主页面滚动。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function requestExit() {
    if (hasUnsavedDraft || isProcessing) {
      setConfirmExit(true);
      return;
    }
    onExit?.();
  }

  useEffect(() => {
    let removed = false;
    let active = true;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (!active || removed) return;
      if (isProcessing) {
        setConfirmExit(true);
        return;
      }
      if (safeIndex > 0 && onBack && !backDisabled) {
        onBack();
        return;
      }
      if (hasUnsavedDraft) {
        setConfirmExit(true);
        return;
      }
      onExit?.();
    }).then((nextHandle) => {
      if (!removed && active) handle = nextHandle;
    });
    return () => {
      active = false;
      removed = true;
      handle?.remove();
    };
  }, [backDisabled, hasUnsavedDraft, isProcessing, onBack, onExit, safeIndex]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] h-[100dvh] bg-[#fbfbf8]">
      <header className="sticky top-0 z-30 border-b border-ink/8 bg-[#fbfbf8]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur-xl">
        <div className="flex h-10 items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={backDisabled || !onBack}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink/70 active:bg-mist disabled:opacity-35"
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
            onClick={requestExit}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink/60 active:bg-mist"
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
        <div className="mx-auto mt-3 flex w-full max-w-md items-start gap-2 rounded-lg border border-clay/20 bg-clay/5 px-3 py-2 text-xs text-clay">
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 leading-relaxed">{error}</p>
        </div>
      ) : null}

      {isProcessing ? (
        <div className="mx-auto mt-3 flex w-full max-w-md items-center gap-2 rounded-lg bg-denim/5 px-3 py-2 text-xs text-ink/65">
          <Loader2 size={14} className="animate-spin text-denim" aria-hidden="true" />
          <span>{processingText || "正在处理，请稍候……"}</span>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+104px)] pt-3">
        {children}
      </main>

      <footer className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-[#fbfbf8]/98 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto grid max-w-md grid-cols-[1fr_1.6fr] gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={backDisabled || isProcessing || !onBack}
            className="h-12 rounded-lg border border-ink/10 bg-white text-sm font-semibold text-ink/70 disabled:opacity-35"
          >
            {backLabel}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || isProcessing || !onNext}
            className="h-12 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-35"
          >
            {nextLabel}
          </button>
        </div>
      </footer>

      {confirmExit ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/35 px-4" onClick={() => setConfirmExit(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-base font-semibold">{isProcessing ? "退出录入？" : "退出本次录入？"}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/58">
              {isProcessing ? "正在处理本次录入，退出后本次结果不会保存。" : "当前草稿尚未保存，退出后会丢失本次录入进度。"}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmExit(false)} className="h-11 rounded-lg border border-ink/10 bg-white text-sm font-semibold">
                继续录入
              </button>
              <button type="button" onClick={onExit} className="h-11 rounded-lg bg-clay text-sm font-semibold text-white">
                退出
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export const INTAKE_FLOW_STEPS: IntakeFlowStep[] = [
  { id: "source", label: "选择来源" },
  { id: "organize", label: "整理" },
  { id: "process", label: "处理" },
  { id: "draft", label: "草稿" },
  { id: "review", label: "校对" },
  { id: "save", label: "保存" },
];
