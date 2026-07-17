"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, ChevronRight, CloudSun, Loader2, MapPin, RefreshCw, Search, Shirt, X } from "lucide-react";
import { useReducedMotion } from "motion/react";

import type { HomeFeedController } from "@/components/home/use-home-feed-controller";
import { HomeFeedTabPanels } from "@/components/home/home-feed-tab-panels";
import { AppPressable, MotionSheet } from "@/components/motion-common";
import type { HomeGarment } from "@/lib/home/home-feed-model";

export function WardoraHomeView({ controller, garments, renderWardrobeContent }: {
  controller: HomeFeedController;
  garments: readonly HomeGarment[];
  renderWardrobeContent: () => ReactNode;
}) {
  const recommendationRef = useRef<HTMLDivElement>(null);
  const [feedTab, setFeedTab] = useState<"recommendation" | "wardrobe">("recommendation");
  const reducedMotion = useReducedMotion();
  const garmentNames = useMemo(() => new Map(garments.map((item) => [item.id, item.name])), [garments]);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(controller.window.today, index)), [controller.window.today]);
  const vm = controller.viewModel;
  const recommendationContext = vm.recommendation.status === "ready" ? vm.recommendation.contextMode : null;

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4 pb-6" data-testid="wardora-home-feed" data-home-state={vm.normalState ?? "workspace-error"}>
      <header className="flex min-h-11 items-center justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-denim/70">WARDORA</p>
          <h1 className="text-2xl font-semibold tracking-tight">今天穿什么</h1>
        </div>
        <AppPressable
          feedback="control"
          className="flex min-h-11 max-w-[55%] items-center gap-2 rounded-full bg-white/85 px-3 text-sm shadow-sm ring-1 ring-ink/10"
          onClick={() => controller.setCityOpen(true)}
          aria-label="选择天气地点"
          data-testid="home-location-entry"
        >
          <MapPin size={17} aria-hidden="true" />
          <span className="truncate">{vm.location.kind === "none" ? "未设置城市" : `${vm.location.displayName} · ${vm.location.kind === "temporary_city" ? "临时" : "常驻"}`}</span>
          <ChevronRight size={15} aria-hidden="true" />
        </AppPressable>
      </header>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" aria-label="选择日期">
        {dates.map((date, index) => (
          <AppPressable
            key={date}
            feedback="control"
            className={`min-h-11 min-w-[68px] rounded-2xl px-3 py-2 text-center text-sm ring-1 ${controller.selectedDate === date ? "bg-denim text-white ring-denim" : "bg-white/75 text-ink ring-ink/10"}`}
            onClick={() => controller.setSelectedDate(date)}
            aria-pressed={controller.selectedDate === date}
          >
            <span className="block text-[11px] opacity-70">{index === 0 ? "今天" : index === 1 ? "明天" : weekday(date)}</span>
            <span className="font-semibold">{date.slice(5).replace("-", "/")}</span>
          </AppPressable>
        ))}
      </div>

      <section className="relative min-h-[190px] overflow-hidden rounded-[28px] bg-gradient-to-br from-denim/12 via-mist to-clay/12 p-5 shadow-sm ring-1 ring-white/70" data-testid="home-weather-card">
        <div className="pointer-events-none absolute inset-0 opacity-55" aria-hidden="true">
          <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/70 blur-2xl" />
          <div className="absolute -bottom-20 left-4 h-36 w-64 rounded-[50%] bg-denim/10 blur-2xl" />
        </div>
        <div className="relative z-10">
          {vm.weather.status === "loading" || vm.weather.status === "idle" ? <ModuleLoading label="正在读取天气" /> : null}
          {vm.weather.status === "error" ? <ModuleError message={vm.weather.message} onRetry={controller.retryWeather} /> : null}
          {vm.weather.status === "ready" ? (
            <AppPressable
              feedback="card"
              className="block min-h-[150px] w-full text-left"
              onClick={() => {
                setFeedTab("recommendation");
                requestAnimationFrame(() => recommendationRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" }));
              }}
              aria-label="查看当日穿搭建议"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-ink/60">{controller.selectedDate === controller.window.today ? "今日天气" : "天气预报"}</p>
                  {vm.weather.temperatureC !== undefined ? <p className="mt-1 text-5xl font-light tracking-tight">{Math.round(vm.weather.temperatureC)}°</p> : null}
                  {vm.weather.temperatureC === undefined && (vm.weather.minTemperatureC !== undefined || vm.weather.maxTemperatureC !== undefined) ? (
                    <p className="mt-2 text-3xl font-light">{tempRange(vm.weather.minTemperatureC, vm.weather.maxTemperatureC)}</p>
                  ) : null}
                  {vm.weather.temperatureC === undefined && vm.weather.minTemperatureC === undefined && vm.weather.maxTemperatureC === undefined ? (
                    <p className="mt-3 text-lg font-medium">暂无可信温度</p>
                  ) : null}
                </div>
                <div className="grid min-h-14 min-w-14 place-items-center rounded-2xl bg-white/55">
                  <CloudSun size={32} strokeWidth={1.6} aria-hidden="true" />
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/65">
                <span>{vm.weather.summary ?? vm.weather.visual?.name ?? availabilityLabel(vm.weather.availabilityReason)}</span>
                {vm.weather.feelsLikeC !== undefined ? <span>体感 {Math.round(vm.weather.feelsLikeC)}°</span> : null}
                {vm.weather.stale ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">缓存天气</span> : null}
              </div>
            </AppPressable>
          ) : null}
        </div>
      </section>

      <div className="grid min-h-11 grid-cols-2 rounded-2xl bg-ink/5 p-1" role="tablist" aria-label="首页内容">
        <AppPressable id="home-recommendation-tab" aria-controls="home-recommendation-panel" className={`rounded-xl text-sm font-semibold ${feedTab === "recommendation" ? "bg-white text-denim shadow-sm" : "text-ink/55"}`} role="tab" aria-selected={feedTab === "recommendation"} onClick={() => setFeedTab("recommendation")}>推荐</AppPressable>
        <AppPressable id="home-wardrobe-tab" aria-controls="home-wardrobe-panel" className={`rounded-xl text-sm font-semibold ${feedTab === "wardrobe" ? "bg-white text-denim shadow-sm" : "text-ink/55"}`} role="tab" aria-selected={feedTab === "wardrobe"} onClick={() => setFeedTab("wardrobe")}>衣橱</AppPressable>
      </div>

      <HomeFeedTabPanels activeTab={feedTab} recommendation={(
      <section ref={recommendationRef} className="scroll-mt-4 rounded-[24px] bg-white/90 p-4 shadow-sm ring-1 ring-ink/8" data-testid="home-recommendation-module">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-ink/50">今日建议</p>
            <h2 className="text-lg font-semibold">穿搭推荐</h2>
          </div>
          {vm.recommendation.status === "error" ? <RetryIcon onClick={controller.retryRecommendation} label="重试推荐" /> : null}
        </div>
        {vm.plan ? (
          <ReadOnlyOutfit title={vm.plan.kind === "actual_wear" ? "今天实际穿着" : "今日主计划"} garmentIds={vm.plan.garmentIds} garmentNames={garmentNames} badge={vm.plan.kind === "actual_wear" ? "已穿事实" : "计划已保护"} />
        ) : vm.recommendation.status === "loading" || vm.recommendation.status === "idle" ? (
          <ModuleLoading label="正在整理穿搭建议" />
        ) : vm.recommendation.status === "error" ? (
          <p className="py-5 text-sm text-ink/60">{vm.recommendation.message}</p>
        ) : vm.recommendation.status === "not_ready" ? (
          <EmptyRecommendation wardrobeReady={vm.wardrobeReady} />
        ) : vm.recommendation.status === "protected" ? (
          <p className="py-5 text-sm text-ink/65">今日已有主计划，天气或推荐变化不会自动覆盖它。</p>
        ) : vm.recommendation.status === "ready" ? (
          <div className="grid gap-3">
            {vm.recommendation.candidates.map((candidate, index) => (
              <ReadOnlyOutfit key={candidate.candidateId} title={index === 0 ? "首选搭配" : `备选 ${index + 1}`} garmentIds={candidate.garmentIds} garmentNames={garmentNames} badge={recommendationContext === "locationless" ? "无城市建议" : recommendationContext === "weather_fallback" ? "静态保底" : "结合天气"} />
            ))}
          </div>
        ) : null}
      </section>
      )} renderWardrobe={() => (

      <section className="rounded-[22px] bg-white/80 p-4 ring-1 ring-ink/8" data-testid="home-wardrobe-column">
        <div className="flex min-h-11 items-center justify-between font-semibold">
          <span className="flex items-center gap-2"><Shirt size={19} />我的衣橱</span>
          <span className="text-sm font-normal text-ink/50">{garments.length} 件</span>
        </div>
        <div className="pt-3">{renderWardrobeContent()}</div>
      </section>
      )} />

      <HomeCitySheet controller={controller} />
    </div>
  );
}

