(function () {
  const dataNode = document.getElementById("visual-review-data");
  const data = JSON.parse(dataNode.textContent);
  const storageKey = "wardrobe-v03-alpha-human-review";
  const stateList = document.getElementById("state-list");
  const filters = document.getElementById("filters");
  const stateTitle = document.getElementById("state-title");
  const segmentTabs = document.getElementById("segment-tabs");
  const targetMount = document.getElementById("target-mock");
  const screenshotMount = document.getElementById("current-screenshot");
  const findingsMount = document.getElementById("findings");
  const reviewMount = document.getElementById("human-review");
  const saveState = document.getElementById("save-state");
  const exportJsonButton = document.getElementById("export-json");
  const exportMarkdownButton = document.getElementById("export-markdown");
  const clearButton = document.getElementById("clear-review");

  let selectedStateId = data.states[0].id;
  let selectedSegmentId = data.states[0].segments[0].id;
  let activeFilter = "all";
  let reviews = readReviews();

  function readReviews() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch (error) {
      console.warn(error);
      return {};
    }
  }

  function writeReviews() {
    localStorage.setItem(storageKey, JSON.stringify(reviews, null, 2));
    saveState.textContent = "已自动保存";
    window.setTimeout(() => {
      saveState.textContent = "";
    }, 1200);
  }

  function reviewFor(stateId) {
    reviews[stateId] ||= {
      reviewStatus: "unreviewed",
      humanNotes: "",
      segmentNotes: {},
      betaPriority: "none",
      betaInstruction: "",
      updatedAt: null,
    };
    return reviews[stateId];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function severityFor(state) {
    const rank = { P0: 0, P1: 1, P2: 2, None: 3 };
    return state.aiFindings
      .map((finding) => finding.level)
      .sort((a, b) => rank[a] - rank[b])[0] || "None";
  }

  function levelClass(level) {
    return String(level).toLowerCase();
  }

  function statusLabel(status) {
    return {
      unreviewed: "未评审",
      approved: "通过",
      needs_changes: "需要调整",
      deferred: "暂缓",
    }[status] || "未评审";
  }

  function filteredStates() {
    return data.states.filter((state) => {
      const severity = severityFor(state);
      const review = reviewFor(state.id);
      if (activeFilter === "all") return true;
      if (activeFilter === "p0") return severity === "P0";
      if (activeFilter === "p1") return severity === "P1";
      if (activeFilter === "unreviewed") return review.reviewStatus === "unreviewed";
      if (activeFilter === "auth") return state.module === "认证";
      if (activeFilter === "detail") return state.type === "详情页";
      if (activeFilter === "intake") return state.module === "录入";
      if (activeFilter === "overlay") return state.module === "Overlay";
      return true;
    });
  }

  function render() {
    const state = data.states.find((entry) => entry.id === selectedStateId) || data.states[0];
    selectedStateId = state.id;
    const segment = state.segments.find((entry) => entry.id === selectedSegmentId) || state.segments[0];
    selectedSegmentId = segment.id;
    renderFilters();
    renderStateList();
    renderStateTitle(state, segment);
    renderSegmentTabs(state);
    targetMount.innerHTML = renderTarget(state, segment);
    screenshotMount.innerHTML = segment.screenshot
      ? `<img class="current-shot" src="${escapeHtml(segment.screenshot)}" width="390" height="844" alt="${escapeHtml(state.title)} ${escapeHtml(segment.label)} 当前截图">`
      : `<div class="missing-shot">截图缺失<br>${escapeHtml(state.id)} / ${escapeHtml(segment.id)}</div>`;
    renderFindings(state, segment);
    renderReview(state, segment);
  }

  function renderFilters() {
    for (const button of filters.querySelectorAll("button")) {
      button.classList.toggle("is-active", button.dataset.filter === activeFilter);
    }
  }

  function renderStateList() {
    stateList.innerHTML = filteredStates().map((state) => {
      const severity = severityFor(state);
      const review = reviewFor(state.id);
      return `
        <button class="state-card ${state.id === selectedStateId ? "is-active" : ""}" type="button" data-state-id="${escapeHtml(state.id)}">
          <strong>${escapeHtml(state.title)}</strong>
          <code>${escapeHtml(state.id)}</code>
          <div class="state-meta">
            <span class="badge">${escapeHtml(state.module)}</span>
            <span class="badge">${escapeHtml(state.segments.length)} 段</span>
          </div>
          <div class="badge-row">
            <span class="badge ${levelClass(severity)}">${escapeHtml(severity)}</span>
            <span class="badge">${escapeHtml(statusLabel(review.reviewStatus))}</span>
          </div>
        </button>`;
    }).join("");
  }

  function renderStateTitle(state, segment) {
    stateTitle.innerHTML = `
      <div>
        <h2>${escapeHtml(state.title)} · ${escapeHtml(segment.label)}</h2>
        <p>${escapeHtml(state.id)} / ${escapeHtml(state.module)} / ${escapeHtml(state.type)} / ${escapeHtml(segment.designBaseline.summary)}</p>
      </div>
      <div class="badge-row">
        <span class="badge">${escapeHtml(data.resolution.width)}×${escapeHtml(data.resolution.height)}</span>
        <span class="badge">${escapeHtml(data.source)}</span>
      </div>`;
  }

  function renderSegmentTabs(state) {
    segmentTabs.innerHTML = state.segments.map((segment) => `
      <button class="segment-tab ${segment.id === selectedSegmentId ? "is-active" : ""}" type="button" data-segment-id="${escapeHtml(segment.id)}">
        ${escapeHtml(segment.label)} · ${escapeHtml(segment.id)}
      </button>`).join("");
  }

  function renderFindings(state, segment) {
    const ordered = state.aiFindings
      .filter((finding) => finding.segment === segment.id || finding.segment === "all")
      .concat(state.aiFindings.filter((finding) => finding.segment !== segment.id && finding.segment !== "all"));
    findingsMount.innerHTML = ordered.map((finding) => `
      <article class="finding">
        <div class="badge-row">
          <span class="badge ${levelClass(finding.level)}">${escapeHtml(finding.level)}</span>
          <span class="badge">${escapeHtml(finding.segment)}</span>
          <span class="badge">${escapeHtml(finding.area)}</span>
        </div>
        <strong>${escapeHtml(finding.finding)}</strong>
        <p>目标：${escapeHtml(finding.expected)}</p>
        <p>beta 候选：${escapeHtml(finding.betaSuggestion)}</p>
      </article>`).join("");
  }

  function renderReview(state, segment) {
    const review = reviewFor(state.id);
    review.segmentNotes ||= {};
    reviewMount.innerHTML = `
      <div class="field">
        <label for="review-status">评审结论</label>
        <select id="review-status">
          ${option("unreviewed", "未评审", review.reviewStatus)}
          ${option("approved", "通过", review.reviewStatus)}
          ${option("needs_changes", "需要调整", review.reviewStatus)}
          ${option("deferred", "暂缓", review.reviewStatus)}
        </select>
      </div>
      <div class="field">
        <label for="human-notes">页面整体意见</label>
        <textarea id="human-notes" placeholder="记录这个页面状态的整体视觉判断">${escapeHtml(review.humanNotes)}</textarea>
      </div>
      <div class="field">
        <label for="segment-notes">当前分段意见：${escapeHtml(segment.label)}</label>
        <textarea id="segment-notes" placeholder="记录 ${escapeHtml(segment.id)} 分段的具体问题">${escapeHtml(review.segmentNotes[segment.id] || "")}</textarea>
      </div>
      <div class="field">
        <label for="beta-priority">beta 优先级</label>
        <select id="beta-priority">
          ${option("none", "none", review.betaPriority)}
          ${option("p0", "p0", review.betaPriority)}
          ${option("p1", "p1", review.betaPriority)}
          ${option("p2", "p2", review.betaPriority)}
        </select>
      </div>
      <div class="field">
        <label for="beta-instruction">给 beta 迁移的人工指令</label>
        <textarea id="beta-instruction" placeholder="只写给 v0.3-beta 的明确迁移要求">${escapeHtml(review.betaInstruction)}</textarea>
      </div>`;

    bindReviewField("review-status", (value) => { review.reviewStatus = value; });
    bindReviewField("human-notes", (value) => { review.humanNotes = value; });
    bindReviewField("segment-notes", (value) => { review.segmentNotes[segment.id] = value; });
    bindReviewField("beta-priority", (value) => { review.betaPriority = value; });
    bindReviewField("beta-instruction", (value) => { review.betaInstruction = value; });
  }

  function option(value, label, current) {
    return `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function bindReviewField(id, setter) {
    const node = document.getElementById(id);
    node.addEventListener("input", () => {
      const review = reviewFor(selectedStateId);
      setter(node.value, review);
      review.updatedAt = new Date().toISOString();
      writeReviews();
      renderStateList();
    });
  }

  function renderTarget(state, segment) {
    if (state.id === "confirm_delete_sheet") return renderDeleteSheet();
    if (state.module === "认证") return renderAuth(state, segment);
    if (state.id === "settings_home") return renderSettings();
    if (state.id === "outfit_calendar") return renderCalendar();
    if (state.module === "录入") return renderIntake(state, segment);
    if (state.type === "详情页") return renderDetail(state, segment);
    return renderHome(state);
  }

  function renderShell(title, content, options = {}) {
    const bottom = options.bottom === false ? "" : `
      <nav class="target-bottom-nav" aria-label="目标底部导航">
        <span class="${options.active === "wardrobe" ? "active" : ""}">衣橱</span>
        <span class="${options.active === "outfit" ? "active" : ""}">套装</span>
        <span class="${options.active === "wishlist" ? "active" : ""}">种草</span>
        <span class="${options.active === "settings" ? "active" : ""}">设置</span>
      </nav>`;
    return `
      <div class="phone-shell">
        <header class="target-top-bar"><strong>${escapeHtml(title)}</strong><span class="target-chip">${escapeHtml(options.action || "390")}</span></header>
        <main class="target-content ${options.bottom === false ? "no-bottom" : ""}">${content}</main>
        ${bottom}
      </div>`;
  }

  function renderAuth(state) {
    const isRegister = state.id === "auth_register";
    return `
      <div class="phone-shell">
        <div class="target-auth-card">
          <div class="target-chip">衣橱穿搭助手</div>
          <h2 class="target-title">${isRegister ? "创建账号" : "欢迎回来"}</h2>
          <p class="target-subtitle">认证入口纳入主 App 视觉系统，圆角、按钮和输入框与移动端一致。</p>
          <div class="target-section-card target-list">
            <div class="target-input">手机号</div>
            <div class="target-input">密码</div>
            ${isRegister ? '<div class="target-input">确认密码</div>' : ""}
          </div>
          <div class="target-button-row">
            <span class="target-button-primary">${isRegister ? "注册" : "登录"}</span>
            <span class="target-button-secondary">${isRegister ? "返回登录" : "去注册"}</span>
          </div>
        </div>
      </div>`;
  }

  function renderSettings() {
    return renderShell("设置", `
      <section class="target-card">
        <h2 class="target-title">账号与 AI</h2>
        <p class="target-subtitle">MiniMax、账号管理、诊断上传保持同一设置卡片节奏。</p>
        <div class="target-section-card target-list">
          <span class="target-chip">配置 Key</span>
          <span class="target-chip">管理账号</span>
          <span class="target-chip">上传诊断数据</span>
        </div>
      </section>
      <section class="target-section-card">
        <div class="target-button-row"><span class="target-button-secondary">位置</span><span class="target-button-secondary">参考照片</span></div>
      </section>`, { active: "settings", action: "Settings" });
  }

  function renderHome(state) {
    const active = state.module === "衣橱" ? "wardrobe" : state.module === "套装" ? "outfit" : "wishlist";
    const title = state.module === "衣橱" ? "衣橱" : state.module === "套装" ? "套装" : "种草";
    return renderShell(title, `
      <section class="target-card">
        <h2 class="target-title">${escapeHtml(state.title)}</h2>
        <p class="target-subtitle">首页卡片应复用瀑布流 shell，图片比例、标题截断、状态徽标保持一致。</p>
      </section>
      <section class="target-grid" style="margin-top: 14px;">
        ${Array.from({ length: 4 }).map((_, index) => `
          <div class="target-card target-mini-card">
            <div class="target-hero-image">${index + 1}</div>
            <div class="target-subtitle">名称 · 标签</div>
          </div>`).join("")}
      </section>`, { active, action: "新建" });
  }

  function renderDetail(state, segment) {
    const isOutfit = state.module === "套装";
    const isWishlist = state.module === "种草";
    const title = isOutfit ? "套装详情" : isWishlist ? "种草详情" : "单品详情";
    const contentBySegment = {
      top: `
        <section class="target-detail-top">
          <div class="target-card">
            <div class="target-hero-image">3:4 主图</div>
            <h2 class="target-title">${isOutfit ? "通勤轻户外套装" : isWishlist ? "浅蓝防晒外套" : "蓝色冲锋衣"}</h2>
            <p class="target-subtitle">标题、meta 和快捷操作不挤进媒体框，保持详情页统一层级。</p>
            <div class="target-button-row"><span class="target-button-primary">穿搭</span><span class="target-button-secondary">编辑</span></div>
          </div>
        </section>`,
      info: `
        <section class="target-detail-info">
          <div class="target-section-card"><span class="target-chip">基础信息</span><h2 class="target-title">颜色与分类</h2><span class="target-color-swatch">蓝色</span></div>
          <div class="target-section-card"><span class="target-chip">温度</span><div class="meter"></div><p class="target-subtitle">8℃ - 18℃，只显示有效上下文窗口。</p></div>
          <div class="target-section-card"><span class="target-chip">状态</span><p class="target-subtitle">收藏、季节、正式度和穿着属性使用统一 chip。</p></div>
        </section>`,
      bottom: `
        <section class="target-detail-bottom">
          <div class="target-section-card"><span class="target-chip">AI 建议</span><p class="target-subtitle">建议、备注和风险说明使用同一信息卡样式。</p></div>
          <div class="target-section-card"><span class="target-chip">操作区</span><div class="target-button-row"><span class="target-button-secondary">更多</span><span class="target-button-primary">保存调整</span></div></div>
        </section>`,
    };
    return renderShell(title, contentBySegment[segment.id] || contentBySegment.top, { bottom: false, action: segment.id });
  }

  function renderCalendar() {
    return renderShell("穿搭计划", `
      <section class="target-card">
        <h2 class="target-title">本月穿搭</h2>
        <p class="target-subtitle">月历页保持二级页顶部栏、计划日期清晰可点。</p>
        <div class="target-calendar">
          ${Array.from({ length: 35 }).map((_, index) => `<span class="${[5, 12, 19].includes(index) ? "planned" : ""}">${index + 1}</span>`).join("")}
        </div>
      </section>`, { bottom: false, action: "月历" });
  }

  function renderIntake(state, segment) {
    const isImported = state.id === "intake_single_step1_imported";
    const isConfirm = state.id === "intake_single_confirm";
    const content = isConfirm ? `
      <section class="target-intake-shell">
        <div class="target-card"><div class="target-hero-image">识别结果图</div><h2 class="target-title">核对 AI 识别结果</h2><p class="target-subtitle">当前分段：${escapeHtml(segment.label)}</p></div>
        <div class="target-section-card target-list">
          <div class="target-input">名称 · 分类 · 颜色</div>
          <div class="target-input">季节 · 温度 · 场景</div>
          <div class="target-button-primary">保存 9 件单品</div>
        </div>
      </section>` : `
      <section class="target-intake-shell">
        <div class="target-card">
          <h2 class="target-title">选择单品照片</h2>
          <p class="target-subtitle">${isImported ? "9 张图片已导入，下一步才发送到 AI 识别。" : "空状态只展示拍照和图库入口，不创建额外步骤。"}</p>
          ${isImported ? '<div class="image-queue"><span></span><span></span><span></span><span></span><span></span><span></span></div>' : '<div class="target-hero-image">待选择照片</div>'}
          <div class="target-button-row"><span class="target-button-secondary">从图库选择</span><span class="target-button-primary">下一步（AI 识别）</span></div>
        </div>
      </section>`;
    return renderShell(isConfirm ? "确认信息" : "选择照片", content, { bottom: false, action: "录入" });
  }

  function renderDeleteSheet() {
    return `
      <div class="phone-shell">
        <main class="target-content no-bottom">
          <section class="target-card"><div class="target-hero-image">详情页背景</div><h2 class="target-title">蓝色冲锋衣</h2></section>
        </main>
        <div class="target-sheet">
          <section class="target-sheet-panel">
            <span class="target-chip">危险操作</span>
            <h2 class="target-title">删除这件衣物？</h2>
            <p class="target-subtitle">确认文案必须具体，取消按钮和删除按钮保持清晰区分。</p>
            <div class="target-button-row"><span class="target-button-secondary">取消</span><span class="target-button-primary" style="background: var(--danger);">删除衣物</span></div>
          </section>
        </div>
      </div>`;
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportPayload() {
    return {
      version: data.version,
      exportedAt: new Date().toISOString(),
      resolution: data.resolution,
      states: data.states.map((state) => ({
        id: state.id,
        title: state.title,
        module: state.module,
        type: state.type,
        segments: state.segments,
        aiFindings: state.aiFindings,
        humanReview: reviewFor(state.id),
      })),
    };
  }

  function exportMarkdown(payload) {
    return [
      `# v0.3-alpha 人工视觉评审`,
      ``,
      `- 导出时间：${payload.exportedAt}`,
      `- 视口：${payload.resolution.width}×${payload.resolution.height}`,
      ``,
      ...payload.states.flatMap((state) => [
        `## ${state.title} (${state.id})`,
        ``,
        `- 评审结论：${statusLabel(state.humanReview.reviewStatus)}`,
        `- beta 优先级：${state.humanReview.betaPriority}`,
        `- 整体意见：${state.humanReview.humanNotes || "未填写"}`,
        `- beta 指令：${state.humanReview.betaInstruction || "未填写"}`,
        ``,
        `### 分段意见`,
        ...state.segments.map((segment) => `- ${segment.id}：${state.humanReview.segmentNotes?.[segment.id] || "未填写"}`),
        ``,
        `### AI 差异`,
        ...state.aiFindings.map((finding) => `- [${finding.level}] ${finding.segment} / ${finding.area}：${finding.finding}；建议：${finding.betaSuggestion}`),
        ``,
      ]),
    ].join("\n");
  }

  stateList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-state-id]");
    if (!card) return;
    selectedStateId = card.dataset.stateId;
    selectedSegmentId = (data.states.find((state) => state.id === selectedStateId)?.segments[0] || {}).id;
    render();
  });

  segmentTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-segment-id]");
    if (!tab) return;
    selectedSegmentId = tab.dataset.segmentId;
    render();
  });

  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    activeFilter = button.dataset.filter;
    render();
  });

  exportJsonButton.addEventListener("click", () => {
    download("v03-alpha-human-review.json", JSON.stringify(exportPayload(), null, 2), "application/json");
  });

  exportMarkdownButton.addEventListener("click", () => {
    download("v03-alpha-human-review.md", exportMarkdown(exportPayload()), "text/markdown");
  });

  clearButton.addEventListener("click", () => {
    if (!window.confirm("清空本机保存的 v0.3-alpha 人工意见？")) return;
    reviews = {};
    localStorage.removeItem(storageKey);
    render();
  });

  render();
})();
