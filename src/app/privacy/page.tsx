import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { privacySections } from "@/content/legal-content";
import { absoluteSiteUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: "隐私政策", description: `${siteConfig.productName}隐私政策与个人信息处理说明。`, alternates: { canonical: absoluteSiteUrl("/privacy/") } };

export default function PrivacyPage() {
  return <LegalPage title="隐私政策" intro={`本政策说明${siteConfig.productName}在提供个人衣橱、穿搭记录、账号同步和用户主动触发的 AI 辅助功能时如何处理相关信息。`} updatedAt={siteConfig.privacyUpdatedAt} sections={privacySections} />;
}
