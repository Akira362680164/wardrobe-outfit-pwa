import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SPEC_PATH = "docs/designs/wardrobe-ui-spec.md";
const HTML_PATH = "docs/designs/wardrobe-ui-spec.html";
const REAL_SCREENSHOT_DIR = "v03-alpha-real-screenshots";

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

const APP_AMBIENT_BACKGROUND = "radial-gradient(circle at 18% 8%, rgba(185,113,85,0.16) 0, rgba(185,113,85,0) 34%), radial-gradient(circle at 82% 92%, rgba(95,112,88,0.14) 0, rgba(95,112,88,0) 36%), linear-gradient(180deg, #fbfbf8 0%, #f4f5f3 100%)";

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
    chevronLeft: '<path d="m15 18-6-6 6-6"></path>',
    chevronDown: '<path d="m6 9 6 6 6-6"></path>',
    check: '<path d="M20 6 9 17l-5-5"></path>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7h.01"></path>',
    alert: '<path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>',
    x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    camera: '<path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5z"></path><circle cx="12" cy="13" r="3"></circle>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8.5" cy="10.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path>',
  };
  return `<svg class="demo-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? ""}</svg>`;
}

function productionShot(filename, title, note = "") {
  return `<figure class="production-shot"><img src="${REAL_SCREENSHOT_DIR}/${filename}" alt="${escapeHtml(title)}"><figcaption><b>${escapeHtml(title)}</b>${note ? `<span>${escapeHtml(note)}</span>` : ""}</figcaption></figure>`;
}

function productionShotGrid(shots) {
  return `<div class="production-shot-grid">${shots.map((shot) => productionShot(...shot)).join("")}</div>`;
}

