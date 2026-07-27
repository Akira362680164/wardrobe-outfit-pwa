"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, ChevronRight, CloudSun, Loader2, MapPin, RefreshCw, RotateCcw, Save, Search, Shirt, ThumbsDown, X } from "lucide-react";
import { useReducedMotion } from "motion/react";

import type { HomeFeedController } from "@/components/home/use-home-feed-controller";
import { HomeFeedTabPanels } from "@/components/home/home-feed-tab-panels";
import { HomeWeatherCanvas } from "@/components/home/home-weather-canvas";
import { AppPressable, MotionSheet } from "@/components/motion-common";
import { OnlineAssetImage } from "@/components/online/online-asset-image";
import type { HomeFeedViewModel, HomeGarment, HomePlan, HomeRecommendationCandidate, HomeWeatherViewModel } from "@/lib/home/home-feed-model";
import { recommendationPlanAvailabilityMessage, recommendationPlanSnapshotNames } from "@/lib/recommendation-plan-presentation";
import { openApplicationSettings } from "@/lib/home/device-location";

export function WardoraHomeView({ controller, garments, renderWardrobeContent }: {
  controller: HomeFeedController;
  garments: readonly HomeGarment[];
  renderWardrobeContent: () => ReactNode;
}) {
  const recommendationRef = useRef<HTMLDivElement>(null);
  const [feedTab, setFeedTab] = useState<"recommendation" | "wardrobe">("recommendation");
  const [replaceMode, setReplaceMode] = useState(false);
  const [postAccept, setPostAccept] = useState<{ candidate: HomeRecommendationCandidate; garmentIds: readonly string[] } | null>(null);
  const reducedMotion = useReducedMotion();
  const garmentById = useMemo(() => new Map(garments.map((item) => [item.id, item])), [garments]);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(controller.window.today, index)), [controller.window.today]);
  const vm = controller.viewModel;
  const readyRecommendation = vm.recommendation.status === "ready" ? vm.recommendation : null;
  const scrollToRecommendations = (date: string) => {
    controller.setSelectedDate(date);
    setFeedTab("recommendation");
    requestAnimationFrame(() => recommendationRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" }));
  };

  return (
    <div className="mx-auto grid min-w-0 w-full max-w-2xl gap-3 overflow-x-clip pb-6" data-testid="wardora-home-feed" data-home-state={vm.normalState ?? "workspace-error"}>
      <header className="px-0.5 pb-1 pt-1">
        <h1 className="text-[25px] font-bold leading-[1.12] tracking-[-0.025em] text-ink">{businessGreeting()}</h1>
        <p className="mt-[7px] text-[13px] font-medium leading-[1.35] text-ink/65" data-testid="home-business-date">{formatBusinessDate(controller.window.today)}</p>
      </header>

      <section className="home-weather-shell ui-card overflow-hidden p-3.5" aria-label="今日和明日天气" data-testid="home-weather-module">
        <AppPressable
          feedback="control"
          className="-ml-2 -mt-2 mb-0.5 flex min-h-12 max-w-full items-center gap-1.5 rounded-xl px-2 text-left text-[13px] font-semibold leading-[18px] text-denim"
          onClick={() => controller.setCityOpen(true)}
          aria-label="选择天气地点"
          data-testid="home-location-entry"
        >
          <MapPin size={21} aria-hidden="true" />
          <span className="truncate" data-testid="home-location-label">{locationLabel(vm.location)}</span>
          <ChevronRight className="shrink-0" size={20} aria-hidden="true" />
        </AppPressable>
        {vm.location.kind === "none" ? (
          <WeatherUnavailable title="设置地点后可查看天气" message="城市不是使用首页的前置条件；现在仍可获得不作天气结论的通用建议。" />
        ) : bothWeatherUnavailable(vm.todayWeather, vm.tomorrowWeather) ? (
          <WeatherUnavailable title="天气服务暂时不可用" message="已切换为通用推荐，不使用过期温度或降雨结论；衣橱仍可正常浏览。" />
        ) : (
          <div className="mt-0.5 grid grid-cols-2 gap-1.5" data-testid="home-weather-pair">
            <WeatherDayCard kind="today" weather={vm.todayWeather} onClick={() => scrollToRecommendations(controller.window.today)} onRetry={() => controller.retryWeather(controller.window.today)} />
            <WeatherDayCard kind="tomorrow" weather={vm.tomorrowWeather} onClick={() => scrollToRecommendations(controller.window.tomorrow)} onRetry={() => controller.retryWeather(controller.window.tomorrow)} />
          </div>
        )}
        <WeatherAttribution weather={[vm.todayWeather, vm.tomorrowWeather]} />
      </section>

      <div className="grid min-h-[56px] grid-cols-2 gap-1 rounded-[14px] bg-ink/5 p-1" role="tablist" aria-label="首页内容">
        <AppPressable id="home-recommendation-tab" aria-controls="home-recommendation-panel" className={`min-h-12 rounded-[11px] text-sm font-semibold ${feedTab === "recommendation" ? "bg-surface text-denim" : "text-ink/65"}`} role="tab" aria-selected={feedTab === "recommendation"} onClick={() => setFeedTab("recommendation")}>推荐</AppPressable>
        <AppPressable id="home-wardrobe-tab" aria-controls="home-wardrobe-panel" className={`min-h-12 rounded-[11px] text-sm font-semibold ${feedTab === "wardrobe" ? "bg-surface text-denim" : "text-ink/65"}`} role="tab" aria-selected={feedTab === "wardrobe"} onClick={() => setFeedTab("wardrobe")}>衣橱</AppPressable>
      </div>

      <HomeFeedTabPanels activeTab={feedTab} recommendation={(
      <section ref={recommendationRef} className="scroll-mt-4 min-w-0 px-px py-1" data-testid="home-recommendation-module">
        {vm.plan ? (
          <div>
            <SectionHeading title={vm.plan.kind === "actual_wear" ? "今天已穿" : "当日穿搭"} subtitle={`${formatShortDate(controller.selectedDate)} · ${vm.plan.kind === "actual_wear" ? "已记录穿着" : "已安排"}`} />
            <CurrentPlanCard plan={vm.plan} backups={vm.backupPlans} garmentById={garmentById} today={controller.window.today} controller={controller} onReplace={() => setReplaceMode(true)} />
            <div className="mt-3" data-testid="home-plan-date-strip"><DateStrip dates={dates} selectedDate={controller.selectedDate} onSelect={controller.setSelectedDate} /></div>
            {replaceMode ? <div className="mt-3"><SectionHeading title="更换当日穿搭" subtitle="选择一套新的穿搭" action={<AppPressable className="min-h-12 rounded-xl px-3 text-sm font-semibold text-ink/60" onClick={() => setReplaceMode(false)}>取消更换</AppPressable>} /></div> : null}
          </div>
        ) : (
          <div className="mb-2.5 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3" data-testid="home-recommendation-toolbar">
            <SectionHeading compact title={dateHeading(controller.selectedDate, controller.window.today)} subtitle={recommendationSubtitle(vm.recommendation)} action={vm.recommendation.status === "error" ? <RetryIcon onClick={controller.retryRecommendation} label="重试推荐" /> : undefined} />
            <DateStrip dates={dates} selectedDate={controller.selectedDate} onSelect={controller.setSelectedDate} />
          </div>
        )}
        {(!vm.plan || replaceMode) && (vm.recommendation.status === "loading" || vm.recommendation.status === "idle") ? (
          <ModuleLoading label="正在整理穿搭建议" />
        ) : (!vm.plan || replaceMode) && vm.recommendation.status === "error" ? (
          <RecommendationState title="这次没有拿到新建议" message={vm.recommendation.message} />
        ) : (!vm.plan || replaceMode) && vm.recommendation.status === "not_ready" ? (
          <EmptyRecommendation wardrobeReady={vm.wardrobeReady} />
        ) : (!vm.plan || replaceMode) && vm.recommendation.status === "protected" ? (
          <RecommendationState title="这天已有安排" message="你可以继续查看，或更换当天穿搭。" />
        ) : (!vm.plan || replaceMode) && readyRecommendation ? (
          <div className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 pt-0.5 [touch-action:pan-x_pan-y]" aria-label="穿搭推荐，横向滚动" data-testid="home-recommendation-rail">
            {readyRecommendation.candidates.map((candidate) => (
              <RecommendationCard key={candidate.candidateId} candidate={candidate} garmentById={garmentById} allGarments={garments} contextMode={readyRecommendation.contextMode} sourceSummary={recommendationSourceSummary(readyRecommendation)} controller={controller} replacePlan={replaceMode ? vm.plan ?? undefined : undefined} onAccepted={(acceptedCandidate, garmentIds) => setPostAccept({ candidate: acceptedCandidate, garmentIds })} />
            ))}
          </div>
        ) : null}
      </section>
      )} renderWardrobe={() => (

      <section className="ui-card p-4" data-testid="home-wardrobe-column">
        <div className="flex min-h-11 items-center justify-between font-semibold">
          <span className="flex items-center gap-2"><Shirt size={19} />我的衣橱</span>
          <span className="text-sm font-normal text-ink/65">{garments.length} 件</span>
        </div>
        <div className="pt-3">{renderWardrobeContent()}</div>
      </section>
      )} />

      <HomeCitySheet controller={controller} />
      <MotionSheet open={Boolean(postAccept)} onClose={() => setPostAccept(null)} ariaLabel="穿搭已安排" variant="action" panelClassName="!max-w-md"><div className="grid gap-3 px-4 pb-[calc(16px+env(safe-area-inset-bottom))]"><h2 className="text-lg font-semibold">穿搭已安排</h2><p className="text-sm leading-6 text-ink/60">这套已经安排好了。你也可以另存为常用套装；即使保存失败，也不会影响这次安排。</p><AppPressable className="min-h-12 rounded-[14px] bg-denim font-semibold text-white" onClick={() => postAccept && void controller.saveCandidateOutfit(postAccept.candidate, postAccept.garmentIds)}>保存到我的套装</AppPressable><AppPressable className="min-h-12 rounded-[14px] bg-mist font-semibold" onClick={() => setPostAccept(null)}>仅本次使用</AppPressable></div></MotionSheet>
    </div>
  );
}

