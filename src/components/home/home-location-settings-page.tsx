"use client";

import { AlertCircle, Check, ChevronLeft, Loader2, MapPin, Trash2 } from "lucide-react";
import { useReducer } from "react";

import type { HomeFeedController } from "@/components/home/use-home-feed-controller";
import { AppPressable, MotionSheet } from "@/components/motion-common";
import { useStableBackHandler } from "@/lib/use-stable-back-handler";

export function HomeLocationSettingsPage({ controller, onBack }: {
  controller: HomeFeedController;
  onBack: () => void;
}) {
  const [clearFlow, dispatchClearFlow] = useReducer(homeLocationClearFlowReducer, "idle");
  const confirmClearHome = clearFlow === "confirming";
  const profile = controller.locationSnapshot?.profile;
  const override = controller.locationSnapshot?.override.override;
  const saving = controller.cityMutation !== null;

  useStableBackHandler(() => {
    if (saving) return true;
    onBack();
    return true;
  }, true, 30);

  async function clearHomeCity() {
    const status = await controller.commitLocation("clear_home");
    dispatchClearFlow({ type: status === "committed" ? "committed" : "failed" });
  }

  return (
    <section className="min-w-0" data-testid="weather-location-settings">
      <header className="flex min-h-14 items-center gap-2 px-1 pt-2">
        <AppPressable feedback="icon" className="grid h-12 w-12 place-items-center rounded-full" onClick={onBack} aria-label="返回设置">
          <ChevronLeft size={22} aria-hidden="true" />
        </AppPressable>
        <div><h1 className="text-lg font-semibold">天气地点</h1><p className="text-xs text-ink/50">常驻城市与临时城市由服务器保存</p></div>
      </header>

      <article className="ui-card mt-3 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-denim/10 text-denim"><MapPin size={19} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">常驻城市</h2>
            <p className="mt-1 text-sm text-ink/60">{profile?.homeCity?.displayName ?? "尚未设置"}</p>
          </div>
        </div>
        {profile?.homeCity ? (
          <AppPressable
            className="mt-4 min-h-11 w-full rounded-xl text-sm font-semibold text-red-700 ring-1 ring-red-700/20"
            onClick={() => dispatchClearFlow({ type: "request" })}
            disabled={saving}
            data-testid="request-clear-home-city"
          >
            <Trash2 className="mr-2 inline" size={16} aria-hidden="true" />清除常驻城市
          </AppPressable>
        ) : null}
      </article>

      <article className="ui-card mt-3 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-moss/10 text-moss"><Check size={19} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">临时城市</h2><p className="mt-1 text-sm text-ink/60">{override?.location.displayName ?? "当前未使用临时城市"}</p></div>
        </div>
      </article>

      {controller.locationState.status === "loading" ? <p className="mt-3 flex min-h-11 items-center gap-2 text-sm text-denim" role="status"><Loader2 className="animate-spin motion-reduce:animate-none" size={17} />正在读取服务端地点…</p> : null}
      {controller.locationState.status === "error" ? <p className="mt-3 flex min-h-11 items-center gap-2 text-sm text-clay" role="alert"><AlertCircle size={17} />{controller.locationState.message}</p> : null}
      {controller.cityMutationError ? <p className="mt-3 text-sm text-clay" role="alert" data-conflict={controller.cityMutationConflict || undefined}>{controller.cityMutationError}</p> : null}

      <MotionSheet
        open={confirmClearHome}
        onClose={() => { if (!saving) dispatchClearFlow({ type: "cancel" }); }}
        variant="destructive"
        role="alertdialog"
        ariaLabel="确认清除常驻城市"
        dismissible={!saving}
        closeOnBackdrop={!saving}
        closeOnEscape={!saving}
        panelClassName="!max-w-sm"
      >
        <h2 className="text-lg font-semibold">清除常驻城市？</h2>
        <p className="mt-2 text-sm leading-6 text-ink/60">清除后，未使用临时城市的日期将不再显示城市天气；已有主计划和已穿事实不会被更改。</p>
        {saving ? <p className="mt-3 flex min-h-11 items-center gap-2 text-sm text-denim" role="status"><Loader2 className="animate-spin motion-reduce:animate-none" size={17} />正在清除并读取服务器结果…</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <AppPressable className="min-h-11 rounded-xl bg-mist px-3 text-sm font-semibold" onClick={() => dispatchClearFlow({ type: "cancel" })} disabled={saving}>保留城市</AppPressable>
          <AppPressable className="min-h-11 rounded-xl bg-red-700 px-3 text-sm font-semibold text-white" onClick={() => void clearHomeCity()} disabled={saving} data-testid="confirm-clear-home-city">确认清除</AppPressable>
        </div>
      </MotionSheet>
    </section>
  );
}

export type HomeLocationClearFlowState = "idle" | "confirming";
export type HomeLocationClearFlowAction = { type: "request" | "cancel" | "committed" | "failed" };

export function homeLocationClearFlowReducer(state: HomeLocationClearFlowState, action: HomeLocationClearFlowAction): HomeLocationClearFlowState {
  if (action.type === "request") return "confirming";
  if (action.type === "cancel" || action.type === "committed") return "idle";
  return state;
}
