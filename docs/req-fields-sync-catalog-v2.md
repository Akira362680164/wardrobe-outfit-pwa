# 业务需求书：衣物字段统一 + catalog 接入 v2

**项目**：wardrobe-outfit-pwa（衣橱穿搭助手）
**版本**：v2（整合所有业务讨论拍板）
**日期**：2026-06-24
**目的**：给 Claude Code 执行；用户已通过业务讨论拍板所有决策
**读者**：Claude Code（执行）/ 用户（评审）

---

## 一、业务背景

现在 `WardrobeItem`（衣橱单品）和 `WishlistItem`（种草单品）在 types.ts 里**字段重复定义**（共享字段靠复制粘贴维护），同时：

- `subcategory` 字段定义 + AI prompt + 录入 UI 都有，但 `garment-category-catalog.ts`（9 组 90 项细分）几乎没人用——subcategory 当前是 free-form 中文，**没真正接入 catalog 系统**
- 颜色字段有 6 个（`colorMode` / `mainColor` / `accentColors` / `primaryColors` / `secondaryColors` / `colors`），其中 `colors` 是死字段，`primaryColors` / `secondaryColors` 是冗余派生——脏数据风险大
- `fitGender` / `fitNotes` AI 识别了但衣橱 + 种草的录入和详情页都看不到
- `WardrobeItem.purchasePrice` 跟 `WishlistItem.price` 重复表达"价格"
- `WishlistItem.styleTags` / `sceneTags` 是历史遗留重复字段

业务上"一件衣物"是**统一概念**——衣橱单品是它的"已购入"状态，种草单品是它的"想购买"状态。代码层面也应该体现这个统一。

---

## 二、业务目标

1. **一件衣物的字段只定义一次** —— `BaseItem` 抽出来，`WardrobeItem` / `WishlistItem` 继承
2. **`subcategory` 真正接入 catalog** —— dropdown 两层联动，AI 输出 catalog id，详情页显示中文 label
3. **颜色体系用 discriminated union** —— `colors: ColorInfo`
4. **价格统一为单一字段** —— `BaseItem.price`，含义按状态决定
5. **备注统一为 `notes`** —— 删 `WishlistItem.note`，全部用 `notes`（复数）
6. **AI 识别字段统一** —— 衣橱 + 种草录入流程完全一致，只在保存时根据状态决定写入哪张表

---

## 三、数据模型

### 3.1 ColorInfo（discriminated union）

```typescript
type ColorInfo =
  | { mode: "single"; primary: string }
  | { mode: "main_with_accent"; primary: string; accents: string[] }
  | { mode: "multicolor"; primaries: string[] };
```

业务含义：
- `single`：1 个主色（如纯白 T 恤）
- `main_with_accent`：1 个主色 + N 个辅助色（如白底红条纹衬衫）
- `multicolor`：N 个主色（如碎花裙）

类型保证：不会出现"multicolor 但只有 1 个 primary"或"main_with_accent 但没 accents"。

### 3.2 BaseItem（衣物通用字段）

```typescript
interface BaseItem {
  id: string;
  name: string;
  imageDataUrl: string;
  sourceImageDataUrl?: string;
  thumbnailDataUrl?: string;
  cropBox?: GarmentCropBox;          // 共有：种草录入也支持裁切
  category: GarmentCategory;          // 一级分类
  subcategory?: string;               // 二级细分（catalog id）
  colors: ColorInfo;
  seasons: Season[];
  styles: GarmentStyle[];
  formality?: number;                  // 1-5
  warmth?: number;                     // 1-5
  temperatureRange?: TemperatureRange;
  material?: string;
  fitGender?: GarmentFitGender;        // 固定 4 值枚举
  fitNotes?: string;                   // 版型说明，最多 40 字
  notes?: string;                      // 备注（统一用 notes，复数）
  price?: number;                      // 含义按状态决定：种草=售价，衣橱=历史成本
  productUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```

**fitGender 是固定 4 值枚举**：

```typescript
type GarmentFitGender = "menswear" | "womenswear" | "unisex" | "unknown";
```

AI 只能从这 4 个里选一个，UI 用 Chip 展示。

**fitNotes 字段约束**：
- 最多 40 字（防御性截断）
- types.ts 注释改为"最多 40 字"
- `device-minimax.ts:38` 的 `FIT_NOTES_MAX_LEN` 改为 40
- `sanitizeFitNotes` 函数逻辑不变

### 3.3 WardrobeItem（已购入的衣物）

