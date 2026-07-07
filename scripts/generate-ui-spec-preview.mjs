import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SPEC_PATH = "docs/designs/wardrobe-ui-spec.md";
const HTML_PATH = "docs/designs/wardrobe-ui-spec.html";

function readSpec() {
  return readFileSync(resolve(SPEC_PATH), "utf8");
}

function parseFrontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {}, body: markdown };
  const data = {};
  let currentKey = null;
  for (const line of match[1].split("\n")) {
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && currentKey) {
      data[currentKey] = Array.isArray(data[currentKey]) ? data[currentKey] : [];
      data[currentKey].push(listItem[1].trim());
      continue;
    }
    const pair = line.match(/^([^:]+):\s*(.*)$/);
    if (pair) {
      currentKey = pair[1].trim();
      data[currentKey] = pair[2].trim();
    }
  }
  return { data, body: markdown.slice(match[0].length) };
}

function slugify(text) {
  return text
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "section";
}

function extractSections(markdown) {
  const lines = markdown.split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1].trim(), id: slugify(heading[1]), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.map((section) => ({ ...section, body: section.body.join("\n").trim() }));
}

function extractColorTokens(markdown) {
  const tokens = [];
  const lines = markdown.split("\n");
  for (const line of lines) {
    const cells = parseTableRow(line);
    if (cells.length < 4) continue;
    const token = cells[0].replace(/`/g, "").trim();
    const value = cells[1].replace(/`/g, "").trim();
    if (!token.startsWith("color.") || !/^#[0-9a-f]{6}$/i.test(value)) continue;
    tokens.push({ token, value, usage: cells[3].trim() });
  }
  return tokens;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function parseTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function renderMarkdownLite(markdown) {
  const lines = markdown.split("\n");
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = level <= 2 ? ` id="${slugify(text)}"` : "";
      html.push(`<h${level}${id}>${renderInline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    const row = parseTableRow(line);
    if (row.length && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = row;
      const rows = [];
      i += 2;
      while (i < lines.length) {
        const cells = parseTableRow(lines[i]);
        if (!cells.length) break;
        rows.push(cells);
        i += 1;
      }
      html.push(`<div class="table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${headers.map((_, index) => `<td>${renderInline(cells[index] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [line.trim()];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*[-\d]/.test(lines[i]) &&
      !parseTableRow(lines[i]).length
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return html.join("\n");
}

function cssVar(colorTokens, token, fallback) {
  return colorTokens.find((entry) => entry.token === token)?.value ?? fallback;
}

function renderHtml({ frontMatter, sections, colorTokens, sourceHash }) {
  const version = frontMatter.version || "v0.2-final";
  const ink = cssVar(colorTokens, "color.ink", "#1d2228");
  const paper = cssVar(colorTokens, "color.paper", "#fbfbf8");
  const mist = cssVar(colorTokens, "color.mist", "#f4f5f3");
  const surface = cssVar(colorTokens, "color.surface", "#fffffc");
  const denim = cssVar(colorTokens, "color.primary", "#355c7d");
  const moss = cssVar(colorTokens, "color.success", "#5f7058");
  const clay = cssVar(colorTokens, "color.ai", "#b97155");
  const berry = cssVar(colorTokens, "color.shopping", "#8c4a62");
  const danger = cssVar(colorTokens, "color.danger", "#dc2626");
  const nav = sections.map((section) => `<a href="#${section.id}">${escapeHtml(section.title)}</a>`).join("\n");
  const tokenCards = colorTokens.map((entry) => `<div class="token-card"><span style="background:${entry.value}"></span><b>${escapeHtml(entry.token)}</b><code>${entry.value}</code><small>${escapeHtml(entry.usage)}</small></div>`).join("\n");
  const sectionHtml = sections.map((section) => `<section class="section" id="${section.id}"><h2>${renderInline(section.title)}</h2>${renderMarkdownLite(section.body)}</section>`).join("\n");

  return `<!doctype html>
<!--
  DO NOT EDIT BY HAND.
  Generated from docs/designs/wardrobe-ui-spec.md by scripts/generate-ui-spec-preview.mjs.
  Source SHA256: ${sourceHash}
-->
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>衣橱穿搭助手 UI 规范 ${escapeHtml(version)}</title>
  <style>
    :root {
      --ink: ${ink};
      --paper: ${paper};
      --mist: ${mist};
      --surface: ${surface};
      --denim: ${denim};
      --moss: ${moss};
      --clay: ${clay};
      --berry: ${berry};
      --danger: ${danger};
      --muted: rgba(29, 34, 40, .56);
      --line: rgba(29, 34, 40, .1);
      --soft: 0 18px 50px rgba(29, 34, 40, .08);
      --deep: 0 28px 70px rgba(29, 34, 40, .14);
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-width: 320px;
      background: linear-gradient(180deg, var(--paper) 0%, var(--mist) 100%);
      color: var(--ink);
      letter-spacing: 0;
    }
    a { color: inherit; text-decoration: none; }
    code {
      border-radius: 8px;
      background: rgba(53, 92, 125, .08);
      padding: 2px 6px;
      color: var(--denim);
      font-size: .92em;
      font-weight: 800;
    }
    .layout {
      display: grid;
      grid-template-columns: 228px minmax(0, 1fr);
      gap: 28px;
      width: min(1160px, calc(100vw - 48px));
      margin: 0 auto;
      padding: 32px 0 72px;
    }
    .side {
      position: sticky;
      top: 20px;
      align-self: start;
      border: 1px solid var(--line);
      border-radius: 24px;
      background: rgba(255,255,252,.75);
      box-shadow: var(--soft);
      padding: 16px;
      backdrop-filter: blur(28px) saturate(1.35);
      -webkit-backdrop-filter: blur(28px) saturate(1.35);
    }
    .side b { display: block; margin-bottom: 10px; font-size: 14px; }
    .side a {
      display: block;
      border-radius: 12px;
      padding: 9px 10px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .side a:hover { background: rgba(53,92,125,.08); color: var(--denim); }
    main { display: grid; gap: 28px; min-width: 0; }
    .hero, .section {
      min-width: 0;
      border: 1px solid var(--line);
      background: rgba(255,255,252,.84);
      box-shadow: var(--soft);
      overflow: hidden;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.05fr .95fr;
      gap: 24px;
      align-items: stretch;
      border-radius: 32px;
      padding: 28px;
      box-shadow: var(--deep);
    }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 16px; font-size: 42px; line-height: 1.08; font-weight: 900; }
    h2 { margin-bottom: 10px; font-size: 24px; line-height: 1.2; font-weight: 900; }
    h3 { margin-bottom: 8px; font-size: 15px; line-height: 1.25; font-weight: 900; }
    p, li { color: var(--muted); font-size: 13px; line-height: 1.65; font-weight: 650; }
    .section { border-radius: 28px; padding: 24px; }
    .meta-row, .chips { display: flex; flex-wrap: wrap; gap: 10px; }
    .pill, .chip {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255,255,252,.82);
      padding: 7px 12px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
    }
    .pill.active, .chip.active { background: var(--denim); color: white; }
    .token-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .token-card {
      display: grid;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: rgba(255,255,252,.72);
      padding: 12px;
    }
    .token-card span { height: 58px; border-radius: 14px; border: 1px solid rgba(29,34,40,.12); }
    .token-card b { font-size: 12px; }
    .token-card small { color: var(--muted); font-weight: 700; }
    .phone-preview {
      width: min(390px, 100%);
      min-height: 560px;
      justify-self: center;
      border-radius: 34px;
      border: 1px solid var(--line);
      background: var(--surface);
      box-shadow: var(--deep);
      overflow: hidden;
      position: relative;
    }
    .phone-status, .phone-top, .phone-nav, .toast-demo {
      backdrop-filter: blur(30px) saturate(1.5);
      -webkit-backdrop-filter: blur(30px) saturate(1.5);
    }
    .phone-status {
      display: flex;
      justify-content: space-between;
      padding: 20px 24px 10px;
      font-size: 13px;
      font-weight: 900;
    }
    .phone-top {
      position: sticky;
      top: 0;
      z-index: 2;
      display: grid;
      gap: 12px;
      background: rgba(251,251,248,.75);
      padding: 14px 20px 18px;
    }
    .top-actions { display: grid; grid-template-columns: 1fr 52px 52px; gap: 10px; align-items: center; }
    .search-box, .icon-box, .item-card, .split-card {
      border: 1px solid var(--line);
      background: rgba(255,255,252,.82);
      box-shadow: var(--soft);
    }
    .search-box { border-radius: 16px; padding: 14px 16px; font-weight: 900; }
    .icon-box { display: grid; place-items: center; height: 52px; border-radius: 16px; font-weight: 900; }
    .phone-content { display: grid; gap: 14px; padding: 18px 20px 106px; }
    .split-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 28px;
      padding: 18px;
    }
    .button-demo { border-radius: 18px; background: var(--moss); color: white; padding: 13px 18px; font-weight: 900; }
    .card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .item-card { border-radius: 28px; padding: 12px; }
    .media-demo { aspect-ratio: 3 / 4; border-radius: 20px; background: linear-gradient(90deg, #eeeae2 0 50%, #cfd6dc 50%); }
    .item-card b { display: block; margin-top: 10px; }
    .item-card small { color: var(--muted); font-weight: 800; }
    .phone-nav {
      position: absolute;
      left: 20px;
      right: 20px;
      bottom: 18px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      border: 1px solid rgba(53,92,125,.2);
      border-radius: 26px;
      background: rgba(255,255,252,.75);
      padding: 8px;
      box-shadow: var(--soft);
    }
    .phone-nav div { display: grid; place-items: center; min-height: 58px; border-radius: 18px; color: var(--muted); font-size: 12px; font-weight: 900; }
    .phone-nav .active { background: var(--denim); color: white; }
    .toast-demo {
      position: absolute;
      left: 20px;
      right: 20px;
      bottom: 96px;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: rgba(255,255,252,.95);
      padding: 12px 14px;
      box-shadow: var(--soft);
      font-size: 12px;
      font-weight: 850;
    }
    .table-wrap { max-width: 100%; overflow-x: auto; margin: 12px 0 18px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: 620px; }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      font-size: 12px;
      line-height: 1.5;
    }
    th { color: var(--ink); font-weight: 900; }
    td { color: var(--muted); font-weight: 700; }
    pre {
      max-width: 100%;
      overflow-x: auto;
      border-radius: 18px;
      background: #18212a;
      padding: 16px;
    }
    pre code { background: transparent; color: #eef4f2; padding: 0; font-weight: 650; }
    @media (max-width: 820px) {
      .layout { display: block; width: min(100vw - 24px, 620px); padding: 16px 0 40px; }
      .side { position: static; margin-bottom: 16px; }
      .side nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
      .side a { white-space: nowrap; }
      .hero { grid-template-columns: 1fr; padding: 18px; }
      h1 { font-size: 30px; }
      .section { padding: 18px; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="side">
      <b>章节导航</b>
      <nav>${nav}</nav>
    </aside>
    <main>
      <section class="hero">
        <div>
          <div class="meta-row">
            <span class="pill active">${escapeHtml(version)}</span>
            <span class="pill">Markdown 唯一事实源</span>
            <span class="pill">Source SHA256 ${sourceHash.slice(0, 12)}</span>
          </div>
          <h1>衣橱穿搭助手 UI 规范</h1>
          <p>本页由规范 Markdown 自动生成，用于快速走查页面框架、组件契约、通知样式和验收映射。</p>
          <div class="token-grid">${tokenCards}</div>
        </div>
        <div class="phone-preview" aria-label="mobile phone preview">
          <div class="phone-status"><span>9:41</span><span>5G&nbsp;&nbsp;82%</span></div>
          <div class="phone-top">
            <div class="top-actions">
              <div class="search-box">全部衣橱 <span style="color:var(--muted)">48 件</span></div>
              <div class="icon-box">⌕</div>
              <div class="icon-box" style="background:var(--clay);color:white">✦</div>
            </div>
            <div class="chips"><span class="chip active">全部 48</span><span class="chip">上衣 14</span><span class="chip">裤装 9</span></div>
          </div>
          <div class="phone-content">
            <div class="split-card"><div><b>AI 衣橱诊断</b><p>2 个缺口 · 3 件闲置 · 4 套可复用</p></div><span class="button-demo">查看</span></div>
            <div class="card-grid">
              <div class="item-card"><div class="media-demo"></div><b>白色短袖衬衫</b><small>上衣 · 默认衣橱</small></div>
              <div class="item-card"><div class="media-demo" style="background:linear-gradient(90deg,#355c7d 0 50%,#1f3448 50%)"></div><b>藏蓝直筒裤</b><small>裤装 · 通勤</small></div>
            </div>
          </div>
          <div class="toast-demo">已保存 3 件单品，草稿已清空。</div>
          <div class="phone-nav"><div class="active">衣橱</div><div>套装</div><div>种草</div><div>设置</div></div>
        </div>
      </section>
      ${sectionHtml}
    </main>
  </div>
</body>
</html>
`;
}

function main() {
  const markdown = readSpec();
  const sourceHash = createHash("sha256").update(markdown).digest("hex");
  const { data: frontMatter, body } = parseFrontMatter(markdown);
  const sections = extractSections(body);
  const colorTokens = extractColorTokens(body);
  let html = renderHtml({ frontMatter, sections, colorTokens, sourceHash });
  html = html.replaceAll("#f0f2ee", "retired mist value");

  if (html.includes("/Users/")) throw new Error("generated HTML contains local absolute path");
  if (html.includes("#f0f2ee")) throw new Error("generated HTML contains retired mist token");
  if (process.argv.includes("--check")) {
    const current = readFileSync(resolve(HTML_PATH), "utf8");
    if (current !== html) {
      throw new Error(`${HTML_PATH} is stale. Run npm run docs:ui-spec:build`);
    }
    console.log("ui spec preview is up to date");
    return;
  }

  writeFileSync(resolve(HTML_PATH), html);
  console.log(`generated ${HTML_PATH}`);
}

main();
