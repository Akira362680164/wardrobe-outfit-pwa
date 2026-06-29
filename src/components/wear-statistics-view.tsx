"use client";

import {
  BarChart3,
  ChevronLeft,
  Clock,
  Repeat2,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { useMemo } from "react";
import { GarmentImage } from "@/components/garment-image";
import { OutfitCover } from "@/components/outfit-cover";
import {
  calculateWearStatistics,
  type IdleWardrobeItem,
  type PurchaseUsageStatistic,
  type WearFrequencyItem,
  type WearFrequencyOutfit,
} from "@/lib/wear-statistics";
import { CATEGORY_LABELS, type SavedOutfit, type WardrobeItem, type WishlistItem } from "@/lib/types";

interface WearStatisticsViewProps {
  items: WardrobeItem[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  onBack: () => void;
}

export function WearStatisticsView({
  items,
  outfits,
  wishlistItems,
  onBack,
}: WearStatisticsViewProps) {
  const stats = useMemo(
    () => calculateWearStatistics({ items, outfits, wishlistItems }, { listLimit: 6 }),
    [items, outfits, wishlistItems],
  );

  const recentRows = [
    ...stats.frequentItems.slice(0, 4),
    ...stats.frequentOutfits.slice(0, 2),
  ].sort((a, b) => (
    b.currentMonthWearCount - a.currentMonthWearCount
    || b.recentWearCount - a.recentWearCount
    || b.totalWearCount - a.totalWearCount
    || (b.lastWornDate ?? "").localeCompare(a.lastWornDate ?? "")
  )).slice(0, 6);

  return (
    <div className="grid gap-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <header className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 border-b border-ink/8 bg-[#fbfbf8]/95 px-4 py-2 backdrop-blur-xl">
        <div className="flex h-11 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="返回衣橱"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink/70 active:bg-mist"
          >
            <ChevronLeft size={21} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">穿着统计</h1>
            <p className="truncate text-[11px] text-ink/50">{stats.monthLabel} · {items.length} 件衣物 · {outfits.length} 套</p>
          </div>
        </div>
      </header>

      <section className="surface rounded-lg p-3">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 size={16} className="text-denim" aria-hidden="true" />
          <h2 className="text-sm font-semibold">本月概览</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MetricCard label="穿过套装" value={stats.overview.monthlyOutfitCount} unit="套" sub={`${stats.overview.monthlyOutfitWearEvents} 次`} />
          <MetricCard label="穿过衣物" value={stats.overview.monthlyItemCount} unit="件" sub={`${stats.overview.monthlyItemWearEvents} 次`} />
          <MetricCard label="闲置衣物" value={stats.overview.idleItemCount} unit="件" sub="45天+" />
        </div>
      </section>

      <section className="surface rounded-lg p-3">
        <SectionTitle icon={<Sparkles size={16} aria-hidden="true" />} title="最近常穿" />
        <div className="mt-3 grid gap-2">
          {recentRows.length > 0 ? recentRows.map((entry) => (
            entry.kind === "item" ? (
              <FrequentItemRow key={`item-${entry.item.id ?? entry.item.name}`} entry={entry} />
            ) : (
              <FrequentOutfitRow key={`outfit-${entry.outfit.id}`} entry={entry} items={items} />
            )
          )) : (
            <EmptyState text="本月还没有穿着记录" />
          )}
        </div>
      </section>

      <section className="surface rounded-lg p-3">
        <SectionTitle icon={<Clock size={16} aria-hidden="true" />} title="很久没穿" />
        <div className="mt-3 grid gap-2">
          {stats.idleItems.length > 0 ? stats.idleItems.map((entry) => (
            <IdleItemRow key={entry.item.id ?? entry.item.name} entry={entry} />
          )) : (
            <EmptyState text="暂时没有 45 天以上未穿的衣物" />
          )}
        </div>
      </section>

      <section className="surface rounded-lg p-3">
        <SectionTitle icon={<ShoppingBag size={16} aria-hidden="true" />} title="购买后使用率" />
        <div className="mt-3 grid gap-2">
          {stats.purchaseUsage.length > 0 ? stats.purchaseUsage.map((entry) => (
            <PurchaseUsageRow key={`${entry.wishlistItem.id}-${entry.item.id ?? entry.item.name}`} entry={entry} />
          )) : (
            <EmptyState text="暂无从种草转入衣橱的记录" />
          )}
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-denim/8 text-denim">{icon}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  );
}

function MetricCard({ label, value, unit, sub }: { label: string; value: number; unit: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-ink/8 bg-white px-2.5 py-3">
      <p className="truncate text-[11px] text-ink/50">{label}</p>
      <p className="mt-1 flex items-baseline gap-0.5">
        <span className="text-xl font-semibold text-ink">{value}</span>
        <span className="text-[11px] text-ink/45">{unit}</span>
      </p>
      <p className="mt-0.5 truncate text-[10px] text-ink/35">{sub}</p>
    </div>
  );
}

function FrequentItemRow({ entry }: { entry: WearFrequencyItem }) {
  const item = entry.item;
  return (
    <RowShell
      image={<ItemThumb item={item} />}
      title={item.name}
      subtitle={`${CATEGORY_LABELS[item.category]} · ${formatLastWorn(entry.lastWornDate)}`}
      badge="衣物"
      value={formatWearCount(entry)}
    />
  );
}

function FrequentOutfitRow({ entry, items }: { entry: WearFrequencyOutfit; items: WardrobeItem[] }) {
  return (
    <RowShell
      image={<OutfitThumb outfit={entry.outfit} items={items} />}
      title={entry.outfit.name}
      subtitle={`${entry.outfit.itemIds.length} 件 · ${formatLastWorn(entry.lastWornDate)}`}
      badge="套装"
      value={formatWearCount(entry)}
    />
  );
}

function IdleItemRow({ entry }: { entry: IdleWardrobeItem }) {
  return (
    <RowShell
      image={<ItemThumb item={entry.item} />}
      title={entry.item.name}
      subtitle={`${CATEGORY_LABELS[entry.item.category]} · ${entry.neverWorn ? "从未记录" : formatLastWorn(entry.lastWornDate)}`}
      badge={entry.neverWorn ? "未穿" : "闲置"}
      value={`${entry.idleDays} 天`}
    />
  );
}

function PurchaseUsageRow({ entry }: { entry: PurchaseUsageStatistic }) {
  const value = entry.usesAfterPurchase === 0
    ? "买后 0 次"
    : `买后 ${entry.usesAfterPurchase} 次`;
  const rate = entry.usesPer30Days > 0 ? ` · 每30天 ${entry.usesPer30Days.toFixed(1)} 次` : "";
  return (
    <RowShell
      image={<ItemThumb item={entry.item} />}
      title={entry.item.name || entry.wishlistItem.name}
      subtitle={`转入 ${entry.convertedAtKey.replace(/-/g, "/")}${rate}`}
      badge={entry.isZeroUse ? "提醒" : "已使用"}
      badgeTone={entry.isZeroUse ? "clay" : "moss"}
      value={value}
    />
  );
}

function RowShell({
  image,
  title,
  subtitle,
  badge,
  badgeTone = "denim",
  value,
}: {
  image: React.ReactNode;
  title: string;
  subtitle: string;
  badge: string;
  badgeTone?: "denim" | "moss" | "clay";
  value: string;
}) {
  const badgeClass = badgeTone === "moss"
    ? "bg-moss/10 text-moss"
    : badgeTone === "clay"
      ? "bg-clay/10 text-clay"
      : "bg-denim/10 text-denim";
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-lg border border-ink/8 bg-white p-2.5">
      {image}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h3>
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass}`}>{badge}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-ink/48">{subtitle}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold text-ink/72">{value}</p>
      </div>
    </article>
  );
}

function ItemThumb({ item }: { item: WardrobeItem }) {
  return (
    <div className="h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-mist">
      <GarmentImage
        src={item.thumbnailDataUrl || undefined}
        alt={item.name}
        fallbackSize={22}
      />
    </div>
  );
}

function OutfitThumb({ outfit, items }: { outfit: SavedOutfit; items: WardrobeItem[] }) {
  return (
    <div className="h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-mist">
      <OutfitCover outfit={outfit} items={items} className="h-full w-full" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid min-h-20 place-items-center rounded-lg border border-dashed border-ink/12 bg-white/70 px-4 py-5 text-center">
      <div className="grid justify-items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-mist text-ink/35">
          <Repeat2 size={15} aria-hidden="true" />
        </span>
        <p className="text-xs text-ink/45">{text}</p>
      </div>
    </div>
  );
}

function formatWearCount(entry: WearFrequencyItem | WearFrequencyOutfit): string {
  if (entry.currentMonthWearCount > 0) return `本月 ${entry.currentMonthWearCount} 次`;
  if (entry.recentWearCount > 0) return `最近 ${entry.recentWearCount} 次`;
  return `累计 ${entry.totalWearCount} 次`;
}

function formatLastWorn(date?: string): string {
  if (!date) return "暂无记录";
  return `最近 ${date.slice(5).replace("-", "/")}`;
}
