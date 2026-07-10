import Link from "next/link";
import { isWebsiteBuild } from "@/lib/site-build-target";
import { SiteLayout } from "@/components/site/site-layout";

export default function NotFound() {
  if (!isWebsiteBuild()) return <main className="grid min-h-dvh place-items-center p-6"><Link className="text-denim" href="/">返回衣橱穿搭助手</Link></main>;
  return <SiteLayout><main className="site-legal-main"><section className="site-reading site-legal-hero"><p className="site-eyebrow">404</p><h1>这一页没有记录</h1><p>你访问的地址不存在或已经调整。可以返回衣橱小站首页，或查看公开合规信息。</p><div className="site-actions"><Link className="site-button site-button--primary" href="/">返回首页</Link><Link className="site-button site-button--secondary" href="/privacy/">查看隐私政策</Link></div></section></main></SiteLayout>;
}