```typescript
interface WardrobeItem extends BaseItem {
  id?: number;                         // Dexie 自增 number
  locationId: string;
  status: GarmentStatus;               // active / laundry / repair / archived
  wornDates: string[];
  purchaseDate?: string;               // 购买日期 YYYY-MM-DD
  referenceOutfitImages?: ReferenceOutfitImage[];
  aiStyleAdvice?: GarmentStyleAdvice;
  aiConfidence?: number;
  needsReview?: boolean;
  thumbnailVersion?: number;
  thumbnailUpdatedAt?: string;
  thumbnailStatus?: ThumbnailStatus;
}
```

### 3.4 WishlistItem（想购买的衣物）

```typescript
interface WishlistItem extends BaseItem {
  id: string;                          // time-based
  status: WishlistStatus;              // interested / rejected / archived
  convertedItemId?: number;
  convertedAt?: string;
  convertedItemDeletedAt?: string;
  aiAssessment?: WishlistAssessment;
}
```

### 3.5 字段归属总览

| 字段 | 共有（BaseItem） | 衣橱独有 | 种草独有 |
|---|---|---|---|
| 通用字段（name/imageDataUrl/sourceImageDataUrl/thumbnailDataUrl/cropBox/...） | ✓ | | |
| category / subcategory | ✓ | | |
| colors (ColorInfo) | ✓ | | |
| seasons / styles / formality / warmth / temperatureRange / material | ✓ | | |
| fitGender / fitNotes / notes | ✓ | | |
| price / productUrl | ✓ | | |
| createdAt / updatedAt | ✓ | | |
| locationId | | ✓ | |
| status (衣橱 4 态) | | ✓ | |
| wornDates / purchaseDate | | ✓ | |
| referenceOutfitImages / aiStyleAdvice | | ✓ | |
| aiConfidence / needsReview | | ✓ | |
| thumbnailVersion / thumbnailUpdatedAt / thumbnailStatus | | ✓ | |
| status (种草 3 态) | | | ✓ |
| convertedItemId / convertedAt / convertedItemDeletedAt | | | ✓ |
| aiAssessment | | | ✓ |

### 3.6 字段命名统一

| 字段 | 旧名 | 新名 | 说明 |
|---|---|---|---|
| 用户备注 | `WishlistItem.note` | `WishlistItem.notes` | 仅 WishlistItem 重命名（单数→复数）；`WardrobeItem.notes` 当前已是复数，保持不变 |
| AI 备注 | `GarmentTagResult.note` + `ShoppingAssessmentCandidate.note` | `notes`（统一） | 跟 BaseItem 字段名一致 |

### 3.7 删除字段

| 字段 | 删除原因 |
|---|---|
| `WishlistItem.currency` | 死字段 |
| `WishlistItem.shopName` | 死字段 |
| `WishlistItem.styleTags` | 跟 styles 重复 |
| `WishlistItem.sceneTags` | 业务上跟 styles 重叠 |
| `WishlistItem.note` | 统一用 `notes` |
| `WardrobeItem.colors` | 死字段 |
| `WishlistItem.colors` | 死字段 |
| `WardrobeItem.sceneTags` | 业务上跟 styles 重叠 |
| **`WardrobeItem.purchasePrice`** | **合并到 `BaseItem.price`** |
| **`WardrobeItem.brand`** | **业务决策不保留 brand 字段** |
| **`WishlistItem.brand`** | **业务决策不保留 brand 字段** |
| **`WardrobeItem.colorMode / mainColor / accentColors / primaryColors / secondaryColors`** | **由 `colors: ColorInfo` discriminated union 替换；迁移见 §10.1** |
| **`WishlistItem.colorMode / mainColor / accentColors / primaryColors / secondaryColors`** | **由 `colors: ColorInfo` discriminated union 替换；迁移见 §10.1** |

---

## 四、Catalog 系统

catalog 数据已在 `src/lib/garment-category-catalog.ts`，9 组 90 项细分。**存 id，展示和编辑用中文**。

### 4.1 完整字典结构（id ↔ 中文映射）

