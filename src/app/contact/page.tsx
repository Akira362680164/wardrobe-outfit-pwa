import type { Metadata } from "next";
import { SiteLayout } from "@/components/site/site-layout";
import { absoluteSiteUrl, siteConfig, siteStatus } from "@/lib/site-config";

export const metadata: Metadata = { title: "联系我们", description: `联系${siteConfig.productName}处理账号、数据、隐私、注销与安全问题。`, alternates: { canonical: absoluteSiteUrl("/contact/") } };
const categories = ["账号问题", "数据问题", "隐私问题", "账号注销", "安全问题", "其他反馈"];

export default function ContactPage() {
  return (
    <SiteLayout>
      <main className="site-legal-main">
        <article className="site-reading">
          <header className="site-legal-hero"><p className="site-eyebrow">保持联系</p><h1>联系我们</h1><p>如需处理账号、数据或隐私问题，请选择对应问题类型并通过公开渠道联系我们。</p></header>
          <div className="site-legal-sections">
            <section><h2>产品信息</h2><p>网站名称：{siteConfig.siteName}</p><p>关联产品：{siteConfig.productName}</p><p>服务类型：个人衣橱与穿搭管理工具的介绍及合规信息展示</p><p>运营主体：{siteStatus.operatorLabel}</p></section>
            <section><h2>问题类型</h2><ul>{categories.map((category) => <li key={category}>{category}</li>)}</ul></section>
            <section><h2>电子邮箱</h2>{siteConfig.contactEmail ? <p><a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a></p> : <p className="site-status-note">{siteStatus.contactLabel}。官网上线前必须填写真实有效的公开邮箱；当前页面不会生成空的邮件链接。</p>}</section>
            <section><h2>安全提醒</h2><p>请勿通过普通邮件发送密码、完整验证码、MiniMax Key、身份证件原件或与问题无关的个人图片。为核验账号，我们可能要求提供必要且最少的信息。</p></section>
          </div>
        </article>
      </main>
    </SiteLayout>
  );
}
