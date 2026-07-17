# Wardora 新首页 P1.3 Browser Evidence Summary（2026-07-18）

- 执行路径（主工作树）：`test-results/home-feed-browser-20260718/`
- 命令：
  - `npm run test:browser:home-feed-p11`
  - `npm run test:browser:home-feed-p12`
  - `npm run test:browser:home-feed-p13`
- 覆盖点：
  - 5 个宽度断点（360/375/390/412/430）水平溢出检查
  - 登录/入口点击
  - 城市设置与保存路径、明日切换
  - 130% 字体样式下关键区块截图
  - 账号切换后首页状态（无设置城市）
- 结果：全部通过（无 fatal 报错）
- 未覆盖：Back/Escape 优先级断言、独立网络 409 场景

相关截图文件：
`account-b-cleared.png`, `city-saving-state.png`, `city-saving-status.png`, `city-sheet.png`, `clear-home-confirm-font-130.png`, `home-390-font-125.png`, `initial.png`
