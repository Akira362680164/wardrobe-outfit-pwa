import type { Metadata, Viewport } from "next";
import "../src/app/globals.css";
import "../src/app/site.css";
import { MotionProvider } from "@/components/motion-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { isWebsiteBuild } from "@/lib/site-build-target";
import { siteConfig } from "@/lib/site-config";

export function generateMetadata(): Metadata {
  if (isWebsiteBuild()) return {
    metadataBase: new URL(siteConfig.domain),
    title: { default: `${siteConfig.siteName}｜${siteConfig.productName}官方信息与合规页面`, template: `%s｜${siteConfig.siteName}` },
    description: siteConfig.siteDescription,
    manifest: "/site.webmanifest",
    alternates: { canonical: "/" },
    openGraph: { title: siteConfig.siteName, description: siteConfig.siteDescription, url: siteConfig.domain, siteName: siteConfig.siteName, locale: "zh_CN", type: "website" },
    icons: { icon: "/icon.svg" },
  };
  return {
    title: "衣橱穿搭助手",
    description: "本地优先的衣橱管理与穿搭推荐 PWA",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "衣橱助手" },
  };
}

export const viewport: Viewport = {
  themeColor: "#f4f5f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const websiteBuild = isWebsiteBuild();
  return (
    <html lang="zh-CN">
      <body className={websiteBuild ? "site-body" : undefined}>
        {websiteBuild ? children : <MotionProvider>{children}</MotionProvider>}
        {!websiteBuild && <ServiceWorkerRegister />}
      </body>
    </html>
  );
}