```
上衣 (tops) [22 项]:
  t_shirt → T恤
  polo → POLO衫
  shirt → 衬衫
  blouse → 女衫
  vest → 马甲
  sweater_knit → 毛衣/针织
  hoodie_sweatshirt → 卫衣
  suit_jacket → 西装
  denim_jacket → 牛仔衣
  baseball_jacket → 棒球服
  jacket → 夹克
  padded_fleece → 棉衣/羊羔绒
  trench_coat → 风衣
  overcoat → 大衣
  down_jacket → 羽绒服
  leather_jacket → 皮衣
  fur → 皮草
  cape → 斗篷
  camisole → 吊带
  tank_top → 背心
  tube_top → 抹胸
  other_tops → 其他上衣

裤子 (pants) [7 项]:
  jeans → 牛仔裤
  casual_pants → 休闲裤
  sports_pants → 运动裤
  suit_pants → 西装裤
  leggings → 打底裤
  leather_pants → 皮裤
  other_pants → 其他裤子

半身裙 (skirts) [6 项]:
  pencil_skirt → 包臀裙
  pinafore_skirt → 背带裙
  tutu_skirt → 蓬蓬裙
  a_line_skirt → A字裙
  pleated_skirt → 百褶裙
  other_skirts → 其他半身裙

连体装 (one_piece) [2 项]:
  dress → 连衣裙
  jumpsuit → 连衣裤

鞋 (shoes) [17 项]:
  high_heels → 高跟鞋
  loafers → 乐福鞋
  long_boots → 长靴
  ankle_boots → 跟/短靴
  flat_fashion_shoes → 平底时装鞋
  sandals → 凉鞋
  skate_shoes → 板鞋
  canvas_shoes → 帆布鞋
  sneakers → 运动鞋
  driving_shoes → 豆豆鞋
  clogs → 洞洞鞋
  platform_shoes → 松糕鞋
  slip_ons → 懒人鞋
  snow_boots → 雪地鞋
  casual_shoes → 休闲鞋
  slippers → 拖鞋
  other_shoes → 其他鞋类

包 (bags) [8 项]:
  casual_sport_bag → 休闲/运动包
  fashion_bag → 时装包
  canvas_bag → 帆布包
  waist_chest_bag → 腰/胸包
  luggage → 箱包
  clutch → 手拿包
  backpack → 双肩包
  other_bags → 其他包类

帽子 (hats) [11 项]:
  baseball_cap → 鸭舌帽
  beret → 贝雷帽
  knit_hat → 毛线帽
  sun_hat → 遮阳帽
  headscarf_hat → 头巾帽
  bucket_hat → 渔夫帽
  flat_cap → 平顶帽
  newsboy_cap → 报童帽
  lei_feng_hat → 雷锋帽
  fedora_hat → 礼帽
  other_hats → 其他帽子

首饰 (jewelry) [6 项]:
  bracelet_bangle → 手链/镯
  ring → 戒指
  brooch → 胸针
  necklace → 项链
  earrings → 耳饰
  other_jewelry → 其他首饰

配饰 (accessories) [11 项]:
  watch → 手表
  hair_accessory → 发饰
  underwear → 内衣
  socks → 袜子
  tie → 领带
  belt_chain → 腰带/腰链
  scarf_shawl → 围巾/披肩
  silk_scarf → 丝巾
  gloves → 手套
  glasses → 眼镜
  other_accessories → 其他配饰
```

### 4.2 业务规则

- **存 id 不存中文**：`WardrobeItem.subcategory` 存 `shirt`，不是"衬衫"
- **dropdown 两层联动**：先选一级 group（9 chip），选完二级 chip 动态显示该组细分
- **切换大类时二级清空**：避免"上衣 - 高跟鞋"矛盾组合
- **AI 已识别默认选中**：dropdown 默认值 = AI 输出，可改
- **留空合法**：保存时 subcategory = undefined，UI 显示"未选择"
- **详情页 / 编辑显示中文 label**：通过 `getSubcategoryLabel(groupId, subcategoryId)` 翻译
- **老数据兼容**：`WardrobeItem.subcategory` 是 free-form 中文（如"百褶裙"）→ 先做 **label 反查兜底**：遍历当前 group 的 subcategories，若旧字符串与某项 `label` 完全相等（或去空白后相等），直接写入对应 id，无需用户介入；反查失败再留空 + UI 标"待校对"，用户自己改 dropdown 或再次 AI 识别
- **`WardrobeItem.category` 老 enum 迁移**：用现有 `mapLegacyCategoryToCatalogGroup` 映射到 catalog group id；`skirt` 旧 enum 无对应值，统一归到 `other_pants`

### 4.3 AI prompt 要求

prompt 必须强制 AI 输出 catalog id：

```json
{ "category": "tops", "subcategory": "shirt" }
```

**不是**：

```json
{ "category": "上装", "subcategory": "短袖衬衫" }
```

归一函数做兜底：category 不在 9 组里 → warn，UI 标"待确认"；subcategory 不在 group 细分里 → 留空，UI 标"待确认"。

---

## 五、AI 识别（13 个字段，衣橱 + 种草统一）

