"use client";
// v0.8.16: 修复 APK 启动白屏 — 补全 app/page.tsx (App Router 切换时漏的, 之前 build 只输出 404.html)
// WardrobeApp 是纯 client component (Dexie + PointerEvent), 必须 ssr: false
import dynamic from "next/dynamic";

const WardrobeApp = dynamic(
  () => import("@/components/wardrobe-app").then((m) => m.WardrobeApp),
  { ssr: false },
);

export default function Page() {
  return <WardrobeApp />;
}
