# 微信小程序双端差异修复证据

日期：2026-07-24（Asia/Shanghai）

## 冻结范围

- 修复起点：`wechat/miniprogram@cd159bb55086b48eeb3e3f002fbacd62f23cc5bc`
- 运行端：WeChat DevTools Nightly `2.02.2607132`，基础库 `3.16.2`
- 正式数据源：`https://api.zhengfangapps.cloud`
- 受控实体：`跨端验收·黑色短袖POLO`（`03bd46ad-5672-4da2-9b6a-60fb5880a064`）
- 最终修复 commit：见本任务分支 Git HEAD

本轮截图来自 `apps/wechat-miniprogram` 正式源码。由于 Nightly 本机 TypeScript 编译链无法稳定生成可运行 JS，截图前在隔离临时目录逐文件转译 TypeScript，保持模块边界与正式请求路径；未打包业务模块、未接入 Fixture、mock server、HTML 原型或旧 P4 截图。临时目录只为视觉验证调整启动页顺序并沿用开发者工具的 `urlCheck=false`，没有修改仓库配置。

## 缺陷关闭

| 缺陷 | 结果 | 直接依据 |
|---|---|---|
| DUAL-P0-001 | PASS | 所有 workspace 列表请求强制 `limit<=200`，持续跟随 `nextCursor` 读取完整集合；重复游标、重复实体和超页数均显式失败 |
| DUAL-P2-001 | PASS | 详情 hero 提供“标记今天穿了”；POST 后再次 GET，只有服务器明确返回 `worn/wornAt/wearEventId` 才更新；取消同样要求严格读回 |
| DUAL-P2-002 | PASS | hero 使用 `aspectFit` 与明确的 `3:4` 容器（686×914.67rpx），缩略图和标题层级按 UI spec 收敛；保留微信胶囊和原生标题 |
| DUAL-P2-003 | PASS | “版型倾向”与“版型说明”拆分；说明使用独立可换行值区，不挤压标签 |
| DUAL-P3-001 | PASS | 衣橱筛选为“全部/上衣/裤子/鞋”，实时数量分别为 8/4/2/2，筛选结果与服务器实体一致 |

## 真实数据与业务往返

- 登录恢复后正式衣橱为 8 件，8/8 有真实图片，8/8 有版型字段。
- 受控 POLO 初始未穿；直接生产链路验证稳定 mutation 重放后，revision `4 → 5 → 6`，最终恢复为 `worn=false`、`wornAt=null`、`wearEventId=null`。
- 正式小程序 UI 再执行标记与取消，按钮依次显示“✓ 今天已穿”和“标记今天穿了”，摘要依次显示“最近 7/24 · 穿过 1 次”和“未穿过”。
- 最终服务器读回 revision `8`，仍为 `worn=false`、`wornAt=null`、`wearEventId=null`、`wornDates=[]`；衣橱仍为 8 件，未编辑或删除任何衣物。
- 客户端没有乐观成功、本地业务队列或离线补写。

## 视口与状态矩阵

| 项目 | 结果 | 证据 |
|---|---|---|
| 390×844 衣橱 | PASS | `wechat-devtools-390x844-wardrobe.png` |
| 390×844 详情 hero | PASS | `wechat-devtools-390x844-detail-top.png` |
| 390×844 属性拆分/长文案 | PASS | `wechat-devtools-390x844-detail-attributes.png` |
| 标记/取消后恢复 | PASS | `wechat-devtools-390x844-detail-wear-restored.png` |
| 360 宽 | PASS | `wechat-devtools-360x640-wardrobe.png` |
| 430 宽 | PASS | `wechat-devtools-430x932-wardrobe.png` |
| 字体放大 | PASS | `wechat-devtools-360x640-font-144pct-wardrobe.png`；读取开发者工具 `fontSizeSetting=23` 并按 23/16 实际放大页面字号，主体与 16 基线有明确可见差异，强于 130% 门槛 |
| loading/error/retry | PASS | 页面保留 `initialLoading/refreshing/error` 与 retry；手写合同门禁校验失败不冒充空数据，正式源码错误态曾在网络域名限制下实际触发 |
| Android/微信差异 | EXPECTED | 保留微信胶囊、原生标题与字体栅格差异；不按 Android 像素盲抄 |

截图为开发者工具整窗证据，右侧模拟器展示正式页面，左侧工程树和底部控制台用于证明运行来源。首轮只读审查指出字体截图未实际放大、hero 不足 3:4、360 控制台含旧 401；随后增加系统字号 token 映射、将 hero 收敛到明确 3:4，并在清空控制台后重拍 360/390/430 与详情证据。早期网络失败和旧告警截图均不在当前证据中。

## 自动化门禁