### 5.1 字段清单

| # | 字段 | 类型 | 业务含义 | 备注 |
|---|---|---|---|---|
| 1 | `name` | string | 名称 | 通过 `candidateNames` 给 1-3 个候选，系统选第一个 |
| 2 | `category` | catalog group id | 一级分类 | 9 组之一 |
| 3 | `subcategory` | catalog subcategory id | 二级细分 | catalog 90 项之一 |
| 4 | `colors` | ColorInfo | 颜色 | discriminated union |
| 5 | `seasons` | Season[] | 季节 | 春/夏/秋/冬/四季 |
| 6 | `styles` | GarmentStyle[] | 风格 | 甜美/通勤/优雅/户外/旅行 |
| 7 | `formality` | number 1-5 | 正式度 | |
| 8 | `warmth` | number 1-5 | 保暖度 | |
| 9 | `temperatureRange` | { minC, maxC } | 适穿温度 | 0-40℃ |
| 10 | `material` | string | 材质 | 如 "棉" / "羊毛" / "皮革" |
| 11 | `fitGender` | GarmentFitGender | 版型倾向 | 4 值枚举 |
| 12 | `fitNotes` | string | 版型说明 | 最多 40 字 |
| 13 | **`notes`** | **string** | **备注**（AI 识别 + 用户补充） | 20-80 字 |

### 5.2 AI Prompt 系统消息（最终版）

```
你是衣橱管理 App 的 M3 多模态衣物识别助手。请只输出合法 JSON，不要输出 Markdown 或解释文字。

[catalog 字典]：9 组 90 项（完整列出）

输出字段（共 13 个）：
- candidateNames: ["中文名称，1-3个候选，8字以内，描述品类和显著特征"]
- category: catalog group id 之一（tops / pants / skirts / one_piece / shoes / bags / hats / jewelry / accessories）
- subcategory: catalog subcategory id 之一；从对应 group 的细分中选；不识别时输出空字符串
- colors: 按下面三种模式之一输出
  - { "mode": "single", "primary": "白" }
  - { "mode": "main_with_accent", "primary": "白", "accents": ["蓝"] }
  - { "mode": "multicolor", "primaries": ["白", "黑", "红"] }
- seasons: ["spring"|"summer"|"autumn"|"winter"|"all"] 数组
- styles: ["casual"|"sweet"|"elegant"|"commute"|"outdoor"|"dinner"|"vacation"] 数组
- formality: 1-5 整数
- warmth: 1-5 整数
- temperatureRange: { "minC": 数字或 null, "maxC": 数字或 null }
- material: 中文材质短词
- fitGender: "menswear"|"womenswear"|"unisex"|"unknown" 之一
- fitNotes: 一句话版型说明，最多 40 字
- notes: 20到80字中文备注，只描述图片中可见信息

不输出以下字段：price、currency、productUrl、url、link、brand、shop、sceneTags、styleTags、imageType、candidates、purchaseDate、locationId、status、wornDates、referenceOutfitImages、aiStyleAdvice、aiAssessment、convertedItemId、convertedAt、note（拼写错误，禁止用 note 单数）、其他字段。

颜色归一规则：白色、纯白 -> 白；米白、奶油色、杏色 -> 米；卡其 -> 棕；浅蓝、深蓝 -> 蓝；丹宁蓝、牛仔蓝色 -> 牛仔蓝。
版型判断：不要按颜色刻板判断版型（粉色不一定是女装，黑灰蓝不一定是男装）；优先根据剪裁、品类、肩线、腰线、裙摆、裤型、鞋型、包型、饰品风格判断。卫衣、T恤、牛仔裤、运动鞋、棒球帽等可优先 unisex。
```

### 5.3 兜底规则

| 情况 | 处理 |
|---|---|
| AI 给的 category 不在 9 组 | warn，UI 标"待确认" |
| AI 给的 subcategory 不在 catalog | 留空，UI 标"待确认" |
| AI 给的 fitGender 不在 4 值枚举 | 强制改为 `unknown` |
| AI 给的 fitNotes 超 40 字 | 截断到 40 字 |
| AI 给的 notes 超 80 字 | 截断到 80 字 |
| AI 没识别的字段 | 留空（用户在步骤 3 手动填） |
| 种草录入不再用 imageType / candidates | 简化到只支持 single_item |

---

## 六、用户填字段（6 个，AI 不识别）

