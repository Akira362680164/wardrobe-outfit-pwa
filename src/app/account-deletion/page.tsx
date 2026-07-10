import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { accountDeletionSections } from "@/content/legal-content";
import { absoluteSiteUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: "账号注销说明", description: "Wardora 账号注销影响、数据删除范围与申请渠道。", alternates: { canonical: absoluteSiteUrl("/account-deletion/") } };

export default function AccountDeletionPage() {
  return <LegalPage title="账号注销说明" intro="请在提交注销申请前阅读注销条件、数据处理范围和当前可用的联系渠道。" updatedAt={siteConfig.privacyUpdatedAt} sections={accountDeletionSections} />;
}
