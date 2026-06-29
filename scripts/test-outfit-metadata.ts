import { strict as assert } from "node:assert";
import {
 buildLocalOutfitMetadataFromItems,
 buildOutfitMetadataSystemPrompt,
 buildOutfitMetadataPrompt,
 parseOutfitMetadataJson,
 sanitizeOutfitMetadata,
 labelGarmentStyle,
 mergeOutfitMetadataIntoDraft,
} from "../src/lib/outfit-ai-metadata";
import { createIntakeField } from "../src/lib/intake-draft";
import { buildColorInfo } from "../src/lib/color-fields";
import type { OutfitIntakeDraft } from "../src/lib/intake-draft";
import type { Season, WardrobeItem } from "../src/lib/types";
import { STYLE_LABELS } from "../src/lib/types";

const now = "2026-06-11T08:00:00.000Z";

function item(id: number, name: string, category: WardrobeItem["category"], color: string, opts: Partial<WardrobeItem> = {}): WardrobeItem {
 return {
 id,
 name,
 imageDataUrl: `data:image/png;base64,${id}`,
 thumbnailDataUrl: `data:image/png;base64,t${id}`,
 category,
 colors: buildColorInfo("single", [color]),
 seasons: ["spring", "autumn"],
 styles: ["commute"],
 formality:4,
 warmth:2,
 locationId: "home",
 status: "active",
 wornDates: [],
 createdAt: now,
 updatedAt: now,
 ...opts,
 };
}

let failed =0;
function check(name: string, fn: () => void) {
 try {
 fn();
 console.log(` ✓ ${name}`);
 } catch (err) {
 failed +=1;
 console.error(` ✗ ${name}`);
 console.error(" ", err instanceof Error ? err.message : String(err));
 }
}

console.log("Outfit Metadata Tests (v1.0)");

// ───labelGarmentStyle ─────────────────────────────────────────────
console.log("\n[labelGarmentStyle] 英文枚举 → 中文标签");
check("casual →休闲", () => assert.equal(labelGarmentStyle("casual"), "休闲"));
check("commute →通勤", () => assert.equal(labelGarmentStyle("commute"), "通勤"));
check("outdoor →户外", () => assert.equal(labelGarmentStyle("outdoor"), "户外"));
check("未知值原样返回", () => assert.equal(labelGarmentStyle("简约"), "简约"));
check("空字符串返回空", () => assert.equal(labelGarmentStyle(""), ""));

// ───parseOutfitMetadataJson ─────────────────────────────────────
console.log("\n[parseOutfitMetadataJson]");
check("合法 JSON", () => {
 const out = parseOutfitMetadataJson('{"name":"通勤套装"}');
 assert.equal((out as { name: string }).name, "通勤套装");
});
check("从 markdown提取 JSON", () => {
 const out = parseOutfitMetadataJson('```json\n{"name":"通勤套装"}\n```');
 assert.equal((out as { name: string }).name, "通勤套装");
});
check("非法 JSON抛错", () => {
 assert.throws(() => parseOutfitMetadataJson("not json"));
});

// ───sanitizeOutfitMetadata ─────────────────────────────────────
console.log("\n[sanitizeOutfitMetadata] 风格标签中文化 +标签清洗");
check("英文 styleTags 全转中文", () => {
 const clean = sanitizeOutfitMetadata({ styleTags: ["casual", "commute"] }, {});
 assert.deepEqual(clean.styleTags, ["休闲", "通勤"]);
});
check("sceneTags 中文原样保留 + 去重 +长度截断", () => {
 const clean = sanitizeOutfitMetadata({ sceneTags: ["通勤", "通勤", "约会", "x".repeat(30)] }, {});
 // "通勤" dedupe; "x".repeat(30)截到12字符 = "xxxxxxxxxxxx" (与 "约会" 不同,所以保留)
 assert.deepEqual(clean.sceneTags, ["通勤", "约会", "xxxxxxxxxxxx"]);
});
check("seasons 白名单过滤 + 全空→空数组", () => {
 const clean = sanitizeOutfitMetadata({ seasons: ["spring", "summer", "无效值", "autumn"] }, {});
 assert.deepEqual(clean.seasons, ["spring", "summer", "autumn"]);
});
check("temperatureRange清洗无效值", () => {
 const clean = sanitizeOutfitMetadata({ temperatureRange: { minC:18, maxC: "abc" as unknown as number } }, {});
 assert.deepEqual(clean.temperatureRange, { minC:18 });
});
check("中文 name 超长截断到30字", () => {
 const long = "套装名称非常非常非常非常非常非常非常非常非常长";
 const clean = sanitizeOutfitMetadata({ name: long }, {});
 assert.ok(clean.name && clean.name.length <=30);
});

// ───buildOutfitMetadataPrompt / SystemPrompt ──────────────────
console.log("\n[buildOutfitMetadataPrompt]");
check("Prompt 含 itemIds 白名单", () => {
 const prompt = buildOutfitMetadataPrompt({ itemIds: [1,2], outfitItems: [item(1, "衬衫", "tops", "白"), item(2, "裤子", "pants", "黑")], allItems: [] });
 assert.ok(prompt.includes("1"));
 assert.ok(prompt.includes("2"));
 assert.ok(prompt.includes("seasons"));
});
check("SystemPrompt 不含英文 style提示硬编码", () => {
 const prompt = buildOutfitMetadataSystemPrompt();
 assert.ok(!prompt.toLowerCase().includes("output style tags in english"));
});