| 字段 | 业务含义 | 谁填 | 备注 |
|---|---|---|---|
| `notes` | 备注 | AI 给默认值 + 用户补充 | 见 5.1 |
| `price` | 种草售价 / 衣橱历史成本 | 用户填 | 含义按状态决定 |
| `productUrl` | 商品链接 | 用户填 | 种草去下单，衣橱退回 / 再买入口 |
| `locationId` | 衣橱位置 | 用户选（仅衣橱） | |
| `status` | 衣橱 4 态 / 种草 3 态 | 用户选 | |
| `purchaseDate` | 购买日期 | 用户选（仅衣橱） | DatePicker |

---

## 七、录入流程（三步走）

### 7.1 衣橱单品录入（`flowKind="garment"`）

**步骤 1：选择照片**（`MultiImageSelectStep`）
- 用户从相机 / 相册选图（多图，最多 GARMENT_INTAKE_MAX_IMAGES 张）
- 选完点 "下一步" 进入步骤 2

**步骤 2：编辑图片**（`MultiImageCropStep`）
- 用户对每张图裁切（cropBox 共有）
- 裁切完点 "开始识别"（按钮文案）
- AI 识别触发：`processAllImagesForRecognition()` 遍历所有图片
- AI prompt 走 garment prompt（输出 13 个字段）
- 全部识别完自动跳到步骤 3

**步骤 3：确认信息**（`MultiImageReviewStep`）
- 显示 AI 识别的所有字段
- 用户校对所有字段（按 UI 字段映射表 8.1）
- 衣橱多填：locationId + status + purchaseDate
- 校对完点 "保存 X 件单品" 写入 WardrobeItem 表

### 7.2 种草单品录入（`flowKind="wishlist"`）

**步骤 1：选择照片**（跟衣橱一样，多图）

**步骤 2：编辑图片**（跟衣橱一样，裁切 → 开始识别）
- AI 识别触发：`recognizeShoppingImage` 简化为只输出单件识别（用 garment 同款 13 字段）
- 全部识别完自动跳到步骤 3

**步骤 3：确认信息**（跟衣橱共用 `MultiImageReviewStep`）
- 校对所有 13 个字段
- 种草多填：status（种草 3 态）
- 校对完点 "保存 X 件种草单品" 写入 WishlistItem 表

### 7.3 衣橱录入 vs 种草录入：差异总览

| 步骤 | 衣橱录入 | 种草录入 | 差异 |
|---|---|---|---|
| 步骤 1 | 选图 | 选图 | **无** |
| 步骤 2 | 裁切 + AI 识别 | 裁切 + AI 识别 | **无** |
| 步骤 2 用的 prompt | `recognizeGarmentImage` | `recognizeShoppingImage`（字段跟 garment 一样） | 内部函数不同，输出 schema 一致 |
| 步骤 3 校对 | 13 个共有字段 + 衣橱独有 | 13 个共有字段 + 种草独有 | 独有字段不同 |
| 保存 | WardrobeItem | WishlistItem | 表不同 |

**步骤 3 字段差异（详细）**：

| 字段组 | 衣橱录入步骤 3 | 种草录入步骤 3 |
|---|---|---|
| 共有字段（13 个） | name / category / subcategory / colors / seasons / styles / formality / warmth / temperatureRange / material / fitGender / fitNotes / notes / price / productUrl | 同上 |
| 衣橱独有 | locationId / status（衣橱 4 态）/ purchaseDate | — |
| 种草独有 | — | status（种草 3 态） |

### 7.4 imageType / candidates 概念

**录入阶段不用**。种草录入简化为只支持 single_item（跟衣橱一样）。

- `ShoppingImageAnalysis.imageType` 字段：录入阶段不输出（但类型保留供 `aiAssessment` 评估用）
- `ShoppingImageAnalysis.candidates[]` 字段：录入阶段不输出
- 失去的能力：淘宝截图自动识别价格、多件 / 套装候选选择、镜面自拍自动裁切
- 保留的能力：种草 aiAssessment（买前评估，基于单件）

---

## 八、UI 行为

### 8.1 步骤 3 校对页字段映射