```text
npm --prefix apps/wechat-miniprogram run typecheck                 PASS
npm --prefix apps/wechat-miniprogram run test:accessibility-font   PASS
npm --prefix apps/wechat-miniprogram run test:workspace-pagination PASS
npm --prefix apps/wechat-miniprogram run test:workspace-wear-state PASS
npm run test:logic:miniprogram-item-detail                         PASS
npm run test:logic:miniprogram-wardrobe                            PASS
npm run test:logic:miniprogram-home-p4                             PASS
git diff --check                                                   PASS
```

分页手写测试覆盖：调用者传入 `500` 时每次网络请求仍为 `200`；多页无重复无遗漏；重复游标与重复实体均抛出可见错误。穿着手写测试覆盖：历史日期与当前直接穿着状态合并、mark 严格读回、cancel 严格读回，以及缺失/错误服务器字段时拒绝成功。

首轮独立只读视觉审查结论为 P0 0 / P1 1 / P2 2 / P3 0，未建议交付；指出的三项分别为无效字体放大证据、hero 比例不足、360 截图带旧 401。修复并重拍后，第二轮独立只读视觉审查结论为 **P0 0 / P1 0 / P2 0 / P3 0，建议交付**；字体放大、3:4 hero、干净控制台、版型拆分和筛选顺序均已关闭。

## 2026-07-27 main-first 串行收口

- 正式同步锚点：`main@8db6794add276a759feb8fe11b4ca4250a8de651`，其中生产 API/worker 功能提交为 `7ba22acd1dd2a2d0eb98a42ea0a46d839f606007`；任务修复冻结提交为 `18138f8902b062db943e3aed5fe726a77200124d`。
- 任务分支使用普通双亲 merge 同步 main，合并提交为 `6ae8de7aacad97a084420341683c51e313acacda`。唯一冲突为 `VERSION_HISTORY.md`，人工保留 App/API 与小程序双方接力；根 `package.json` 和 lock 均为 main 的 `2.1.33-test`。
- 同步首次执行 `home-shared:miniprogram:check` 发现 generated 天气合同桥接已过期；使用正式生成器更新 `generated/wardora-home-contracts.js` 后复查通过。`online-workspace` 同时证明最新 `imageDataUrl` 主图字段映射保持有效。
- `18138f89..6ae8de7` 对已审的详情 hero、属性区、衣橱、字号、首页与 workspace 小程序源码均无差异；之后仅生成合同桥接字节变化，不改变 WXML/WXSS、布局、手势或动效。因此复用上一阶段独立视觉审查结论，未重复启动 subagent。
- 最终正式 `wechat/miniprogram` 提交以本任务完成后的该分支与 `origin/wechat/miniprogram` 对齐 HEAD 为准；Git commit 无法在自身内容中自引用，精确 SHA 在最终交接中记录。

### 串行门禁

```text
npm run test:logic:domain-catalog                              PASS
npm run catalog:miniprogram:check                              PASS
npm run test:logic:miniprogram-catalog                         PASS
npm run cloud:contracts:typecheck                              PASS
npm run api:typecheck                                          PASS
npm run typecheck                                              PASS
npm --prefix apps/wechat-miniprogram run typecheck             PASS
npm run home-shared:miniprogram:check                          PASS（更新生成桥接后）
npm run test:logic:online-workspace                            PASS
npm run test:logic:component-reuse                             PASS
npm --prefix apps/wechat-miniprogram run test:workspace-pagination PASS
npm --prefix apps/wechat-miniprogram run test:workspace-wear-state PASS
npm --prefix apps/wechat-miniprogram run test:accessibility-font   PASS
npm run test:logic:miniprogram-item-detail                     PASS
npm run test:logic:miniprogram-wardrobe                        PASS
npm run test:logic:miniprogram-home-p4                         PASS
npm run build                                                  PASS
git diff --check                                               PASS
```

WeChat DevTools Nightly `2.02.2607132` 直接打开 `.ts` 正式目录时仍触发既有工具链限制：未生成 `pages/login/index.js`。随后执行仓库正式 `prepare:wechat-devtools-validation`，从同一份正式源码生成无 Fixture、无 mock 的隔离逐文件 JS 验证目录；开发者工具日志确认 appservice launch success、pageframe 用户代码加载完成，并编译到 `pages/login/index`。验证目录已移入废纸篓，开发者工具已退出；没有执行 preview 或 upload。

## 限制与安全

- 按用户内存要求，本阶段没有重新启动 Android 模拟器；跨端对照使用冻结验收包中的 App 权威截图和 UI spec。
- 没有调用 `miniprogram_upload`，没有上传体验版，没有部署 API，没有修改云数据库、云存储或云函数。
- 第一阶段没有修改 `packages/cloud-contracts/**`、`services/wardrobe-api/**`、`src/**`、App 构建配置或生产部署文件；第二阶段只通过 Git merge 纳入 main 已验收内容，没有在这些所有权外文件上另行开发。
- 证据不含密码、token、Authorization header、私钥或 Keychain 内容。