export function HomeCitySheet({ controller }: { controller: HomeFeedController }) {
  const [purposeOpen, setPurposeOpen] = useState(false);
  const profile = controller.locationSnapshot?.profile;
  const override = controller.locationSnapshot?.override.override;
  const locationActions = homeCitySheetLocationActions(Boolean(override));
  return (
    <MotionSheet open={controller.cityOpen} onClose={() => controller.setCityOpen(false)} ariaLabel="选择天气城市" variant="form" panelClassName="!max-w-md">
      <div className="px-4 pb-[calc(16px+env(safe-area-inset-bottom))]" data-testid="home-city-sheet">
        <div className="mb-4 flex min-h-11 items-center justify-between">
          <div><h2 className="text-lg font-semibold">天气地点</h2><p className="text-xs text-ink/65">仅使用你明确确认的城市</p></div>
          <AppPressable feedback="icon" className="grid h-11 w-11 place-items-center rounded-full bg-mist" onClick={() => controller.setCityOpen(false)} aria-label="关闭城市选择"><X size={20} /></AppPressable>
        </div>
        {controller.locationState.status === "error" ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-clay/10 p-3 text-sm text-clay" role="alert">
            <span>{controller.locationState.message}</span>
            <AppPressable className="min-h-11 shrink-0 rounded-xl bg-white px-3 font-semibold" onClick={() => void controller.retryLocation()}>重试</AppPressable>
          </div>
        ) : null}
        <AppPressable className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-denim/10 px-3 text-sm font-semibold text-denim" disabled={controller.deviceLocation.status === "requesting"} onClick={() => setPurposeOpen(true)} data-testid="home-use-current-location"><MapPin size={18} />{controller.deviceLocation.status === "requesting" ? "正在获取大致位置…" : "使用当前位置"}</AppPressable>
        {controller.deviceLocation.status === "denied" ? <div className="mb-3 rounded-2xl bg-clay/10 p-3 text-sm leading-6 text-clay" role="alert"><p>{controller.deviceLocation.message}</p><div className="mt-2 grid grid-cols-2 gap-2"><AppPressable className="min-h-12 rounded-xl bg-white px-2 font-semibold" onClick={() => void openApplicationSettings()}>前往系统设置</AppPressable><AppPressable className="min-h-12 rounded-xl bg-white px-2 font-semibold" onClick={() => void controller.requestDeviceLocation()}>返回后重试</AppPressable></div></div> : null}
        {controller.deviceLocation.status === "error" ? <p className="mb-3 text-sm leading-6 text-clay" role="alert">{controller.deviceLocation.message}</p> : null}
        {controller.deviceLocation.status === "ready" ? <div className="mb-3 grid gap-2" data-testid="home-device-location-candidates"><p className="text-sm font-semibold">请确认城市，然后选择本次或常驻</p>{controller.deviceLocation.candidates.map((city) => <div key={city.locationId} className="rounded-2xl border border-denim/20 bg-white p-3"><div className="font-medium">{city.displayName}</div><div className="mt-2 grid grid-cols-2 gap-2"><AppPressable className="min-h-12 rounded-xl bg-denim px-2 text-sm font-semibold text-white" disabled={!!controller.cityMutation} onClick={() => void controller.commitLocation("home", city.locationId)}>设为常驻</AppPressable><AppPressable className="min-h-12 rounded-xl bg-mist px-2 text-sm font-semibold" disabled={!!controller.cityMutation} onClick={() => void controller.commitLocation("temporary", city.locationId)}>临时至明日</AppPressable></div></div>)}</div> : null}
        <label className="flex min-h-12 items-center gap-2 rounded-2xl bg-mist px-3 ring-1 ring-ink/8">
          <Search size={18} aria-hidden="true" />
          <input
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
            value={controller.cityQuery}
            onChange={(event) => controller.searchCities(event.target.value)}
            onCompositionStart={controller.startCityComposition}
            onCompositionEnd={(event) => controller.endCityComposition(event.currentTarget.value)}
            placeholder="搜索城市"
            aria-label="搜索城市"
          />
          {controller.citySearchState === "loading" ? <Loader2 className="animate-spin" size={17} aria-label="搜索中" /> : null}
        </label>
        {controller.citySearchState === "error" ? <p className="mt-2 text-sm text-clay" role="alert">{controller.citySearchMessage ?? "城市搜索失败，请修改关键词重试。"}</p> : null}
        {controller.citySearchState === "rate_limited" ? <p className="mt-2 text-sm text-clay" role="alert">搜索请求过于频繁{controller.citySearchRetryAfter ? `，请在 ${controller.citySearchRetryAfter} 秒后手动重试` : "，请稍后手动重试"}。</p> : null}
        {controller.cityMutation ? <p className="mt-2 flex min-h-11 items-center gap-2 text-sm text-denim" role="status"><Loader2 className="animate-spin motion-reduce:animate-none" size={17} />正在保存地点…</p> : null}
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
      <MotionSheet open={purposeOpen} onClose={() => setPurposeOpen(false)} ariaLabel="使用当前位置说明" variant="confirm" panelClassName="!max-w-md"><div className="grid gap-3 px-4 pb-[calc(16px+env(safe-area-inset-bottom))]"><h2 className="text-lg font-semibold">用大致位置找城市</h2><p className="text-sm leading-6 text-ink/60">Wardora 只用本次大致位置查找附近城市。不需要精确位置，也不会保存你的位置；你选择城市后才会保存地点设置。</p><AppPressable className="min-h-12 rounded-[14px] bg-denim font-semibold text-white" onClick={() => { setPurposeOpen(false); void controller.requestDeviceLocation(); }}>继续使用大致位置</AppPressable><AppPressable className="min-h-12 rounded-[14px] bg-mist font-semibold" onClick={() => setPurposeOpen(false)}>暂不使用</AppPressable></div></MotionSheet>
    </MotionSheet>
  );
}

