"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export interface LegalSection {
  title: string;
  children: React.ReactNode;
}

export function LegalDocumentView({
  title,
  lastUpdated,
  sections,
  onBack,
}: {
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
  onBack?: () => void;
}) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <div className="grid gap-4">
      <header className="surface rounded-lg px-4 py-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-sm font-semibold text-denim"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          返回
        </button>
        <h1 className="mt-3 text-lg font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-xs text-ink/55">最近更新：{lastUpdated}</p>
      </header>

      {sections.map((section, index) => (
        <section
          key={index}
          className="surface rounded-lg px-4 py-4 text-sm leading-relaxed text-ink/85 [&_p+p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul_li+li]:mt-1 [&_code]:rounded [&_code]:bg-ink/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_strong]:font-semibold [&_strong]:text-ink"
        >
          <h2 className="text-sm font-bold text-ink">{section.title}</h2>
          <div className="mt-2">{section.children}</div>
        </section>
      ))}
    </div>
  );
}
