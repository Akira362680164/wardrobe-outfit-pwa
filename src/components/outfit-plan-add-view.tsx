"use client";

import { ChevronLeft } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { OutfitCalendarPlan, OutfitCalendarPlanDraft, OutfitCalendarPlanTone, OutfitCalendarPlanType } from "@/lib/types";
import { createOutfitCalendarPlan, PLAN_TONE_BG_MAP, PLAN_TONE_LABEL_MAP } from "@/lib/outfit-planning";
import { getLocalDateKey } from "@/lib/wear-records";
import { daysBetween } from "@/lib/outfit-calendar";
import { MotionSheet } from "@/components/motion-common";

const TONES: OutfitCalendarPlanTone[] = ["denim", "moss", "clay", "amber", "rose", "purple", "slate"];

interface OutfitPlanAddViewProps {
  type: OutfitCalendarPlanType;
  initialPlan?: OutfitCalendarPlan | null;
  onBack: () => void;
  onSave: (plan: OutfitCalendarPlan | OutfitCalendarPlanDraft) => Promise<void>;
  onMessage: (msg: string, type?: "success" | "error" | "info") => void;
}

export function OutfitPlanAddView({ type, initialPlan, onBack, onSave, onMessage }: OutfitPlanAddViewProps) {
  const today = getLocalDateKey();
  const [title, setTitle] = useState(initialPlan?.title ?? "");
  const [startDate, setStartDate] = useState(initialPlan?.startDate ?? today);
  const [endDate, setEndDate] = useState(initialPlan?.endDate ?? today);
  const [destination, setDestination] = useState(initialPlan?.destination ?? "");
  const [activities, setActivities] = useState<string[]>(initialPlan?.activities ?? []);
  const [activityInput, setActivityInput] = useState("");
  const [weatherNote, setWeatherNote] = useState(initialPlan?.weatherNote ?? "");
  const [notes, setNotes] = useState(initialPlan?.notes ?? "");
  const [tone, setTone] = useState<OutfitCalendarPlanTone>(initialPlan?.tone ?? (type === "travel" ? "clay" : type === "business" ? "moss" : "denim"));
  const [packingEnabled, setPackingEnabled] = useState(initialPlan?.packingEnabled ?? (type !== "custom"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);

  const dirty = useMemo(() => {
    if (!initialPlan) return title.trim() !== "" || destination.trim() !== "" || activities.length > 0 || weatherNote.trim() !== "" || notes.trim() !== "";
    return title !== initialPlan.title || startDate !== initialPlan.startDate || endDate !== initialPlan.endDate ||
      destination !== (initialPlan.destination ?? "") || JSON.stringify(activities) !== JSON.stringify(initialPlan.activities ?? []) ||
      weatherNote !== (initialPlan.weatherNote ?? "") || notes !== (initialPlan.notes ?? "") ||
      tone !== initialPlan.tone || packingEnabled !== (initialPlan.packingEnabled ?? false);
  }, [initialPlan, title, startDate, endDate, destination, activities, weatherNote, notes, tone, packingEnabled]);

  const titleLabel = initialPlan
    ? (type === "travel" ? "编辑旅行计划" : type === "business" ? "编辑出差计划" : "编辑自定义计划")
    : (type === "travel" ? "添加旅行计划" : type === "business" ? "添加出差计划" : "添加自定义计划");

  const handleBack = useCallback(() => {
    if (dirty) { setShowDiscard(true); return; }
    onBack();
  }, [dirty, onBack]);

  const handleSave = useCallback(async () => {
    setError("");
    if (!startDate || !endDate) { setError("请选择日期范围"); return; }
    if (startDate > endDate) { setError("结束日期不能早于开始日期"); return; }
    const days = daysBetween(startDate, endDate);
    if (days > 365) { setError("计划最长支持 365 天"); return; }

    setSaving(true);
    try {
      const plan = createOutfitCalendarPlan({
        type,
        title: title.trim() || undefined,
        startDate,
        endDate,
        tone,
        destination: destination.trim() || undefined,
        activities: activities.length > 0 ? activities : undefined,
        weatherNote: weatherNote.trim() || undefined,
        notes: notes.trim() || undefined,
        packingEnabled,
      });
      if (initialPlan) { plan.id = initialPlan.id; plan.createdAt = initialPlan.createdAt; }
      await onSave(plan);
    } catch (e) {
      onMessage("计划保存失败，请重试", "error");
    } finally {
      setSaving(false);
    }
  }, [type, title, startDate, endDate, tone, destination, activities, weatherNote, notes, packingEnabled, initialPlan, onSave, onMessage]);

  function addActivity() {
    const v = activityInput.trim();
    if (!v || activities.includes(v) || activities.length >= 8) return;
    setActivities([...activities, v]);
    setActivityInput("");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink/5">
        <button type="button" className="flex items-center gap-1 text-sm font-medium text-ink/70" onClick={handleBack}>
          <ChevronLeft size={18} /> {titleLabel}
        </button>
        <button
          type="button"
          disabled={saving}
          className="rounded-full bg-denim px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          onClick={handleSave}
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      {/* Error */}
      {error && <div className="mx-4 mt-2 rounded-lg bg-clay/10 border border-clay/20 px-3 py-2 text-xs text-clay">{error}</div>}

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Title */}
        <div>
          <label className="text-xs font-medium text-ink/60">计划名称</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === "travel" ? "未命名旅行" : type === "business" ? "未命名出差" : "未命名计划"}
            className="mt-1 w-full rounded-xl border border-ink/10 bg-mist/30 px-3 py-2 text-sm text-ink placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-denim/30"
          />
        </div>

        {/* Destination (travel & business) */}
        {type !== "custom" && (
          <div>
            <label className="text-xs font-medium text-ink/60">{type === "travel" ? "目的地" : "地点"}</label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={type === "travel" ? "如 伊宁 / 夏塔" : "如 上海"}
              className="mt-1 w-full rounded-xl border border-ink/10 bg-mist/30 px-3 py-2 text-sm text-ink placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-denim/30"
            />
          </div>
        )}

        {/* Date range */}
        <div>
          <label className="text-xs font-medium text-ink/60">日期范围</label>
          <div className="mt-1 flex items-center gap-2">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="flex-1 rounded-xl border border-ink/10 bg-mist/30 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-denim/30" />
            <span className="text-xs text-ink/40">至</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="flex-1 rounded-xl border border-ink/10 bg-mist/30 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-denim/30" />
          </div>
        </div>

        {/* Activities */}
        <div>
          <label className="text-xs font-medium text-ink/60">活动关键词</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={activityInput}
              onChange={(e) => setActivityInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addActivity(); } }}
              placeholder="输入后回车添加"
              className="flex-1 rounded-xl border border-ink/10 bg-mist/30 px-3 py-2 text-sm text-ink placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-denim/30"
            />
          </div>
          {activities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {activities.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-full bg-denim/10 px-2.5 py-0.5 text-[11px] font-medium text-denim border border-denim/15">
                  {a}
                  <button type="button" className="text-denim/60 hover:text-denim" onClick={() => setActivities(activities.filter((x) => x !== a))}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Weather note (travel) */}
        {type === "travel" && (
          <div>
            <label className="text-xs font-medium text-ink/60">天气备注</label>
            <input
              type="text"
              value={weatherNote}
              onChange={(e) => setWeatherNote(e.target.value)}
              placeholder="如 早晚温差大"
              className="mt-1 w-full rounded-xl border border-ink/10 bg-mist/30 px-3 py-2 text-sm text-ink placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-denim/30"
            />
          </div>
        )}

        {/* Notes (business & custom) */}
        {(type === "business" || type === "custom") && (
          <div>
            <label className="text-xs font-medium text-ink/60">备注</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={type === "business" ? "如 需要偏正式" : "可选"}
              className="mt-1 w-full rounded-xl border border-ink/10 bg-mist/30 px-3 py-2 text-sm text-ink placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-denim/30"
            />
          </div>
        )}

        {/* Tone selector */}
        <div>
          <label className="text-xs font-medium text-ink/60">计划彩条颜色</label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                className={`h-8 w-8 rounded-full ${PLAN_TONE_BG_MAP[t]} ${tone === t ? "ring-2 ring-denim ring-offset-2" : ""}`}
                onClick={() => setTone(t)}
                title={PLAN_TONE_LABEL_MAP[t]}
              />
            ))}
          </div>
        </div>

        {/* Packing toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ink/60">自动生成打包清单</span>
          <button
            type="button"
            className={`relative h-6 w-11 rounded-full transition-colors ${packingEnabled ? "bg-moss" : "bg-ink/15"}`}
            onClick={() => setPackingEnabled(!packingEnabled)}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${packingEnabled ? "translate-x-[22px]" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>

      {/* Discard confirmation */}
      <MotionSheet open={showDiscard} onClose={() => setShowDiscard(false)}>
        <div className="text-center">
          <h3 className="text-base font-semibold text-ink">放弃当前计划？</h3>
          <p className="text-sm text-ink/55 mt-1">未保存的修改会丢失。</p>
          <div className="flex items-center gap-3 mt-4">
            <button type="button" className="flex-1 rounded-full border border-ink/10 py-2 text-sm font-medium text-ink/70" onClick={() => setShowDiscard(false)}>继续编辑</button>
            <button type="button" className="flex-1 rounded-full bg-clay py-2 text-sm font-semibold text-white" onClick={onBack}>放弃</button>
          </div>
        </div>
      </MotionSheet>
    </div>
  );
}
