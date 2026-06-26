# 账号与同步说明（阶段 1A / 1B-B3 · 内部测试）

> 最新阶段 1B-B9 收口结果见 `docs/cloud/phase1b-regression-report.md`。本文保留 1A 到 1B-B3 的设计边界说明，后续不要把本文顶部标题误认为当前实现只到 B3。

> 适用版本：阶段 1A（账号认证 + 服务器底座 + AuthGate）到阶段 1B-B3（每账号本机工作区、本地 schema、云端业务 schema 与同步契约，默认相关开关关闭）。
> 不构成对后续阶段功能的承诺。后续阶段会单独更新本文档。

## 1. 阶段 1A 实际提供的能力

| 能力 | 是否在 1A / 1B-B3 | 备注 |
| --- | --- | --- |
| 手机号 + 密码注册 | ✅ | 密码 Argon2id 哈希保存，注册申请 30 分钟过期 |
| 手机号 + 密码登录 | ✅ | 返回 Access Token + Refresh Token |
| 开发期 CLI 验证 | ✅ | 仅内部测试使用，verificationSource = `development_cli` |
| 多设备会话 | ✅ | 每设备独立 Refresh Token |
| 账号管理（当前设备标识、改密、退出当前设备、退出全部） | ✅ | 在 App 内 "账号管理" 入口；1A 不提供完整设备列表页 |
| 改密吊销全部 Refresh Token | ✅ | 改密后必须重新登录 |
| 退出当前设备 | ✅ | 只吊销本设备的 Refresh Token |
| `NEXT_PUBLIC_CLOUD_AUTH_ENABLED` 开关 | ✅ | 默认 `false` |
| 每账号本机工作区 registry | ✅ B1 | 由 `NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED` 控制，默认 `false` |
| 每账号新 Dexie schema 与读取 repository | ✅ B2 | 仅数据层，不接业务 UI |
| 云端业务 schema 与同步契约 | ✅ B3 | 仅 migration / Drizzle schema / Zod contracts，不启用同步引擎 |

## 2. 阶段 1A 明确**不**提供的能力

下面这些能力都属于后续阶段，1A 不会承诺、也不会做：

- 衣橱云同步（结构化数据上传、pull / push / cursor / 冲突处理）— 阶段 1B
- 图片资产云同步（assets / 缩略图 / 原图）— 阶段 1C
- 旧 Dexie 数据导入到云端工作区 — 阶段 1B
- 多账号本地业务读写切换 — 阶段 1B 后续提交
- 短信验证码 — 未排期
- 微信扫码验证 — 未排期（`wechat_identities` 表 1A 不创建）
- 邮箱验证、第三方 OAuth 登录 — 未排期
- 客服通道、IM 客服、工单系统 — 1A 不承诺
- 服务等级协议（SLA）、数据导出 SLA — 1A 不承诺
- 账号数据自助导出 — 1A 不提供，后续阶段再评估
- 任何"云端衣橱备份""云端图片备份""云端找回密码"语义 — 1A 全部不支持

> 客服承诺的明确边界：阶段 1A 内部测试不设客服渠道。反馈请走内部协作通道，**不要**在文档或 App 界面向最终用户承诺客服响应时效。

## 3. 认证功能开关：默认关闭

```text
NEXT_PUBLIC_CLOUD_AUTH_ENABLED=false （默认）
NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED=false （默认）
NEXT_PUBLIC_CLOUD_SYNC_ENABLED=false （默认）
```

- `false` → App 直接进入现有本地衣橱界面，不初始化认证，不展示账号卡片，与 1A 之前的体验一致。
- `true`  → App 启用 AuthProvider / AuthGate，强制走注册/登录才能进衣橱主界面。

阶段 1A / 1B 的内部测试 APK 由构建配置决定开关取值。生产默认值保持关闭，直到结构化同步整段验收通过并由用户另行确认。

## 3.1 阶段 1B-B1 / B2 本机工作区数据层

B1 只新增每账号本机工作区登记表和 Gate，不迁移现有衣橱业务读写，也不启用云端同步。registry 保存在本机 `localStorage`，内容不包含 token、密码或 MiniMax Key，只包含：

- `userId`
- `stableUserIdHash`
- `dbName`
- `schemaVersion`
- `lastOpenedAt`
- `activeWorkspaceGeneration`
- 主动退出标记
- `offlineAccessUntil`

