import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(".");
const outDir = join(root, "docs/designs/v0.3-alpha");
const screenshotDir = join(outDir, "screenshots");
const exportsDir = join(outDir, "exports");
const assetsDir = join(outDir, "assets");
const resolution = { width: 390, height: 844 };
const allowIncomplete = process.argv.includes("--allow-incomplete");

const findings = {
  auth_login: [
    f("P0", "top", "认证视觉体系", "登录页仍更像独立网页入口，和主 App 的移动端卡片/玻璃层级不够一致。", "认证入口应纳入主 App 视觉系统，使用同一圆角、按钮和背景 token。", "v0.3-beta 统一 AuthShell 与 App Shell 的视觉 token。"),
    f("P1", "top", "主按钮", "登录主按钮存在 inline fallback 色值风险，不应绕开 denim token。", "主按钮统一使用 primary/denim token，并复用按钮语义。", "将 Auth 主操作迁移到统一 Button 样式。"),
    f("P2", "top", "表单卡片", "登录卡片圆角和间距偏网页化，与 28px 一级卡片目标有差距。", "表单卡片使用移动端一级卡片圆角和紧凑输入区。", "调整 Auth 表单容器圆角、间距和输入高度。"),
  ],
  auth_register: [
    f("P0", "top", "认证视觉体系", "注册页属于用户第一眼入口，但当前没有完全继承主 App 视觉语言。", "注册页应与登录页和主 App 保持统一移动端结构。", "v0.3-beta 将注册/登录统一为同一 Auth 页面系统。"),
    f("P1", "top", "协议区域", "协议勾选、隐私链接和主操作之间层级容易被卡片样式削弱。", "协议区应作为低权重辅助信息，主按钮仍保持清晰。", "整理协议文案区域的间距和强调级别。"),
    f("P2", "top", "输入控件", "手机号、密码、确认密码的圆角和背景需要与正式表单控件收敛。", "输入框使用统一 target-input 半径和背景。", "迁移 Auth 输入框到统一 form token。"),
  ],
  settings_home: [
    f("P1", "top", "设置分组", "设置页存在多类功能入口，卡片层级需要进一步区分账号、AI 和诊断。", "分组标题、入口高度和图标语义统一，减少扫描负担。", "将设置页入口整理为统一 setting row 组件。"),
    f("P2", "top", "MiniMax Key", "配置 Key 是关键入口，视觉上应清楚表达本机保存和当前状态。", "Key 状态、保存结果、失败提示使用统一系统状态样式。", "补强设置页 MiniMax 状态卡。"),
    f("P2", "top", "底部导航", "设置页底部导航需和其他主 Tab 的 active 状态保持完全一致。", "底部导航激活项使用统一 icon、denim 背景和命中区。", "复核 TabBar 在设置页的 active 和 safe area。"),
  ],
  intake_single_step1_empty: [
    f("P1", "top", "录入空态", "空状态入口需要同时清楚表达拍照/图库，但不能像网页上传组件。", "录入 Step 1 使用全屏 mobile shell、明确照片入口和主按钮。", "统一 Step 1 空态卡片和按钮密度。"),
    f("P2", "top", "步骤表达", "录入流程必须只显示两步，不能出现第三步或独立识别步骤。", "选择照片与确认信息两步保持稳定。", "复核录入步骤条文案和进度表达。"),
    f("P2", "top", "底部操作", "空态主按钮在无图片时应禁用或明确不可继续。", "未选择图片前主操作状态清晰，不影响返回。", "补充 Step 1 操作区 disabled 样式。"),
  ],
  intake_single_step1_imported: [
    f("P0", "top", "一次性截图节点", "导入 9 张图片后的队列状态只在 AI 识别前出现，必须作为 alpha 独立截图。", "图片导入后、识别前保留队列、数量和当前图选中态。", "v0.3-beta 保留多图队列的固定视觉合同。"),
    f("P1", "top", "图片队列", "多图缩略图需要避免撑高首屏，当前状态要重点核对纵向空间。", "9 张图队列在 390×844 内可扫描，主按钮可触达。", "收敛队列高度和当前项 Denim 选中边框。"),
    f("P2", "top", "AI 触发", "进入识别前应清楚说明下一步会调用 MiniMax 识别。", "下一步按钮文案保留 AI 识别语义，不新增流程页。", "统一 AI 触发按钮和说明文案。"),
  ],
  intake_single_confirm: [
    f("P1", "top", "确认页首屏", "AI 识别返回后的首屏需要同时展示当前图、识别状态和关键字段，避免用户不知道在核对哪一件。", "顶部显示当前图片、来源、置信度和必要关键字段。", "优化确认页首屏信息密度和当前图定位。"),
    f("P1", "bottom", "保存区域", "批量保存按钮数量必须等于真实可保存数量，底部滚动区要避免按钮被遮住。", "底部显示真实保存数量、失败/部分保存提示和可重试入口。", "加强确认页底部固定/安全区策略。"),
    f("P2", "top", "字段分组", "颜色、分类、温度等字段视觉层级需要和详情页展示态一致。", "复用颜色字段、温度条和分类控件的视觉 token。", "把确认页字段组件逐步迁移到共享展示/编辑控件。"),
    f("P2", "bottom", "错误状态", "识别失败或低置信度的局部状态需要在保存区域附近有明确提示。", "失败草稿可手动补全，重试只影响当前件。", "补齐确认页局部 retry/failed 样式。"),
  ],
  wardrobe_home: [
    f("P1", "top", "瀑布流卡片", "衣橱首页卡片需要严格复用 CatalogWaterfallCardShell 的固定媒体和文本高度。", "2 列卡片图片 3:4、标题截断、meta 不撑高。", "复核首页所有衣物卡片是否仍有私有样式。"),
    f("P2", "top", "顶部筛选", "搜索、分类和统计入口需要统一 icon 语义，不能用文字替代图标。", "使用 lucide Search、BarChart3 等图标并保留 aria-label。", "整理首页工具按钮图标映射。"),
    f("P2", "top", "新建入口", "全局创建入口需要在主 Tab 中保持位置、层级和触控面积一致。", "FAB/新建按钮不遮挡卡片和底部导航。", "统一 global-create 在主 Tab 的布局。"),
  ],
  garment_detail: [
    f("P1", "top", "详情媒体", "单品详情首屏需要主图、标题、meta 分层清楚，避免图片卡片包住过多信息。", "DetailShell 主图为稳定 3:4，标题和快捷操作在媒体下方。", "收敛单品详情首屏到 DetailShell 目标结构。"),
    f("P1", "info", "颜色与温度", "信息区应使用色卡和温度条，不应退回纯文本表达。", "ItemColorFields view 模式和温度视窗在详情页一致。", "迁移详情信息区到共享颜色/温度组件。"),
    f("P2", "bottom", "AI 建议", "底部 AI 建议、备注和操作区应保持信息卡层级，不要混成普通段落。", "AI 建议使用 clay 语义，危险操作放入更多菜单。", "整理详情底部信息卡和更多操作。"),
  ],
  confirm_delete_sheet: [
    f("P0", "top", "危险确认", "删除确认是破坏性一次性节点，截图和人工评审不能误触确认。", "Sheet 内必须有明确标题、具体删除对象、取消和危险按钮。", "v0.3-beta 强化所有危险操作的 ConfirmActionSheet 合同。"),
    f("P1", "top", "遮罩层", "Sheet 遮罩、面板圆角和按钮布局需要与 MotionSheet 保持一致。", "遮罩锁定底层滚动，面板最高 92vh，圆角统一。", "统一删除确认 Sheet 视觉参数。"),
    f("P2", "top", "文案", "危险按钮文案应具体到操作对象，不能只写确定。", "按钮写删除衣物/删除套装/删除种草，取消按钮始终可见。", "补齐危险操作文案表。"),
  ],
  outfit_home: [
    f("P1", "top", "套装卡片", "套装首页需要区分套装封面、组成件数量和场景标签。", "套装卡片复用列表 shell，但使用套装语义图标和标签。", "统一套装卡片字段映射。"),
    f("P2", "top", "创建入口", "添加套装入口和衣橱添加入口应共享全局创建 Sheet 规则。", "主 Tab 新建行为、图标和文案一致。", "复核 global-create 下套装入口的视觉。"),
    f("P2", "top", "空/少数据状态", "正式测试新建套装后首页应展示真实服务器读回内容。", "首页只展示服务器返回数据，不依赖本地缓存占位。", "保留线上读回后的卡片状态作为回归基线。"),
  ],
  outfit_detail: [
    f("P1", "top", "套装首屏", "套装详情首屏需要把封面、名称和组成摘要分清，不应像单品详情完全复刻。", "封面、组成件和快捷操作有套装语义。", "为套装详情补齐 DetailShell 套装 variant。"),
    f("P1", "info", "组成件信息", "信息区应清楚列出组成衣物、场景、季节和温度。", "组成件使用小图 + 名称 + 标签，不撑高布局。", "统一套装详情组成件卡片。"),
    f("P2", "bottom", "计划与穿着", "底部计划、近期穿着和 AI 建议需要清楚区分。", "计划入口、AI 建议和备注使用独立信息块。", "整理套装详情底部信息架构。"),
  ],
  outfit_calendar: [
    f("P1", "top", "二级页顶部", "月历是套装子页面，应使用 AppSubPageTopBar 而非主页面顶部。", "标题为穿搭计划，返回到套装首页，底部导航不显示。", "统一月历页二级导航结构。"),
    f("P2", "top", "日期可读性", "390×844 下日期格需要兼顾点击面积和计划标记。", "日期格最小 44px 命中区，计划标记不遮挡数字。", "复核月历网格密度。"),
    f("P2", "top", "计划状态", "计划项颜色应使用 success/moss，而不是临时高亮色。", "计划状态、今天、选中态都有固定 token。", "完善日历状态 token。"),
  ],
  wishlist_home: [
    f("P1", "top", "种草语义", "种草首页需要和衣橱卡片共享结构，但保留 shopping/berry 语义。", "商品图、价格/状态、购买意向用统一字段层级。", "统一 Wishlist 卡片和衣橱卡片的 shell 差异。"),
    f("P2", "top", "筛选状态", "待买/已买/不感兴趣等状态不应挤占首屏主要内容。", "状态筛选紧凑、可横向滚动、不造成横向页面溢出。", "整理种草筛选条。"),
    f("P2", "top", "添加入口", "添加种草入口应和添加衣物入口共享录入两步模型。", "从图库选择、AI 识别和保存数量文案保持一致。", "复核 wishlist intake 入口文案。"),
  ],
  wishlist_detail: [
    f("P1", "top", "商品媒体", "种草详情首屏应突出商品图和购买判断，不应完全套用衣物详情信息优先级。", "商品图、名称、价格/状态和买前评估入口分层。", "定义 Wishlist DetailShell variant。"),
    f("P1", "info", "买前评估", "信息区需要清楚表达适配度、已有相似单品和购买风险。", "买前评估使用独立信息块和 berry/ai 语义。", "整理种草详情买前评估视觉。"),
    f("P2", "bottom", "转入衣橱", "底部加入衣橱、已买、不感兴趣等操作需要危险/成功语义清楚。", "转入衣橱和归档类操作分组显示，保留确认。", "统一种草详情底部操作区。"),
  ],
};

