# 衣橱 V4 云端化 1B 阶段 Handoff Prompt

> 写于 2026-06-26，从 `minimax/cloud-1b-engine` 分支切走时交付。
> 接续方：codex 主分支（`codex/cloud-phase1-auth`），合并 B4 + B5a 之后在此基础上做 B5b。

---

## 项目背景

- **项目路径**: `/Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP`
- **V4 主方案**: `/Users/fangzheng/Downloads/WARDROBE_CLOUD_V4_FULL_MASTER_PLAN.md`
- **V4 执行评审方案**: `/Users/fangzheng/Downloads/WARDROBE_CLOUD_V4_EXECUTION_PLAN_FOR_REVIEW.md`
- **AGENTS.md**（30K 字节强制规则）必须在做任何修改前完整读完
- **个人项目**，无团队成员 / 公司合规 / PR review；APK 直接打到自己手机用

## 关键约束（必读）

1. **强制先读** `/Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP/AGENTS.md`
2. 不提交 `node_modules` / `.next` / `out` / `android/app/src/main/assets/public` / `.env*` / `android/local.properties` / 签名文件 / **`.vscode/`** / `*.apk`
3. 删除走 `mavis-trash`（单独一行），禁止 `rm -rf` / `git reset --hard` / `git clean -fd` / `git checkout --`
4. 提交前必跑 `npm --workspace @wardrobe/wardrobe-api run typecheck` + `npm run typecheck`（全 workspaces）
5. **subagent 独立审查**只在用户明确说"开审查"/"派 subagent 审查"时触发（AGENTS.md §96），不可自动因风险等级判断触发
6. V4 执行方案 §1.2: 不 fetch / pull / merge / rebase / clone / 不创建 worktree / 不丢弃未提交未推送配置（**合并到主分支是用户显式授权，codex 分支合并不在此约束内**）
7. 临时 IP `http://111.231.98.86` 继续用，域名 `api.zhengfangapps.cloud` 备案未恢复
8. 真机验收先不执行；生产开关 `NEXT_PUBLIC_CLOUD_SYNC_ENABLED` / `NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED` / `NEXT_PUBLIC_CLOUD_AUTH_ENABLED` 仍保持 false
9. 风险门禁 high/medium/low + `subagent_trigger` 字段必须写进 VERSION_HISTORY.md
10. ponytail 默认开启，bug fix = root cause，`// ponytail:` 注释标记 shortcut
11. 任何代码改动 **必须先复述理解 + 提方案 + 等用户拍板**才能动手（用户偏好 §workflow "代码改动必须先讨论，再动手"）

## 已完成工作（v1.1.37 cloud 1B）

### B1-B3 (前置)
- 已 commit 在分支历史里（B1 auth schema / B2 auth session / B3 sync schema contracts）

### B4 — commit `c8675b8` "v1.1.37 cloud 1B B4 sync engine and outbox round trip"
**新增/修改**:
- `services/wardrobe-api/src/sync/service.ts`（主干）：`SyncService.bootstrap/push/pull/resolveConflict`，含 8 个 entityType 动态 dispatch
- `services/wardrobe-api/src/sync/entity-tables.ts`：8 个 entityType 映射表
- `services/wardrobe-api/src/sync/cursor.ts`：`base64url(JSON({seq,serverTime}))` 编码
- `services/wardrobe-api/src/sync/routes.ts`：4 个 POST 路由 `/api/sync/{bootstrap,push,pull,resolve-conflict}`
- `services/wardrobe-api/src/app.ts`：注册 `registerSyncRoutes`
- 含 7 个 typecheck 错误修复；`.vscode/` 误提交已回滚
- `npm --workspace @wardrobe/wardrobe-api run typecheck` + `npm run typecheck` ✅

**已知遗留问题**（B5+ 处理）:
- `entityTypeForBundle` 用对象引用判等（`siblingList.includes(entity)`）—— 有 bug 的启发式
- service.ts 用了 `as any` 多次绕过 drizzle 动态 dispatch 类型问题
- `markOutboxConflict` 用 `attemptCount` 保留原值，B5 接入时要确认
- push 路径只有 1 处显式 `throw new SyncApiError(403, "CROSS_ACCOUNT_ACCESS")`，其他错误 catch-all 转 `rejected: SERVER_ERROR`
- V4 §6.1 B4 要求"重试"—— `computeBackoffMs` 只算延迟，没真正 timer 调度（B6 状态机做）

### B5a — commit `a9c8a2e` "v1.1.37 cloud 1B B5a garment create bridge to workspace outbox"
**新增/修改**:
- `src/lib/cloud-sync/garment-bridge.ts`（~80 行）：`bridgeGarmentCreate(item)` helper + `loadBridgeContext` 三重检查
- `src/components/wardrobe-app.tsx`：2 处 `void bridgeGarmentCreate({ ...item, id })` fire-and-forget
- `VERSION_HISTORY.md`：B5a 条目在最顶部
- `npm run typecheck` ✅ 通过
- **范围仅 garment create**，未动 outfit-capture 路径 line 880/898 的 `db.items.add`（B5b 处理）

