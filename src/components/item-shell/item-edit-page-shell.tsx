"use client";

import type { ReactNode } from "react";
import { SaveAll } from "lucide-react";
import { AppSubPageTopBar } from "@/components/app-sub-page-top-bar";
import { OnlineButtonSpinner } from "@/components/online/online-button-spinner";
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

  imageSection?: ReactNode;
  basicSection?: ReactNode;
  colorSection?: ReactNode;
  wearingSection?: ReactNode;
  notesSection?: ReactNode;

  extraSections?: ReactNode;
  children?: ReactNode;
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
  children,
  overlays,
}: ItemEditPageShellProps) {
  return (
    <section className={ITEM_PAGE_ROOT_CLASS}>
      <AppSubPageTopBar
        title={title}
        onBack={onBack}
        rightAction={
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled || saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-denim px-4 text-sm font-semibold text-white disabled:bg-ink/18 disabled:text-ink/42 active:scale-[0.98] transition-transform"
          >
            {saving ? <OnlineButtonSpinner /> : <SaveAll size={15} aria-hidden="true" />}
            {saving ? "保存中" : "保存"}
          </button>
        }
      />

      <main className={ITEM_PAGE_SCROLL_CLASS}>
        <div className={`${ITEM_PAGE_CONTENT_CLASS} py-4`}>
          <div className="space-y-4">
            {children}
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
