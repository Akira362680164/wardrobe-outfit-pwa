# 旧衣物永久删除与默认衣橱云同步修复设计

## 目标

1. 两件早期云端脏衣物可以从 App 删除，删除同步到云端；卸载重装、退出重登和其他客户端均不再出现。
2. 全新安装后，用户不手动新增衣橱也拥有一个真实、可同步的“默认衣橱”。
3. 新录入衣物默认进入该衣橱，并能完成上传、跨全新安装恢复、删除及删除同步。
4. `testA`、`testB` 一类后续自定义衣橱和其中的新衣物可以完整同步，不再只恢复早期两件脏衣物。

## 已确认根因

### 旧衣物无法删除

早期云端衣物没有 `legacyItemId`。当前 UI 为了展示这些记录，使用 workspace UUID 的稳定哈希作为数字 ID；但 `bridgeGarmentDelete()` 只用 `legacyItemId` 查 workspace 记录。结果是：

- UI 能显示衣物；
- 旧 Dexie 中不存在对应哈希 ID 的记录；
- 删除 cascade 看似完成，但 bridge 找不到云端 garment；
- 没有生成有效云端删除 mutation，衣物继续显示或重装后重新出现。

### 正确衣橱和衣物未恢复

服务端当前已包含 `closetLocation` 表、同步契约和 bootstrap 返回，不需要新增一套服务端衣橱功能。问题来自历史客户端写入不完整：

- 早期版本未把衣橱位置可靠写入 workspace/outbox；
- 后续 location bridge 曾用 workspace UUID 查 Dexie 字符串 ID，更新/删除可能找不到原记录；
- 本地数据被卸载清除前若没有成功 push，服务端无法凭空恢复 `testA`、`testB` 及其衣物。

现有 `workspace-ui-mapper` 会为孤儿衣物临时生成“默认衣橱”，但该位置只存在于 UI snapshot，不在 workspace DB，也不进入 outbox，因此不能作为真正可同步的默认衣橱。

## 设计决策

### 1. 统一 workspace 衣物有效 ID

新增一个共享纯函数，按以下顺序解析 UI 使用的数字 ID：

1. `garment.legacyItemId`
2. `payload.legacyItemId`
3. 数字型 `payload.id`
4. `hashWorkspaceIdToNumber(garment.id)`

`workspace-ui-mapper`、`garment-bridge` 的查找/删除/更新，以及依赖旧 ID 建映射的 outfit/wear bridge 全部复用该函数，避免展示 ID 与写操作 ID 再次分叉。

### 2. 删除使用云端 tombstone

删除顺序：

1. 用统一有效 ID 找到 workspace garment。
2. 旧 Dexie 有对应记录则做级联删除；没有也允许继续。
3. workspace garment 标记 `deletedAt`，写入 delete outbox mutation。
4. 等待本地 bridge 完成后刷新 UI，不能 fire-and-forget。
5. 同步服务接受 delete 后保留最小 tombstone 供其他客户端识别删除，并删除该衣物的云端图片资产。

这里的“永久删除”指用户数据不会在退出重登、卸载重装或其他客户端重新出现。为避免离线旧客户端把记录复活，服务端保留 tombstone 元数据，而不是直接物理删除同步标识。

### 3. 创建真实默认衣橱

在账号 workspace 首次 bootstrap 完成后、进入 App 前执行幂等检查：

- 若存在 active closet location：不新增。
- 若不存在：创建一条真实 workspace location，payload 中 `dexieId = "home"`，名称为“默认衣橱”，同时写入 create outbox。
- 旧 Dexie 的 `DEFAULT_LOCATIONS` 保持不变，workspace 读路径以真实 workspace location 为准。
- 若云端有孤儿衣物的 `locationId = "home"`，它们统一落入该真实默认衣橱。

同一账号、同一 workspace 多次启动必须幂等，不能生成多个默认衣橱。

### 4. 衣橱与衣物写入一致性