| UI 控件 | 默认值来源 | 用户可改 |
|---|---|---|
| name TextField | AI candidateNames[0] | ✓ |
| category Dropdown（一级 9 chip） | AI 识别 | ✓ |
| subcategory 两层 Dropdown | AI 识别 | ✓ |
| colors ColorInfo 编辑器（按 mode 渲染） | AI 识别 | ✓ |
| seasons Tag 多选 | AI 识别 | ✓ |
| styles Tag 多选 | AI 识别 | ✓ |
| formality NumberStepper 1-5 | AI 识别（默认 3） | ✓ |
| warmth NumberStepper 1-5 | AI 识别（默认 3） | ✓ |
| temperatureRange 双端点可拖动滑块 | AI 识别 | ✓ |
| material TextField | AI 识别 | ✓ |
| fitGender Chip 4 选 1 | AI 识别 | ✓ |
| fitNotes TextField | AI 识别 | ✓ |
| **notes Textarea** | **AI 识别（20-80 字）+ 用户补充** | ✓ |
| price NumberInput | 用户填 | ✓ |
| productUrl TextField | 用户填 | ✓ |
| locationId SelectField | 用户选（仅衣橱） | ✓ |
| status SelectField | 用户选（衣橱 4 态 / 种草 3 态） | ✓ |
| purchaseDate DatePicker | 用户选（仅衣橱） | ✓ |

### 8.2 ColorInfo 编辑器

按 mode 渲染：

```
mode = "single":
  [主色 chip 选择]

mode = "main_with_accent":
  [主色 chip] [辅助色 chip 多选]

mode = "multicolor":
  [主色 chip 多选]
```

切换 mode 时弹确认："切换颜色模式会清空当前选择"。

### 8.3 temperatureRange UI

**展示模式**（详情页 / 列表卡片）：

```
温度区间可视化进度条：
┌──────────────────────────────────────────────────┐
│  0℃                    15℃              28℃    40℃│
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ████████░░░░░░░░░░░░██████████░░░░░░░░░░░░░░░░░  │
│  🟦                    ⬤             ⬤         🟥  │
│  (蓝)              15℃           28℃         (红)│
└──────────────────────────────────────────────────┘
```

业务规则：
- 进度条背景：0℃ 到 40℃ 蓝→红渐变
- 实际区间：高亮实色填充
- 超出区间（<0℃ 或 >40℃）：自动 clamp 到进度条两端
- 上方文字：`15℃ - 28℃`
- 进度条端点：两个圆点标注 min / max
- AI 未识别或留空：进度条灰色 + 显示"未设置"

**编辑模式**（录入 / 编辑页）：

双端点可拖动滑块：

```
温度区间编辑器：
┌──────────────────────────────────────────────────┐
│  适穿温度                                  15-28℃│
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●      │
│  拖动左侧端点 = 最低温                               │
│  拖动右侧端点 = 最高温                               │
└──────────────────────────────────────────────────┘
```

业务规则：
- 单条进度条上两个圆点（**不是**双 slider 控件）
- 范围 0-40℃，步长 1℃
- 左端点 ≤ 右端点
- 上方实时显示 `15℃ - 28℃` 文字

### 8.4 date 字段 UI

- 用 native DatePicker / `<input type="date">`
- 不让用户手输 YYYY-MM-DD 字符串
- 默认值：AI 未识别时留空；衣橱新增默认今天
- 详情页展示："YYYY年M月D日"（如"2026年6月24日"）

### 8.5 二次识别

- 录入页和详情页**已有**"重新识别"按钮，保留
- 用户也可以只改某个 dropdown 字段（不需要走"重新识别"）
- AI 二次识别会重置所有 13 个 AI 识别字段

### 8.6 详情 / 编辑 UI 补全清单

**衣橱详情 / 编辑**（`garment-detail-3.0.tsx`）当前缺：
- fitGender / fitNotes 展示
- notes 展示
- price 展示

**种草详情 / 编辑**（`wishlist-view-2.0.tsx` 第 800-936 行）当前缺 UI 控件（state 在 211-480 行全有）：
- subcategory（两层 dropdown）
- colors（ColorInfo 编辑器）
- fitGender / fitNotes
- notes（Textarea）
- price / productUrl

**衣橱录入补**：
- fitGender（Chip）
- fitNotes（TextField）
- temperatureRange（双滑块）
- purchaseDate（DatePicker）
- **price**（之前 garment 模式没显示）
- **productUrl**（之前 garment 模式没显示）
- notes（已有）

**种草录入补**：
- fitGender（Chip）
- fitNotes（TextField）
- temperatureRange（双滑块）
- notes（已有）

formality / warmth / seasons / styles / material 在 garment-intake-flow.tsx 没有 `flowKind` 限制，两边都渲染。

---

## 九、种草 → 衣橱 转换

字段映射（`wishlistToWardrobeItem`）：

