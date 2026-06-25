"use client";

import type { ReactNode } from "react";
import {
  ITEM_PAGE_ROOT_CLASS,
  ITEM_PAGE_SCROLL_CLASS,
  ITEM_PAGE_CONTENT_CLASS,
} from "@/components/item-shell/item-surface-tokens";

export interface ItemEditPageShellProps {
  title: string;

  onBack: () => void;
  onSave: () => void;

  saving?: boolean;
  saveDisabled?: boolean;

  imageSection: ReactNode;
  basicSection: ReactNode;
  colorSection: ReactNode;
  wearingSection: ReactNode;
  notesSection: ReactNode;

  extraSections?: ReactNode;
  overlays?: ReactNode;
}

export function ItemEditPageShell({
  title,
  onBack,
  onSave,
  saving = false,
  saveDisabled = false,
  imageSection,
  basicSection,
  colorSection,
  wearingSection,
  notesSection,
  extraSections,
  overlays,
}: ItemEditPageShellProps) {
  return (
    <section className={ITEM_PAGE_ROOT_CLASS}>
      <ItemEditTopBar
        title={title}
        onBack={onBack}
        onSave={onSave}
        saving={saving}
        saveDisabled={saveDisabled}
      />

      <main className={ITEM_PAGE_SCROLL_CLASS}>
        <div className={`${ITEM_PAGE_CONTENT_CLASS} py-4`}>
          <div className="space-y-4">
            {imageSection}
            {basicSection}
            {colorSection}
            {wearingSection}
            {notesSection}
            {extraSections}
          </div>
        </div>
      </main>

      {overlays}
    </section>
  );
}

import { ChevronLeft, Loader2, SaveAll } from "lucide-react";

function ItemEditTopBar({
  title,
  onBack,
  onSave,
  saving,
  saveDisabled,
}: {
  title: string;
  onBack: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between px-1 h-14 border-b border-ink/10">
      <button
        type="button"
        onClick={onBack}
        className="grid h-11 w-11 place-items-center rounded-full hover:bg-mist/50 active:scale-95 transition-transform"
        aria-label="返回"
      >
        <ChevronLeft size={20} />
      </button>
      <h2 className="text-base font-semibold">{title}</h2>
      <button
        type="button"
        onClick={onSave}
        disabled={saveDisabled}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-denim px-4 text-sm font-semibold text-white disabled:bg-ink/18 disabled:text-ink/42 active:scale-[0.98] transition-transform"
      >
        {saving ? (
          <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        ) : (
          <SaveAll size={15} aria-hidden="true" />
        )}
        {saving ? "保存中" : "保存"}
      </button>
    </div>
  );
}
