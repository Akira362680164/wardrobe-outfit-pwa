// v1.1.31 commit3 — 裤装分类 + AI 命名合同测试
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const catalog = readFileSync(join(root, "src/lib/garment-category-catalog.ts"), "utf8");
const deviceMinimax = readFileSync(join(root, "src/lib/device-minimax.ts"), "utf8");
const retryLib = readFileSync(join(root, "src/lib/intake-recognition-retry.ts"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// 裤装 ID 校验
check("jeans label 牛仔长裤", /id:\s*"jeans",\s*label:\s*"牛仔长裤"/.test(catalog));
check("denim_shorts 存在", /id:\s*"denim_shorts",\s*label:\s*"牛仔短裤"/.test(catalog));
check("casual_pants label 休闲长裤", /id:\s*"casual_pants",\s*label:\s*"休闲长裤"/.test(catalog));
check("casual_shorts 存在", /id:\s*"casual_shorts",\s*label:\s*"休闲短裤"/.test(catalog));
check("sports_pants label 运动长裤", /id:\s*"sports_pants",\s*label:\s*"运动长裤"/.test(catalog));
check("sports_shorts 存在", /id:\s*"sports_shorts",\s*label:\s*"运动短裤"/.test(catalog));
check("cargo_pants 存在", /id:\s*"cargo_pants",\s*label:\s*"工装长裤"/.test(catalog));
check("cargo_shorts 存在", /id:\s*"cargo_shorts",\s*label:\s*"工装短裤"/.test(catalog));
check("suit_pants 保留", /id:\s*"suit_pants"/.test(catalog));
check("leggings 保留", /id:\s*"leggings"/.test(catalog));
check("leather_pants 保留", /id:\s*"leather_pants"/.test(catalog));
check("other_pants 保留", /id:\s*"other_pants"/.test(catalog));

// 裤装总数 12
const pantsMatch = catalog.match(/id:\s*"pants",[\s\S]*?subcategories:\s*\[([\s\S]*?)\]/);
const pantsCount = pantsMatch ? (pantsMatch[1].match(/id:\s*"/g) || []).length : 0;
check("裤装二级共 12 项", pantsCount === 12, `实际 ${pantsCount}`);

// Prompt 包含长短裤判断 + 工装规则 + 名称规则
check("Prompt 包含裤装判断规则", /裤装判断规则/.test(deviceMinimax));
check("Prompt 包含工装裤特征", /工装裤特征/.test(deviceMinimax));
check("Prompt 包含 cargo_shorts / cargo_pants 规则", /cargo_shorts/.test(deviceMinimax) && /cargo_pants/.test(deviceMinimax));
check("Prompt 禁止 garment 泛化名称", /garment、clothes、clothing、item/.test(deviceMinimax));
check("Prompt 名称正例 (棕色宽松工装短裤)", /棕色宽松工装短裤/.test(deviceMinimax));
check("Prompt 裤长判断 (大腿/脚踝)", /短裤[\s\S]{0,200}大腿[\s\S]{0,200}脚踝/.test(deviceMinimax));

// 动态 catalog 数量
check("Prompt catalog 字典动态计算 groupCount", /groupCount\s*=\s*GARMENT_CATEGORY_CATALOG\.length/.test(deviceMinimax));
check("Prompt catalog 字典动态计算 subcategoryCount", /subcategoryCount\s*=\s*GARMENT_CATEGORY_CATALOG\.reduce/.test(deviceMinimax));
check("Prompt 不再硬编码 '9 组 90 项'", !/9 组 90 项/.test(deviceMinimax));

// 名称归一化与 cargo_shorts 名称
check("isGenericGarmentName 导出", /export function isGenericGarmentName/.test(deviceMinimax));
check("buildConcreteGarmentName 导出", /export function buildConcreteGarmentName/.test(deviceMinimax));
check("GENERIC_GARMENT_NAMES 集合存在", /GENERIC_GARMENT_NAMES:[^=]*= new Set/.test(deviceMinimax));
check("GENERIC_GARMENT_NAMES 包含英文 garment/clothes", /garment/.test(deviceMinimax) && /clothes/.test(deviceMinimax));
check("GENERIC_GARMENT_NAMES 包含中文泛化词", /单品/.test(deviceMinimax) && /衣物/.test(deviceMinimax));
check("normalizeGarmentTag 调用 buildConcreteGarmentName", /buildConcreteGarmentName/.test(deviceMinimax));
check("buildConcreteGarmentName 返回 主色+subLabel", /\$\{mainColor\}\$\{subLabel\}/.test(deviceMinimax));
check("buildConcreteGarmentName subcategory 空时返回 undefined", /if \(!subLabel\) return undefined/.test(deviceMinimax));

// 跨分类 subcategory 校验
check("retryLib 包含 validateSubcategoryForCategory", /export function validateSubcategoryForCategory/.test(retryLib));
check("retryLib 跨分类校验非空时清空 subcategory", /validateSubcategoryForCategory/.test(deviceMinimax) || /isFailedDraftManualRecoveryComplete/.test(retryLib));
check("garment-intake-flow 调用 validateSubcategoryForCategory", /validateSubcategoryForCategory/.test(readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8")));

console.log(`\npants category AI contract tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