| WishlistItem | WardrobeItem |
|---|---|
| name | name |
| imageDataUrl / sourceImageDataUrl | 同名 |
| cropBox | 同名 |
| category / subcategory / colors | 同名 |
| seasons / styles | 同名 |
| formality / warmth / temperatureRange / material | 同名 |
| fitGender / fitNotes / notes | 同名 |
| **price** | **同名**（字段统一，含义从"售价"变"历史成本"） |
| **productUrl** | **同名**（保留作为退货 / 再买入口） |
| (无) | purchaseDate = 今天 |
| (无) | wornDates = [] |
| (无) | locationId（用户选，默认 = 第一个衣橱位置） |
| (无) | status = "active" |
| id (string) | id 变化（WardrobeItem 用 number） |
| convertedItemId | 指向新 WardrobeItem.id |
| aiAssessment | 丢弃（衣橱无此字段） |

---

## 十、数据迁移

### 10.1 颜色字段迁移

老数据 `mainColor + accentColors + primaryColors + secondaryColors + colorMode` → `colors: ColorInfo`：

```
colorMode = "single" + mainColor 有值:
  → { mode: "single", primary: mainColor }

colorMode = "main_with_accent" + mainColor + accentColors:
  → { mode: "main_with_accent", primary: mainColor, accents: accentColors }

colorMode = "multicolor" + primaryColors:
  → { mode: "multicolor", primaries: primaryColors }

colorMode 未填 / undefined:
  → 默认 "single"，primary = primaryColors[0] ?? mainColor ?? ""
```

**兜底规则**：迁移后 `primary` 为空字符串或 `primaries` 为空数组时，UI 详情页显示"未识别"占位，并在编辑页 / 录入页提示用户走"重新识别"或手动选色；不阻塞保存。

### 10.2 字段迁移总览

| 老数据 | 迁移目标 |
|---|---|
| `WardrobeItem.subcategory` (free-form 中文) | label 反查命中 → 写入对应 catalog id；反查失败 → 留空 + UI 标"待校对" |
| `WardrobeItem.category` (旧 enum) | `mapLegacyCategoryToCatalogGroup` 归一 |
| 颜色 5 字段 | 归一到 `colors: ColorInfo` |
| 死字段（currency / shopName / colors / styleTags / sceneTags / note） | 直接丢弃 |
| **`WardrobeItem.purchasePrice`** | **合并到 `BaseItem.price`** |
| `WishlistItem.id` (string) | 不变 |
| `WardrobeItem.id` (number) | 不变 |
| 种草转衣橱时的 ID 变化 | 业务上接受 |

---

## 十一、验收标准

每 Phase 完成后都要跑：
- `npm run typecheck` —— 0 errors
- `npm run test:logic:all` —— 全过
- `npm run build` —— 通过

Playwright 移动视口（390×844）实测必须覆盖：

| 场景 | 验收点 |
|---|---|
| 衣橱录入 | 选图 → AI 识别 → dropdown 改 subcategory → 保存 → 详情页显示中文 label |
| 种草录入 | 同上 + price / productUrl 填进去 |
| 衣橱详情 | fitGender / fitNotes / notes / price 全部显示 |
| 种草详情 | subcategory / colors / fitGender / fitNotes / notes / price / productUrl 全部显示 |
| 种草转衣橱 | 自动转换后字段映射正确（price 透传 / productUrl 透传 / notes 透传） |
| 颜色编辑器 | 三种 mode 切换正常，字段正确 |
| temperatureRange | 蓝→红渐变进度条展示，双端点可拖动滑块编辑 |
| 老数据兼容 | 旧衣橱数据 subcategory 显示原值 + "待校对"标签；颜色显示正常 |

---

## 十二、改动文件范围

**主要逻辑**：
- `src/lib/types.ts` — 抽 BaseItem + ColorInfo + 改继承 + 删死字段 + 字段 rename（note → notes）+ fitNotes 注释改 40 字
- `src/lib/intake-save-adapters.ts` — 适配新字段结构（note → notes）
- `src/lib/intake-draft.ts` / `src/lib/intake-local-draft.ts` — 草稿 schema（note → notes）
- `src/lib/migrate.ts` — 老数据迁移（颜色归一 + 死字段清掉）
- `src/lib/wishlist-conversion.ts` — 适配新 BaseItem + ColorInfo
- `src/lib/recommendations.ts` — 适配 `colors: ColorInfo`
- `src/lib/wishlist-assessment.ts` — 删 `subcategory?.includes("skirt")` 硬编码 + 删 `if (item.subcategory) score += 1`
- `src/lib/device-minimax.ts` — AI prompt 改输出 catalog id + ColorInfo + 删 sceneTags/styleTags/imageType/candidates + fitGender 4 值 + note → notes + `FIT_NOTES_MAX_LEN = 40`
- `src/lib/intake-color-mode-editor.tsx` — 改成 ColorInfo 编辑器