export function homeCitySheetLocationActions(hasTemporaryOverride: boolean): readonly ("clear_temporary")[] {
  return hasTemporaryOverride ? ["clear_temporary"] : [];
}

function WeatherDayCard({ kind, weather, onClick, onRetry }: { kind: "today" | "tomorrow"; weather: HomeWeatherViewModel; onClick: () => void; onRetry: () => unknown }) {
  if (weather.status === "loading" || weather.status === "idle") return <div className="home-weather-day-card grid min-h-[108px] place-items-center bg-mist/75 px-2 text-center text-xs text-ink/65" data-testid={`home-weather-${kind}`}><Loader2 className="animate-spin motion-reduce:animate-none" size={19} /><span>{kind === "today" ? "正在读取今天" : "正在读取明天"}</span></div>;
  if (weather.status === "error") return <div className="home-weather-day-card grid min-h-[108px] content-center bg-mist/75 px-2 text-center" data-testid={`home-weather-${kind}`}><AlertCircle className="mx-auto text-clay" size={18} /><p className="mt-1 line-clamp-2 text-[11px] text-ink/65">{weather.message}</p><AppPressable className="mx-auto min-h-11 px-3 text-xs font-semibold text-denim" onClick={() => void onRetry()}>重试</AppPressable></div>;
  if (weather.status !== "ready") return null;
  const isToday = kind === "today";
  const temperature = isToday && weather.temperatureC !== undefined
    ? `${Math.round(weather.temperatureC)}°`
    : tempRange(weather.minTemperatureC, weather.maxTemperatureC);
  return (
    <AppPressable
      feedback="card"
      className="home-weather-day-card home-weather-static relative h-[113px] overflow-hidden px-[9px] pb-[5px] pt-[7px] text-left"
      onClick={onClick}
      aria-label={`${isToday ? "今天" : "明天"}天气，切换到${isToday ? "今日" : "明日"}推荐`}
      data-testid={`home-weather-${kind}`}
      data-weather-family={weather.visual?.family ?? "unknown"}
    >
      {isToday && weather.visual ? <HomeWeatherCanvas visual={weather.visual} forecast={weather.availabilityReason === "available"} stale={weather.stale} /> : null}
      <div className="relative z-10 grid h-full grid-rows-[17px_28px_35px_16px]">
        <div data-weather-row="label" className="flex items-baseline justify-between gap-1 self-start text-[12px] font-medium leading-[17px] text-ink/65"><span>{isToday ? "今天" : "明天"}</span><span className="truncate">{weather.maxTemperatureC !== undefined ? `最高 ${Math.round(weather.maxTemperatureC)}°` : ""}</span></div>
        <p data-weather-row="temperature" className={`self-start whitespace-nowrap leading-[28px] tracking-[-0.025em] ${isToday ? "text-[24px] font-bold" : "text-[22px] font-semibold"}`}>{temperature}</p>
        <p data-weather-row="summary" className="line-clamp-2 self-start text-[12px] font-medium leading-[17px]">{weather.summary ?? weather.visual?.name ?? "暂无完整天气摘要"}</p>
        <p data-weather-row="meta" className="self-end truncate text-[11px] leading-4 text-ink/65">{isToday
          ? [weather.feelsLikeC !== undefined ? `体感 ${Math.round(weather.feelsLikeC)}°` : null, weather.windLevel !== undefined ? `${weather.windLevel} 级风` : null].filter(Boolean).join(" · ") || tempLowLabel(weather.minTemperatureC)
          : [tempLowLabel(weather.minTemperatureC), "日间预报"].filter(Boolean).join(" · ")}</p>
      </div>
    </AppPressable>
  );
}