const states = [
  state("auth_login", "登录页", "认证", "入口页", [seg("top", "首屏", "auth_login", "auth_login_top", "登录页", "手机号/密码登录入口")]),
  state("auth_register", "注册页", "认证", "入口页", [seg("top", "首屏", "auth_register", "auth_register_top", "注册页", "手机号注册、密码与协议勾选")]),
  state("settings_home", "设置首页", "设置", "主页面", [seg("top", "首屏", "settings_home", "settings_home_top", "设置首页", "登录后设置与 MiniMax 配置入口")]),
  state("intake_single_step1_empty", "单品录入 Step 1 空状态", "录入", "录入流", [seg("top", "首屏", "intake_single_step1_empty", "intake_step1_empty", "选择单品照片", "未导入图片前的正式录入入口")]),
  state("intake_single_step1_imported", "单品图片导入后", "录入", "录入流", [seg("top", "首屏", "intake_single_step1_imported", "intake_step1_imported", "图片已导入", "9 张图片导入后、AI 识别前的一次性状态")]),
  state("intake_single_confirm", "单品录入确认信息", "录入", "录入流", [
    seg("top", "首屏", "intake_single_confirm", "intake_confirm_top", "识别确认首屏", "live MiniMax 识别后的关键字段上半部分"),
    seg("bottom", "底部", "intake_single_confirm", "intake_confirm_bottom", "识别确认底部", "live MiniMax 识别后的字段下半部分和保存区域"),
  ]),
  state("wardrobe_home", "衣橱首页", "衣橱", "主页面", [seg("top", "首屏", "wardrobe_home", "wardrobe_home_top", "衣橱首页", "服务器读回后的衣物瀑布流")]),
  state("garment_detail", "单品详情页", "衣橱", "详情页", [
    seg("top", "首屏", "garment_detail", "garment_detail_top", "单品详情首屏", "顶部栏、主图、标题和快捷操作"),
    seg("info", "信息区", "garment_detail", "garment_detail_info", "单品详情信息区", "基础信息、颜色、温度和状态"),
    seg("bottom", "底部", "garment_detail", "garment_detail_bottom", "单品详情底部", "AI 建议、备注和更多操作前的末尾区域"),
  ]),
  state("confirm_delete_sheet", "删除确认 Sheet", "Overlay", "弹层", [seg("top", "首屏", "confirm_delete_sheet", "delete_sheet_top", "删除确认", "详情页更多菜单触发的危险确认弹层")]),
  state("outfit_home", "套装首页", "套装", "主页面", [seg("top", "首屏", "outfit_home", "outfit_home_top", "套装首页", "正式创建套装后的服务器读回列表")]),
  state("outfit_detail", "套装详情页", "套装", "详情页", [
    seg("top", "首屏", "outfit_detail", "outfit_detail_top", "套装详情首屏", "封面、名称、组成摘要和快捷操作"),
    seg("info", "信息区", "outfit_detail", "outfit_detail_info", "套装详情信息区", "组成件、场景、季节和温度"),
    seg("bottom", "底部", "outfit_detail", "outfit_detail_bottom", "套装详情底部", "计划、近期穿着、AI 建议和备注"),
  ]),
  state("outfit_calendar", "套装月历页", "套装", "子页面", [seg("top", "首屏", "outfit_calendar", "outfit_calendar_top", "穿搭计划月历", "套装子页面月历视图")]),
  state("wishlist_home", "种草首页", "种草", "主页面", [seg("top", "首屏", "wishlist_home", "wishlist_home_top", "种草首页", "正式创建种草后的服务器读回列表")]),
  state("wishlist_detail", "种草详情页", "种草", "详情页", [
    seg("top", "首屏", "wishlist_detail", "wishlist_detail_top", "种草详情首屏", "商品图、名称、购买状态和主操作"),
    seg("info", "信息区", "wishlist_detail", "wishlist_detail_info", "种草详情信息区", "买前评估、相似单品和字段信息"),
    seg("bottom", "底部", "wishlist_detail", "wishlist_detail_bottom", "种草详情底部", "加入衣橱、已买、不感兴趣和备注"),
  ]),
];