**UI**：
- `src/components/garment-intake-flow.tsx` — 录入 UI（衣橱 + 种草共用）
- `src/components/wishlist-intake-flow.tsx` — **整文件删** (e93fb47 commit 后整个种草录入已切到 `GarmentIntakeFlow` `flowKind="wishlist"`，整个文件不再被生产代码引用，只剩 7 个测试脚本 grep 它做合约断言；测试在 v1.1.22-dev 同步改为 grep `garment-intake-flow.tsx` 的 `flowKind="wishlist"` 分支)
- `src/components/garment-detail-3.0.tsx` — 衣橱详情补 fitGender / fitNotes / notes / price
- `src/components/wishlist-view-2.0.tsx` — 种草详情 / 编辑补 subcategory / colors / fitGender / fitNotes / notes / price / productUrl
- `src/components/wardrobe-app.tsx` — 补 fitGender / fitNotes 展示（如 garment-detail 没补全）

Dexie：不需要升 schema 版本号（字段都兼容）。

---

## 十三、不要做的

- 不要改 Dexie schema 版本号
- 不要改 Android 原生签名 / Manifest / Gradle
- 不要新增 npm 依赖
- 不要重写 `wardrobe-app.tsx` 大范围
- 不要删 AI 二次识别按钮
- 不要在 BaseItem 里加 `purchaseDate` / `purchasePrice` / `locationId` / `status` / `wornDates`（业务上是子类独有）
- 不要在 BaseItem 里加 brand 字段（业务上决定不加）
- 不要把 `SavedOutfit` 改成继承 BaseItem（套装不属于"衣物"概念）
- 不要打 APK（除非用户明确说）
- 不要保留 `WishlistItem.note` 兼容（直接删，统一用 `notes`）
- 不要保留 `WishlistItem.purchasePrice` 兼容（已合并到 `price`）

---

## 十四、风险提示

按 `AGENTS.md` §119-141 风险门禁：
- 数据结构变化 → high
- AI prompt / 模型解析变化 → high
- 跨 5+ 文件 / `wardrobe-app.tsx` 大范围改动 → high
- 移动端录入 / 详情页 → high

**整体 high 风险**。

---

## 十五、Phase 拆分建议

**Phase 1：types + 数据迁移**
- types.ts 抽 BaseItem + ColorInfo + 改继承 + 删死字段 + note → notes rename
- types.ts fitNotes 注释改 40 字
- migrate.ts 老数据迁移（颜色归一）

**Phase 2：AI prompt + 适配器**
- device-minimax.ts prompt 改输出 catalog id + ColorInfo + 删 sceneTags/styleTags/imageType/candidates + fitGender 4 值 + note → notes
- device-minimax.ts `FIT_NOTES_MAX_LEN = 40`
- intake-save-adapters 适配新字段

**Phase 3：录入 UI**
- garment-intake-flow 改两层 dropdown + ColorInfo 编辑器 + 补字段（fitGender/fitNotes/temperatureRange/purchaseDate/price/productUrl）
- wishlist-intake-flow 整文件删（见 Phase 2 改动文件列表）

**Phase 4：详情 / 编辑页**
- garment-detail 补 fitGender / fitNotes / notes / price
- wishlist-view 补 subcategory / colors / fitGender / fitNotes / notes / price / productUrl

**Phase 5：转换 + 推荐适配**
- wishlist-conversion 适配新 BaseItem + ColorInfo
- recommendations 适配 ColorInfo
- wishlist-assessment 删死代码

**Phase 6：验证**
- typecheck / test:logic:all / build
- Playwright 移动视口实测
- VERSION_HISTORY 记录

---

## 十六、给 Claude Code 的执行提示

按项目约定（`AGENTS.md` / `codex_experience_profile.md`）：
1. 修改前先读 `AGENTS.md` + 本文档 + `VERSION_HISTORY.md` 最新条目 + `README.md` + `package.json`
2. 按 Phase 顺序做，**不要跨 phase 跳跃**
3. 每 Phase 完跑验证命令（typecheck / test:logic:all / build）
4. 老数据兼容，**不要破坏已有数据**
5. 字段命名 / UI 文案统一风格
6. 不要提交 `node_modules` / `.next` / `android/app/src/main/assets/public` / `*.apk` 等
7. commit 信息包含版本号或 phase 名，例如 `v1.2.0-dev Phase 1 BaseItem + ColorInfo`
8. **不要打 APK**（用户没明确说）
9. 不要自动启动 subagent 独立审查（项目默认跳过）

---

**文档结束。** 请评审。
