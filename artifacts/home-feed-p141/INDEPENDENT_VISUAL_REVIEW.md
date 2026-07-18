# P1.4.1 独立只读视觉审查与关闭记录

审查基线：`43a5add8c50282b7d6f3673ed7f0dd81eeedfd6b`

审查范围仅包括 travel、stale attribution、protected plan 后日期条/快照风险、partial weather error，以及窄屏/130% 的遮挡与溢出。

## 原始结论

- P0：0
- P1：1 个证据缺口
- P2：0
- P3：0
- 已截图的四个状态未发现可见缺陷。

P1 缺口：初始证据中 travel 仅 390/100%、stale 仅 360/130%、protected plan 仅 390/100%、partial error 仅 430/130%；只点击第 3 天，明日重试只检查入口而未实际恢复，因此当时结论为“修复证据门禁后再交付”。

## 关闭结果

- 四个受影响状态分别运行 `360/390/430px × 100%/130%`，每个组合均执行页面横向溢出断言并保存截图。
- protected plan 先证明事实卡、删除快照、blocked 风险和其后的日期条，再逐一点击第 3、4、5、6、7 天并验证 `aria-pressed=true`。
- partial weather error 实际点击明日卡的重试；Fixture 只让明日首次失败，重试后明日恢复 `30°/22°`，今日卡文字保持完全不变。
- 更新后的 `browser-manifest.json` 明确记录逐状态矩阵、`futureDatesAccessed: [3,4,5,6,7]` 和 `partialWeatherRetryRecoveredTomorrowOnly: true`。

结论：独立审查提出的唯一 P1 已关闭，P0/P1/P2 均无未关闭项；建议进入合入与 APK 收口。