- 新增/编辑/删除衣橱必须等待 location bridge 写入 workspace/outbox。
- 新衣物保存必须使用当前 location 的 Dexie ID；没有用户自建衣橱时使用 `home`。
- garment payload 必须包含 `legacyItemId` 和 `locationId`。
- location payload 必须包含 `dexieId`。
- UI 成功提示只证明本地 workspace/outbox 已落盘；云端恢复由后续真实跨安装验证证明。

## 版本与交付

- `package.json` 从 `2.0.2-test` 升为 `2.0.3-test`，Android versionCode 随现有规则推导为 `20003`。
- 使用固定签名 `CN=fangzheng` 构建 `衣橱穿搭助手-v2.0.3-test.apk`。
- 当前未提交的 `android/app/build.gradle` 中 `release.debuggable true` 不纳入正式源码提交；若测试需要 WebView 调试，只允许作为本机临时构建差异并在交付记录中明确标注。

## 测试设计

### 自动化回归

1. 无 `legacyItemId` 的 workspace garment 使用稳定哈希 ID。
2. 传入该哈希 ID 能找到同一 workspace garment 并生成 delete mutation。
3. 删除 bridge 不再静默返回 `workspace_garment_not_found`。
4. 空 workspace 幂等创建一个 `home` 默认衣橱并写入 outbox。
5. 已有任意 active location 时不创建默认衣橱。
6. location + garment 的 payload 保留 `dexieId`、`legacyItemId`、`locationId`。
7. 运行 typecheck、相关逻辑测试、全量逻辑测试和 build。

### Android 真机验证

用户已明确授权卸载重装，允许清除本地 App 数据；不重启手机。

1. 构建并卸载旧 App，安装全新 `2.0.3-test`。
2. 登录固定测试账号，确认两件旧衣物从云端出现。
3. 分别删除两件旧衣物，确认列表立即变为0；等待同步后退出重登。
4. 再次卸载重装并登录，确认两件旧衣物不再出现。
5. 不手动添加衣橱，确认设置页只有一个真实“默认衣橱”。
6. 从 Keychain 的 `MINIMAX_API_KEY` 安全读取 Key，填入 App；不得输出到终端、报告或日志。
7. 用 `test-clothes/` 图片录入一件新衣物，确认自动归入默认衣橱。
8. 等待同步，再次卸载重装并登录，确认默认衣橱和新衣物完整恢复、图片可见。
9. 删除该测试衣物，再次重登或重装，确认不会恢复。
10. 创建 `testA`、`testB`，分别录入可区分测试衣物；同步后再次卸载重装，确认两个衣橱及对应衣物完整恢复、归属正确。

Keychain 只用于读取现有 MiniMax Key。读取命令必须把结果直接传入输入动作，不回显、不写文件、不进入 Git。

## 错误处理

- 找不到 workspace garment 时，删除必须返回明确错误，不能静默成功。
- bridge/outbox 写失败时不关闭确认流程，并提示“删除同步失败，请重试”。
- 默认衣橱创建失败时阻止进入录入主流程，避免继续产生无归属衣物。
- 云端恢复缺少任一衣橱或衣物时，测试直接 FAIL，并记录源端/恢复端实体差异。

## 不在本次范围

- 不尝试恢复从未成功上传、且本地已随卸载清除的历史 `testA` / `testB` 数据。
- 不重构整个同步协议，不新增另一套衣橱服务。
- 不物理删除同步 tombstone；其存在用于防止离线客户端复活已删除记录。
- 不修复与本目标无关的 UI、AI 推荐或备份功能。

## 验收标准

1. 两件旧衣物在删除、重登和再次全新安装后均不出现。
2. 全新 App 无需用户手动建衣橱即可录入默认衣橱。
3. 默认衣橱、新衣物、`testA`、`testB` 及其衣物均能经云端在下一次全新安装完整恢复。
4. 删除新衣物后不会被云端重新拉回。
5. MiniMax Key 只从 Keychain 读取并写入设备本地，任何产物中不含 Key。
