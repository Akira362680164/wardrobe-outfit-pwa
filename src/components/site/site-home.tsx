import { CalendarDays, Cloud, ScanSearch, Shirt, Sparkles, Tags } from "lucide-react";
import { SiteLayout } from "./site-layout";

const features = [
  { title: "衣物管理", text: "记录衣物图片、分类、颜色及其他个人衣橱信息。", icon: Shirt },
  { title: "穿搭管理", text: "创建并保存个人穿搭组合。", icon: Sparkles },
  { title: "穿搭计划", text: "按日期规划个人穿搭和出行穿搭安排。", icon: CalendarDays },
  { title: "购物意向", text: "记录感兴趣的衣物，不提供商品购买或交易服务。", icon: Tags },
  { title: "AI 辅助识别", text: "根据用户主动提交的图片辅助识别衣物信息，识别结果由用户确认。", icon: ScanSearch },
  { title: "云端同步", text: "登录后在授权范围内保存和同步个人衣橱数据。", icon: Cloud },
] as const;

export function SiteHome() {
  return (
    <SiteLayout>
      <main>
        <section className="site-hero">
          <div className="site-container site-hero__grid">
            <div className="site-hero__copy">
              <p className="site-eyebrow">个人衣橱与穿搭管理工具</p>
              <h1>Wardora</h1>
              <p className="site-hero__lead">轻松记录衣物，整理衣橱，规划每日穿搭。</p>
              <p className="site-hero__description">Wardora 是一款面向个人用户的衣橱与穿搭管理工具，帮助用户记录衣物、整理分类、管理穿搭组合与穿搭计划。</p>
              <div className="site-actions">
                <a className="site-button site-button--primary" href="#features">了解主要功能</a>
                <a className="site-button site-button--secondary" href="/privacy/">查看隐私政策</a>
              </div>
            </div>
            <div className="wardrobe-ledger" aria-hidden="true">
              <div className="wardrobe-ledger__head"><span>今日衣橱</span><span>07 · 10</span></div>
              <div className="wardrobe-ledger__outfit">
                <div className="garment-shape garment-shape--shirt"><span /></div>
                <div className="garment-shape garment-shape--trousers"><span /></div>
                <div className="wardrobe-ledger__note"><strong>通勤组合</strong><span>浅色上装 · 深色下装</span></div>
              </div>
              <div className="wardrobe-ledger__tags"><span>春秋</span><span>简约</span><span>已记录</span></div>
            </div>
          </div>
        </section>

        <section id="features" className="site-section" aria-labelledby="features-title">
          <div className="site-container">
            <div className="site-section__heading"><p className="site-eyebrow">主要功能</p><h2 id="features-title">从记录一件衣物开始</h2><p>围绕个人衣橱建立清晰、可持续整理的日常记录。</p></div>
            <div className="site-feature-grid">
              {features.map(({ title, text, icon: Icon }, index) => (
                <article className="site-feature" key={title}>
                  <div className="site-feature__top"><span className="site-feature__icon"><Icon size={20} aria-hidden="true" /></span><span className="site-feature__number">0{index + 1}</span></div>
                  <h3>{title}</h3><p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="site-section site-section--boundary" aria-labelledby="boundary-title">
          <div className="site-container">
            <div className="site-boundary-card">
              <p className="site-eyebrow">服务边界</p>
              <h2 id="boundary-title">专注个人衣橱，不延伸至交易与公众服务</h2>
              <p>Wardora 是个人衣橱管理工具，不提供电商交易、公众内容发布、社交论坛、金融服务或其他需专项行政许可的服务。</p>
            </div>
          </div>
        </section>

        <section className="site-section site-section--compliance" aria-labelledby="compliance-title">
          <div className="site-container site-compliance-grid">
            <div><p className="site-eyebrow">公开信息</p><h2 id="compliance-title">清楚了解服务规则</h2><p>查看数据处理、账号使用与注销安排；如需帮助，可通过公开联系渠道提出问题。</p></div>
            <div className="site-compliance-links">
              <a href="/privacy/"><span>隐私政策</span><small>数据收集与处理说明</small></a>
              <a href="/terms/"><span>用户协议</span><small>服务规则与用户责任</small></a>
              <a href="/account-deletion/"><span>账号注销说明</span><small>注销影响与申请渠道</small></a>
              <a href="/contact/"><span>联系我们</span><small>账号、数据与隐私反馈</small></a>
            </div>
          </div>
        </section>
      </main>
    </SiteLayout>
  );
}