function WeatherUnavailable({ title, message }: { title: string; message: string }) {
  return <div className="rounded-[16px] bg-mist/65 p-4"><CloudSun className="mb-3 text-denim/70" size={26} /><h2 className="font-semibold">{title}</h2><p className="mt-1 max-w-[34ch] text-sm leading-6 text-ink/60">{message}</p><span className="mt-3 inline-flex min-h-7 items-center rounded-full bg-moss/10 px-3 text-xs font-semibold text-moss">通用推荐 · 不使用温度和降雨</span></div>;
}

function DateStrip({ dates, selectedDate, onSelect }: { dates: readonly string[]; selectedDate: string; onSelect: (date: string) => void }) {
  return <div className="no-scrollbar flex min-w-0 gap-1.5 overflow-x-auto pb-0.5" aria-label="选择推荐日期" data-testid="home-date-strip">{dates.map((date, index) => <AppPressable key={date} feedback="control" className={`min-h-12 min-w-[48px] rounded-[13px] px-1 py-1 text-center text-[10px] leading-[1.2] ${selectedDate === date ? "bg-denim text-white shadow-sm" : "bg-white/55 text-ink/60"}`} onClick={() => onSelect(date)} aria-pressed={selectedDate === date}><span className="block opacity-80">{index === 0 ? "今天" : index === 1 ? "明天" : weekday(date)}</span><span className="mt-0.5 block font-semibold">{date.slice(5).replace("-", "/")}</span></AppPressable>)}</div>;
}

