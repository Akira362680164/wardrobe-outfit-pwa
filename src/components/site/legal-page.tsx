import type { LegalSection } from "@/content/legal-content";
import { SiteLayout } from "./site-layout";

export function LegalPage({ title, intro, updatedAt, sections }: { title: string; intro: string; updatedAt: string; sections: LegalSection[] }) {
  return (
    <SiteLayout>
      <main className="site-legal-main">
        <article className="site-reading">
          <header className="site-legal-hero">
            <p className="site-eyebrow">Wardora 公开文件</p>
            <h1>{title}</h1>
            <p>{intro}</p>
            <p className="site-legal-date">最近更新：{updatedAt}</p>
          </header>
          <div className="site-legal-sections">
            {sections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                <div>{section.children}</div>
              </section>
            ))}
          </div>
        </article>
      </main>
    </SiteLayout>
  );
}
