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
      const visual = level === 3 ? renderPartVisual(text) : "";
      html.push(`<h${level}${id}>${renderInline(text)}</h${level}>${visual}`);
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

function icon(name) {
  const paths = {
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
    sparkles: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"></path><path d="M5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15z"></path>',
    shirt: '<path d="M8 4 4 6l2 4 2-1v11h8V9l2 1 2-4-4-2-2 3h-4L8 4z"></path>',
    layers: '<path d="m12 3 8 4-8 4-8-4 8-4z"></path><path d="m4 12 8 4 8-4"></path><path d="m4 17 8 4 8-4"></path>',
    bag: '<path d="M6 8h12l-1 13H7L6 8z"></path><path d="M9 8a3 3 0 0 1 6 0"></path>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3.1h5l.4-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1z"></path>',
    chevronDown: '<path d="m6 9 6 6 6-6"></path>',
  };
  return `<svg class="demo-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? ""}</svg>`;
}

function renderPartVisual(title) {
  if (/2\.1\s+颜色/.test(title)) {
    return `
      <div class="part-visual" data-visual="color-token-palette">
        <div class="token-strip">
          <span style="background:var(--ink)">ink</span><span style="background:var(--paper);color:var(--ink)">paper</span>
          <span style="background:var(--denim)">primary</span><span style="background:var(--moss)">success</span>
          <span style="background:var(--clay)">ai</span><span style="background:var(--berry)">shopping</span>
        </div>
        <div class="visual-caption"><b>颜色 token</b><span>每个语义色都显示色块、名称和用途，不只列十六进制。</span></div>
      </div>`;
  }

  if (title.includes("圆角与同心关系")) {
    return `
      <div class="part-visual" data-visual="concentric-radius">
        <div class="radius-demo outer"><div class="radius-demo inner"></div></div>
        <div class="radius-stack"><span>一级卡片 28px</span><span>内层图片 = 外框半径 - 内边距</span><span>选中按钮与外框弧度一致</span></div>
      </div>`;
  }

  if (title.includes("Glass")) {
    return `
      <div class="part-visual" data-visual="glass-layer">
        <div class="glass-scene">
          <span></span><span></span><span></span>
          <div class="glass-panel">75% glass / blur 30</div>
        </div>
        <div class="shadow-samples"><span>soft</span><span>card</span><span>deep</span></div>
      </div>`;
  }

  if (title.includes("Motion")) {
    return `
      <div class="part-visual" data-visual="motion-token">
        <div class="motion-bars"><span style="--w:28%">fast</span><span style="--w:52%">normal</span><span style="--w:76%">panel</span><span style="--w:100%">slow</span></div>
        <div class="motion-chip-row"><span>fade</span><span>slideUp</span><span>toastDrop</span><span>pop</span></div>
      </div>`;
  }

  if (title.includes("Icon")) {
    return `
      <div class="part-visual" data-visual="icon-library">
        <div class="icon-spec-board">
          <span>${icon("search")}<b>Search</b></span>
          <span>${icon("sparkles")}<b>Sparkles</b></span>
          <span>${icon("shirt")}<b>Shirt</b></span>
          <span>${icon("layers")}<b>Layers</b></span>
          <span>${icon("bag")}<b>ShoppingBag</b></span>
          <span>${icon("settings")}<b>Settings</b></span>
        </div>
        <div class="visual-caption"><b>只用 lucide-react</b><span>不得用文字、emoji、符号或手绘临时图标替代。</span></div>
      </div>`;
  }

  if (title.includes("详情媒体")) {
    return `
      <div class="part-visual" data-visual="detail-media">
        <div class="detail-hero-demo"><div class="visual-frame-media"></div><div class="filmstrip"><span></span><span></span><span></span></div></div>
        <div class="detail-meta-demo"><b>白色短袖衬衫</b><span>上衣 / 衬衫 · 默认衣橱 · 可穿</span><div class="color-dots"><i style="background:#fffffc"></i><i style="background:#355c7d"></i></div><small>名称、属性、色卡在底层，不塞进一级卡片。</small></div>
      </div>`;
  }

  if (title.includes("瀑布流与多选")) {
    return `
      <div class="part-visual" data-visual="waterfall-multi-select">
        <div class="waterfall-demo"><div class="item-card selected"><div class="media-demo"></div><b>白色短袖衬衫</b><small>上衣 · 默认衣橱</small><div class="color-dots"><i style="background:#fffffc"></i><i style="background:#355c7d"></i></div></div><div class="item-card"><div class="media-demo dark"></div><b>藏蓝直筒裤</b><small>裤装 · 通勤</small><div class="color-dots"><i style="background:#355c7d"></i><i style="background:#1d2228"></i></div></div></div>
        <div class="bulk-bar">已选 1 件 <button>删除</button></div>
      </div>`;
  }

  if (title.includes("分类与细分")) {
    return `
      <div class="part-visual" data-visual="category-subcategory">
        <div class="field-card"><b>分类</b><div class="chips"><span class="chip active">上衣</span><span class="chip">裤子</span><span class="chip">半身裙</span></div><div class="chips"><span class="chip active">衬衫</span><span class="chip">T 恤</span><span class="chip">针织</span></div></div>
      </div>`;
  }

  if (/8\.2\s+颜色/.test(title)) {
    return `
      <div class="part-visual" data-visual="color-fields">
        <div class="field-card color-field-demo">
          <b>颜色</b>
          <div class="segmented-mini"><span class="active">单主色</span><span>主辅色</span><span>拼色</span></div>
          <div class="swatch-row"><span style="background:#fffffc"></span><span style="background:#355c7d"></span><span style="background:#9aa0a6"></span><span style="background:#e1d9ca"></span><span style="background:#8c4a62"></span></div>
          <small>常用色与扩展色按系统色卡分组展示。</small>
        </div>
      </div>`;
  }

  if (title.includes("温度")) {
    return `
      <div class="part-visual" data-visual="temperature-range">
        <div class="field-card temperature-view-window">
          <b>详情展示</b>
          <div class="temperature-slider view-range"><span></span><i class="min"></i><i class="max"></i></div>
          <div class="temp-labels"><span>17℃</span><b>18℃ - 28℃</b><span>29℃</span></div>
          <small>展示态只给选中区间约 ±10% 上下文，不露出全域端点。</small>
        </div>
        <div class="field-card temperature-edit-window">
          <b>录入 / 编辑</b>
          <div class="temperature-slider edit-range"><span></span><i class="min"></i><i class="max"></i></div>
          <div class="temp-labels"><span>-20℃</span><b>18℃ - 28℃</b><span>40℃</span></div>
        </div>
      </div>`;
  }

  if (title.includes("季节、风格、状态")) {
    return `
      <div class="part-visual" data-visual="season-style-status">
        <div class="field-card"><b>季节 / 风格 / 状态</b><div class="chips"><span class="chip active">春秋</span><span class="chip">通勤</span><span class="chip">可穿</span><span class="chip">待确认</span></div></div>
      </div>`;
  }

  if (title.includes("AI 状态")) {
    return `
      <div class="part-visual" data-visual="ai-state">
        <div class="status-board"><span><b></b>识别中</span><span><b></b>低置信待确认</span><span><b></b>失败可重试</span><span><b></b>保存失败草稿保留</span></div>
      </div>`;
  }

  if (title.includes("系统状态")) {
    return `
      <div class="part-visual" data-visual="system-state">
        <div class="notice-stack"><span>Workspace loading</span><span>Inline retry</span><span>权限被拒绝</span><span>AI Key 缺失</span></div>
      </div>`;
  }

  return `<div class="part-visual" data-visual="generic-part"><div class="visual-card"><b>${escapeHtml(title)}</b><span>此小节必须配合对应视觉示意。</span></div></div>`;
}

