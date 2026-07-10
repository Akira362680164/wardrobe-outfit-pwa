import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/auth/legal-document-view";
import { privacySections } from "@/content/legal-content";

const LAST_UPDATED = "2026-07-09";
const APP_NAME = "衣橱穿搭助手";

export const metadata: Metadata = {
  title: `${APP_NAME} · 隐私政策`,
  description: `${APP_NAME} 隐私政策。`,
};


export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-mist px-4 py-6 text-ink">
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <LegalDocumentView
          title={`${APP_NAME} 隐私政策`}
          lastUpdated={LAST_UPDATED}
          sections={privacySections}
        />
      </div>
    </main>
  );
}