export function HomeCitySheet({ controller }: { controller: HomeFeedController }) {
  const profile = controller.locationSnapshot?.profile;
  const override = controller.locationSnapshot?.override.override;
  const locationActions = homeCitySheetLocationActions(Boolean(override));
  return (
    <MotionSheet open={controller.cityOpen} onClose={() => controller.setCityOpen(false)} ariaLabel="选择天气城市" variant="form" panelClassName="!max-w-md">
      <div className="px-4 pb-[calc(16px+env(safe-area-inset-bottom))]" data-testid="home-city-sheet">
        <div className="mb-4 flex min-h-11 items-center justify-between">
          <div><h2 className="text-lg font-semibold">天气地点</h2><p className="text-xs text-ink/50">仅使用你明确确认的城市</p></div>
          <AppPressable feedback="icon" className="grid h-11 w-11 place-items-center rounded-full bg-mist" onClick={() => controller.setCityOpen(false)} aria-label="关闭城市选择"><X size={20} /></AppPressable>
        </div>
        {controller.locationState.status === "error" ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-clay/10 p-3 text-sm text-clay" role="alert">
            <span>{controller.locationState.message}</span>
            <AppPressable className="min-h-11 shrink-0 rounded-xl bg-white px-3 font-semibold" onClick={() => void controller.retryLocation()}>重试</AppPressable>
          </div>
        ) : null}
        <label className="flex min-h-12 items-center gap-2 rounded-2xl bg-mist px-3 ring-1 ring-ink/8">
          <Search size={18} aria-hidden="true" />
          <input
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
            value={controller.cityQuery}
            onChange={(event) => controller.searchCities(event.target.value)}
            onCompositionStart={controller.startCityComposition}
            onCompositionEnd={(event) => controller.endCityComposition(event.currentTarget.value)}
            placeholder="至少输入 2 个字搜索城市"
            aria-label="搜索城市"
          />
          {controller.citySearchState === "loading" ? <Loader2 className="animate-spin" size={17} aria-label="搜索中" /> : null}
        </label>
        {controller.citySearchState === "error" ? <p className="mt-2 text-sm text-clay" role="alert">{controller.citySearchMessage ?? "城市搜索失败，请修改关键词重试。"}</p> : null}
        {controller.citySearchState === "rate_limited" ? <p className="mt-2 text-sm text-clay" role="alert">搜索请求过于频繁{controller.citySearchRetryAfter ? `，请在 ${controller.citySearchRetryAfter} 秒后手动重试` : "，请稍后手动重试"}。</p> : null}
        {controller.cityMutation ? <p className="mt-2 flex min-h-11 items-center gap-2 text-sm text-denim" role="status"><Loader2 className="animate-spin motion-reduce:animate-none" size={17} />正在保存地点，完成后会读取服务器结果…</p> : null}
        {controller.cityMutationError ? <p className="mt-2 text-sm text-clay" role="alert" data-conflict={controller.cityMutationConflict || undefined}>{controller.cityMutationError}</p> : null}
        <div className="mt-3 grid max-h-[34vh] gap-2 overflow-y-auto">
          {controller.cityCandidates.map((city) => (
            <div key={city.locationId} className="rounded-2xl border border-ink/10 bg-white p-3">
              <div className="font-medium">{city.displayName}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <AppPressable className="min-h-11 rounded-xl bg-denim px-2 text-sm font-semibold text-white" disabled={!!controller.cityMutation} onClick={() => void controller.commitLocation("home", city.locationId)}>设为常驻</AppPressable>
                <AppPressable className="min-h-11 rounded-xl bg-mist px-2 text-sm font-semibold" disabled={!!controller.cityMutation} onClick={() => void controller.commitLocation("temporary", city.locationId)}>临时至明日</AppPressable>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 border-t border-ink/10 pt-4">
          {locationActions.includes("clear_temporary") ? <AppPressable className="min-h-11 rounded-xl bg-mist px-3 text-sm" disabled={!!controller.cityMutation} onClick={() => void controller.commitLocation("clear_temporary")}><Check className="mr-2 inline" size={16} />恢复常驻城市{profile?.homeCity ? ` · ${profile.homeCity.displayName}` : ""}</AppPressable> : null}
        </div>
      </div>
    </MotionSheet>
  );
}

export function homeCitySheetLocationActions(hasTemporaryOverride: boolean): readonly ("clear_temporary")[] {
  return hasTemporaryOverride ? ["clear_temporary"] : [];
}

function ModuleLoading({ label }: { label: string }) { return <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-ink/55"><Loader2 className="animate-spin motion-reduce:animate-none" size={18} />{label}</div>; }
function ModuleError({ message, onRetry }: { message: string; onRetry: () => unknown }) { return <div className="grid min-h-28 place-items-center text-center"><div><AlertCircle className="mx-auto mb-2" size={22} /><p className="text-sm">{message}</p><AppPressable className="mt-3 min-h-11 rounded-full bg-white/70 px-4 text-sm font-semibold" onClick={() => void onRetry()}>重试天气</AppPressable></div></div>; }
function RetryIcon({ onClick, label }: { onClick: () => unknown; label: string }) { return <AppPressable feedback="icon" className="grid h-11 w-11 place-items-center rounded-full bg-mist" onClick={() => void onClick()} aria-label={label}><RefreshCw size={17} /></AppPressable>; }
function EmptyRecommendation({ wardrobeReady }: { wardrobeReady: boolean }) { return <div className="py-5 text-sm text-ink/60"><p>{wardrobeReady ? "暂时没有可展示的服务端推荐。" : "衣橱还未满足完整搭配条件。"}</p><p className="mt-1 text-xs">补齐上装、下装与鞋履后再刷新。</p></div>; }
function ReadOnlyOutfit({ title, garmentIds, garmentNames, badge }: { title: string; garmentIds: readonly string[]; garmentNames: ReadonlyMap<string, string>; badge: string }) { return <article className="rounded-2xl bg-mist/70 p-3"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{title}</h3><span className="rounded-full bg-white px-2 py-1 text-[11px] text-ink/55">{badge}</span></div><p className="mt-2 text-sm leading-6 text-ink/65">{garmentIds.map((id) => garmentNames.get(id) ?? "衣物").join(" · ")}</p></article>; }
function addDays(date: string, days: number) { const value = new Date(`${date}T12:00:00+08:00`); value.setUTCDate(value.getUTCDate() + days); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(value); }
function weekday(date: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(new Date(`${date}T12:00:00+08:00`)); }
function tempRange(min?: number, max?: number) { if (min !== undefined && max !== undefined) return `${Math.round(min)}° / ${Math.round(max)}°`; return `${Math.round(min ?? max!)}°`; }
function availabilityLabel(reason: string) { return reason === "locationless" ? "未设置城市" : reason === "provider_unavailable" ? "天气服务暂不可用" : "暂无完整天气"; }
