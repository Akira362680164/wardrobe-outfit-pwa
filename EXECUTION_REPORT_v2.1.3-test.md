# 衣橱穿搭助手 v2.1.3-test 执行报告

> 生成时间：2026-07-01
> 生成 Agent：Codex
> 版本：v2.1.3-test
> Git：`00298fc`

---

## 1. 测试体系改造

### 1.1 目标

将测试体系从平铺的 `scripts/test-*.ts` 单层结构，改造为分层门禁体系：

```
tests/manifest/       → 唯一测试清单来源（9 fragments）
tests/contract/       → baseline + strict（Cutoff SHA 控制）
tests/unit/           → Vitest 纯函数测试
tests/component/      → jsdom + Testing Library
tests/integration/    → 真实 PostgreSQL 集成
scripts/test/         → run-suite 9 层路由
scripts/test/adapters → vitest/api/playwright/android/maestro/vendor/postrelease
package.json          → 25+ 新 test 命令
.github/workflows     → test-fast.yml + test-full.yml
```

### 1.2 结果

| 层级 | 状态 | 数量 |
|---|---|---|
| Manifest | ✅ Valid | 29 entries, 9 layers |
| Contract baseline | ✅ PASSED | 2 tests |
| Contract strict | ✅ PASSED | 1 test（legacy field scanner） |
| Unit | ✅ PASSED | 10 tests |
| Component | ✅ PASSED | 3 tests（jsdom） |
| Repository Integration | ✅ PASSED | 3 tests（真实 PostgreSQL） |
| API | ✅ PASSED | 58 tests |
| E2E Playwright | ✅ PASSED | 17 tests |
| Post-release | ✅ PASSED | 远程 API 烟测 |
| Android | ✅ PASSED | APK 构建 + 模拟器启动验证 |
| **test:local:full** | **✅ PASSED** | **全部层级通过** |

### 1.3 分支与版本

- 业务分支 `codex/v2.1.3-asset-model-reset` → 已合并到 `main`
- 测试分支 `test/v2.1.3-remodel` → 已合并到 `main`
- `main` 当前 `00298fc`，已推送到公开 GitHub
- 版本：`2.1.3-test`

---

## 2. 测试命令

### 快速验证
```bash
npm run test:fast                # Manifest + typecheck + contract strict + unit
npm run test:fast:baseline       # Manifest + typecheck + contract baseline + unit
npm run test:local:full          # 全量本地门禁（含 strict contract）
npm run test:local:full:baseline # 全量本地门禁（含 baseline contract）
```

### 层级命令
```bash
npm run test:manifest         # 校验 manifest
npm run test:contract         # strict 模式
npm run test:contract:baseline # baseline 模式
npm run test:unit             # Vitest 单元测试
npm run test:component        # jsdom 组件测试
npm run test:api              # API 测试（58 项）
npm run test:integration:repository  # PostgreSQL 集成测试
npm run test:e2e:smoke        # Playwright smoke
npm run test:e2e:critical     # Playwright critical
npm run test:e2e:full         # Playwright 全量
npm run test:postrelease      # 远程 API 烟测
npm run test:gate:automated   # 自动化门禁
npm run test:gate:release     # 最终门禁
```

### 淘汰命令
```bash
npm run test:logic:all  # 重定向到 test:local:full（弃用警告）
```

---

## 3. 关键测试基础设施

### 3.1 PostgreSQL
- `wardrobe_test` 数据库（25 表已迁移）
- `wardrobe_e2e` 数据库（E2E 专用）
- Schema 隔离：`run_<RUN_ID>`
- 脚本：`scripts/test/verify-test-environment.ts`、`prepare-test-schema.ts`、`drop-test-schema.ts`

### 3.2 Component
- Vitest + jsdom
- `@testing-library/react`、`@testing-library/jest-dom`
- 环境变量：`jsdom`、`setupFiles`

### 3.3 E2E Playwright
- 15 个现有 spec 注册在 manifest
- `scripts/run-e2e-local.sh`（自动启动 API + Web + Playwright）
- Fixture AI 模式（`NEXT_PUBLIC_E2E_AI_MODE=fixture`）
- `.env.e2e.local` 配置

### 3.4 Android
- 固定签名：`CN=fangzheng`
- APK 构建：`npm run android:apk`
- 模拟器回归：`scripts/android-emulator-regression.sh`
- AVD：`wardrobe-test`（Pixel 6 / API 35 / arm64-v8a）

### 3.5 AI Live 保护
- `scripts/test/require-live-ai-flag.mjs`：需 `ALLOW_LIVE_AI_TEST=true` + `E2E_AI_MODE=live`
- 专用 spec：`e2e/specs/90-ai-live.spec.ts`（blocking=false, manual）
- 默认 E2E 不读取 Keychain

---

## 4. 旧脚本分类

46 项旧脚本完全分类，0 UNCLASSIFIED

```text
MIGRATED: 0（旧脚本保留原地，新测试在 tests/ 目录）
SUPERSEDED: 1
RETAINED: 44
DEPRECATED: 1
UNCLASSIFIED: 0
```

详见 `docs/test-legacy-script-mapping.md`

---

## 5. 未完成项

| 项目 | 原因 |
|---|---|
| Maestro Android 自动化 | 需要 test-harness APK + Selector 清单 |
| 全量 Playwright E2E（garment/outfit/wishlist CRUD） | 需要长时间 API+Web 运行 |
| PostgreSQL 集成测试完整矩阵 | 需要本地 DB + Storage 完整链路 |

这些属于**测试执行**而不是测试体系写代码的事，当需要时可以继续跑。
