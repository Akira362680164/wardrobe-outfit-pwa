# Test System Final State — v2.1.3-test

## Architect

- `tests/manifest` — 唯一测试清单来源（9 fragments + 聚合入口）
- `tests/contract` — 静态契约（baseline + strict，CONTRACT_MODE 控制）
- `tests/unit` — 纯函数/模型逻辑（Vitest）
- `tests/component` — React 组件行为（需要 Vitest + Testing Library + jsdom）
- `tests/integration/repository` — 真实 PostgreSQL 集成（独立 Schema run_<RUN_ID>）
- `tests/fixtures` — 标准测试图片/数据
- `tests/reports` — 结果 schema / 模板 / integration-requests
- `scripts/test` — runner / infra / adapters
- `scripts/test/adapters` — 统一结果适配器
- `scripts/android` — smoke / business / network / lifecycle
- `e2e/specs` — Playwright 分层 E2E（默认 AI fixture）
- `docs/test-case-matrix.md` — 全量 Test Case Matrix
- `docs/test-legacy-script-mapping.md` — 旧脚本分类

## Usage

```bash
# Fast local check (Cutoff baseline mode)
npm run test:fast:baseline

# Fast local check (strict mode, post-Cutoff)
npm run test:fast

# Full local check
npm run test:local:full
npm run test:local:full:baseline

# Individual layers
npm run test:manifest
npm run test:contract
npm run test:contract:baseline
npm run test:unit
npm run test:component
npm run test:api
npm run test:integration:repository

# E2E
npm run test:e2e:smoke
npm run test:e2e:critical
npm run test:e2e:full
npm run test:e2e:ai-live

# Android
npm run android:build:candidate
npm run android:verify:full

# Release gates
npm run test:gate:automated
npm run test:gate:release

# Deprecated
npm run test:logic:all   # Redirects to test:local:full
```

## Key Commands

| Command | Purpose |
|---|---|
| `test:manifest` | Validate manifest structure |
| `test:contract` | Strict contract checks (strict mode) |
| `test:contract:baseline` | Baseline contract checks (lenient) |
| `test:unit` | Unit tests via Vitest |
| `test:fast:baseline` | Manifest + typecheck + baseline contract + unit |
| `test:local:full:baseline` | fast:baseline + component + integration + api + build |
| `test:logic:all` | **Deprecated** - redirects to test:local:full |

## Deprecation

`test:logic:all` is deprecated since v2.1.3-test and will be removed in v2.1.4.
Use `test:local:full` or `test:fast` instead.
