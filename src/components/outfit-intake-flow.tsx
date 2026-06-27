"use client";

import { CheckCircle2, Layers, PackageCheck, Search, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { IntakeFlowShell, type IntakeFlowStep } from "@/components/intake-flow-shell";
import {
 ConfirmSummaryCard,
 DraftQualitySummary,
 EmptyStateBox,
 IntakeStepSection,
 ProcessingIssueList,
 ProcessingResultList,
 SEASON_OPTIONS,
 SelectField,
 TagToggleGroup,
 TextField,
 TextareaField,
 formatIntakeError,
 labelSeasons,
 parseTagInput,
 toggleArrayValue,
 userField,
 type IntakeAsyncResult,
} from "@/components/garment-intake-flow";
import {
 calculateDraftReviewSummary,
 type DraftReviewSummary,
 type OutfitIntakeDraft,
} from "@/lib/intake-draft";
import { buildLocalOutfitDraftFromItems } from "@/lib/intake-local-draft";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";
import { buildLocalOutfitMetadataFromItems, mergeOutfitMetadataIntoDraft } from "@/lib/outfit-ai-metadata";
import {
 CATEGORY_LABELS,
 SEASON_LABELS,
 type ClosetLocation,
 type GarmentCategory,
 type SavedOutfit,
 type Season,
 type WardrobeItem,
} from "@/lib/types";
import { getAllColors } from "@/lib/color-fields";

/** v1.0: 手动创建套装流程不再保留未知单品,此处仅留接口以保持向后兼容 */
export interface OutfitIntakeSaveOptions {
 unknownItemResolutions?: never;
}

export interface OutfitIntakeFlowProps {
 title?: string;
 items: WardrobeItem[];
 /** v1.0: 衣橱位置筛选 (可选, 用于选择衣物页顶部 chip) */
 locations?: ClosetLocation[];
 /** v1.0: 默认衣橱位置 id 或 "all" */
 defaultLocationId?: string | "all";
 initialItemIds?: number[];
 initialDraft?: OutfitIntakeDraft;
 isSaving?: boolean;
 onEnhanceDraft?: (draft: OutfitIntakeDraft) => IntakeAsyncResult<OutfitIntakeDraft>;
 onDraftChange?: (draft: OutfitIntakeDraft) => void;
 /** v1.0: 新签名, 不再需要 unknownItemResolutions (旧字段保留可选以兼容) */
 onSave: (draft: OutfitIntakeDraft, options?: OutfitIntakeSaveOptions) => IntakeAsyncResult<void>;
 onExit?: () => void;
}

// v1.0: 4步流程, 上传套装图 / 未知单品 / 重复校对草稿 + 确认保存都整合到4步里
export const OUTFIT_INTAKE_STEPS: IntakeFlowStep[] = [
 { id: "select", label: "选择衣物" },
 { id: "analyze", label: "分析套装" },
 { id: "review", label: "校对信息" },
 { id: "save", label: "保存完成" },
];

const outfitSourceOptions: Array<{ value: SavedOutfit["source"]; label: string }> = [
 { value: "manual", label: "手动创建" },
];

export function OutfitIntakeFlow({
 title = "创建套装",
 items,
 locations,
 defaultLocationId,
 initialItemIds = [],
 initialDraft,
 isSaving = false,
 onEnhanceDraft,
 onDraftChange,
 onSave,
 onExit,
}: OutfitIntakeFlowProps) {
 const [stepIndex, setStepIndex] = useState(() => (initialDraft ?2 : initialItemIds.length >0 ?0 :0));
 const [selectedItemIds, setSelectedItemIds] = useState<number[]>(() => uniqueNumberArray(initialDraft?.itemIds.value ?? initialItemIds));
 const [draft, setDraft] = useState<OutfitIntakeDraft | null>(initialDraft ?? null);
 // v1.0: 选择衣物页的衣橱筛选 /分类筛选 /搜索
 const [locationFilter, setLocationFilter] = useState<string>(defaultLocationId ?? "all");
 const [categoryFilter, setCategoryFilter] = useState<GarmentCategory | "all">("all");
 const [itemSearch, setItemSearch] = useState("");
 const [isBusy, setIsBusy] = useState(false);
 const [error, setError] = useState("");
 const [saved, setSaved] = useState(false);
 const [enhanceHint, setEnhanceHint] = useState<string>("");

 // v1.1.20-dev commit2 (P1 诊断): intake_flow_step_changed — 套装录入
 useEffect(() => {
  recordDiagnosticEvent("intake_flow_step_changed", {
   flow: "outfit",
   step: stepIndex,
   selectedItemCount: selectedItemIds.length,
   hasDraft: Boolean(draft),
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [stepIndex]);

 const itemsById = useMemo(() => {
 const map = new Map<number, WardrobeItem>();
 for (const item of items) {
 if (typeof item.id === "number") map.set(item.id, item);
 }
 return map;
 }, [items]);

 const selectedItems = useMemo(
 () => selectedItemIds.map((id) => itemsById.get(id)).filter((item): item is WardrobeItem => Boolean(item)),
 [itemsById, selectedItemIds],
 );

 // v1.0: 选择衣物页 active衣物筛选 (status=active +数字 id)
 const activeItems = useMemo(
 () => items.filter((item) => item.status === "active" && typeof item.id === "number"),
 [items],
 );

 // v1.0: 按衣橱位置过滤
 const locationFilteredItems = useMemo(() => {
 if (locationFilter === "all") return activeItems;
 return activeItems.filter((item) => item.locationId === locationFilter);
 }, [activeItems, locationFilter]);

 // v1.0: 动态分类计数, 只展示当前衣橱范围内存在的分类
 const categoryCounts = useMemo(() => buildCategoryCounts(locationFilteredItems), [locationFilteredItems]);

 // v1.0: 衣橱筛选 +分类筛选 +搜索组合
 const filteredItems = useMemo(() => {
 const q = itemSearch.trim().toLowerCase();
 return locationFilteredItems.filter((item) => {
 const matchCategory = categoryFilter === "all" || item.category === categoryFilter;
 if (!matchCategory) return false;
 if (!q) return true;
 const haystack = [
 item.name,
 CATEGORY_LABELS[item.category],
 ...getAllColors(item.colors),
 ]
 .filter(Boolean)
 .join(" ")
 .toLowerCase();
 return haystack.includes(q);
 });
 }, [locationFilteredItems, categoryFilter, itemSearch]);

 const composition = useMemo(() => analyzeOutfitComposition(selectedItems), [selectedItems]);
 const reviewSummary = useMemo(() => (draft ? calculateDraftReviewSummary(draft) : null), [draft]);
 const locked = isBusy || isSaving;
 const hasUnsavedDraft = !saved && (selectedItemIds.length >0 || Boolean(draft));

 useEffect(() => {
 if (!initialDraft) return;
 setDraft(initialDraft);
 setSelectedItemIds(uniqueNumberArray(initialDraft.itemIds.value));
 setStepIndex(2);
 }, [initialDraft]);

 function commitDraft(nextDraft: OutfitIntakeDraft) {
 setDraft(nextDraft);
 onDraftChange?.(nextDraft);
 }

 function toggleItem(id: number) {
 setSelectedItemIds((current) => toggleArrayValue(current.map(String), String(id)).map(Number));
 setDraft(null);
 setSaved(false);
 setEnhanceHint("");
 }

 async function ensureLocalDraft() {
 if (selectedItems.length ===0) {
 setError("请先选择至少一件已有衣物。");
 return null;
 }
 setIsBusy(true);
 setError("");
 try {
 const nextDraft = buildLocalOutfitDraftFromItems({
 items: selectedItems,
 source: "manual",
 });
 commitDraft(nextDraft);
 return nextDraft;
 } catch (err) {
 setError(formatIntakeError(err, "套装组成分析失败"));
 return null;
 } finally {
 setIsBusy(false);
 }
 }

 async function ensureEnhancedDraft(currentDraft: OutfitIntakeDraft | null) {
 const baseDraft = currentDraft ?? draft ?? await ensureLocalDraft();
 if (!baseDraft) return null;
 // v1.0: 没有 onEnhanceDraft 时回退本地规则; 本地规则始终能产出基础元数据
 if (!onEnhanceDraft) {
 const localMeta = buildLocalOutfitMetadataFromItems({
 outfitItems: selectedItems,
 currentName: baseDraft.name.value,
 });
 const next = mergeOutfitMetadataIntoDraft(baseDraft, localMeta, "local");
 commitDraft(next);
 setEnhanceHint("已使用本地规则生成");
 return next;
 }
 setIsBusy(true);
 setError("");
 setEnhanceHint("AI 生成中…");
 try {
 const enhanced = await onEnhanceDraft(baseDraft);
 commitDraft(enhanced);
 setEnhanceHint("已使用 AI 生成");
 return enhanced;
 } catch (err) {
 // v1.0: AI失败 → 本地规则兜底
 const localMeta = buildLocalOutfitMetadataFromItems({
 outfitItems: selectedItems,
 currentName: baseDraft.name.value,
 });
 const fallback = mergeOutfitMetadataIntoDraft(baseDraft, localMeta, "local");
 commitDraft(fallback);
 setEnhanceHint("AI 生成失败,已降级为本地规则生成");
 setError(formatIntakeError(err, "套装草稿补全失败,已保留本地基础草稿"));
 return fallback;
 } finally {
 setIsBusy(false);
 }
 }

 async function handleNext() {
 if (locked) return;
 setError("");
 if (stepIndex ===0) {
 if (selectedItemIds.length <2) {
 setError("套装至少需要2 件衣物,请继续选择。");
 return;
 }
 setStepIndex(1);
 await ensureLocalDraft();
 return;
 }
 if (stepIndex ===1) {
 if (!draft) {
 const nextDraft = await ensureLocalDraft();
 if (!nextDraft) return;
 }
 const enhanced = await ensureEnhancedDraft(draft);
 if (!enhanced) return;
 setStepIndex(2);
 return;
 }
 if (stepIndex ===2) {
 const summary = draft ? calculateDraftReviewSummary(draft) : null;
 if (!summary?.canSave) {
 setError("请先补齐必填项,再进入保存确认。");
 return;
 }
 setStepIndex(3);
 return;
 }
 if (stepIndex ===3 && draft) {
 setIsBusy(true);
 try {
 await onSave(draft);
 setSaved(true);
 } catch (err) {
 setError(formatIntakeError(err, "保存套装失败"));
 } finally {
 setIsBusy(false);
 }
 }
 }

 function patchDraft(patch: Partial<OutfitIntakeDraft>) {
 if (!draft) return;
 commitDraft({ ...draft, ...patch, updatedAt: new Date().toISOString() });
 setSaved(false);
 }

 const nextLabel = stepIndex ===1 ? "生成草稿" : stepIndex ===3 ? "保存套装" : "继续";
 const nextDisabled = locked || (stepIndex ===0 && selectedItemIds.length <2) || ((stepIndex ===1 || stepIndex ===2) && !draft);

 return (
 <IntakeFlowShell
 title={title}
 steps={OUTFIT_INTAKE_STEPS}
 currentStepIndex={stepIndex}
 isProcessing={locked}
 error={error}
 hasUnsavedDraft={hasUnsavedDraft}
 nextLabel={nextLabel}
 nextDisabled={nextDisabled}
 backDisabled={stepIndex ===0}
 onBack={() => {
 setError("");
 setStepIndex((current) => Math.max(0, current -1));
 }}
 onNext={handleNext}
 onExit={onExit}
 >
 {stepIndex ===0 ? (
 <OutfitSelectStep
 items={filteredItems}
 allItems={locationFilteredItems}
 selectedItemIds={selectedItemIds}
 categoryCounts={categoryCounts}
 locations={locations}
 locationFilter={locationFilter}
 categoryFilter={categoryFilter}
 itemSearch={itemSearch}
 onLocationFilterChange={setLocationFilter}
 onCategoryFilterChange={setCategoryFilter}
 onSearchChange={setItemSearch}
 onToggleItem={toggleItem}
 onRemoveItem={toggleItem}
 />
 ) : null}
 {stepIndex ===1 ? <OutfitAnalyzeStep composition={composition} draft={draft} enhanceHint={enhanceHint} /> : null}
 {stepIndex ===2 && draft && reviewSummary ? (
 <OutfitReviewStep
 draft={draft}
 summary={reviewSummary}
 composition={composition}
 onPatchDraft={patchDraft}
 />
 ) : null}
 {stepIndex ===3 && draft && reviewSummary ? (
 <OutfitSaveStep
 draft={draft}
 summary={reviewSummary}
 composition={composition}
 onBackToReview={() => setStepIndex(2)}
 />
 ) : null}
 </IntakeFlowShell>
 );
}

function OutfitSelectStep({
 items,
 allItems,
 selectedItemIds,
 categoryCounts,
 locations,
 locationFilter,
 categoryFilter,
 itemSearch,
 onLocationFilterChange,
 onCategoryFilterChange,
 onSearchChange,
 onToggleItem,
 onRemoveItem,
}: {
 items: WardrobeItem[];
 allItems: WardrobeItem[];
 selectedItemIds: number[];
 categoryCounts: Array<{ key: GarmentCategory | "all"; label: string; count: number }>;
 locations?: ClosetLocation[];
 locationFilter: string;
 categoryFilter: GarmentCategory | "all";
 itemSearch: string;
 onLocationFilterChange: (value: string) => void;
 onCategoryFilterChange: (value: GarmentCategory | "all") => void;
 onSearchChange: (value: string) => void;
 onToggleItem: (id: number) => void;
 onRemoveItem: (id: number) => void;
}) {
 return (
 <div className="grid gap-4">
 <IntakeStepSection title="选择衣物组成套装" icon={<Layers size={16} aria-hidden="true" />}>
 <p className="mb-3 text-xs leading-relaxed text-ink/50">
套装必须从已有衣物组合。请至少选择2 件;已选摘要会显示在下方。
 </p>

 {/* 衣橱位置筛选 */}
 {locations && locations.length >0 ? (
 <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
 <button
 type="button"
 onClick={() => onLocationFilterChange("all")}
 className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
 locationFilter === "all" ? "bg-denim/10 text-denim border border-denim/30" : "bg-milk-darker/50 text-ink/60 border border-transparent"
 }`}
 >
全部衣橱 ({allItems.length})
 </button>
 {locations.map((location) => {
 const count = allItems.filter((item) => item.locationId === location.id).length;
 return (
 <button
 key={location.id}
 type="button"
 onClick={() => onLocationFilterChange(location.id)}
 className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
 locationFilter === location.id ? "bg-denim/10 text-denim border border-denim/30" : "bg-milk-darker/50 text-ink/60 border border-transparent"
 }`}
 >
 {location.name} ({count})
 </button>
 );
 })}
 </div>
 ) : null}

 {/* 搜索框 */}
 <label className="mb-3 grid grid-cols-[18px_1fr] items-center gap-2 rounded-lg border border-ink/10 bg-[#fbfbf8] px-3">
 <Search size={15} className="text-ink/35" aria-hidden="true" />
 <input
 value={itemSearch}
 onChange={(event) => onSearchChange(event.target.value)}
 placeholder="搜索名称、颜色或分类"
 className="h-10 bg-transparent text-sm outline-none"
 />
 </label>

 {/* 动态分类 chip (仅显示当前衣橱范围内存在的分类 +数量) */}
 <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
 {categoryCounts.map((chip) => (
 <button
 key={chip.key}
 type="button"
 onClick={() => onCategoryFilterChange(chip.key)}
 className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
 categoryFilter === chip.key ? "bg-denim/10 text-denim border border-denim/30" : "bg-milk-darker/50 text-ink/60 border border-transparent"
 }`}
 >
 {chip.label} ({chip.count})
 </button>
 ))}
 </div>

 {/* 衣物宫格 */}
 {items.length ===0 ? (
 <EmptyStateBox text="当前筛选条件下没有衣物。" />
 ) : (
 <div className="grid grid-cols-3 gap-2">
 {items.map((item) => {
 const id = item.id;
 if (typeof id !== "number") return null;
 const selected = selectedItemIds.includes(id);
 return (
 <button
 key={id}
 type="button"
 onClick={() => onToggleItem(id)}
 className={`min-w-0 overflow-hidden rounded-lg border text-left ${selected ? "border-denim bg-denim/6" : "border-ink/8 bg-[#fbfbf8]"}`}
 >
 <div className="aspect-[3/4] bg-mist">
 <img src={item.thumbnailDataUrl || item.imageDataUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
 </div>
 <div className="p-1.5">
 <p className="truncate text-[11px] font-semibold">{item.name}</p>
 <p className="truncate text-[10px] text-ink/42">{CATEGORY_LABELS[item.category]}</p>
 </div>
 </button>
 );
 })}
 </div>
 )}
 </IntakeStepSection>

 {/* 已选摘要 */}
 <div className="rounded-lg border border-ink/8 bg-milk-darker/30 p-3">
 <p className="text-xs font-medium text-ink/55">已选 {selectedItemIds.length} 件 {selectedItemIds.length <2 ? "(至少2 件)" : ""}</p>
 {selectedItemIds.length >0 ? (
 <div className="mt-2 flex flex-wrap gap-1.5">
 {selectedItemIds.map((id) => {
 const item = items.find((i) => i.id === id) ?? allItems.find((i) => i.id === id);
 return item ? (
 <span key={id} className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-2 py-0.5 text-xs">
 {item.name}
 <button type="button" onClick={() => onRemoveItem(id)} className="text-ink/30 hover:text-clay">×</button>
 </span>
 ) : null;
 })}
 </div>
 ) : null}
 </div>
 </div>
 );
}

function OutfitAnalyzeStep({
 composition,
 draft,
 enhanceHint,
}: {
 composition: OutfitCompositionSummary;
 draft: OutfitIntakeDraft | null;
 enhanceHint: string;
}) {
 return (
 <div className="grid gap-4">
 <CompositionCard composition={composition} />
 <IntakeStepSection title="组成分析结果" icon={<CheckCircle2 size={16} aria-hidden="true" />}>
 <ProcessingResultList
 rows={[
 { ok: composition.selectedCount >=2, text: `已选择 ${composition.selectedCount} 件衣物${composition.selectedCount >=2 ? " (满足套装)" : " (至少2 件)"}` },
 { ok: composition.basicComplete, text: composition.basicComplete ? "基础组成完整" : `基础组成待补:${composition.missingEssentials.join("、") || "继续确认"}` },
 { ok: Boolean(draft), text: draft ? "已生成套装基础草稿" : "正在准备草稿" },
]}
 />
 {enhanceHint ? <p className="mt-3 text-xs leading-relaxed text-ink/55">{enhanceHint}</p> : null}
 </IntakeStepSection>
 {draft ? <ProcessingIssueList issues={draft.processingIssues} /> : null}
 </div>
 );
}

function OutfitReviewStep({
 draft,
 summary,
 composition,
 onPatchDraft,
}: {
 draft: OutfitIntakeDraft;
 summary: DraftReviewSummary;
 composition: OutfitCompositionSummary;
 onPatchDraft: (patch: Partial<OutfitIntakeDraft>) => void;
}) {
 return (
 <div className="grid gap-4">
 <DraftQualitySummary summary={summary} />
 <CompositionCard composition={composition} />
 <IntakeStepSection title="校对套装草稿" icon={<Tag size={16} aria-hidden="true" />}>
 <div className="grid gap-3">
 <TextField label="套装名称" value={draft.name.value} field={draft.name} onChange={(value) => onPatchDraft({ name: userField(value) })} />
 <TagToggleGroup
 label="季节"
 values={draft.seasons.value}
 options={SEASON_OPTIONS.map((season) => ({ value: season, label: SEASON_LABELS[season] }))}
 onChange={(values: Season[]) => onPatchDraft({ seasons: userField(values) })}
 />
 <TextField label="场景标签" value={draft.sceneTags.value.join("、")} field={draft.sceneTags} onChange={(value) => onPatchDraft({ sceneTags: userField(parseTagInput(value)) })} />
 <TextField label="风格标签" value={draft.styleTags.value.join("、")} field={draft.styleTags} onChange={(value) => onPatchDraft({ styleTags: userField(parseTagInput(value)) })} />
 <TextField label="搭配标签" value={draft.pairingTags.value.join("、")} field={draft.pairingTags} onChange={(value) => onPatchDraft({ pairingTags: userField(parseTagInput(value)) })} />
 <SelectField
 label="来源"
 value={draft.source.value}
 field={draft.source}
 options={outfitSourceOptions}
 onChange={(value) => onPatchDraft({ source: userField(value as SavedOutfit["source"]) })}
 />
 <TextareaField label="备注" value={draft.notes.value} field={draft.notes} onChange={(value) => onPatchDraft({ notes: userField(value) })} />
 </div>
 </IntakeStepSection>
 <ProcessingIssueList issues={draft.processingIssues} />
 </div>
 );
}

function OutfitSaveStep({
 draft,
 summary,
 composition,
 onBackToReview,
}: {
 draft: OutfitIntakeDraft;
 summary: DraftReviewSummary;
 composition: OutfitCompositionSummary;
 onBackToReview: () => void;
}) {
 return (
 <div className="grid gap-4">
 <CompositionCard composition={composition} />
 <ConfirmSummaryCard
 title={draft.name.value}
 rows={[
 ["组成", `${draft.itemIds.value.length} 件已有衣物`],
 ["季节", labelSeasons(draft.seasons.value)],
 ["场景", draft.sceneTags.value.join(" / ") || "未填写"],
 ["风格", draft.styleTags.value.join(" / ") || "未填写"],
 ["收藏", draft.favorite.value ? "是" : "否 (可在详情页收藏)"],
]}
 footer={summary.canSave ? "草稿已满足保存条件,点击保存即可写入。" : "仍有必填项,请返回校对。"}
 onEdit={onBackToReview}
 />
 </div>
 );
}

function CompositionCard({ composition }: { composition: OutfitCompositionSummary }) {
 return (
 <IntakeStepSection title="组成完整度" icon={<PackageCheck size={16} aria-hidden="true" />}>
 <div className="grid grid-cols-3 gap-2">
 {composition.slots.map((slot) => (
 <div key={slot.key} className={`rounded-lg px-2 py-2 text-xs ${slot.present ? "bg-moss/8 text-moss" : "bg-[#fbfbf8] text-ink/42"}`}>
 <div className="font-semibold">{slot.label}</div>
 <div className="mt-0.5 text-[10px]">{slot.present ? "已覆盖" : "未覆盖"}</div>
 </div>
 ))}
 </div>
 <p className="mt-3 text-xs leading-relaxed text-ink/55">{composition.summary}</p>
 </IntakeStepSection>
 );
}

export interface OutfitCompositionSlot {
 key: "top" | "bottom" | "shoes" | "bag" | "outerwear" | "accessory";
 label: string;
 present: boolean;
}

export interface OutfitCompositionSummary {
 selectedCount: number;
 basicComplete: boolean;
 missingEssentials: string[];
 slots: OutfitCompositionSlot[];
 summary: string;
}

export function analyzeOutfitComposition(items: WardrobeItem[]): OutfitCompositionSummary {
 const hasOnePiece = items.some((item) => item.category === "one_piece");
 const slots: OutfitCompositionSlot[] = [
 { key: "top", label: "上装", present: hasOnePiece || items.some((item) => item.category === "tops") },
 { key: "bottom", label: "下装", present: hasOnePiece || items.some((item) => item.category === "pants" || item.category === "skirts") },
 { key: "shoes", label: "鞋", present: items.some((item) => item.category === "shoes") },
 { key: "bag", label: "包", present: items.some((item) => item.category === "bags") },
 { key: "outerwear", label: "外套", present: items.some((item) => item.category === "tops" && Boolean(item.subcategory?.includes("jacket"))) },
 {
 key: "accessory",
 label: "配饰",
 present: items.some((item) => item.category === "hats" || item.category === "jewelry" || item.category === "accessories"),
 },
 ];
 const missingEssentials = slots
 .filter((slot) => ["top", "bottom", "shoes"].includes(slot.key) && !slot.present)
 .map((slot) => slot.label);
 const basicComplete = missingEssentials.length ===0;
 const covered = slots.filter((slot) => slot.present).length;
 return {
 selectedCount: items.length,
 basicComplete,
 missingEssentials,
 slots,
 summary: basicComplete
 ? `已覆盖基础穿搭组成,共 ${items.length} 件,${covered} 类组成可见。`
 : `已选择 ${items.length} 件,基础组成还缺 ${missingEssentials.join("、") || "必要单品"}。`,
 };
}

/** v1.0: 根据当前衣橱范围内的衣物,动态生成只含现有分类的 chip。 */
function buildCategoryCounts(items: WardrobeItem[]): Array<{ key: GarmentCategory | "all"; label: string; count: number }> {
 const counts = new Map<GarmentCategory, number>();
 for (const item of items) {
 counts.set(item.category, (counts.get(item.category) ??0) +1);
 }
 const chips: Array<{ key: GarmentCategory | "all"; label: string; count: number }> = [
 { key: "all", label: "全部", count: items.length },
 ];
 const order: GarmentCategory[] = ["tops", "pants", "skirts", "one_piece", "shoes", "bags", "hats", "jewelry", "accessories"];
 for (const cat of order) {
 const count = counts.get(cat);
 if (!count) continue;
 chips.push({ key: cat, label: CATEGORY_LABELS[cat] ?? cat, count });
 }
 return chips;
}

function uniqueNumberArray(values: number[]): number[] {
 return Array.from(new Set(values.filter((value) => Number.isFinite(value))));
}