const visualReferences = [
  ["auth_login_390_top.png", "认证 / 登录页", "登录衣橱账号", ["保留 background.appAmbient 全局渐变，不退回 paper/mist 纯底。", "主卡 28px 圆角，输入框 12-14px，focus 用 denim。", "登录按钮启用态用 primary，Shield 图标统一 lucide 20px。"]],
  ["auth_register_390_top.png", "认证 / 注册页", "注册衣橱账号", ["沿用登录页背景、主卡和表单控件 token。", "协议勾选命中区补到 44px，链接用 denim 600。", "注册按钮图标用 UserPlus，输入框 R 角和边框一致。"]],
  ["settings_home_390_top.png", "设置 / 首页", "账号服务、MiniMax、画像与位置入口", ["MiniMax 缺 Key 提醒改为启动后 Toast，不长期占据页面顶部。", "设置列表一级卡 28px，二级提示块 18-20px。", "底部导航 glass 75%，选中项与外框同心圆角。"]],
  ["wardrobe_home_390_top.png", "衣橱 / 首页", "顶部筛选、瀑布流、Toast、底部导航", ["顶部按钮使用 glass 背景，图标统一 lucide 20px。", "瀑布流卡片与内图保持同心圆角，边框用 line。", "Toast 固定在导航上方，覆盖 FAB，关闭区 44px。"]],
  ["garment_detail_390_top.png", "衣物 / 详情首屏", "主图、胶片、标题与操作", ["TopBar 改为透明底 + 毛玻璃，删除实心白条。", "主图 3:4 和外框 28px，浮层胶囊降对比。", "胶片选中态用 Denim 边框，缩略图 8-12px 圆角。"]],
  ["garment_detail_390_info.png", "衣物 / 详情信息入口", "AI 建议露出、标题与 Toast", ["AI 卡用 surface，Toast 用更强 glass 区分层级。", "标题、记录提示、meta 间距按 12/16/20 节奏。", "生成按钮 lucide 18-20px，按钮 R 角统一。"]],
  ["garment_detail_390_bottom.png", "衣物 / 详情底部", "颜色、穿着属性、备注", ["信息卡统一一级内容卡圆角和 shadow.card。", "色点与 chip 边线更淡，label muted、value ink。", "温度条低饱和蓝红渐变，handle 20px。"]],
  ["confirm_delete_sheet_390_top.png", "覆盖层 / 删除确认", "衣物详情删除 Sheet", ["遮罩用 ink 半透明 + blur，不压暗过重。", "Sheet 顶部 26-28px，surface 干净无硬边。", "取消和删除按钮同高同 R，删除用 danger。"]],
  ["intake_single_step1_empty_390_top.png", "录入 / Step 1 空态", "选择单品照片", ["顶部栏使用透明底 + top glass，不出现白色条块。", "一级选择卡 28px，内部虚线框 12-14px。", "拍照/图库入口改为最新圆角矩形按钮，图标用 Camera/Image。"]],
  ["intake_single_step1_imported_390_top.png", "录入 / Step 1 已导入", "图片队列与裁切入口", ["主预览保持 3:4，图片与卡片圆角同心。", "选中缩略图用 Denim 边框 + 轻 ring。", "继续拍照/图库按钮减阴影，清空只用 danger 文本/边框。"]],
  ["intake_single_confirm_390_top.png", "录入 / Step 2 确认", "已识别 9 件单品", ["进度条 primary + mist 轨道，不用渐变。", "重新识别为次级 AI 操作，RefreshCw 18px。", "AI/待确认徽标用浅底深字，保存栏用 bottom glass。"]],
  ["intake_single_confirm_390_bottom.png", "录入 / Step 2 保存区", "确认页底部截图", ["当前截图与首屏一致，不能凭空新增字段结构。", "可见提示卡按 24-28px 一级卡处理。", "下方字段若出现，只优化字重、色卡、badge，不改顺序。"]],
  ["outfit_home_390_top.png", "套装 / 首页", "周历、套装卡、Toast", ["周历一级容器 28px，选中日期用 Denim 淡底细边。", "顶部按钮和底部导航 glass 75%，激活项圆角矩形。", "套装卡图片 3:4 主体居中，Toast 上移到导航上方。"]],
  ["outfit_detail_390_top.png", "套装 / 详情首屏", "套装主图与元信息", ["返回/更多栏用透明 glass，删除二级/三级页白色条块。", "Hero 图保持结构，只调 object-position 保完整主体。", "主图和标记按钮用半透明 surface，字重 600。"]],
  ["outfit_detail_390_info.png", "套装 / 详情信息入口", "主图区与 AI 卡露出", ["胶片选中边框 Denim，虚线占位更淡。", "标记今天穿了按钮减阴影。", "AI 卡使用二级卡 18-20px，与主图区分层。"]],
  ["outfit_detail_390_bottom.png", "套装 / 详情底部", "AI 建议、概况、适穿信息", ["Tab 激活态弱化阴影，减少卡片套卡片感。", "信息块靠 28px，内部少阴影靠文字层级。", "温度条低饱和，label muted、value ink。"]],
  ["outfit_calendar_390_top.png", "套装 / 月历页", "穿搭计划月历", ["月份标题、Chevron、星期行拉开字号层级。", "选中日期用 Denim 淡底 + 12-14px 圆角。", "+计划按钮与套装首页主按钮统一。"]],
  ["wishlist_home_390_top.png", "种草 / 首页", "商品卡、筛选、Toast", ["购物袋图标使用 shopping token，不偏橙。", "商品卡沿用瀑布流规格，图片 3:4 主体居中。", "active chip 用 Denim 浅底，数字不比标签更抢。"]],
  ["wishlist_detail_390_top.png", "种草 / 详情首屏", "商品图、主操作、标题", ["商品图优先完整轮廓，避免人物/衣物关键区域截断。", "商品图标签用半透明 surface，降低深灰块。", "不想买按钮 danger 细边轻字重，Toast 避开关键字段。"]],
  ["wishlist_detail_390_info.png", "种草 / 详情信息入口", "商品图与 CTA", ["TopBar 与套装详情完全一致。", "商品图外框统一，去除内部明显灰底边缘。", "CTA 高度、R 角、图标尺寸统一，仅颜色区分优先级。"]],
  ["wishlist_detail_390_bottom.png", "种草 / 详情底部", "基础信息、颜色、穿着属性", ["颜色色卡边线更淡，不像可编辑输入框。", "label 统一 muted，长文本行高 1.5。", "备注只调行高、字重和内边距，不新增说明块。"]],
];

function referenceShot([filename, section, page, items]) {
  return `<article class="reference-shot" data-page-state="${escapeHtml(filename.replace(/\.png$/, ""))}">
    ${productionShot(filename, section, page)}
    <div class="reference-notes"><span>视觉优化参考</span><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
  </article>`;
}

