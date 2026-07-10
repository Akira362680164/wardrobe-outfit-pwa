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
    title: { default: "Wardora｜个人衣橱与穿搭管理工具", template: "%s｜Wardora" },
    description: "Wardora 帮助个人用户记录衣物、整理衣橱、保存穿搭组合并规划每日穿搭。",
    manifest: "/wardora.webmanifest",
    alternates: { canonical: "/" },
    openGraph: { title: "Wardora", description: siteConfig.siteDescription, url: siteConfig.domain, siteName: "Wardora", locale: "zh_CN", type: "website" },
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