function SectionHeading({ title, subtitle, action, compact = false }: { title: string; subtitle: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`${compact ? "" : "mb-2.5"} flex min-h-11 items-end justify-between gap-3`}><div><h2 className="text-[18px] font-bold leading-[1.2] tracking-[-0.015em]">{title}</h2><p className="mt-[3px] max-w-[12ch] text-[11px] leading-[1.4] text-ink/65">{subtitle}</p></div>{action}</div>;
}

function RecommendationCard({ candidate, garmentById, allGarments, contextMode, sourceSummary, controller, replacePlan, onAccepted }: { candidate: HomeRecommendationCandidate; garmentById: ReadonlyMap<string, HomeGarment>; allGarments: readonly HomeGarment[]; contextMode: "forecast" | "locationless" | "weather_fallback"; sourceSummary: string; controller: HomeFeedController; replacePlan?: NonNullable<HomeFeedViewModel["plan"]>; onAccepted: (candidate: HomeRecommendationCandidate, garmentIds: readonly string[]) => void }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(candidate.garmentIds);
  const garments = candidate.garmentIds.map((id) => garmentById.get(id)).filter((item): item is HomeGarment => Boolean(item));
  const target = objectiveLabel(candidate.objective);
  const pending = controller.homeMutation?.status === "pending";
  const accept = async () => { if (await controller.acceptCandidate(candidate, selectedIds, replacePlan)) { setDetailOpen(false); onAccepted(candidate, selectedIds); } };
  return <><article className="ui-card grid w-[310px] min-w-[310px] max-w-[calc(100vw-50px)] basis-[310px] snap-start gap-y-1.5 px-[17px] pb-[17px] pt-[21px] !shadow-none" data-testid="home-recommendation-card">
    <div data-rec-row="target" className="flex h-[18px] items-center justify-between gap-3"><span className="text-[13px] font-bold leading-[18px] text-denim" data-testid="home-recommendation-target-label">{target}</span><span className="max-w-[17ch] truncate text-[10px] font-medium leading-[18px] text-ink/65" data-testid="home-recommendation-source">{sourceSummary}</span></div>
    <div className="grid h-[78px] grid-cols-[1.15fr_.9fr_.72fr] gap-1.5" aria-label={garments.map((item) => item.name).join("、")}>
      {garments.slice(0, 3).map((item) => <div key={item.id} className="relative min-w-0 overflow-hidden rounded-[11px] bg-mist"><OnlineAssetImage asset={item.imageAsset} variant="thumbnail" alt={item.name} className="h-full w-full" imageClassName="object-cover" fallback={<div className="grid h-full place-items-center text-ink/25"><Shirt size={25} /></div>} /><span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/55 to-transparent px-2 pb-1.5 pt-5 text-[10px] font-semibold text-white">{item.name}</span></div>)}
    </div>
    <h3 data-rec-row="title" className="truncate text-[15px] font-bold leading-5">{target}搭配</h3>
    <p data-rec-row="garments" className="truncate text-[11px] leading-4 text-ink/65">{garments.map((item) => item.name).join(" · ") || "推荐衣物正在同步"}</p>
    <p data-rec-row="reason" className="line-clamp-2 h-[34px] text-[12px] leading-[17px]">{reasonLabel(candidate.reasonCodes?.[0], contextMode)}</p>
    <p data-rec-row="risk" className="line-clamp-2 flex h-8 gap-1.5 overflow-hidden text-[11px] leading-4 text-ink/70"><span className="mt-1 h-[7px] w-[7px] shrink-0 rounded-full bg-clay" aria-hidden="true" /><span>{riskLabel(candidate.riskCodes?.[0], contextMode)}</span></p>
    <div className="mt-1 grid grid-cols-[1fr_48px] gap-2"><AppPressable className="min-h-12 rounded-[14px] bg-denim px-3 text-sm font-semibold text-white" disabled={pending} onClick={() => void accept()}>{pending ? "提交中…" : replacePlan ? "更换当日穿搭" : arrangementLabel(controller.selectedDate, controller.window.today)}</AppPressable><AppPressable feedback="icon" className="grid min-h-12 place-items-center rounded-[14px] bg-mist text-denim" onClick={() => setDetailOpen(true)} aria-label="查看推荐详情"><ChevronRight size={20} /></AppPressable></div>
    {controller.homeMutation?.status === "error" ? <p className="text-xs leading-5 text-clay" role="alert">{controller.homeMutation.message}；草稿已保留，可原样重试。</p> : null}
  </article>
  <MotionSheet open={detailOpen} onClose={() => !pending && setDetailOpen(false)} dismissible={!pending} ariaLabel="推荐详情与操作" variant="form" panelClassName="!max-w-md">
    <div className="grid max-h-[86dvh] gap-4 overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))]"><div className="flex min-h-12 items-center justify-between"><div><h2 className="text-lg font-semibold">{target}搭配</h2><p className="text-xs text-ink/65">最多可替换一件</p></div><AppPressable feedback="icon" className="grid h-12 w-12 place-items-center rounded-full bg-mist" onClick={() => setDetailOpen(false)} aria-label="关闭推荐详情"><X size={20} /></AppPressable></div>
      <ReplacementPicker originalIds={candidate.garmentIds} selectedIds={selectedIds} allGarments={allGarments} onChange={setSelectedIds} />
      <AppPressable className="min-h-12 rounded-[14px] bg-denim px-4 font-semibold text-white" disabled={pending} onClick={() => void accept()}>{pending ? "正在保存…" : replacePlan ? "更换当日穿搭" : arrangementLabel(controller.selectedDate, controller.window.today)}</AppPressable>
      <div className="grid grid-cols-2 gap-2"><AppPressable className="min-h-12 rounded-[14px] bg-mist px-3 text-sm font-semibold" disabled={pending} onClick={() => void controller.rejectCandidate(candidate)}><ThumbsDown className="mr-1.5 inline" size={17} />不喜欢</AppPressable><AppPressable className="min-h-12 rounded-[14px] bg-mist px-3 text-sm font-semibold" disabled={pending} onClick={() => void controller.saveCandidateOutfit(candidate, selectedIds)}><Save className="mr-1.5 inline" size={17} />保存为套装</AppPressable></div>
    </div>
  </MotionSheet></>;
}

function CurrentPlanCard({ plan, backups, garmentById, today, controller, onReplace }: { plan: NonNullable<HomeFeedViewModel["plan"]>; backups: readonly HomePlan[]; garmentById: ReadonlyMap<string, HomeGarment>; today: string; controller: HomeFeedController; onReplace: () => void }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [backupId, setBackupId] = useState(backups[0]?.id ?? "");
  const snapshotNames = recommendationPlanSnapshotNames(plan);
  const snapshotList = plan.kind === "actual_wear" && plan.actualGarmentSnapshots?.length ? plan.actualGarmentSnapshots : plan.garmentSnapshots;
  const displayItems = (snapshotList?.length ? snapshotList : plan.garmentIds.map((garmentId) => ({ garmentId, name: garmentById.get(garmentId)?.name ?? "已删除衣物", role: "", category: "" }))).slice(0, 3);
  const risk = recommendationPlanAvailabilityMessage(plan, today);
  const pending = controller.homeMutation?.status === "pending";
  const selectedBackup = backups.find((item) => item.id === backupId);
  return <><article className="ui-card p-4" data-testid={plan.kind === "actual_wear" ? "home-actual-wear" : "home-protected-plan"}><div className="grid grid-cols-3 gap-2">{displayItems.map((snapshot) => { const garment = garmentById.get(snapshot.garmentId); return <div key={snapshot.garmentId} className="relative aspect-[3/4] overflow-hidden rounded-[13px] bg-mist"><OnlineAssetImage asset={garment?.imageAsset} variant="thumbnail" alt={snapshot.name} className="h-full w-full" imageClassName="object-cover" fallback={<div className="grid h-full place-items-center px-2 text-center text-xs text-ink/65"><Shirt className="mb-1" size={25} /><span>{snapshot.name}</span></div>} /></div>; })}</div><p className="mt-3 text-sm leading-6 text-ink/65">{snapshotNames.join(" · ") || displayItems.map((item) => item.name).join(" · ") || "已保留安排时的衣物名称"}</p>{risk ? <p className="mt-2 text-sm font-semibold text-clay" role="status" data-testid="home-plan-availability-risk">{risk}</p> : null}
    <div className="mt-3 grid gap-2">{plan.kind === "actual_wear" ? <AppPressable className="min-h-12 rounded-[14px] bg-mist font-semibold text-denim" disabled={pending} onClick={() => void controller.undoPlanWorn(plan)}><RotateCcw className="mr-2 inline" size={17} />撤销已穿</AppPressable> : <>{plan.date === today ? <AppPressable className="min-h-12 rounded-[14px] bg-denim font-semibold text-white" disabled={pending || Boolean(risk)} onClick={() => void controller.markPlanWorn(plan)}>确认今天穿了这套</AppPressable> : null}<div className="grid grid-cols-2 gap-2"><AppPressable className="min-h-12 rounded-[14px] bg-mist text-sm font-semibold" disabled={pending} onClick={onReplace}>更换穿搭</AppPressable><AppPressable className="min-h-12 rounded-[14px] bg-mist text-sm font-semibold text-clay" disabled={pending} onClick={() => setCancelOpen(true)}>取消安排</AppPressable></div></>}</div>
    {controller.homeMutation?.status === "error" ? <p className="mt-2 text-sm text-clay" role="alert">{controller.homeMutation.message} 请重试。</p> : null}</article>
    <MotionSheet open={cancelOpen} onClose={() => !pending && setCancelOpen(false)} dismissible={!pending} ariaLabel="取消当日安排" role="alertdialog" variant="confirm" panelClassName="!max-w-md"><div className="grid gap-3 px-4 pb-[calc(16px+env(safe-area-inset-bottom))]"><h2 className="text-lg font-semibold">取消当日安排</h2><p className="text-sm leading-6 text-ink/60">{backups.length ? "取消当前安排后，会同时换回你选择的另一套。" : "取消后当天将没有已安排穿搭。"}</p>{backups.length ? <div className="grid gap-2">{backups.map((backup, index) => <AppPressable key={backup.id} className={`min-h-12 rounded-[14px] px-3 text-left text-sm ${backupId === backup.id ? "bg-denim text-white" : "bg-mist"}`} aria-pressed={backupId === backup.id} onClick={() => setBackupId(backup.id)}>换回第 {index + 1} 套</AppPressable>)}</div> : null}<AppPressable className="min-h-12 rounded-[14px] bg-clay font-semibold text-white" disabled={pending} onClick={async () => { if (await controller.cancelPrimary(plan, selectedBackup)) setCancelOpen(false); }}>{pending ? "正在保存…" : backups.length ? "取消并换回所选穿搭" : "取消后不再安排"}</AppPressable><AppPressable className="min-h-12 rounded-[14px] bg-mist font-semibold" disabled={pending} onClick={() => setCancelOpen(false)}>保留当前安排</AppPressable></div></MotionSheet></>;
}

function ReplacementPicker({ originalIds, selectedIds, allGarments, onChange }: { originalIds: readonly string[]; selectedIds: readonly string[]; allGarments: readonly HomeGarment[]; onChange: (ids: readonly string[]) => void }) {
  return <div className="grid gap-3">{originalIds.map((id, index) => { const current = allGarments.find((item) => item.id === id); const options = allGarments.filter((item) => item.status === "active" && item.hasImage && item.category === current?.category); return <label key={id} className="grid gap-1 text-sm font-medium"><span>{current?.name ?? "已失效衣物"}</span><select className="min-h-12 rounded-[14px] bg-mist px-3" value={selectedIds[index] ?? id} onChange={(event) => onChange(originalIds.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} disabled={!current}><option value={id}>保留当前衣物</option>{options.filter((item) => item.id !== id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>; })}</div>;
}

function RecommendationState({ title, message }: { title: string; message: string }) { return <div className="ui-card p-4"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-ink/60">{message}</p></div>; }
function ModuleLoading({ label }: { label: string }) { return <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-ink/65"><Loader2 className="animate-spin motion-reduce:animate-none" size={18} />{label}</div>; }
function RetryIcon({ onClick, label }: { onClick: () => unknown; label: string }) { return <AppPressable feedback="icon" className="grid h-12 w-12 place-items-center rounded-[15px] bg-mist" onClick={() => void onClick()} aria-label={label}><RefreshCw size={17} /></AppPressable>; }
function EmptyRecommendation({ wardrobeReady }: { wardrobeReady: boolean }) { return <RecommendationState title={wardrobeReady ? "暂时没有新的穿搭建议" : "衣橱还未满足完整搭配条件"} message={wardrobeReady ? "稍后重新进入首页时会再试一次，你仍可正常浏览衣橱。" : "补齐上装、下装与鞋履后即可形成合法组合，不会为了凑数使用不适合的衣物。"} />; }
function addDays(date: string, days: number) { const value = new Date(`${date}T12:00:00+08:00`); value.setUTCDate(value.getUTCDate() + days); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(value); }
function weekday(date: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(new Date(`${date}T12:00:00+08:00`)); }
function tempRange(min?: number, max?: number) { if (min !== undefined && max !== undefined) return `${Math.round(max)}°/${Math.round(min)}°`; if (min !== undefined || max !== undefined) return `${Math.round(min ?? max!)}°`; return "--°"; }
function tempLowLabel(min?: number) { return min === undefined ? "" : `最低 ${Math.round(min)}°`; }
function locationLabel(location: { kind: string; displayName?: string }) { return location.kind === "none" ? "未设置城市" : `${location.displayName} · ${location.kind === "travel" ? "行程" : location.kind === "temporary_override" || location.kind === "temporary_city" ? "临时" : "常驻"}`; }
function locationSourceLabel(source?: string) { return source === "travel" ? "行程" : source === "temporary_override" ? "临时" : source === "home_city" ? "常驻" : ""; }
function recommendationSourceSummary(state: Extract<HomeFeedViewModel["recommendation"], { status: "ready" }>) { const location = state.resolvedLocation ? `${state.resolvedLocation.displayName} · ${locationSourceLabel(state.locationSource)}` : null; return [location, state.stale && state.weatherUpdatedAt ? `缓存 ${formatWeatherTime(state.weatherUpdatedAt)}` : null].filter(Boolean).join(" · "); }
function WeatherAttribution({ weather }: { weather: readonly HomeWeatherViewModel[] }) { const supplied = weather.filter((item): item is Extract<HomeWeatherViewModel, { status: "ready" }> => item.status === "ready" && Boolean(item.attribution)); if (!supplied.length) return null; const latest = supplied.map((item) => item.weatherUpdatedAt).filter((item): item is string => Boolean(item)).sort().at(-1); return <p className="mt-2 truncate text-[10px] leading-4 text-ink/65" data-testid="home-weather-attribution">天气服务由 QWeather 提供{latest ? ` · ${supplied.some((item) => item.stale) ? "缓存" : "更新"} ${formatWeatherTime(latest)}` : ""}</p>; }
function formatWeatherTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)); }
function bothWeatherUnavailable(today: HomeWeatherViewModel, tomorrow: HomeWeatherViewModel) { return today.status === "ready" && tomorrow.status === "ready" && today.availabilityReason !== "available" && tomorrow.availabilityReason !== "available"; }
function businessGreeting() { const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hourCycle: "h23" }).format(new Date())); return hour < 11 ? "早上好，今天穿得轻松一点" : hour < 14 ? "中午好，今天穿得自在一点" : hour < 18 ? "下午好，今天穿得从容一点" : "晚上好，明天也穿得轻松一点"; }
function formatBusinessDate(date: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00+08:00`)); }
function formatShortDate(date: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00+08:00`)); }
function dateHeading(date: string, today: string) { return date === today ? "今天" : date === addDays(today, 1) ? "明天" : formatShortDate(date); }
function arrangementLabel(date: string, today: string) { return date === today ? "设为今日穿搭" : date === addDays(today, 1) ? "设为明日穿搭" : `安排到 ${formatShortDate(date)}`; }
function recommendationSubtitle(state: HomeFeedViewModel["recommendation"]) { return state.status === "ready" ? contextLabel(state.contextMode) : "正在为你整理穿搭"; }
function objectiveLabel(objective?: string) { return objective === "fresh" ? "变化" : objective === "comfort" ? "舒适" : "稳妥"; }
function contextLabel(mode: "forecast" | "locationless" | "weather_fallback") { return mode === "forecast" ? "结合天气" : "通用建议"; }
function reasonLabel(code: string | undefined, mode: "forecast" | "locationless" | "weather_fallback") { const labels: Record<string, string> = { good_for_commute: "适合日常通勤，整体组合清晰可靠。", good_for_business: "正式度与商务场景相符。", good_for_travel: "适合行程活动与移动需要。", weather_fit: "当前衣物与天气证据匹配。", rain_ready: "组合已考虑降雨与路面情况。", activity_comfort: "活动空间与舒适度更充足。", historical_success: "这类组合过去有良好穿着记录。", rotation_value: "优先带回近期较少穿着的衣物。", new_combination: "在可靠结构中加入新的组合变化。", shoe_rationality: "鞋履与今天的活动强度匹配。", outerwear_rationality: "外层便于应对室内外变化。", adaptable_conditions: "采用容易增减的通用分层。", needs_evening_layer: "晚间可按体感补充轻薄外层。" }; return labels[code ?? ""] ?? (mode === "forecast" ? "结合天气、场景与衣橱状态整理。" : "按场景与衣橱状态给出通用组合。"); }
function riskLabel(code: string | undefined, mode: "forecast" | "locationless" | "weather_fallback") { const labels: Record<string, string> = { missing_required_slot: "组合存在缺失角色，采用前需要补齐。", severe_temperature_mismatch: "温度适配存在明显风险。", severe_formality_mismatch: "正式度与当前场景差异较大。", rain_incompatible: "降雨条件下部分衣物不够稳妥。", shoe_activity_mismatch: "鞋履可能不适合今天的活动强度。", wind_rain_exposure: "风雨暴露较高，建议增加保护层。", outerwear_recommended: "建议随身准备一件轻薄外层。", evening_layer_recommended: "晚间体感变化时建议补充外层。", too_cold: "部分衣物可能不够保暖。", too_hot: "部分衣物可能偏热。", rain_exposure: "有淋雨风险，请留意防水。", wind_exposure: "风力较强时需要额外防护。", shoe_discomfort: "长时间活动时鞋履舒适度需留意。", formality_mismatch: "正式度可能与场景不完全一致。", activity_mismatch: "活动强度与衣物组合可能不完全匹配。", missing_required_layer: "建议补充必要的外层。", style_conflict: "组合风格存在轻微冲突。" }; return labels[code ?? ""] ?? (mode === "forecast" ? "未发现需要特别提醒的天气风险。" : "通用建议不作温度或降雨判断，出门前请自行确认天气。"); }