// ───buildLocalOutfitMetadataFromItems ────────────────────────────
console.log("\n[buildLocalOutfitMetadataFromItems] 本地规则生成");
check("名称 =短袖衬衫等2件", () => {
 const meta = buildLocalOutfitMetadataFromItems({ outfitItems: [item(1, "短袖衬衫", "tops", "白"), item(2, "牛仔裤", "pants", "蓝")] });
 assert.ok(meta.name?.includes("短袖衬衫等2件"), `actual: ${meta.name}`);
});
check("styleTags 不含英文枚举", () => {
 const meta = buildLocalOutfitMetadataFromItems({ outfitItems: [item(1, "衬衫", "tops", "白", { styles: ["casual", "outdoor"] })] });
 // 所有标签都应该是中文 (即 STYLE_LABELS 反查应该返回自身,即已是中文)
 assert.ok(meta.styleTags);
 assert.ok(!meta.styleTags.includes("casual"));
 assert.ok(!meta.styleTags.includes("outdoor"));
 assert.ok(meta.styleTags.includes("休闲"));
 assert.ok(meta.styleTags.includes("户外"));
});
check("sceneTags 从 styleTags推断 (通勤 →通勤/办公)", () => {
 const meta = buildLocalOutfitMetadataFromItems({ outfitItems: [item(1, "衬衫", "tops", "白", { styles: ["commute"] })] });
 assert.ok(meta.sceneTags?.includes("通勤"));
});
check("无衣物时返回空对象", () => {
 const meta = buildLocalOutfitMetadataFromItems({ outfitItems: [] });
 assert.deepEqual(meta, {});
});
check("seasons聚合去重 + 全空→all", () => {
 const meta1 = buildLocalOutfitMetadataFromItems({ outfitItems: [item(1, "衬衫", "tops", "白", { seasons: ["spring", "autumn"] }), item(2, "裤子", "pants", "黑", { seasons: ["spring"] })] });
 assert.ok(meta1.seasons?.includes("spring"));
 assert.ok(meta1.seasons?.includes("autumn"));
 const meta2 = buildLocalOutfitMetadataFromItems({ outfitItems: [item(1, "衬衫", "tops", "白", { seasons: [] })] });
 assert.deepEqual(meta2.seasons, ["all"]);
});
check("温度聚合结果统一归一为 minC <= maxC", () => {
 const meta = buildLocalOutfitMetadataFromItems({ outfitItems: [
 item(1, "夏装", "tops", "白", { temperatureRange: { minC:20, maxC:30 } }),
 item(2, "冬装", "pants", "黑", { temperatureRange: { minC:5, maxC:15 } }),
] });
 assert.equal(meta.temperatureRange?.minC,15);
 assert.equal(meta.temperatureRange?.maxC,20);
});
check("notes 一句中文搭配说明 (长度 ≤90)", () => {
 const meta = buildLocalOutfitMetadataFromItems({ outfitItems: [item(1, "衬衫", "tops", "白", { styles: ["commute"] })] });
 assert.ok(meta.notes);
 assert.ok(meta.notes.length <=90);
 assert.ok(meta.notes.length >0);
});

// ───mergeOutfitMetadataIntoDraft ─────────────────────────────────
console.log("\n[mergeOutfitMetadataIntoDraft] 回填 intake draft");
check("AI source标记", () => {
 const draft: OutfitIntakeDraft = {
 id: "test", kind: "outfit", itemIds: createIntakeField([1], "local", "high"), itemNames: createIntakeField(["衬衫"], "local", "high"),
 unknownItemNotes: createIntakeField([], "default", "low"), name: createIntakeField("原名", "local", "low"),
 seasons: createIntakeField<Season[]>([], "default", "low"), sceneTags: createIntakeField([], "default", "low"),
 styleTags: createIntakeField([], "default", "low"), pairingTags: createIntakeField([], "default", "low"),
 temperatureRange: createIntakeField(null, "default", "low"), source: createIntakeField("manual", "default", "low"),
 favorite: createIntakeField(false, "default", "low"), notes: createIntakeField("", "default", "low"),
 processingIssues: [], createdAt: now, updatedAt: now,
 };
 const merged = mergeOutfitMetadataIntoDraft(draft, { name: "AI套装", styleTags: ["休闲"] }, "ai");
 assert.equal(merged.name.value, "AI套装");
 assert.equal(merged.name.source, "ai");
 assert.deepEqual(merged.styleTags.value, ["休闲"]);
 assert.equal(merged.styleTags.source, "ai");
});
check("Local source标记", () => {
 const draft: OutfitIntakeDraft = {
 id: "test", kind: "outfit", itemIds: createIntakeField([1], "local", "high"), itemNames: createIntakeField(["衬衫"], "local", "high"),
 unknownItemNotes: createIntakeField([], "default", "low"), name: createIntakeField("", "default", "low"),
 seasons: createIntakeField<Season[]>([], "default", "low"), sceneTags: createIntakeField([], "default", "low"),
 styleTags: createIntakeField([], "default", "low"), pairingTags: createIntakeField([], "default", "low"),
 temperatureRange: createIntakeField(null, "default", "low"), source: createIntakeField("manual", "default", "low"),
 favorite: createIntakeField(false, "default", "low"), notes: createIntakeField("", "default", "low"),
 processingIssues: [], createdAt: now, updatedAt: now,
 };
 const merged = mergeOutfitMetadataIntoDraft(draft, { name: "本地套装" }, "local");
 assert.equal(merged.name.source, "local");
});

console.log(`\n${failed ===0 ? "✓ All passed" : `✗ ${failed} failed`}`);
if (failed >0) process.exit(1);
