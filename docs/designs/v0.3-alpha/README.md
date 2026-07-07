# 衣橱穿搭助手 v0.3-alpha 视觉评审台

本目录是 v0.3-alpha 人眼视觉评审交付物。alpha 阶段只建立评审台、真实截图基线、目标设计基线、AI 差异清单和人工意见导出能力，不进入 v0.3-beta / v0.3-rc 的正式 UI 迁移。

## 执行方式

本轮截图使用正式业务流程：

1. 打开 App 登录页并截图。
2. 进入注册页截图，注册测试账号。
3. 退出后重新走登录流程。
4. 进入设置页截图，并通过正式设置弹窗写入 MiniMax Key。
5. 进入衣橱正式添加衣物流程。
6. 单品录入 Step 1 空状态截图。
7. 从图库导入 9 张衣物图片后截图。
8. 调用 live MiniMax 识别，进入“核对 AI 识别结果”确认页后截图顶部和底部。
9. 保存衣物，等待服务器读回，截图衣橱首页和单品详情。
10. 在详情页触发删除确认 Sheet，只截图并取消。
11. 正式创建套装，截图套装首页、详情和月历。
12. 正式创建种草单品，截图种草首页和详情。

本轮 14 个页面状态中，原计划的 `image_source_sheet` 已按最新正式流程替换为 `intake_single_step1_imported`。该状态是导入图片后、点击 AI 识别前的一次性截图节点。

## 文件

- `visual-review.html`：可直接打开的人眼视觉评审台。
- `visual-review-data.json`：评审台数据、状态清单、截图路径和 AI 差异清单。
- `live-capture-manifest.json`：真实业务流截图证据，由截图脚本生成。
- `beta-migration-list.md`：基于 AI 差异的 v0.3-beta 候选迁移清单初稿。
- `screenshots/`：390×844 当前真实截图基线。
- `assets/visual-review.css` / `assets/visual-review.js`：评审台样式和本地交互。
- `exports/`：人工意见导出文件的建议存放目录。

## 命令

```bash
npm run v03-alpha:capture
npm run v03-alpha:build
npm run test:logic:v03-alpha-visual-review
```

截图脚本会通过 `scripts/run-e2e-local.sh` 加载本机测试环境，并使用正式 UI 配置 MiniMax Key。MiniMax Key 只从本机环境/Keychain 进入浏览器 localStorage，不写入本目录、日志或 JSON。

## 人工意见

打开 `visual-review.html` 后，人工意见会自动保存在浏览器 localStorage。页面提供：

- 导出 JSON：`v03-alpha-human-review.json`
- 导出 Markdown：`v03-alpha-human-review.md`
- 清空本地意见：带浏览器确认弹窗

导出的人工意见用于后续 v0.3-beta 迁移，不直接修改生产代码。

## 未完成项

- 本目录不包含 v0.3-beta/rc 迁移实现。
- 本轮只覆盖 390×844，不覆盖 360/375/412/430 多尺寸。
- 协议/隐私、账号管理、编辑页、裁切页、Lightbox、Toast 等状态登记到后续 backlog，不进入本轮截图。
