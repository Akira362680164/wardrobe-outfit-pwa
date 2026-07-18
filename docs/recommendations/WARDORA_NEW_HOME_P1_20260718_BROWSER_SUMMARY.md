# Wardora 新首页 P1.3 Browser Evidence Summary（2026-07-18）

- 执行路径（主工作树）：`test-results/home-feed-p13-browser/20260718/`
- 命令：
  - `npm run test:browser:home-feed-p13`
  - `npm run test:browser:home-feed-p12`
  - `npm run test:browser:home-feed-p11`
- 覆盖点：
  - 5 个宽度断点（360/375/390/412/430）水平溢出检查（全部通过）
  - 登录/首页入口与设置入口
  - 130% 字体场景
  - 首次地点读取失败后 `重试`，恢复天气与推荐，断点复查
  - 清除常驻城市：pending 保持、Esc/遮罩不关闭、网络失败错误保留在 Sheet 且不误判冲突、409 重试仍保留 Sheet、成功后关闭并读回“未设置城市”
  - `pageerror/console/request` 关键致命项统计为 0
- 结果：通过（`test-results/home-feed-p13-browser/20260718/manifest.json`）
- 未覆盖：Android 返回键/后台恢复/请求级别 backtrace 语义（留给 Android 验收）

相关截图文件：
`p13-home-font130.png`, `p13-location-retry-success.png`, `p13-settings-font130.png`, `p13-clear-home-fail.png`, `p13-clear-home-conflict.png`, `p13-clear-home-success.png`, `p13-final-home.png`
