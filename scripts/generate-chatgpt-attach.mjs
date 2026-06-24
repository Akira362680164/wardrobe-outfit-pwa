#!/usr/bin/env node

/**
 * 生成 chatgpt-attach 合并文件包
 * 把项目源码按主题合并到 <=25 个 .md 文件中，供 ChatGPT Projects 附件使用。
 *
 * 用法: node scripts/generate-chatgpt-attach.mjs [输出目录]
 * 默认输出: ~/Desktop/chatgpt-attach/
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = process.argv[2] || join(process.env.HOME, "Desktop", "chatgpt-attach");

// ─── 文件分组定义 ─────────────────────────────────────────────

const FILE_GROUPS = [
  {
    id: "01",
    name: "src-app",
    title: "src/app — Next.js 路由入口",
    description: "Next.js App Router 入口：layout.tsx（HTML 骨架 + Provider 嵌套）和 page.tsx（根路由渲染 WardrobeApp）。",
    files: [
      "src/app/layout.tsx",
      "src/app/page.tsx",
    ],
  },
  {
    id: "02a",
    name: "src-components-shell",
    title: "src/components — 应用壳 / 根组件（shell）",
    description: "应用根组件 WardrobeApp（最大）、motion provider / common 动画底座、Service Worker 注册、6 步录入流程壳、AppRoute 导航控制器（v1.1.7 4A）。",
    files: [
      "src/components/wardrobe-app.tsx",
      "src/components/motion-provider.tsx",
      "src/components/motion-common.tsx",
      "src/components/service-worker-register.tsx",
      "src/components/use-app-navigation-controller.ts",
      "src/components/intake-flow-shell.tsx",
    ],
  },
  {
    id: "02b",
    name: "src-components-intake",
    title: "src/components — 录入流程（intake）",
    description: "单品/种草录入流（共用 GarmentIntakeFlow）、套装录入流、批量 AI 进度面板。",
    files: [
      "src/components/garment-intake-flow.tsx",
      "src/components/outfit-intake-flow.tsx",
      "src/components/batch-ai-progress-panel.tsx",
    ],
  },
  {
    id: "02c",
    name: "src-components-detail",
    title: "src/components — 详情页 / 列表页（detail & list）",
    description: "单品详情 3.0、详情页壳（v1.1.5 新增 detail-shell 统一壳）、沉浸式详情、套装列表、种草列表 2.0、穿着统计。",
    files: [
      "src/components/garment-detail-3.0.tsx",
      "src/components/detail-shell.tsx",
      "src/components/garment-immersive-detail.tsx",
      "src/components/outfit-list-view.tsx",
      "src/components/wishlist-view-2.0.tsx",
      "src/components/wear-statistics-view.tsx",
    ],
  },
  {
    id: "02d",
    name: "src-components-widgets",
    title: "src/components — 交互小部件（widgets）",
    description: "图片预览/裁切/轮播、单品图、套装关联、套装封面、颜色色卡、统一子页面顶部栏（v1.1.7 4A 新增 AppSubPageTopBar）。",
    files: [
      "src/components/selected-images-review.tsx",
      "src/components/image-crop-editor.tsx",
      "src/components/swipe-image-carousel.tsx",
      "src/components/garment-image.tsx",
      "src/components/garment-outfit-associations.tsx",
      "src/components/outfit-cover.tsx",
      "src/components/color-chip.tsx",
      "src/components/app-sub-page-top-bar.tsx",
    ],
  },
  {
    id: "02e",
    name: "src-components-plan",
    title: "src/components — 穿搭计划（outfit planning）",
    description: "Round 6 新增 + v1.1.5 扩展：穿搭计划日历、周计划条、计划添加、单日卡片、套装选择、装箱清单、计划详情视图（v1.1.5 新增）——日历视图 + 7 天计划 + 旅行打包 + 计划详情子模块。",
    files: [
      "src/components/outfit-planning-calendar-view.tsx",
      "src/components/outfit-weekly-plan-strip.tsx",
      "src/components/outfit-plan-add-view.tsx",
      "src/components/outfit-plan-day-card.tsx",
      "src/components/outfit-plan-select-sheet.tsx",
      "src/components/outfit-plan-detail-view.tsx",
      "src/components/plan-packing-checklist-view.tsx",
    ],
  },
  {
    id: "03a",
    name: "src-lib-data",
    title: "src/lib — 数据层 & 图片管线（data & image pipeline）",
    description: "Dexie 数据库 schema / 迁移 / 备份；图片处理（压缩 / 变体 / HEIC 转换 / 缩略图回填）；类型定义；穿着记录 / 统计；中文显示标签（v1.1.4 新增）；衣橱级联删除；数据仓库统一入口（v1.1.7 4B 新增 data-repo）；套装级联删除（v1.1.7 新增 outfit-cascade-delete）。",
    files: [
      "src/lib/types.ts",
      "src/lib/db.ts",
      "src/lib/migrate.ts",
      "src/lib/wardrobe-cascade-delete.ts",
      "src/lib/backup.ts",
      "src/lib/image.ts",
      "src/lib/image-variants.ts",
      "src/lib/garment-image-source.ts",
      "src/lib/native-heic-converter.ts",
      "src/lib/thumbnail.ts",
      "src/lib/thumbnail-runtime.ts",
      "src/lib/thumbnail-backfill.ts",
      "src/lib/wear-records.ts",
      "src/lib/wear-statistics.ts",
      "src/lib/wishlist-display-state.ts",
      "src/lib/display-labels.ts",
      "src/lib/data-repo.ts",
      "src/lib/outfit-cascade-delete.ts",
    ],
  },
  {
    id: "03b",
    name: "src-lib-ai",
    title: "src/lib — AI 调用 & 推荐算法（AI layer）",
    description: "MiniMax M3 调用、录入/套装/种草 AI prompt、AI 推荐、相似度、搭配建议、种草 AI 录入（v1.1.4 新增）。",
    files: [
      "src/lib/device-minimax.ts",
      "src/lib/intake-ai-prompt.ts",
      "src/lib/outfit-ai-prompt.ts",
      "src/lib/outfit-ai-suggestion.ts",
      "src/lib/outfit-ai-metadata.ts",
      "src/lib/wishlist-ai-prompt.ts",
      "src/lib/wishlist-intake-from-ai.ts",
      "src/lib/wishlist-assessment.ts",
      "src/lib/wishlist-conversion.ts",
      "src/lib/recommendations.ts",
      "src/lib/similarity.ts",
      "src/lib/garment-style-advice.ts",
    ],
  },
  {
    id: "03c",
    name: "src-lib-utils",
    title: "src/lib — 工具 / Hooks / 动效 / 杂项（utils）",
    description: "裁切数学、动效 tokens、轮播逻辑、搭配配对、分类目录、自定义 hooks（含 v1.1.4 新增的稳定 Android 返回键 hook）、录入草稿、进度通知、套装封面逻辑、穿搭计划业务逻辑（calendar / planning / wear-sync / packing）、颜色模式归一化（v1.1.5-followup 新增 color-fields）、AppRoute 导航模型（v1.1.7 4A 新增 app-route）。",
    files: [
      "src/lib/cropper-math.ts",
      "src/lib/motion-tokens.ts",
      "src/lib/carousel-logic.ts",
      "src/lib/garment-detail-pairing.ts",
      "src/lib/garment-category-catalog.ts",
      "src/lib/use-keyboard-aware-editable.ts",
      "src/lib/use-local-date-key.ts",
      "src/lib/use-scroll-lock.ts",
      "src/lib/use-soft-ai-progress.ts",
      "src/lib/use-stable-back-handler.ts",
      "src/lib/intake-draft.ts",
      "src/lib/intake-local-draft.ts",
      "src/lib/intake-save-adapters.ts",
      "src/lib/native-progress-notification.ts",
      "src/lib/outfit-cover.ts",
      "src/lib/outfit-calendar.ts",
      "src/lib/outfit-planning.ts",
      "src/lib/outfit-wear-sync.ts",
      "src/lib/color-fields.ts",
      "src/lib/app-route.ts",
      "src/lib/plan-packing.ts",
    ],
  },
  {
    id: "04",
    name: "docs",
    title: "docs/ — 项目历史 & 交接文档",
    description: "docs/ 目录下的项目交接、设计决策、测试计划、bug 复盘等 Markdown 文档。",
    files: [], // dynamically populated
  },
  {
    id: "05",
    name: "configs",
    title: "项目根配置（configs）",
    description: "package.json / tsconfig.json / next.config.ts / capacitor.config.ts / postcss.config.mjs / .eslintrc.json 的合并说明。",
    files: [
      "package.json",
      "tsconfig.json",
      "next.config.ts",
      "capacitor.config.ts",
      "postcss.config.mjs",
      ".eslintrc.json",
    ],
    isConfig: true,
  },
  {
    id: "06",
    name: "AGENTS",
    title: "AGENTS.md（项目 AI 协作主规范）",
    description: "原始文件直接复制。",
    files: ["AGENTS.md"],
    isRaw: true,
  },
  {
    id: "07",
    name: "README",
    title: "README.md（项目入口说明）",
    description: "原始文件直接复制。",
    files: ["README.md"],
    isRaw: true,
  },
  {
    id: "08",
    name: "ENTRY-HINTS",
    title: "入口提示（CLAUDE.md + MINIMAX.md）",
    description: "合并的 AI agent 入口提示：CLAUDE.md（Claude Code 入口） + MINIMAX.md（MiniMax Code 入口）——两个文件都是 ~10 行的简短提示，长期规则都维护在 06-AGENTS.md。",
    files: ["CLAUDE.md", "MINIMAX.md"],
    isRawMerged: true,
  },
  {
    id: "09",
    name: "VERSION_HISTORY",
    title: "VERSION_HISTORY.md（版本与变更记录，已 compact）",
    description: "压缩后的版本历史：保留最近 10 条完整记录 + 14 条老记录按主版本号聚合汇总 + 早期 v0.1.x-v0.9.45-dev 137 条的合并说明 + 末尾历史基线。",
    files: ["VERSION_HISTORY.md"],
    isRaw: true,
  },
];

// ─── 辅助函数 ─────────────────────────────────────────────────

function detectExports(content, ext) {
  const exports = [];
  const lines = content.split("\n");

  for (const line of lines) {
    // export const / let / var / function / class / type / interface / default
    let m;
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;

    // export const/let/var/function/class
    m = trimmed.match(/^export\s+(const|let|var|function|class|type|interface|enum|abstract|async)\s+(\w+)/);
    if (m) {
      exports.push(m[2]);
      continue;
    }
    // export default function/class
    m = trimmed.match(/^export\s+default\s+(function|class)\s+(\w+)/);
    if (m) {
      exports.push(m[2]);
      continue;
    }
    // export { ... }
    m = trimmed.match(/^export\s+\{\s*([^}]+)\s*\}/);
    if (m) {
      const names = m[1].split(",").map(s => s.trim().split(" as ")[0].trim()).filter(Boolean);
      exports.push(...names);
      continue;
    }
    // export default ...
    if (trimmed.startsWith("export default")) {
      exports.push("default");
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const e of exports) {
    if (!seen.has(e)) {
      seen.add(e);
      unique.push(e);
    }
  }
  return unique;
}

function readFileSafe(relPath) {
  const absPath = join(PROJECT_ROOT, relPath);
  try {
    const content = readFileSync(absPath, "utf-8");
    const stat = statSync(absPath);
    return { content, size: stat.size };
  } catch (e) {
    console.warn(`  ⚠ 找不到文件: ${relPath}`);
    return null;
  }
}

// ─── 生成合并文件 ─────────────────────────────────────────────

const MERGED_HEADER = `# {TITLE}

> **重要提示（请先读完再读代码）**
>
> 本文件是 **代码合并包**——把多个源码文件按主题拼到一个 .md 里，方便你（ChatGPT）在 Projects 附件 25 个文件上限内一次性看到完整代码。
> **这不是合法的 TypeScript 源码**——import / export 都来自不同文件，路径是虚拟的。
>
> **如何阅读**：
> 1. 每个原文件之间用 \`// ================================================================================\` 包围的注释头标记（\`// FILE:\` / \`// LINES:\` / \`// EXPORTS:\`），**用 grep 搜 \`// FILE: src/...\` 即可定位到具体原文件**。
> 2. 每个原文件保留**完整源码**（不是摘要），包括注释。
> 3. 原文件之间的路径是项目根的相对路径，例如 \`src/components/wardrobe-app.tsx\`。
> 4. 如果用户问「X 文件在哪儿」，回答："X 在 \`{FILENAME}\` 里，路径段是 \`src/...\`，请用 grep 定位"。
> 5. 如果用户问「代码能跑吗」——**不能**，这是给人读的，不是给 tsc 编译的。
`;

const CONFIG_HEADER = `# 项目根配置（configs）

> 本文件是项目根配置文件的合并说明。**不是合法源码**——每个配置作为 fenced code block 给出，路径在标题里。
>
> 用途：package.json / tsconfig.json / next.config.ts / capacitor.config.ts / postcss.config.mjs / .eslintrc.json 的合并说明，含完整内容。
`;

function generateMergedFile(group) {
  const filename = `${group.id}-${group.name}.md`;
  const title = group.title;

  // Raw files: just copy
  if (group.isRaw) {
    const f = group.files[0];
    const result = readFileSafe(f);
    if (!result) return null;
    return { filename, content: result.content, size: result.size, fileCount: 1, totalLines: result.content.split("\n").length };
  }

  // Raw files merged: concatenate multiple small raw files with a header
  if (group.isRawMerged) {
    const parts = [];
    parts.push(`# ${group.title}\n`);
    parts.push("");
    parts.push(`> ${group.description}`);
    parts.push("");
    let totalSize = 0;
    let totalLines = 0;
    for (const relPath of group.files) {
      const result = readFileSafe(relPath);
      if (!result) continue;
      parts.push(`## \`${relPath}\` (${result.size} bytes, ${result.content.split("\n").length} lines)\n`);
      parts.push("```");
      parts.push(result.content.trimEnd());
      parts.push("```");
      parts.push("");
      totalSize += result.size;
      totalLines += result.content.split("\n").length;
    }
    return { filename, content: parts.join("\n"), size: totalSize, fileCount: group.files.length, totalLines };
  }

  // Config files: special format
  if (group.isConfig) {
    const parts = [];
    parts.push(CONFIG_HEADER);
    parts.push(`原文件数：${group.files.length}\n`);

    let totalSize = 0;
    let totalLines = 0;

    for (const relPath of group.files) {
      const result = readFileSafe(relPath);
      if (!result) continue;

      const ext = basename(relPath).split(".").pop();
      const lang = ext === "mjs" ? "js" : ext === "json" ? "json" : ext === "ts" ? "ts" : "";

      const lines = result.content.split("\n").length;
      totalSize += result.size;
      totalLines += lines;

      parts.push(`## \`${relPath}\` (${result.size} bytes, ${lines} lines)\n`);
      parts.push("```" + lang);
      parts.push(result.content.trimEnd());
      parts.push("```");
      parts.push("");
    }

    return { filename, content: parts.join("\n"), size: totalSize, fileCount: group.files.length, totalLines };
  }

  // Normal merged files
  const parts = [];
  const header = MERGED_HEADER
    .replace(/\{TITLE\}/g, title)
    .replace(/\{FILENAME\}/g, filename);

  parts.push(header);

  // Package metadata
  parts.push("## 包元信息\n");
  parts.push(`- 用途：${group.description}`);
  parts.push(`- 原文件数：${group.files.length}`);
  parts.push("- 原文件列表：");
  for (const f of group.files) {
    parts.push(`  - \`${f}\``);
  }

  parts.push("");
  parts.push("## 代码");
  parts.push("");

  let totalSize = 0;
  let totalLines = 0;

  for (const relPath of group.files) {
    const result = readFileSafe(relPath);
    if (!result) continue;

    const lines = result.content.split("\n").length;
    const exports = detectExports(result.content, basename(relPath).split(".").pop());
    const exportsStr = exports.length > 0 ? exports.join(", ") : "(none detected)";

    totalSize += result.size;
    totalLines += lines;

    // File separator + header comment
    parts.push("// ================================================================================");
    parts.push(`// FILE: ${relPath}`);
    parts.push(`// LINES: ${lines}`);
    parts.push(`// BYTES: ${result.size}`);
    parts.push(`// EXPORTS: ${exportsStr}`);
    parts.push("// ================================================================================");
    parts.push("");

    // File content
    parts.push(result.content.trimEnd());
    parts.push("");
  }

  return { filename, content: parts.join("\n"), size: totalSize, fileCount: group.files.length, totalLines };
}

// ─── 动态填充 docs/ 文件 ─────────────────────────────────────

function populateDocsGroup() {
  const docsDir = join(PROJECT_ROOT, "docs", "archive");
  let files = [];
  try {
    files = readdirSync(docsDir)
      .filter(f => {
        // Only include actual files (skip subdirectories)
        const abs = join(docsDir, f);
        return statSync(abs).isFile();
      })
      .sort((a, b) => {
        // Sort by modification time, newest first
        const sa = statSync(join(docsDir, a));
        const sb = statSync(join(docsDir, b));
        return sb.mtimeMs - sa.mtimeMs;
      });
  } catch (e) {
    console.warn("  ⚠ 找不到 docs/archive/ 目录");
  }

  const group = FILE_GROUPS.find(g => g.id === "04");
  group.files = files.map(f => `docs/archive/${f}`);
}

// ─── 主流程 ──────────────────────────────────────────────────

console.log("🔧 生成 chatgpt-attach 合并文件包\n");
console.log(`  项目根目录: ${PROJECT_ROOT}`);
console.log(`  输出目录:   ${OUT_DIR}\n`);

// Ensure output directory exists
if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

// Populate docs group
populateDocsGroup();

// Generate all files
const mapEntries = [];
let grandTotalSize = 0;

for (const group of FILE_GROUPS) {
  const filename = `${group.id}-${group.name}.md`;

  process.stdout.write(`  📄 ${filename} ... `);

  const result = generateMergedFile(group);

  if (!result) {
    console.log("⚠ 已跳过");
    continue;
  }

  // Write to output
  const outPath = join(OUT_DIR, filename);
  writeFileSync(outPath, result.content, "utf-8");

  const sizeKB = (result.size / 1024).toFixed(0);
  console.log(`✅ ${sizeKB} KB, ${result.totalLines} 行`);

  grandTotalSize += result.size;

  // Determine type for map
  let type = "🧩 代码合并";
  if (group.id === "00") type = "🗺️ 地图";
  else if (group.isRawMerged) type = "📑 合并原始文件";
  else if (group.isRaw) type = "📄 原始文件";
  else if (group.isConfig) type = "⚙️ 配置合并";

  mapEntries.push({
    num: group.id,
    filename,
    type,
    description: group.description.split("。")[0] + (group.description.includes("。") ? "" : ""),
    size: result.size,
    lines: result.totalLines,
  });
}

// ─── 生成地图文件 ─────────────────────────────────────────────

const generateTime = new Date().toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/\//g, "-");
let mapContent = `# 项目地图（ChatGPT 必读）

> 本文件告诉你（ChatGPT）这 ${mapEntries.length + 1} 份附件（含本文件）里都有啥、哪些代码在哪份。**先读完本文件再回答问题**。

## 附件总览

| # | 文件名 | 类型 | 用途 | 字节 | 行数 |
|---:|---|---|---|---:|---:|
`;

for (const e of mapEntries) {
  mapContent += `| ${e.num} | \`${e.filename}\` | ${e.type} | ${e.description} | ${e.size.toLocaleString()} | ${e.lines.toLocaleString()} |\n`;
}

// Build directory tree
mapContent += `
## 目录树（含所有原文件）

\`\`\`
.
├── AGENTS.md ............................ 06-AGENTS.md
├── README.md ............................ 07-README.md
├── CLAUDE.md + MINIMAX.md .............. 08-ENTRY-HINTS.md (合并)
├── VERSION_HISTORY.md .................. 09-VERSION_HISTORY.md
├── package.json / tsconfig.json / ...... 05-configs.md
│   next.config.ts / capacitor.config.ts
│   postcss.config.mjs / .eslintrc.json
├── src/
│   ├── app/                          ... 01-src-app.md
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/                   ... 02a/b/c/d/e-src-components-*.md
│   │   ├── wardrobe-app.tsx (shell 根组件)
│   │   ├── motion-provider.tsx
│   │   ├── motion-common.tsx
│   │   ├── service-worker-register.tsx
│   │   ├── use-app-navigation-controller.ts
│   │   ├── intake-flow-shell.tsx
│   │   ├── garment-intake-flow.tsx
│   │   ├── outfit-intake-flow.tsx
│   │   ├── batch-ai-progress-panel.tsx
│   │   ├── garment-detail-3.0.tsx
│   │   ├── detail-shell.tsx
│   │   ├── garment-immersive-detail.tsx
│   │   ├── outfit-list-view.tsx
│   │   ├── wishlist-view-2.0.tsx
│   │   ├── wear-statistics-view.tsx
│   │   ├── selected-images-review.tsx
│   │   ├── image-crop-editor.tsx
│   │   ├── swipe-image-carousel.tsx
│   │   ├── garment-image.tsx
│   │   ├── garment-outfit-associations.tsx
│   │   ├── outfit-cover.tsx
│   │   ├── color-chip.tsx
│   │   ├── app-sub-page-top-bar.tsx
│   │   ├── outfit-planning-calendar-view.tsx
│   │   ├── outfit-weekly-plan-strip.tsx
│   │   ├── outfit-plan-add-view.tsx
│   │   ├── outfit-plan-day-card.tsx
│   │   ├── outfit-plan-select-sheet.tsx
│   │   ├── outfit-plan-detail-view.tsx
│   │   └── plan-packing-checklist-view.tsx
│   └── lib/                          ... 03a/b/c-src-lib-*.md
│       ├── types.ts / db.ts / migrate.ts / wardrobe-cascade-delete.ts / outfit-cascade-delete.ts / data-repo.ts / backup.ts
│       ├── image*.ts (3) / native-heic-converter.ts
│       ├── thumbnail*.ts (3) / wear-*.ts (2)
│       ├── device-minimax.ts / intake-ai-prompt.ts
│       ├── outfit-ai-*.ts (4) / wishlist-*.ts (5)
│       ├── recommendations.ts / similarity.ts
│       ├── garment-style-advice.ts
│       ├── outfit-calendar.ts / outfit-planning.ts
│       ├── outfit-wear-sync.ts / plan-packing.ts
│       ├── app-route.ts / color-fields.ts / cropper-math.ts / motion-tokens.ts
│       ├── carousel-logic.ts / outfit-cover.ts
│       ├── garment-detail-pairing.ts / garment-category-catalog.ts
│       ├── use-*.ts (5) / intake-*.ts (3)
│       └── native-progress-notification.ts / wishlist-display-state.ts
└── docs/ ............................... 04-docs.md
    └── archive/ (${FILE_GROUPS.find(g => g.id === "04").files.length} 个历史交接 / 设计 / 测试文档)
\`\`\`

## 关键事实速查

- **项目性质**：个人项目（衣橱穿搭助手 PWA + Capacitor 打包 Android APK）
- **当前版本**：v${getCurrentVersion()}
- **最大文件**：\`src/components/wardrobe-app.tsx\`（根组件）
- **核心数据**：Dexie IndexedDB（src/lib/db.ts），类型在 src/lib/types.ts
- **AI 接入**：MiniMax M3（src/lib/device-minimax.ts），Key 走 macOS Keychain（用户已配置）
- **未传内容**：\`node_modules/\` / \`android/\` / \`apk-archive/\` / \`out/\` / \`assets/\`（图片） / \`*.lock\`（按 token 经济性裁剪）

## 上下文用法

- 用户问"某个文件在哪" → 看上面的目录树 → 告诉用户去 \`0X-*.md\` 找
- 用户问"X 文件的 Y 函数做什么" → 用 grep \`// FILE: src/path/to/X\` 定位到那个文件，再 grep 函数名
- 用户问"为什么改" → 读 \`09-VERSION_HISTORY.md\`，按版本号查改动
- 用户问"项目规范" → 读 \`06-AGENTS.md\`
- 用户问"架构 / 数据流" → 读 \`09-VERSION_HISTORY.md\` 顶部记录 + \`06-AGENTS.md\`

## 限制

- **不能跑代码**：合并包不合法 tsc，只供阅读
- **不能看图**：\`assets/\` 没传；任何需要 UI 截图的问题用户需另外提供
- **没有 node_modules / lockfile**：\`package-lock.json\` 没传

_本地图生成时间：${generateTime}_
`;

// Write map file (round 1: without self-row to know its size)
const mapPath = join(OUT_DIR, "00-PROJECT_MAP.md");
writeFileSync(mapPath, mapContent, "utf-8");
const mapSize = Buffer.byteLength(mapContent, "utf-8");
const mapLines = mapContent.split("\n").length;

// Now insert the self-row at the top of the table
const selfRow = `| 00 | \`00-PROJECT_MAP.md\` | 🗺️ 地图 | 项目地图（ChatGPT 必读，含 16 份附件总览 + 目录树 + 关键事实） | ${mapSize.toLocaleString()} | ${mapLines.toLocaleString()} |\n`;
const tableEnd = mapContent.indexOf("\n## 目录树");
mapContent = mapContent.slice(0, tableEnd) + selfRow + mapContent.slice(tableEnd);

// Re-write with self-row included; size will be slightly larger, but the
// self-row still references the round-1 size, which is close enough.
writeFileSync(mapPath, mapContent, "utf-8");
grandTotalSize += Buffer.byteLength(mapContent, "utf-8");

console.log(`\n  🗺️  00-PROJECT_MAP.md ✅ (${(Buffer.byteLength(mapContent, "utf-8") / 1024).toFixed(0)} KB, ${mapContent.split("\n").length} 行, 含 self-row)`);
console.log(`\n📦 生成完毕！总计 ${mapEntries.length + 1} 份附件 (含地图)，${(grandTotalSize / 1024 / 1024).toFixed(1)} MB`);
console.log(`  输出目录: ${OUT_DIR}\n`);

// ─── 版本读取 ─────────────────────────────────────────────────

function getCurrentVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf-8"));
    return pkg.version;
  } catch {
    return "?.?.?";
  }
}