function renderSectionVisual(section) {
  const title = section.title;

  if (title.includes("产品与平台边界")) {
    return `
      <div class="visual-phone-mini">
        <div class="visual-status"><span>9:41</span><span>Portrait</span></div>
        <div class="visual-frame-media"></div>
        <div class="visual-note-row"><span>3:4 单品图</span><span>服务器事实源</span></div>
      </div>
      <div class="visual-card">
        <b>平台边界</b>
        <div class="visual-checks"><span>竖屏</span><span>lucide 图标</span><span>无本地业务缓存</span></div>
      </div>`;
  }

  if (title.includes("Design Tokens")) {
    return `
      <div class="visual-token-board">
        <span style="background:var(--ink)"></span>
        <span style="background:var(--paper)"></span>
        <span style="background:var(--denim)"></span>
        <span style="background:var(--moss)"></span>
        <span style="background:var(--clay)"></span>
        <span style="background:var(--berry)"></span>
      </div>
      <div class="visual-radius-board">
        <div>一级卡片<br><b>28px</b></div>
        <div>内层图片<br><b>同心圆角</b></div>
        <div>菜单按钮<br><b>外框 - 间距</b></div>
      </div>`;
  }

  if (title.includes("Viewport")) {
    return `
      <div class="safe-phone">
        <div class="safe-zone top">safe-area top</div>
        <div class="safe-content">390 x 844<br><span>360px 不横滚</span></div>
        <div class="safe-zone bottom">safe-area bottom</div>
      </div>
      <div class="viewport-chips"><span>360</span><span>375</span><span>390</span><span>412</span><span>430</span></div>`;
  }

  if (title.includes("App Shell")) {
    return `
      <div class="visual-phone-mini shell-demo">
        <div class="visual-top-glass"><b>顶部毛玻璃层</b><span>筛选 / 标题</span></div>
        <div class="visual-scroll-cards"><span></span><span></span><span></span></div>
        <div class="visual-floating-nav">
          <div class="nav-tab active">${icon("shirt")}<span>衣橱</span></div>
          <div class="nav-tab">${icon("layers")}<span>套装</span></div>
          <div class="nav-tab">${icon("bag")}<span>种草</span></div>
          <div class="nav-tab">${icon("settings")}<span>设置</span></div>
        </div>
      </div>`;
  }

  if (title.includes("Route")) {
    return `
      <div class="route-chain">
        <span>首页</span><i></i><span>搜索</span><i></i><span>详情</span><i></i><span>编辑</span>
      </div>
      <div class="route-grid">
        <span>Tab 主页面</span><span>详情页</span><span>子页面</span><span>录入流</span>
      </div>`;
  }

  if (title.includes("Overlay")) {
    return `
      <div class="layer-stack">
        <span style="--level:6">Toast z75</span>
        <span style="--level:5">Popover z70</span>
        <span style="--level:4">Sheet z50</span>
        <span style="--level:3">FAB z40</span>
        <span style="--level:2">Bottom nav z30</span>
        <span style="--level:1">Page</span>
      </div>`;
  }

  if (title.includes("核心组件")) {
    return `
      <div class="component-grid">
        <span>AppSubPageTopBar</span><span>DetailShell</span><span>CatalogWaterfallGrid</span>
        <span>ItemColorFields</span><span>TemperatureRangeSlider</span><span>MotionSheet</span>
      </div>`;
  }

  if (title.includes("领域 UI")) {
    return `
      <div class="domain-card">
        <b>分类 / 细分</b>
        <div class="chips"><span class="chip active">上衣</span><span class="chip">衬衫</span><span class="chip">T 恤</span></div>
      </div>
      <div class="domain-card">
        <b>色卡与温度</b>
        <div class="swatch-row"><span style="background:#fffffc"></span><span style="background:#355c7d"></span><span style="background:#8c4a62"></span></div>
        <div class="temp-bar"><i></i></div>
      </div>`;
  }

  if (title.includes("录入流程")) {
    return `
      <div class="step-flow">
        <div class="step-card active"><b>1</b><span>选择照片</span><small>缩略图 / 裁切旋转</small></div>
        <i></i>
        <div class="step-card"><b>2</b><span>确认信息</span><small>复核 AI 草稿</small></div>
      </div>
      <div class="thumb-strip"><span></span><span></span><span></span><button>裁切/旋转</button></div>`;
  }

  if (title.includes("AI 与系统状态")) {
    return `
      <div class="status-board">
        <span><b></b>识别中</span>
        <span><b></b>待确认</span>
        <span><b></b>失败可重试</span>
        <span><b></b>保存中</span>
      </div>
      <div class="inline-notice">失败草稿保留，可手动补全或重新识别。</div>`;
  }

  if (title.includes("通知 Toast")) {
    return `
      <div class="toast-stage">
        <div class="mini-card"></div>
        <div class="mini-card"></div>
        <div class="mini-toast"><b></b><span>已保存 3 件单品</span><button>×</button></div>
        <div class="mini-bottom-bar">底部操作栏同宽</div>
      </div>`;
  }

  if (title.includes("无障碍")) {
    return `
      <div class="a11y-board">
        <span>44px 命中区</span><span>aria-label</span><span>focus ring</span><span>不只靠颜色</span>
      </div>
      <div class="focus-demo"><button>保存</button><button class="focused">删除 2 件</button></div>`;
  }

  if (title.includes("文字规范")) {
    return `
      <div class="copy-board">
        <div><small>推荐</small><b>保存 3 件单品</b></div>
        <div><small>危险操作</small><b>删除 2 件</b></div>
        <div><small>错误提示</small><b>草稿已保留，可重试</b></div>
      </div>`;
  }

  if (title.includes("Known Deviations")) {
    return `
      <div class="debt-board">
        <span>UI-DEBT-001<br><b>open</b></span>
        <span>UI-DEBT-002<br><b>closed</b></span>
        <span>UI-DEBT-005<br><b>closed</b></span>
      </div>`;
  }

  if (title.includes("文档治理")) {
    return `
      <div class="pipeline">
        <span>Markdown</span><i></i><span>生成脚本</span><i></i><span>HTML 预览</span><i></i><span>测试</span>
      </div>`;
  }

  if (title.includes("产品视觉方案实操")) {
    return `
      <div class="practice-board">
        <div class="practice-phone home"><b>衣橱首页</b><div class="practice-top"></div><div class="practice-grid"><span></span><span></span><span></span><span></span></div></div>
        <div class="practice-phone detail"><b>衣物详情</b><div class="practice-media"></div><div class="practice-meta"></div><div class="color-dots"><i style="background:#fffffc"></i><i style="background:#355c7d"></i></div></div>
        <div class="practice-phone intake"><b>单品录入</b><div class="practice-upload"></div><div class="thumb-strip"><span></span><span></span><span></span></div></div>
        <div class="practice-phone outfit"><b>套装首页</b><div class="practice-week"></div><div class="practice-outfit"></div></div>
        <div class="practice-phone wishlist"><b>种草首页</b><div class="practice-product"></div><div class="practice-meta"></div></div>
        <div class="practice-phone settings"><b>设置页</b><div class="practice-list"><span></span><span></span><span></span></div></div>
      </div>`;
  }

  if (title.includes("验收与测试")) {
    return `
      <div class="test-board">
        <span>ui-spec-preview</span><span>ui-token-contract</span><span>ui-overlay-contract</span>
        <span>app-route</span><span>detail-shell</span><span>color-catalog</span>
      </div>`;
  }

  return `<div class="visual-card"><b>${escapeHtml(title)}</b><p>本章节对应视觉模块。</p></div>`;
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
  const sectionHtml = sections.map((section) => {
    const hasParts = /^###\s+/m.test(section.body);
    const visual = hasParts ? "" : `<div class="module-visual" aria-label="${escapeHtml(section.title)} 视觉示意">${renderSectionVisual(section)}</div>`;
    return `<section class="section" id="${section.id}"><h2>${renderInline(section.title)}</h2>${visual}<div class="module-copy">${renderMarkdownLite(section.body)}</div></section>`;
  }).join("\n");

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
    .demo-icon {
      width: 22px;
      height: 22px;
      display: block;
      flex: 0 0 auto;
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
    .module-visual, .part-visual {
      min-width: 0;
      margin: 14px 0 18px;
      border: 1px solid rgba(53,92,125,.14);
      border-radius: 24px;
      background: linear-gradient(135deg, rgba(53,92,125,.1), rgba(255,255,252,.9));
      padding: 16px;
      display: grid;
      gap: 14px;
      overflow: hidden;
    }
    .module-visual { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); align-items: stretch; }
    .part-visual { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); align-items: center; }
    .module-visual > *, .part-visual > * { min-width: 0; }
    .visual-card, .field-card, .domain-card {
      border: 1px solid var(--line);
      border-radius: 20px;
      background: rgba(255,255,252,.78);
      padding: 14px;
      box-shadow: var(--soft);
    }
    .visual-card { display: grid; gap: 10px; }
    .visual-card b, .field-card b, .domain-card b { font-size: 13px; }
    .visual-card span, .visual-caption span, .radius-stack span, .detail-meta-demo span, .detail-meta-demo small, .field-card small {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.45;
      font-weight: 800;
    }
    .visual-phone-mini, .safe-phone {
      border: 1px solid var(--line);
      border-radius: 28px;
      background: var(--surface);
      box-shadow: var(--soft);
      overflow: hidden;
      min-height: 260px;
    }
    .visual-status {
      display: flex;
      justify-content: space-between;
      padding: 12px 14px;
      font-size: 11px;
      font-weight: 900;
    }
    .visual-frame-media {
      width: min(148px, 72%);
      aspect-ratio: 3 / 4;
      margin: 10px auto;
      border-radius: 22px;
      background: linear-gradient(90deg, #eeeae2 0 50%, #cfd6dc 50%);
    }
    .visual-note-row, .viewport-chips, .visual-checks, .motion-chip-row, .swatch-row, .thumb-strip, .a11y-board, .copy-board, .debt-board, .test-board, .route-grid, .shadow-samples {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .visual-note-row { justify-content: center; padding: 0 12px 14px; }
    .visual-note-row span, .visual-checks span, .viewport-chips span, .motion-chip-row span, .shadow-samples span, .route-grid span, .a11y-board span, .debt-board span, .test-board span {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: rgba(255,255,252,.82);
      padding: 8px 10px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
    }
    .visual-token-board, .token-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
      gap: 8px;
    }
    .visual-token-board span, .token-strip span {
      min-height: 54px;
      border: 1px solid rgba(29,34,40,.12);
      border-radius: 16px;
      display: grid;
      place-items: center;
      color: white;
      font-size: 11px;
      font-weight: 900;
    }
    .visual-radius-board, .radius-stack, .notice-stack {
      display: grid;
      gap: 8px;
    }
    .visual-radius-board div, .radius-stack span, .notice-stack span {
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255,255,252,.8);
      padding: 12px;
      font-size: 11px;
      font-weight: 900;
    }
    .safe-phone {
      display: grid;
      grid-template-rows: 44px 1fr 54px;
      min-height: 300px;
    }
    .safe-zone {
      display: grid;
      place-items: center;
      background: rgba(53,92,125,.1);
      color: var(--denim);
      font-size: 11px;
      font-weight: 900;
    }
    .safe-content {
      display: grid;
      place-items: center;
      text-align: center;
      font-size: 24px;
      font-weight: 950;
    }
    .safe-content span { color: var(--muted); font-size: 12px; }
    .shell-demo { position: relative; padding-bottom: 78px; }
    .visual-top-glass {
      display: grid;
      gap: 4px;
      padding: 18px;
      background: rgba(251,251,248,.75);
      backdrop-filter: blur(30px) saturate(1.5);
      -webkit-backdrop-filter: blur(30px) saturate(1.5);
    }
    .visual-top-glass span { color: var(--muted); font-size: 11px; font-weight: 800; }
    .visual-scroll-cards { display: grid; gap: 10px; padding: 16px; }
    .visual-scroll-cards span, .mini-card {
      height: 58px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255,255,252,.82);
    }
    .visual-floating-nav {
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 14px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      border: 1px solid rgba(53,92,125,.18);
      border-radius: 24px;
      background: rgba(255,255,252,.75);
      padding: 7px;
      backdrop-filter: blur(30px) saturate(1.5);
      -webkit-backdrop-filter: blur(30px) saturate(1.5);
    }
    .visual-floating-nav .nav-tab {
      display: grid;
      place-items: center;
      gap: 3px;
      min-height: 42px;
      border-radius: 17px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
    }
    .visual-floating-nav .demo-icon { width: 18px; height: 18px; }
    .visual-floating-nav .active { background: var(--denim); color: white; }
    .route-chain, .pipeline, .step-flow {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .route-chain span, .pipeline span, .step-card {
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255,255,252,.82);
      padding: 12px 14px;
      font-size: 12px;
      font-weight: 900;
    }
    .route-chain i, .pipeline i, .step-flow > i {
      width: 24px;
      height: 2px;
      border-radius: 999px;
      background: rgba(53,92,125,.35);
    }
    .layer-stack { display: grid; gap: 8px; align-items: end; }
    .layer-stack span {
      width: calc(54% + var(--level) * 6%);
      border: 1px solid rgba(53,92,125,.18);
      border-radius: 14px;
      background: rgba(255,255,252,.75);
      padding: 9px 12px;
      color: var(--denim);
      font-size: 11px;
      font-weight: 900;
      box-shadow: var(--soft);
    }
    .component-grid, .status-board, .icon-spec-board {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
    }
    .component-grid span, .status-board span, .icon-spec-board span {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255,255,252,.8);
      padding: 12px;
      font-size: 11px;
      font-weight: 900;
    }
    .icon-spec-board span {
      display: grid;
      place-items: center;
      gap: 8px;
      min-height: 88px;
    }
    .status-board b {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--clay);
      margin-right: 8px;
    }
    .domain-card, .field-card { display: grid; gap: 12px; }
    .swatch-row span, .thumb-strip span {
      width: 42px;
      height: 42px;
      border: 1px solid rgba(29,34,40,.12);
      border-radius: 14px;
    }
    .temp-bar, .temperature-slider {
      position: relative;
      height: 14px;
      border-radius: 999px;
      background: linear-gradient(90deg, #3b82f6 0%, #f59e0b 52%, #dc2626 100%);
      overflow: hidden;
    }
    .temp-bar i {
      display: block;
      width: 58%;
      height: 100%;
      margin-left: 24%;
      background: rgba(29,34,40,.28);
    }
    .step-card { display: grid; gap: 4px; min-width: 150px; }
    .step-card b {
      width: 28px;
      height: 28px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: rgba(53,92,125,.12);
      color: var(--denim);
    }
    .step-card small { color: var(--muted); font-size: 11px; font-weight: 800; }
    .step-card.active { background: var(--denim); color: white; }
    .step-card.active b { background: rgba(255,255,255,.2); color: white; }
    .thumb-strip button, .bulk-bar button, .focus-demo button, .mini-toast button {
      border: 0;
      border-radius: 14px;
      background: var(--denim);
      color: white;
      padding: 10px 12px;
      font-weight: 900;
    }
    .inline-notice, .bulk-bar, .mini-bottom-bar {
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255,255,252,.82);
      padding: 12px 14px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
    }
    .toast-stage {
      position: relative;
      min-height: 230px;
      display: grid;
      gap: 10px;
      padding-bottom: 70px;
    }
    .mini-toast {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 58px;
      display: grid;
      grid-template-columns: 10px 1fr 38px;
      gap: 10px;
      align-items: center;
      min-height: 52px;
      border: 1px solid rgba(53,92,125,.18);
      border-radius: 20px;
      background: rgba(255,255,252,.95);
      box-shadow: var(--deep);
      padding: 10px 12px;
      backdrop-filter: blur(30px) saturate(1.5);
      -webkit-backdrop-filter: blur(30px) saturate(1.5);
    }
    .mini-toast b { width: 8px; height: 28px; border-radius: 999px; background: var(--moss); }
    .mini-toast span { font-size: 12px; font-weight: 900; }
    .mini-toast button { width: 38px; height: 38px; padding: 0; background: rgba(29,34,40,.08); color: var(--ink); }
    .mini-bottom-bar { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; }
    .copy-board { align-items: stretch; }
    .copy-board div {
      display: grid;
      gap: 5px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255,255,252,.82);
      padding: 12px;
    }
    .copy-board small { color: var(--muted); font-size: 11px; font-weight: 800; }
    .copy-board b { font-size: 13px; }
    .token-strip { grid-column: 1 / -1; }
    .visual-caption { display: grid; gap: 5px; }
    .radius-demo.outer {
      width: min(220px, 100%);
      aspect-ratio: 1.5 / 1;
      border-radius: 34px;
      background: rgba(53,92,125,.16);
      padding: 16px;
    }
    .radius-demo.inner {
      width: 66%;
      height: 100%;
      border-radius: 22px;
      background: var(--denim);
    }
    .glass-scene {
      position: relative;
      min-height: 160px;
      border-radius: 20px;
      overflow: hidden;
      background: linear-gradient(120deg, #eeeae2, #cfd6dc);
    }
    .glass-scene > span {
      position: absolute;
      width: 90px;
      height: 90px;
      border-radius: 999px;
      background: rgba(53,92,125,.25);
    }
    .glass-scene > span:nth-child(1) { left: 18px; top: 18px; }
    .glass-scene > span:nth-child(2) { right: 28px; top: 48px; background: rgba(185,113,85,.28); }
    .glass-scene > span:nth-child(3) { left: 40%; bottom: 16px; background: rgba(95,112,88,.28); }
    .glass-panel {
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 14px;
      border-radius: 18px;
      background: rgba(255,255,252,.75);
      padding: 14px;
      font-size: 12px;
      font-weight: 900;
      backdrop-filter: blur(30px) saturate(1.5);
      -webkit-backdrop-filter: blur(30px) saturate(1.5);
    }
    .motion-bars { display: grid; gap: 8px; }
    .motion-bars span {
      display: block;
      width: var(--w);
      min-width: 80px;
      border-radius: 999px;
      background: var(--denim);
      color: white;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 900;
    }
    .detail-hero-demo {
      border: 1px solid var(--line);
      border-radius: 24px;
      background: rgba(255,255,252,.8);
      padding: 14px;
    }
    .detail-hero-demo .visual-frame-media { width: min(190px, 74%); }
    .filmstrip { display: flex; justify-content: center; gap: 8px; margin-top: 10px; }
    .filmstrip span {
      width: 34px;
      height: 44px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: linear-gradient(90deg, #eeeae2 0 50%, #cfd6dc 50%);
    }
    .detail-meta-demo { display: grid; gap: 7px; align-content: center; }
    .detail-meta-demo b { font-size: 20px; }
    .waterfall-demo { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .item-card.selected { outline: 3px solid var(--denim); outline-offset: -3px; }
    .media-demo.dark { background: linear-gradient(90deg, #355c7d 0 50%, #1f3448 50%); }
    .segmented-mini {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      border-radius: 18px;
      background: rgba(29,34,40,.05);
      padding: 6px;
    }
    .segmented-mini span {
      border-radius: 13px;
      padding: 9px 8px;
      text-align: center;
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
    }
    .segmented-mini .active { background: var(--denim); color: white; }
    .temperature-slider span {
      position: absolute;
      left: 38%;
      right: 20%;
      height: 100%;
      background: rgba(255,255,252,.36);
      border: 2px solid rgba(29,34,40,.32);
      border-radius: inherit;
    }
    .temperature-slider i {
      position: absolute;
      top: 50%;
      width: 24px;
      height: 24px;
      border: 3px solid var(--denim);
      border-radius: 999px;
      background: var(--surface);
      transform: translate(-50%, -50%);
      box-shadow: var(--soft);
    }
    .temperature-slider .min { left: 38%; }
    .temperature-slider .max { left: 80%; }
    .temperature-slider.view-range span { left: 12%; right: 12%; }
    .temperature-slider.view-range .min { left: 12%; }
    .temperature-slider.view-range .max { left: 88%; }
    .temp-labels { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 11px; font-weight: 900; }
    .temp-labels b { color: var(--ink); }
    .color-dots {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
    }
    .color-dots i {
      width: 14px;
      height: 14px;
      border: 1px solid rgba(29,34,40,.16);
      border-radius: 999px;
      display: block;
    }
    .focus-demo { display: flex; flex-wrap: wrap; gap: 10px; }
    .focus-demo button { min-width: 96px; min-height: 44px; }
    .focus-demo .focused { outline: 3px solid rgba(53,92,125,.35); outline-offset: 3px; background: var(--danger); }
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
    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 16px;
      padding: 14px 16px;
      font-weight: 900;
    }
    .search-box .demo-icon { width: 16px; height: 16px; color: var(--muted); }
    .wardrobe-count { color: var(--muted); font-weight: 700; }
    .icon-box { display: grid; place-items: center; height: 52px; border-radius: 16px; color: var(--ink); }
    .icon-box .demo-icon { width: 23px; height: 23px; }
    .icon-box.ai { background: var(--clay); color: white; }
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
    .phone-nav .nav-tab { display: grid; place-items: center; gap: 3px; min-height: 58px; border-radius: 18px; color: var(--muted); font-size: 12px; font-weight: 900; }
    .phone-nav .demo-icon { width: 20px; height: 20px; }
    .phone-nav .active { background: var(--denim); color: white; }
    .practice-board {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      grid-column: 1 / -1;
    }
    .practice-phone {
      min-height: 300px;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: var(--surface);
      padding: 14px;
      display: grid;
      gap: 12px;
      align-content: start;
      box-shadow: var(--soft);
    }
    .practice-phone b { font-size: 13px; }
    .practice-top, .practice-media, .practice-upload, .practice-week, .practice-product, .practice-outfit, .practice-meta, .practice-list span {
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(53,92,125,.08);
    }
    .practice-top { height: 64px; background: rgba(251,251,248,.75); backdrop-filter: blur(24px); }
    .practice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .practice-grid span, .practice-product { aspect-ratio: 3 / 4; border-radius: 18px; background: linear-gradient(90deg, #eeeae2 0 50%, #cfd6dc 50%); }
    .practice-media { aspect-ratio: 3 / 4; background: linear-gradient(90deg, #eeeae2 0 50%, #cfd6dc 50%); }
    .practice-upload { min-height: 150px; border-style: dashed; background: rgba(53,92,125,.05); }
    .practice-week { height: 56px; background: linear-gradient(90deg, rgba(53,92,125,.18), rgba(255,255,252,.9)); }
    .practice-outfit { min-height: 130px; background: linear-gradient(90deg, #fffffc 0 33%, #355c7d 33% 66%, #1d2228 66%); }
    .practice-meta { height: 52px; }
    .practice-list { display: grid; gap: 10px; }
    .practice-list span { height: 48px; }
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
              <div class="search-box"><span>全部衣橱</span><span class="wardrobe-count">48 件</span>${icon("chevronDown")}</div>
              <div class="icon-box">${icon("search")}</div>
              <div class="icon-box ai">${icon("sparkles")}</div>
            </div>
            <div class="chips"><span class="chip active">全部 48</span><span class="chip">上衣 14</span><span class="chip">裤装 9</span></div>
          </div>
          <div class="phone-content">
            <div class="split-card"><div><b>AI 衣橱诊断</b><p>2 个缺口 · 3 件闲置 · 4 套可复用</p></div><span class="button-demo">查看</span></div>
            <div class="card-grid">
              <div class="item-card"><div class="media-demo"></div><b>白色短袖衬衫</b><small>上衣 · 默认衣橱</small><div class="color-dots"><i style="background:#fffffc"></i><i style="background:#355c7d"></i></div></div>
              <div class="item-card"><div class="media-demo" style="background:linear-gradient(90deg,#355c7d 0 50%,#1f3448 50%)"></div><b>藏蓝直筒裤</b><small>裤装 · 通勤</small><div class="color-dots"><i style="background:#355c7d"></i><i style="background:#1d2228"></i></div></div>
            </div>
          </div>
          <div class="toast-demo">已保存 3 件单品，草稿已清空。</div>
          <div class="phone-nav">
            <div class="nav-tab active">${icon("shirt")}<span>衣橱</span></div>
            <div class="nav-tab">${icon("layers")}<span>套装</span></div>
            <div class="nav-tab">${icon("bag")}<span>种草</span></div>
            <div class="nav-tab">${icon("settings")}<span>设置</span></div>
          </div>
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