开启 `NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED=true` 后，登录成功会登记当前账号的本机工作区；退出账号会保留工作区记录，但写入主动退出标记并清空该账号离线授权。后续同步、bootstrap、repository 和图片缓存隔离仍按 1B 后续提交接入。

B2 新增每账号独立 Dexie schema，数据库名仍使用 `wardrobe_account_<stableUserIdHash>`。已存在的数据表：

- `garments`
- `outfits`
- `outfitItems`
- `wishlistItems`
- `wearEvents`
- `tripPlans`
- `outfitPlans`
- `assets`
- `syncOutbox`
- `syncState`
- `syncConflicts`
- `migrationState`

B2 只提供纯读取 repository 和事务写入封装；现有衣橱首页、录入、套装、种草、穿着统计和计划页面仍读取旧本机库，直到 1B 后续 B5a-B5d 逐段迁移。

B3 新增云端业务 schema 和共享同步契约，包含：

- PostgreSQL 表：`wardrobes`、`garments`、`outfits`、`outfit_items`、`wishlist_items`、`wear_events`、`trip_plans`、`outfit_plans`、`assets`、`sync_changes`、`sync_mutations`
- 共享契约：bootstrap、push、pull、resolve-conflict
- 约束：`sync_changes` 按 `user_id + change_seq` 唯一，`sync_mutations` 按 `user_id + mutation_id` 幂等

B3 仍不注册 `/api/sync/*` 可用业务接口；真正执行 bootstrap / push / pull 属于 B4 及后续。

## 4. 账号 = 身份认证，不是云端衣橱

阶段 1A 的"账号"只解决"我是不是注册过的用户"这件事。它**不**意味着：

- 衣橱数据已上传云端
- 衣物图片已上传云端
- AI Key 已绑定到账号
- 任何形式的"找回衣橱"通道已开通

本机衣橱数据是否上传、什么时候上传，**完全由后续阶段决定**。1A 期间，云端**不存**衣物条目、套装、心愿单、行程、图片或 AI Key。

## 5. 退出账号会发生什么

| 数据 | 退出账号时 |
| --- | --- |
| 本机衣橱（衣物 / 套装 / 心愿单 / 穿着记录 / 行程 / 打包清单） | 保留 |
| 本机衣物图片缓存 | 保留 |
| 未来阶段才会出现的"未同步 Outbox" | 保留（本阶段不存在） |
| 本机 MiniMax AI Key | 保留 |
| 云端 Refresh Token（本设备） | 吊销 |
| 云端账号记录、密码哈希、设备会话 | 保留（直到开发者测试清理或测试期清空） |

> 再次使用该账号必须在线重新登录。退出后即使本地仍有数据，本阶段也不允许离线进入该账号的本地衣橱。

## 6. 多个账号 / 多个设备

- 同一账号可在多个设备登录，每设备独立 Refresh Token。
- 账号管理页展示当前设备标识，并提供"退出当前设备"和"退出全部设备"。
- 阶段 1A 同一设备上**不**支持离线切换本地衣橱到另一个账号——本机已有账号未退出时，禁止在另一账号下进入本地衣橱。

## 7. 离线 / 限流 / 服务降级

- 认证开关为 `false`：不初始化账号服务，直接使用既有本机衣橱。
- 认证开关为 `true`：首次登录、注册验证、会话恢复都必须访问账号服务；网络失败或服务不可用时，不生成假的本地账号，也不进入未验证账号的衣橱。
- refresh 失败：清除本机认证凭据，回到登录页。
- 429：按 `retryAfterSeconds` 提示稍后再试。

> 1A 没有"云端衣橱同步"概念，所以"同步冲突 / bootstrap / 离线工作区"在 1A 都不存在——那些属于阶段 1B。

## 8. 验证方式（与法律页保持一致）

- 阶段 1A 不发短信验证码，不接微信扫码。
- 注册后由开发者在服务器上用 CLI 完成 `development_cli` 验证。
- 该验证流程仅服务内部测试，不会出现在面向公众的版本中。

## 9. 自查清单（写给后续维护者）

- [x] 没有承诺"云端衣橱"。
- [x] 没有承诺"找回密码靠短信 / 微信"。
- [x] 没有承诺"客服渠道 / SLA"。
- [x] 没有承诺"账号数据一键导出"。
- [x] 明确写了"退出账号 = 不删本机数据、不删 AI Key"。
- [x] 明确写了"AI Key 是设备级，不属于账号"。
- [x] 明确写了"认证开关默认 false"。
- [x] 把"未同步 Outbox"标注为本阶段不存在，避免被理解为已上线。