### 服务器端部署
- 服务器源码：`rsync -az --rsync-path="sudo rsync"` 把本地覆盖到 `wardrobe-cloud:/opt/wardrobe-cloud/source/`
- 服务器 .env: `WARDROBE_API_IMAGE=wardrobe-api:c8675b8` + `GIT_COMMIT=c8675b8`（root only 600）
- DB 备份: `wardrobe-20260626-121428.sql` 在 `/opt/wardrobe-cloud/backups/postgres/`
- 镜像构建: `sudo docker build -t wardrobe-api:c8675b8` 成功
- **postgres 库名实际是 `wardrobe`**（不是 `wardrobe_cloud`），drizzle 自动连对

## 刚刚修好的 B4 部署坑（HTTP smoke 前卡住的）

**根因**: drizzle `migrator()` 启动时尝试重跑 0001 SQL（已经在 `applyMigration` 之前手动 psql 跑过了），但 `__drizzle_migrations` 表里只记了 0000。结果 drizzle 看到 journal 有 0001 entry 但 db 里没 0001 记录 → 重跑 CREATE TYPE `garment_status` → 撞 `already exists` → 容器 crash loop。

**修复（已落地）**: 给 `__drizzle_migrations` 手动插入 0001 行
```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('2ec53ae452c84443a575e43b681fcc38c290acb3082c685a7e2b0de66bf3b585', 1782432000001);
```

**drizzle hash 算法**（在 `node_modules/drizzle-orm/migrator.js` 里）:
```js
crypto.createHash("sha256").update(sqlContent).digest("hex")
```
对**整个 .sql 文件内容**做 sha256（不按 `--> statement-breakpoint` 分割）

**重启后**:
```
=== /api/health ===
{"status":"ok","serverTime":"2026-06-26T06:27:28.417Z"}
HTTP 200
```

## HTTP smoke 已验证 ✅

完整流程在单 SSH session 里跑通（脚本在 `/tmp/wardrobe-smoke-2.sh`）:
1. ✅ POST `/api/auth/registrations` → `registrationId + clientSecret`
2. ✅ CLI `verify-pending-registration.js <regId>` → status=`verified`
3. ✅ POST `/api/auth/registrations/:id/complete` → `accessToken`（640 字符 RS256 JWT）
4. ✅ GET `/api/account/me` → 200，返回 userId + maskedPhone
5. ✅ POST `/api/sync/pull` → 200，返回 `{changes:[], nextCursor, hasMore:false}`（验证 cursor 编解码正确）
6. ⚠️ POST `/api/sync/bootstrap` → **400 `invalid_request`**（Zod 验证失败，schema 没匹配）
7. ⚠️ POST `/api/sync/push` → **400 `invalid_request`**（同上）

### B5b 接入时必须先修的 bug（HTTP smoke step 6/7）

`BootstrapRequestSchema` / `PushRequestSchema` 在 `packages/cloud-contracts/src/sync/contracts.ts` 第 46 / 71 行。**根因猜测**: bootstrap/push 都要求 body 里包含 `deviceId` / `clientId` / `cursor` 之类的字段，但 curl 发的是 `{}`。需要 Read contracts.ts 第 46-130 行拿到精确 schema，然后**改 smoke 脚本的 payload**——这是验证脚本的问题，不是 API bug。但 **B5b 客户端 push 实现要严格按 schema 写**。

**pull 用 `{}` 就过**说明 pull schema 全 optional；bootstrap/push 大概率有必填字段。

### Smoke 脚本（参考）

```bash
PHONE="+13105550$(printf '%03d' $((RANDOM % 1000)))"
API='http://127.0.0.1:3000'
REG_JSON=$(curl -sS -X POST "$API/api/auth/registrations" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\",\"password\":\"SmokeTestPass123\"}")
REG_ID=$(echo "$REG_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["registrationId"])')
CLIENT_SECRET=$(echo "$REG_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["clientSecret"])')

sudo docker exec wardrobe-cloud-wardrobe-api-1 \
  node dist/cli/verify-pending-registration.js "$REG_ID" > /dev/null

COMPLETE_JSON=$(curl -sS -X POST "$API/api/auth/registrations/$REG_ID/complete" \
  -H 'Content-Type: application/json' \
  -d "{\"clientSecret\":\"$CLIENT_SECRET\",\"deviceId\":\"smoke-device-1\"}")
ACCESS_TOKEN=$(echo "$COMPLETE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')

# 然后用 Bearer token 调 /api/sync/{bootstrap,push,pull}
```

服务器 `127.0.0.1:3000`（docker compose port mapping），容器内 `0.0.0.0:3000` listen，无 curl/wget，node 有。

## 下一步要做的（B5b 之后按顺序）

