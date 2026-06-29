# v2.0.13-test 紧急修复设计

日期：2026-06-29

执行 agent：Codex

基线：`main` / `d5f84f8` / `v2.0.10-test`

## 目标与边界

修复图片资产回填、默认衣橱重复、AI 置信度、待确认数量、全局温度范围、账号页、全局创建入口和衣橱名称必填标记。保持业务实体与图片资产分离、默认衣橱不可编辑删除、现有两步录入流程和本机优先隐私边界。

不恢复 `v2.0.11-test` 或 `v2.0.12-test` 的实现，不从业务 payload 读取已拆出的图片，不在 UI 层隐藏重复默认衣橱，不引入新依赖，不修改固定签名配置。

## 方案

### 1. 图片资产装配

- 在 `src/lib/cloud-sync/` 建立单一图片解析模块，按实体 ID、字段名和 asset ref 解析图片。
- 解析顺序固定为：工作区 `assets` 表中的本地 data URL → 账号隔离缓存 → 现有下载接口并写回缓存 → 空值。
- `readWorkspaceUiSnapshot` 同时读取业务表和 assets 表，先完成资产装配，再生成 `WardrobeItem`、`WishlistItem`、`SavedOutfit`。
- 严禁从 garment、wishlist、outfit payload 的图片字段兜底。单个资产失败只影响对应字段，不阻断整个快照。
- 字段集合以 `imageAssetInputsForGarment/Wishlist/Outfit` 的实际输出为权威，并补齐源码当前遗漏的原图、缩略图、参考图和套装实拍图键。
- 保存链路继续在事务中写实体、资产和 outbox；刷新必须发生在事务完成后。

### 2. 默认衣橱唯一性

- 本地初始化在单一 Dexie 事务内完成查询、canonical 选择、归一、衣物迁移、重复记录墓碑和 outbox 写入。
- 默认语义键为 `dexieId="home"`；兼容识别旧同名默认记录，但名称只用于迁移识别，不作为长期主键。
- 并发初始化通过 workspace 维度互斥和事务共同保护；重复调用不新增记录或 outbox。
- 服务端新增迁移：先整理已有重复默认衣橱，再建立同一用户活动 `payload->>'dexieId'='home'` 的部分唯一索引。
- push 对并发默认衣橱创建返回 canonical 结果，不生成第二条记录；pull/bootstrap 落库后触发同一本地归一流程。
- UI mapper 不创建、不合并、不重定向衣橱数据，只读取修复后的真实状态。

### 3. AI 置信度与待确认

- 草稿使用独立整件级 `aiConfidenceScore?: number`，单位为 0～100；值只来自 MiniMax `tag.confidence`，经有限数校验、clamp 和四舍五入得到。
- 缺少真实 confidence 时不显示 AI 胶囊，不使用字段平均、默认值或演示兜底。
- 保存到 `WardrobeItem.aiConfidence` 时明确换算回 0～1。
- 待确认只由实际缺失、非法枚举、字段冲突、非法温度和明确字段不确定性产生。顶部数量与当前确认页可见字段胶囊使用同一函数和同一字段集合。
- 用户修正字段后统一变为 `source=user / confidence=high / needsReview=false`。

### 4. 全局温度规则

- 新增唯一 domain 模块，导出最小值 `-20`、最大值 `40`、步长 `1`，以及统一校验/归一函数。
- 滑块、只读温度条、MiniMax 解析、录入与编辑保存、种草、套装元数据聚合、workspace 恢复和相关测试全部引用该模块。
- 低于 -20、高于 40 时 clamp；`minC > maxC` 按统一规则交换；负数不得转换为空值。
- 删除组件和解析器中的 0～40 硬编码，键盘、拖动百分比和无障碍边界均读取全局常量。

### 5. 账号页、全局创建入口和衣橱字段

- 账号页只保留脱敏手机号、登录状态、简短设备名、修改密码、退出登录及二次确认；不展示 deviceId、同步冲突 UI、MiniMax 说明和多设备退出按钮。
- 保留底层冲突检测和诊断能力，不再让普通用户手工选择冲突版本。
- `app-route.ts` 提供全局创建入口白名单，只允许三个主首页。
- 添加和编辑衣橱复用同一个必填字段组件，标题和星号同一行，input 带 `required` 与 `aria-required`。

## 提交结构

1. `fix: hydrate workspace image assets for UI`
2. `fix: enforce one default closet per account`
3. `fix: use real AI confidence and global temperature rules`
4. `v2.0.13-test simplify account UI and complete urgent repair`

第四个提交完成版本号、版本历史和交付记录。版本直接升至 `2.0.13-test`，确保 Android versionCode 高于历史 `v2.0.12-test`。

## 验证

- 静态与逻辑：`npm run typecheck`、相关新增/现有逻辑测试、`npm run api:test`、`npm run build`。
- 图片：单品、种草、套装本地资产、缓存命中、下载成功、单项失败隔离及刷新后恢复。
- 默认衣橱：并发初始化、脏数据迁移、服务端并发创建和唯一索引。
- AI/待确认：不同真实置信度、无置信度隐藏、实际错误数量与字段胶囊一致。
- 温度：-20、40、负数区间、键盘边界、AI 归一、旧数据兼容。
- 浏览器：按任务文件流程 A～F 执行；缺少测试账号或 MiniMax Key 时明确记录阻塞项。
- Android：构建固定签名 APK，核对包名、versionName、versionCode、签名、大小和 SHA-256；有单一已授权设备时再保留数据安装并做真机检查。

## 错误处理与风险

- 图片解析失败只记录脱敏结构化上下文，不记录 DataURL、Token 或 Key。
- 默认衣橱修复必须在事务中完成，任何一步失败整体回滚，不留下半迁移状态。
- 服务端迁移先处理历史重复数据再建索引，避免上线迁移直接失败。
- 本轮属于 high 风险：涉及图片、同步、数据修复、AI 元数据、移动端交互和 APK；用户未要求 subagent，因此不触发独立审查，以加强本地自动化和实操验证代替。