function referenceShotGrid() {
  return `<div class="reference-grid">${visualReferences.map(referenceShot).join("")}</div>`;
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
        <div class="ambient-demo"><b>background.appAmbient</b><span>所有页面统一使用登录页这套低饱和渐变底层。</span></div>
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
        ${productionShotGrid([
          ["garment_detail_390_top.png", "单品详情首屏", "主图、胶片、名称与属性沿用生产结构"],
          ["garment_detail_390_info.png", "单品详情信息区", "颜色、分类、季节等字段按生产区块排列"],
          ["garment_detail_390_bottom.png", "单品详情底部", "只优化卡片圆角、色彩与毛玻璃质感"],
        ])}
      </div>`;
  }

  if (title.includes("瀑布流与多选")) {
    return `
      <div class="part-visual" data-visual="waterfall-multi-select">
        ${productionShotGrid([
          ["wardrobe_home_390_top.png", "衣橱瀑布流", "真实生产截图：两列卡片、筛选、Toast、底部导航"],
        ])}
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
        ${productionShotGrid([
          ["garment_detail_390_info.png", "详情色卡展示", "结构以生产字段区为准，规范只收紧色卡颜色和标签"],
          ["intake_single_confirm_390_top.png", "录入确认色卡入口", "重新识别和字段校对位置沿用生产"],
        ])}
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

  if (title.includes("Android edge-to-edge")) {
    return `
      <div class="part-visual" data-visual="android-edge-to-edge">
        <div class="safe-phone">
          <div class="visual-status"><span>动态顶部 inset</span><span>Android</span></div>
          <div class="visual-card"><b>WebView 内容延伸到系统栏下方</b><span>标题、滚动区和底部操作分别消费真实 system bar / keyboard inset。</span></div>
          <div class="visual-note-row"><span>透明系统栏</span><span>动态 safe area</span><span>竖屏优先</span></div>
        </div>
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
      <div class="ambient-board"><b>全局背景</b><span>background.appAmbient</span><small>所有页面底层使用登录页同款柔和渐变</small></div>
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
        <div class="visual-status"><span>9:41</span><span>5G 82%</span></div>
        <div class="visual-top-glass shell-topbar-demo">
          <button aria-label="返回">${icon("chevronLeft")}</button>
          <b>二级页 TopBar</b>
          <button aria-label="更多">${icon("settings")}</button>
        </div>
        <div class="visual-scroll-cards"><span></span><span></span><span></span></div>
        <div class="visual-floating-nav" data-visual="bottom-nav-concentric">
          <span class="nav-tab active">${icon("shirt")}<b>衣橱</b></span>
          <span class="nav-tab">${icon("layers")}<b>套装</b></span>
          <span class="nav-tab">${icon("bag")}<b>种草</b></span>
          <span class="nav-tab">${icon("settings")}<b>设置</b></span>
        </div>
      </div>
      ${productionShotGrid([
        ["wardrobe_home_390_top.png", "衣橱 Shell", "顶部控件、Toast、圆形 FAB 和底部 Tab 以生产截图为准"],
        ["settings_home_390_top.png", "设置 Shell", "设置页同一底部 Tab，不重新设计页面结构"],
      ])}`;
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
      </div>
      ${productionShotGrid([
        ["confirm_delete_sheet_390_top.png", "删除确认 Sheet", "覆盖层结构以生产截图为准，只优化毛玻璃、圆角和阴影"],
      ])}`;
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
      <div class="intake-contract-demo" data-visual="intake-glass-actions">
        <div class="visual-top-glass intake-topbar-demo">
          <button aria-label="返回">${icon("chevronLeft")}</button>
          <span><b>添加单品</b><small>步骤 1 / 2 · 选择照片</small></span>
          <button aria-label="关闭">${icon("x")}</button>
          <i></i>
        </div>
        <div class="intake-action-grid">
          <button>${icon("camera")}<b>拍照</b><small>打开相机录入</small></button>
          <button>${icon("image")}<b>从图库选择</b><small>最多 20 张</small></button>
        </div>
      </div>
      ${productionShotGrid([
        ["intake_single_step1_empty_390_top.png", "Step 1 空状态", "添加单品 / 选择照片"],
        ["intake_single_step1_imported_390_top.png", "Step 1 已导入", "缩略图、继续拍照、图库入口、清空"],
        ["intake_single_confirm_390_top.png", "Step 2 确认首屏", "已识别单品、重新识别、校对草稿"],
        ["intake_single_confirm_390_bottom.png", "Step 2 保存区", "保存按钮与底部操作栏沿用生产"],
      ])}`;
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
        <div class="toast-style-board">
          <div class="spec-toast success one-line">
            <span class="toast-icon">${icon("check")}</span>
            <span class="toast-copy">已保存 9 件单品，草稿已清空。</span>
            <button class="toast-close" aria-label="关闭">${icon("x")}</button>
          </div>
          <div class="spec-toast info two-line">
            <span class="toast-icon">${icon("info")}</span>
            <span class="toast-copy">尚未配置 MiniMax Key，AI 识别和推荐功能暂不可用。</span>
            <button class="toast-action">前往设置</button>
            <button class="toast-close" aria-label="关闭">${icon("x")}</button>
          </div>
          <div class="spec-toast error three-line">
            <span class="toast-icon">${icon("alert")}</span>
            <span class="toast-copy">保存失败，当前页面草稿已完整保留。请先检查网络连接后直接重试；如果仍然失败，请稍后再试，或返回当前页面继续编辑后重新保存。</span>
            <button class="toast-close" aria-label="关闭">${icon("x")}</button>
          </div>
        </div>
        ${productionShotGrid([
          ["wardrobe_home_390_top.png", "衣橱保存 Toast", "同底部操作区宽，覆盖 FAB"],
          ["outfit_home_390_top.png", "套装创建 Toast", "结构不变，只优化毛玻璃与圆角"],
          ["wishlist_home_390_top.png", "种草添加 Toast", "悬浮于页面与底部导航之上"],
        ])}
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
      ${referenceShotGrid()}`;
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
      --app-ambient: ${APP_AMBIENT_BACKGROUND};
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
      background: var(--app-ambient);
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
      grid-template-columns: 1fr;
      gap: 24px;
      align-items: start;
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
    .production-shot-grid {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 14px;
      align-items: start;
    }
    .production-shot {
      min-width: 0;
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 26px;
      background: rgba(255,255,252,.86);
      box-shadow: var(--soft);
      overflow: hidden;
    }
    .production-shot img {
      display: block;
      width: 100%;
      height: auto;
      background: var(--mist);
    }
    .production-shot figcaption {
      display: grid;
      gap: 4px;
      padding: 10px 12px 12px;
    }
    .production-shot figcaption b { font-size: 12px; line-height: 1.25; }
    .production-shot figcaption span { color: var(--muted); font-size: 10px; line-height: 1.35; font-weight: 800; }
    .reference-grid {
      grid-column: 1 / -1;
      display: grid;
      gap: 16px;
    }
    .reference-shot {
      display: grid;
      grid-template-columns: minmax(220px, 340px) minmax(0, 1fr);
      gap: 14px;
      align-items: stretch;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: rgba(255,255,252,.78);
      box-shadow: var(--soft);
      padding: 12px;
    }
    .reference-shot .production-shot {
      border-radius: 22px;
      box-shadow: none;
    }
    .reference-notes {
      display: grid;
      align-content: start;
      gap: 10px;
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(53,92,125,.08), rgba(255,255,252,.8));
      padding: 14px;
    }
    .reference-notes span {
      width: fit-content;
      border-radius: 999px;
      background: rgba(53,92,125,.12);
      color: var(--denim);
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 900;
    }
    .reference-notes ul {
      margin: 0;
      padding-left: 18px;
    }
    .reference-notes li {
      color: rgba(29,34,40,.72);
      font-size: 12px;
      line-height: 1.55;
      font-weight: 750;
    }
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
      background: var(--app-ambient);
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
    .ambient-board, .ambient-demo {
      min-height: 118px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background: var(--app-ambient);
      box-shadow: inset 0 0 0 1px rgba(255,255,252,.42), var(--soft);
      padding: 16px;
      display: grid;
      align-content: end;
      gap: 6px;
    }
    .ambient-board b, .ambient-demo b { font-size: 13px; }
    .ambient-board span, .ambient-board small, .ambient-demo span {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.4;
      font-weight: 850;
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
      background: transparent;
      border: 0;
      box-shadow: none;
      backdrop-filter: blur(30px) saturate(1.5);
      -webkit-backdrop-filter: blur(30px) saturate(1.5);
    }
    .visual-top-glass span { color: var(--muted); font-size: 11px; font-weight: 800; }
    .shell-topbar-demo, .intake-topbar-demo {
      grid-template-columns: 44px 1fr 44px;
      align-items: center;
      border-bottom: 0;
      background: transparent;
      box-shadow: none;
    }
    .shell-topbar-demo b, .intake-topbar-demo b {
      display: block;
      text-align: center;
      font-size: 13px;
      font-weight: 950;
    }
    .shell-topbar-demo button, .intake-topbar-demo button {
      width: 40px;
      height: 40px;
      border: 1px solid rgba(53,92,125,.13);
      border-radius: 16px;
      background: rgba(255,255,252,.36);
      color: var(--denim);
      display: grid;
      place-items: center;
      box-shadow: none;
    }
    .shell-topbar-demo .demo-icon, .intake-topbar-demo .demo-icon { width: 20px; height: 20px; }
    .intake-topbar-demo { grid-template-rows: auto 5px; row-gap: 10px; }
    .intake-topbar-demo span { color: var(--ink); text-align: center; }
    .intake-topbar-demo small { display: block; color: var(--muted); font-size: 10px; font-weight: 850; }
    .intake-topbar-demo i {
      grid-column: 1 / -1;
      height: 5px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--denim) 0 50%, rgba(29,34,40,.05) 50%);
    }
    .visual-scroll-cards { display: grid; gap: 10px; padding: 16px; }
    .visual-scroll-cards span, .mini-card {
      height: 58px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255,255,252,.82);
    }
    .visual-floating-nav {
      --nav-radius: 30px;
      --nav-padding: 8px;
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 14px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      border: 1px solid rgba(53,92,125,.18);
      border-radius: var(--nav-radius);
      background: rgba(255,255,252,.75);
      padding: var(--nav-padding);
      backdrop-filter: blur(30px) saturate(1.5);
      -webkit-backdrop-filter: blur(30px) saturate(1.5);
    }
    .visual-floating-nav .nav-tab {
      display: grid;
      place-items: center;
      gap: 3px;
      min-height: 54px;
      border-radius: calc(var(--nav-radius) - var(--nav-padding));
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
    }
    .visual-floating-nav .nav-tab b { font-size: 11px; font-weight: 950; }
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
    }
    .temp-bar { overflow: hidden; }
    .temperature-slider { overflow: visible; margin: 8px 13px; }
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
    .thumb-strip button, .bulk-bar button, .focus-demo button, .spec-toast button {
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
      display: grid;
      gap: 10px;
    }
    .toast-style-board {
      display: grid;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: var(--app-ambient);
      padding: 12px;
      overflow: hidden;
    }
    .spec-toast {
      display: grid;
      grid-template-columns: 38px minmax(0, 1fr) auto auto;
      gap: 10px;
      align-items: center;
      min-height: 58px;
      border: 1px solid rgba(29,34,40,.10);
      border-radius: 22px;
      background: rgba(255,255,252,.88);
      box-shadow: 0 18px 50px rgba(29,34,40,.10);
      padding: 9px 10px;
      backdrop-filter: blur(30px) saturate(1.35);
      -webkit-backdrop-filter: blur(30px) saturate(1.35);
    }
    .spec-toast .toast-icon {
      width: 38px;
      height: 38px;
      border-radius: 15px;
      display: grid;
      place-items: center;
      align-self: center;
      justify-self: center;
    }
    .spec-toast .toast-icon .demo-icon { width: 19px; height: 19px; }
    .spec-toast.success .toast-icon { background: rgba(95,112,88,.14); color: var(--moss); }
    .spec-toast.info .toast-icon { background: rgba(53,92,125,.14); color: var(--denim); }
    .spec-toast.error .toast-icon { background: rgba(220,38,38,.10); color: var(--danger); }
    .spec-toast .toast-copy {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      line-height: 18px;
      color: var(--ink);
      font-weight: 900;
    }
    .spec-toast.two-line .toast-copy,
    .spec-toast.three-line .toast-copy {
      white-space: normal;
      display: -webkit-box;
      -webkit-box-orient: vertical;
    }
    .spec-toast.two-line .toast-copy { -webkit-line-clamp: 2; }
    .spec-toast.three-line {
      min-height: 104px;
      align-items: center;
    }
    .spec-toast.three-line .toast-copy {
      max-width: 330px;
      min-height: 54px;
      -webkit-line-clamp: 3;
    }
    .spec-toast .toast-action {
      min-width: 74px;
      min-height: 38px;
      padding: 0 12px;
      border-radius: 15px;
      box-shadow: none;
    }
    .spec-toast .toast-close {
      width: 38px;
      height: 38px;
      padding: 0;
      border-radius: 15px;
      background: rgba(29,34,40,.06);
      color: var(--muted);
      align-self: center;
      justify-self: center;
    }
    .spec-toast .toast-close .demo-icon { width: 17px; height: 17px; margin: auto; }
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
      width: min(520px, 100%);
      justify-self: center;
    }
    .phone-preview .production-shot {
      border-radius: 32px;
      box-shadow: var(--deep);
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
      .reference-shot { grid-template-columns: 1fr; }
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
          ${productionShot("wardrobe_home_390_top.png", "衣橱首页真实生产截图", "只允许优化颜色、圆角、字体、图标和毛玻璃等视觉细节；结构以截图为准。")}
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
