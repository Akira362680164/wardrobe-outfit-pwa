# v1.1.17 录入字段契约验证报告

日期：2026-06-15  
执行 Agent：Codex  
版本：1.1.17

## 结论

已按本轮最终口径完成修复并验证通过：

- 单品录入、种草录入、套装录入的 AI 字段、确认页字段、保存字段与详情展示字段口径收敛。
- 单品和种草颜色改为系统色卡与三种颜色模式，不再使用手工颜色文本输入。
- 种草录入与种草编辑入口不再识别、展示或保存价格、币种、商品链接。
- 用户可见来源标签删除“本地”，改为 AI / 默认 / 已修改 / 待确认。
- 种草录入处理中可退出，返回键会给出退出确认。
- 设置页缓存失败支持查看全部失败记录、单项重试、查看衣物、重试全部失败项。

## 关键验证

| 项目 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm run test:logic:all` | 通过 |
| `npm run build` | 通过，仅既有 lint warnings |
| MiniMax Keychain | 找到 `MINIMAX_API_KEY` / `fangzheng` |
| MiniMax live 链路 | 通过，HTTP 200，JSON 可解析，未返回 `price/currency/productUrl` 键 |
| 内置浏览器 DOM 烟测 | 通过，`localhost:3000` 可打开，未出现旧价格/链接字段 |
| 移动端竖屏截图 | `review-artifacts/intake-field-contract/mobile-portrait-home.png` |
| 移动端横屏截图 | `review-artifacts/intake-field-contract/mobile-landscape-home.png` |

## 变更覆盖

### 单品录入

- 新增系统色归一化，限制 AI 色值进入 12 个系统色。
- 确认页颜色区改为颜色模式 + 色卡选择。
- 备注、材质、细分等字段进入 AI 映射和确认页。
- 衣橱位置、状态不显示来源标签。

### 种草录入

- 新增独立 `analyzeWishlistIntakeImageOnDevice`，不再使用旧买前评估图片识别链路。
- Prompt 明确禁止 `price/currency/productUrl/url/link/brand/shop/purchaseAdvice/worthBuying`。
- 确认页移除价格、币种、商品链接。
- 保存 adapter 不写入价格、币种、商品链接。
- 种草详情不再展示购买信息卡片。
- 种草编辑页保留编辑能力，但删除价格/链接输入和旧识别入口。

### 套装录入

- 增加字段契约测试，确认套装录入只处理套装元数据，不识别单品属性。

### 缓存失败明细

- 失败摘要可打开全部失败记录。
- 全部失败记录支持查看衣物、单项重试和重试全部失败项。

## 未验证风险

- 未做 Android 真机实操录入，因为当前环境没有连接真机。
- MiniMax live 验证使用的是安全的最小文本 JSON 请求，不上传用户图片；真实商品图识别仍需用户在 APK 内用本机 Key 进行端侧验证。
- `npm run build` 仍输出项目既有 lint warnings，本轮未把全仓历史 warning 作为修复范围。

