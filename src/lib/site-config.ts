const DEFAULT_DOMAIN = "https://zhengfangapps.cloud";
const DEFAULT_OPERATOR_NAME = "方正";
const DEFAULT_ICP_NUMBER = "鲁ICP备2026037404号-1";
const ICP_QUERY_URL = "https://beian.miit.gov.cn/";

function optionalValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function httpsUrl(value: string | undefined, fallback?: string): string | null {
  const candidate = optionalValue(value) ?? fallback ?? null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.origin + url.pathname.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

function emailAddress(value: string | undefined): string | null {
  const candidate = optionalValue(value);
  return candidate && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

export const siteConfig = {
  siteName: "个人内网穿透及衣橱小站",
  siteShortName: "衣橱小站",
  productName: "衣橱穿搭助手",
  siteDescription: "衣橱穿搭助手官方信息与合规页面",
  domain: httpsUrl(process.env.NEXT_PUBLIC_WARDORA_SITE_DOMAIN, DEFAULT_DOMAIN) ?? DEFAULT_DOMAIN,
  contactEmail: emailAddress(process.env.NEXT_PUBLIC_WARDORA_SITE_CONTACT_EMAIL),
  operatorName:
    optionalValue(process.env.NEXT_PUBLIC_WARDORA_SITE_OPERATOR_NAME) ?? DEFAULT_OPERATOR_NAME,
  icpNumber: optionalValue(process.env.NEXT_PUBLIC_WARDORA_SITE_ICP_NUMBER) ?? DEFAULT_ICP_NUMBER,
  policeRecordNumber: optionalValue(process.env.NEXT_PUBLIC_WARDORA_SITE_POLICE_RECORD_NUMBER),
  policeRecordUrl: httpsUrl(process.env.NEXT_PUBLIC_WARDORA_SITE_POLICE_RECORD_URL),
  privacyUpdatedAt: optionalValue(process.env.NEXT_PUBLIC_WARDORA_SITE_PRIVACY_UPDATED_AT) ?? "2026-07-10",
  termsUpdatedAt: optionalValue(process.env.NEXT_PUBLIC_WARDORA_SITE_TERMS_UPDATED_AT) ?? "2026-07-10",
} as const;

export const siteStatus = {
  operatorLabel: siteConfig.operatorName ?? "运营主体上线前待确认",
  contactLabel: siteConfig.contactEmail ?? "公开联系邮箱上线前待配置",
  icpLabel: siteConfig.icpNumber ?? "ICP备案信息上线前待配置",
  icpUrl: siteConfig.icpNumber ? ICP_QUERY_URL : null,
  policeLabel: siteConfig.policeRecordNumber ?? "公安备案信息办理中",
  policeUrl:
    siteConfig.policeRecordNumber && siteConfig.policeRecordUrl
      ? siteConfig.policeRecordUrl
      : null,
} as const;

export const siteLinks = [
  { href: "/", label: "首页" },
  { href: "/privacy/", label: "隐私政策" },
  { href: "/terms/", label: "用户协议" },
  { href: "/account-deletion/", label: "账号注销" },
  { href: "/contact/", label: "联系我们" },
] as const;

export const complianceLinks = siteLinks.slice(1);

export function absoluteSiteUrl(pathname: string): string {
  return new URL(pathname, `${siteConfig.domain}/`).toString();
}