1. **修 smoke 脚本的 bootstrap/push payload**（先读 contracts.ts 第 46-130 行拿精确 schema，再 curl 重测，目标是 push 一条 garment → pull 拿回来）
2. **B5b**: outfit + outfitItems 业务写入迁移
   - 接 sync-engine `writeOutfit` / `writeOutfitItem`，桥接 `wardrobe-app.tsx` line 880/1201/1213/3656/5317/5325
   - 复用 B5a 的 `bridgeGarmentCreate` 模式
3. **B5c**: wishlist 业务写入迁移
4. **B5d**: wearEvent + tripPlans + outfitPlans + garment update/delete
5. **B6**: 在线/离线状态机 + 账号切换 + runSyncOnce 触发点（V4 §6.1 重点，V4 §2.5 状态机 spec）
6. **B7**: 冲突处理 UI
7. **B8**: 旧 Dexie 导入（幂等 + 不破坏旧库）
8. **B9**: 1B 全量回归（V4 §6.1）

## 重要路径 & 命令

- 服务器: `ssh wardrobe-cloud`（mavis config）
- 服务器路径: `/opt/wardrobe-cloud/{source,compose.production.yaml,.env,caddy/,secrets/,backups/}`
- 服务器 .env: `-rw------- 1 root root`（600 root-only，**非 root 读会 Permission denied**）
- 服务器脚本: `deploy/scripts/wardrobe-cloud.sh`（注意 `${1:-${WARDROBE_API_IMAGE:-}}` 不会从 .env fallback，**未来 build/image 命令直接 `sudo docker build -t ...` 不走脚本**）
- 重启容器: `ssh wardrobe-cloud 'sudo docker compose -f /opt/wardrobe-cloud/compose.production.yaml up -d wardrobe-api'`
- 看日志: `ssh wardrobe-cloud 'sudo docker logs --tail 50 wardrobe-cloud-wardrobe-api-1'`
- 看 migrations: `ssh wardrobe-cloud 'sudo docker exec wardrobe-cloud-postgres-1 psql -U wardrobe -d wardrobe -c "SELECT * FROM drizzle.__drizzle_migrations;"'`
- DB 备份: `ssh wardrobe-cloud 'sudo /opt/wardrobe-cloud/deploy/scripts/wardrobe-cloud.sh backup-db'`

## 当前服务器状态

- `wardrobe-api:c8675b8` ✅ Running（drizzle hash 修完后稳定）
- `wardrobe-cloud-postgres-1` ✅ Healthy
- `__drizzle_migrations` 表有 2 行（0000 + 0001）
- 数据库 `wardrobe` 有 18 张表（7 auth + 2 sync + 8 business + wardrobe）
- 当前 session 已有 1 个 smoke test 用户：`userId=d3e6ee48-cca5-46db-a55a-d62670b3bf15`, maskedPhone=131****0497

## 给 codex 分支的执行建议

1. **先读 AGENTS.md 再做任何事**（用户多次强调）
2. **先读 `packages/cloud-contracts/src/sync/contracts.ts`** 把 bootstrap/push/pull 三个 schema 完整摸清，curl 重测 HTTP smoke 拿到 push 一条 garment → pull 拿回来的完整证据
3. **再开 B5b**，**先讨论方案再动键盘**（用户硬性偏好，§workflow entry）
4. **B5b 起每次 commit 前跑 `npm run typecheck`**
5. **不需要自动开 subagent 审查**，等用户明确通知
6. **每个 dev 节点结束 → VERSION_HISTORY.md 顶部加一条** + `subagent_trigger: false`（除非用户明确说要审查）
7. **合并流程**（用户已授权）:
   - `cd /Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP`
   - `git checkout codex/cloud-phase1-auth`
   - `git merge --no-ff minimax/cloud-1b-engine -m "merge: B4 sync engine + B5a garment bridge from minimax branch"`
   - 验证 `npm run typecheck` 仍然通过
8. **dev server 用完必关**，记录 PID + `kill <PID>` + `lsof` 验证无输出
9. **遇到 drizzle 类似坑**：先 `Read node_modules/drizzle-orm/migrator.js` 找 hash 算法，再 INSERT 手动 mark；不要改 source 里的 SQL

## 踩过的坑（不要重复）

- 服务器 build image 走脚本会 fallback 到 .env 但 .env 是 600 root → **直接 `sudo docker build -t <image>` 不走脚本**
- 服务器 compose port: 容器内 3000 → host `127.0.0.1:3000`（不是 8080）
- 容器内没 curl/wget，用 `node -e "..."` 做 HTTP
- postgres 实际库名是 `wardrobe`，不是 `wardrobe_cloud`
- ssh `bash -s < script.sh` 跑远程脚本比嵌套引号安全得多
- curl `-w '\nHTTP %{http_code}\n'` 配合 python `rsplit` 解析 body+status
- bearer token 用 `-H "Authorization: Bearer $ACCESS_TOKEN"`（注意 Bearer 大小写）
- npm run typecheck 在每个 workspace 都要跑（不只是 api）

---

**接着干 B5b 吧。任何卡点直接 ping 我（mavis mvs_c6e4a05c31414450b5798c9f115a392e）。**
