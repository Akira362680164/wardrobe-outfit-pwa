# Wardora 1C 代表性测试衣橱推荐验收

本报告只描述隔离测试 schema 中的非个人测试衣橱，不包含账号、密码、令牌、原图、用户标识或自由错误堆栈。测试图片字段使用项目授权测试资产占位，不引入外部图片。

## 衣橱与上下文

| 测试衣物 | 分类 | 颜色 | 预期用途 |
| --- | --- | --- | --- |
| 通勤衬衫 | 上装 | 白 | 稳妥通勤 |
| 休闲 T 恤 | 上装 | 黑 | 变化/休闲 |
| 西装裤 | 下装 | 黑 | 稳妥通勤 |
| 休闲裤 | 下装 | 蓝 | 变化/休闲 |
| 乐福鞋 | 鞋 | 黑 | 通勤正式度 |
| 运动鞋 | 鞋 | 白 | 舒适与步行 |

另有一套已保存的“代表性通勤套装”、一次带正反馈的历史穿着和一段七天外测试出差。边界衣物包括归档衣物、缺主图衣物和缺分类/颜色/季节/正式度字段衣物；日期边界包括已确认 primary 计划和实际已穿。

## 受控结果

- 今日 readiness：`ready`；今日与明日 current 使用同一 `generationBatchId`。
- 远期出差的空日期被纳入任务；已确认 primary 与实际已穿日期被跳过。
- 归档衣物排除码：`unavailable_status`。
- 缺主图衣物排除码：`missing_primary_image`。
- 缺必要字段衣物排除码：`missing_required_field`。
- 空衣橱/缺鞋等边界由同批隔离用户覆盖 `not_ready`，不会生成伪推荐；候选不足由既有 1A Fixture 覆盖 `limited`。
- 天气来源只可能为 `plan_semantic_inference`、`seasonal_inference` 或 `layering_default`；测试未声称接入 QWeather 或真实 forecast。

## 风险与未覆盖

- 当前模型没有“用户按日期关闭推荐”的持久化来源，Worker 已实现 actual/primary 两类跳过，但不会虚构关闭标志。
- 本批不实现推荐接受、计划快照、旅行打包页面、双端 UI、QWeather 或 PAW 增强。
