import type { Metadata, Viewport } from "next";
import "../src/app/globals.css";
import { MotionProvider } from "@/components/motion-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export const metadata: Metadata = {
  title: "衣橱穿搭助手",
  description: "本地优先的衣橱管理与穿搭推荐 PWA",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "衣橱助手",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f5f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <MotionProvider>{children}</MotionProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
