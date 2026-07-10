import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { termsSections } from "@/content/legal-content";
import { absoluteSiteUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: "用户协议", description: "Wardora 服务范围、账号规则与用户责任。", alternates: { canonical: absoluteSiteUrl("/terms/") } };

export default function TermsPage() {
  return <LegalPage title="用户协议" intro="本协议界定 Wardora 的服务内容、账号使用规则、用户上传内容与 AI 辅助能力的使用边界。" updatedAt={siteConfig.termsUpdatedAt} sections={termsSections} />;
}