function f(level, segment, area, finding, expected, betaSuggestion) {
  return { level, segment, area, finding, expected, betaSuggestion };
}

function seg(id, label, stateId, kind, title, summary) {
  return {
    id,
    label,
    screenshot: `screenshots/${stateId}_390_${id}.png`,
    designBaseline: { kind, title, summary },
  };
}

function state(id, title, module, type, segments) {
  return {
    id,
    title,
    module,
    type,
    segments,
    aiFindings: findings[id],
  };
}

function gitValue(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function readCaptureManifest() {
  const path = join(outDir, "live-capture-manifest.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildData() {
  const captureManifest = readCaptureManifest();
  return {
    version: "v0.3-alpha",
    title: "衣橱穿搭助手 v0.3-alpha 视觉评审台",
    resolution,
    source: "live_business_flow",
    generatedAt: new Date().toISOString(),
    validatedAgainstCommit: gitValue(["rev-parse", "HEAD"]),
    validatedAgainstBranch: gitValue(["branch", "--show-current"]),
    captureManifestAvailable: Boolean(captureManifest),
    captureManifest,
    notes: [
      "截图来自正式登录、注册、MiniMax Key 配置、图片导入、live MiniMax 识别、保存并从服务器读回的真实业务流程。",
      "原计划 image_source_sheet 已被最新正式流程中的 intake_single_step1_imported 替换；该状态在导入 9 张图片后、点击 AI 识别前截图。",
      "本阶段只做 alpha 视觉评审工具和基线，不进入 v0.3-beta/rc UI 迁移。",
    ],
    states,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(data) {
  const embedded = JSON.stringify(data, null, 2).replace(/<\//g, "<\\/");
  return `<!doctype html>
<!-- DO NOT EDIT BY HAND. Generated by scripts/generate-v03-alpha-visual-review.mjs -->
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.title)} / ${data.resolution.width}×${data.resolution.height}</title>
  <link rel="stylesheet" href="assets/visual-review.css">
</head>
<body>
  <div class="review-app">
    <header class="topbar">
      <div>
        <h1>${escapeHtml(data.title)}</h1>
        <p>390×844 / 正式业务流截图 / 图片导入后截图 / live MiniMax 识别确认页截图 / 不进入 beta 迁移</p>
      </div>
      <div class="topbar-actions">
        <button class="button" id="export-json" type="button">导出 JSON</button>
        <button class="ghost-button" id="export-markdown" type="button">导出 Markdown</button>
        <button class="danger-button" id="clear-review" type="button">清空本地意见</button>
      </div>
    </header>
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2>页面状态</h2>
          <div class="filters" id="filters">
            <button class="filter-button is-active" data-filter="all" type="button">全部</button>
            <button class="filter-button" data-filter="p0" type="button">只看 P0</button>
            <button class="filter-button" data-filter="p1" type="button">只看 P1</button>
            <button class="filter-button" data-filter="unreviewed" type="button">只看未评审</button>
            <button class="filter-button" data-filter="auth" type="button">认证</button>
            <button class="filter-button" data-filter="detail" type="button">详情页</button>
            <button class="filter-button" data-filter="intake" type="button">录入</button>
            <button class="filter-button" data-filter="overlay" type="button">Overlay</button>
          </div>
        </div>
        <div class="state-list" id="state-list"></div>
      </aside>
      <main class="stage">
        <div class="state-title" id="state-title"></div>
        <div class="segment-tabs" id="segment-tabs"></div>
        <div class="comparison">
          <section class="phone-column">
            <h3>v0.3 目标设计基线</h3>
            <div id="target-mock"></div>
          </section>
          <section class="phone-column">
            <h3>当前真实截图基线</h3>
            <div id="current-screenshot"></div>
          </section>
        </div>
      </main>
      <aside class="review-panel">
        <section class="panel-section">
          <h2>AI 差异清单</h2>
          <div class="findings" id="findings"></div>
        </section>
        <section class="panel-section">
          <h2>人工评审意见</h2>
          <div id="human-review"></div>
          <div class="save-state" id="save-state"></div>
          <p class="footer-note">意见仅保存在本机 localStorage。导出 JSON/Markdown 后可交给 v0.3-beta 迁移 agent 使用。</p>
        </section>
      </aside>
    </div>
  </div>
  <script type="application/json" id="visual-review-data">${embedded}</script>
  <script src="assets/visual-review.js"></script>
</body>
</html>
`;
}

function renderMigrationList(data) {
  const groups = { P0: [], P1: [], P2: [], None: [] };
  for (const state of data.states) {
    for (const finding of state.aiFindings) {
      groups[finding.level].push({ state, finding });
    }
  }
  const lines = [
    "# v0.3-beta 候选迁移清单（alpha 初稿）",
    "",
    `生成时间：${data.generatedAt}`,
    `截图来源：${data.source}`,
    "",
    "本文件由 v0.3-alpha 视觉评审台生成，只作为 beta 候选池；不得直接视为已批准的 UI 迁移需求。",
    "",
  ];
  for (const level of ["P0", "P1", "P2"]) {
    lines.push(`## ${level}`, "");
    for (const { state, finding } of groups[level]) {
      lines.push(`- ${state.title}（${state.id} / ${finding.segment} / ${finding.area}）：${finding.betaSuggestion}`);
    }
    lines.push("");
  }
  lines.push("## None / 观察项", "");
  for (const { state, finding } of groups.None) {
    lines.push(`- ${state.title}（${state.id} / ${finding.segment}）：${finding.finding}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function ensureFiles(data) {
  const missing = [];
  if (!data.captureManifestAvailable) missing.push("live-capture-manifest.json");
  if (data.captureManifest && data.captureManifest.captures?.length !== 21) {
    missing.push(`live-capture-manifest.json: expected 21 captures, got ${data.captureManifest.captures?.length ?? 0}`);
  }
  for (const state of data.states) {
    if (!state.aiFindings || state.aiFindings.length < 3) missing.push(`${state.id}: fewer than 3 findings`);
    for (const segment of state.segments) {
      const shotPath = join(outDir, segment.screenshot);
      if (!existsSync(shotPath)) missing.push(segment.screenshot);
    }
  }
  if (missing.length) {
    const message = [
      `v0.3-alpha incomplete: ${missing.length} screenshot/data prerequisite(s) missing.`,
      ...missing.slice(0, 28).map((entry) => `- ${entry}`),
    ].join("\n");
    if (!allowIncomplete) throw new Error(message);
    console.warn(message);
  }
}

function main() {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(screenshotDir, { recursive: true });
  mkdirSync(exportsDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });
  const data = buildData();
  ensureFiles(data);
  writeFileSync(join(outDir, "visual-review-data.json"), `${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(join(outDir, "visual-review.html"), renderHtml(data));
  writeFileSync(join(outDir, "beta-migration-list.md"), renderMigrationList(data));
  console.log(`v0.3-alpha visual review generated: ${join(outDir, "visual-review.html")}`);
}

main();
