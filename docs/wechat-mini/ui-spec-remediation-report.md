# 微信小程序 UI 规范修复与 App 截图对照报告

日期：2026-07-08  
执行：Codex + 并行 subagent  
小程序工程：`apps/wechat-miniprogram`  
App 对照截图：`/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/`  
小程序截图：`test-results/wechat-miniprogram-ui-spec/`

## 对照范围

本轮逐页对照 App 版真实业务流截图，不再只看小程序模拟器截图。

| 小程序页面 | 小程序截图 | App 对照截图 | 当前结论 |
| --- | --- | --- | --- |
| 登录 | `01-login.png` | `auth_login_390_top.png` | 小程序按微信认证登录语义重排；主/次按钮等宽，`微信认证登录` 六字完整显示。 |
| 账号密码登录 | `02-password-login.png` | `auth_login_390_top.png` | 作为小程序兜底登录页，视觉卡片、输入框和按钮形态对齐 App 登录页。 |
| 衣橱首页 | `03-wardrobe.png` | `wardrobe_home_390_top.png` | 顶部胶囊区域已空出；操作入口下移到内容区；空态已验证，已登录数据态待真机/API 登录后复核。 |
| 套装首页 | `04-outfits.png` | `outfit_home_390_top.png`、`outfit_calendar_390_top.png` | 周历卡片、月历入口、内容区 FAB 对齐 App 结构；右上角无自定义操作按钮。 |
| 种草首页 | `05-wishlist.png` | `wishlist_home_390_top.png` | 空态、FAB、底部 Tab 对齐；已登录商品卡片态待 API 数据复核。 |
| 设置 | `06-settings.png` | `settings_home_390_top.png` | 已从简单列表改为 App 同类卡片结构：账号服务、穿衣画像、AI 参考照片、AI 设置、远程诊断、隐私与关于。 |
| 单品录入选择 | `07-intake-camera.png` | `intake_single_step1_empty_390_top.png` | 两步流程、进度条、照片入口和底部毛玻璃操作条对齐。 |
| 单品录入确认 | `08-intake-review.png` | `intake_single_confirm_390_top.png` | 确认页卡片、图片预览、字段区和底部保存条对齐。 |
| 单品详情 | `09-wardrobe-detail.png` | `garment_detail_390_top.png`、`garment_detail_390_info.png` | 使用公共详情 shell，衣橱字段保留独立信息卡；当前无实体 id 时为空/默认态。 |
| 套装详情 | `10-outfit-detail.png` | `outfit_detail_390_top.png`、`outfit_detail_390_info.png` | 使用公共详情 shell，套装字段独立展示。 |
| 种草详情 | `11-wishlist-detail.png` | `wishlist_detail_390_top.png`、`wishlist_detail_390_info.png` | 使用公共详情 shell，价格、商品链接、购买动作等种草字段独立保留。 |

## 已完成修复

1. 全局 UI token、毛玻璃、卡片、按钮和底部 Tab 样式按 `wardrobe-ui-spec` 收敛，主色统一为 `--color-primary`。
2. 所有主 Tab 页为四个入口：衣橱、套装、种草、设置；真实 `wx.switchTab` 路径下选中态已验证正常。
3. 微信右上角官方胶囊区域已预留：衣橱搜索/统计/添加、套装月历入口、种草新增入口均不再放在页面右上角。
4. 套装和种草新增 `+` 改为内容区右下 FAB，圆形、居中、主色一致。
5. 登录页改为一个主按钮 `微信认证登录`、一个次按钮 `账号密码登录`；账号密码输入移入独立页面。
6. 衣橱单品和种草单品卡片已抽到 `components/domain/catalog-card`，列表页只传各自字段。
7. 单品、套装、种草详情页已抽到 `components/domain/detail-shell`，业务差异字段仍保留在各自页面。
8. 小程序保存 payload 统一抽出公共 catalog item payload 构造逻辑；衣橱保留 `locationId/status/legacyItemId`，种草保留 `price/productUrl/status`。
9. 设置页按 App 版信息架构改为卡片式：账号服务、穿衣画像、AI 参考照片、AI 设置、远程诊断、隐私与关于。
10. 协议与隐私 webview 页面从占位改为可读内容，登录页协议入口不再落到空白占位。

## 验证结果

- `npm --prefix apps/wechat-miniprogram run typecheck` 通过。
- 微信开发者工具 CLI `compile_wxml` / `compile_wxss` 覆盖登录、衣橱、套装、种草、设置、录入、详情和公共组件，均通过。
- `automation_viewport_action screenshot` 已生成 11 张小程序页面截图。
- `get_app_console_content` grep `error|fail|warn` 无命中。
- `git diff -- services/wardrobe-api packages/cloud-contracts | wc -l` 为 `0`，本轮未修改服务器后端代码。

## 待复核风险

1. 备案和微信合法域名未完全闭环前，无法在真机完成微信认证登录、真实 API 写入和图片上传完整闭环。
2. 衣橱/种草列表的真实卡片数据态需要登录后读取服务器数据复核；当前截图主要覆盖未登录空态。
3. AI 识别、推荐和试穿代理尚未接入后端，本轮只保留设置页状态说明，不实现后端 AI 调用。
4. 小程序详情页已具备公共 shell 和差异字段结构，但真实图片/实体详情仍依赖后端返回完整数据后再走查。
