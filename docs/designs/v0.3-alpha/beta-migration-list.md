# v0.3-beta 候选迁移清单（alpha 初稿）

生成时间：2026-07-08T13:04:48.890Z
截图来源：live_business_flow

本文件由 v0.3-alpha 视觉评审台生成，只作为 beta 候选池；不得直接视为已批准的 UI 迁移需求。

## P0

- 登录页（auth_login / top / 认证视觉体系）：v0.3-beta 统一 AuthShell 与 App Shell 的视觉 token。
- 注册页（auth_register / top / 认证视觉体系）：v0.3-beta 将注册/登录统一为同一 Auth 页面系统。
- 单品图片导入后（intake_single_step1_imported / top / 一次性截图节点）：v0.3-beta 保留多图队列的固定视觉合同。
- 删除确认 Sheet（confirm_delete_sheet / top / 危险确认）：v0.3-beta 强化所有危险操作的 ConfirmActionSheet 合同。

## P1

- 登录页（auth_login / top / 主按钮）：将 Auth 主操作迁移到统一 Button 样式。
- 注册页（auth_register / top / 协议区域）：整理协议文案区域的间距和强调级别。
- 设置首页（settings_home / top / 设置分组）：将设置页入口整理为统一 setting row 组件。
- 单品录入 Step 1 空状态（intake_single_step1_empty / top / 录入空态）：统一 Step 1 空态卡片和按钮密度。
- 单品图片导入后（intake_single_step1_imported / top / 图片队列）：收敛队列高度和当前项 Denim 选中边框。
- 单品录入确认信息（intake_single_confirm / top / 确认页首屏）：优化确认页首屏信息密度和当前图定位。
- 单品录入确认信息（intake_single_confirm / bottom / 保存区域）：加强确认页底部固定/安全区策略。
- 衣橱首页（wardrobe_home / top / 瀑布流卡片）：复核首页所有衣物卡片是否仍有私有样式。
- 单品详情页（garment_detail / top / 详情媒体）：收敛单品详情首屏到 DetailShell 目标结构。
- 单品详情页（garment_detail / info / 颜色与温度）：迁移详情信息区到共享颜色/温度组件。
- 删除确认 Sheet（confirm_delete_sheet / top / 遮罩层）：统一删除确认 Sheet 视觉参数。
- 套装首页（outfit_home / top / 套装卡片）：统一套装卡片字段映射。
- 套装详情页（outfit_detail / top / 套装首屏）：为套装详情补齐 DetailShell 套装 variant。
- 套装详情页（outfit_detail / info / 组成件信息）：统一套装详情组成件卡片。
- 套装月历页（outfit_calendar / top / 二级页顶部）：统一月历页二级导航结构。
- 种草首页（wishlist_home / top / 种草语义）：统一 Wishlist 卡片和衣橱卡片的 shell 差异。
- 种草详情页（wishlist_detail / top / 商品媒体）：定义 Wishlist DetailShell variant。
- 种草详情页（wishlist_detail / info / 买前评估）：整理种草详情买前评估视觉。

## P2

- 登录页（auth_login / top / 表单卡片）：调整 Auth 表单容器圆角、间距和输入高度。
- 注册页（auth_register / top / 输入控件）：迁移 Auth 输入框到统一 form token。
- 设置首页（settings_home / top / MiniMax Key）：补强设置页 MiniMax 状态卡。
- 设置首页（settings_home / top / 底部导航）：复核 TabBar 在设置页的 active 和 safe area。
- 单品录入 Step 1 空状态（intake_single_step1_empty / top / 步骤表达）：复核录入步骤条文案和进度表达。
- 单品录入 Step 1 空状态（intake_single_step1_empty / top / 底部操作）：补充 Step 1 操作区 disabled 样式。
- 单品图片导入后（intake_single_step1_imported / top / AI 触发）：统一 AI 触发按钮和说明文案。
- 单品录入确认信息（intake_single_confirm / top / 字段分组）：把确认页字段组件逐步迁移到共享展示/编辑控件。
- 单品录入确认信息（intake_single_confirm / bottom / 错误状态）：补齐确认页局部 retry/failed 样式。
- 衣橱首页（wardrobe_home / top / 顶部筛选）：整理首页工具按钮图标映射。
- 衣橱首页（wardrobe_home / top / 新建入口）：统一 global-create 在主 Tab 的布局。
- 单品详情页（garment_detail / bottom / AI 建议）：整理详情底部信息卡和更多操作。
- 删除确认 Sheet（confirm_delete_sheet / top / 文案）：补齐危险操作文案表。
- 套装首页（outfit_home / top / 创建入口）：复核 global-create 下套装入口的视觉。
- 套装首页（outfit_home / top / 空/少数据状态）：保留线上读回后的卡片状态作为回归基线。
- 套装详情页（outfit_detail / bottom / 计划与穿着）：整理套装详情底部信息架构。
- 套装月历页（outfit_calendar / top / 日期可读性）：复核月历网格密度。
- 套装月历页（outfit_calendar / top / 计划状态）：完善日历状态 token。
- 种草首页（wishlist_home / top / 筛选状态）：整理种草筛选条。
- 种草首页（wishlist_home / top / 添加入口）：复核 wishlist intake 入口文案。
- 种草详情页（wishlist_detail / bottom / 转入衣橱）：统一种草详情底部操作区。

## None / 观察项


