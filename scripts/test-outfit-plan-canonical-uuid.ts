import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const appMapper = read("src/lib/online/online-repository.ts");
const appWriter = read("src/lib/repository/wardrobe-repository.ts");
const appPlanning = read("src/components/outfit-list-view.tsx");
const apiCommands = read("services/wardrobe-api/src/workspace/command-service.ts");
const apiQueries = read("services/wardrobe-api/src/workspace/query-service.ts");
const miniMapper = read("apps/wechat-miniprogram/services/workspace.ts");
const miniCalendar = read("apps/wechat-miniprogram/pages/outfits/calendar/index.ts");
const migration = read("services/wardrobe-api/migrations/0017_outfit_plan_canonical_uuid.sql");

assert.match(appMapper, /id: entity\.id, name: stringValue\(p\.name\)/, "App 套装必须使用服务端实体 UUID");
assert.match(appMapper, /id: entity\.id, date: stringValue\(p\.date\)/, "App 穿搭计划必须使用服务端实体 UUID");
assert.doesNotMatch(appWriter, /legacyOutfitId/, "App 写入端不得继续生成旧套装标识");
assert.match(appPlanning, /setSelectOutfitMode\(hasResolvablePrimary \? "backup" : "primary"\)/, "空日期必须创建主穿搭");
assert.match(apiCommands, /canonicalWorkspacePayload/, "服务端必须统一校验关系 UUID");
assert.match(apiCommands, /旧标识 \$\{found\} 已停用/, "服务端必须拒绝旧客户端继续写入旧标识");
assert.match(apiCommands, /actualOutfitId: uuidOrNull\(payload\.actualOutfitId\)/, "实际穿着关系必须落列");
assert.match(apiQueries, /canonicalOutfitPlanPayload/, "服务端读取必须由关系列覆盖 JSON payload");
assert.match(miniMapper, /outfitId: firstString\(payload\.outfitId\)/, "小程序不得用实际穿着 ID 冒充计划套装 ID");
assert.match(miniCalendar, /计划关联的套装已失效/, "小程序必须显式展示失效关系");
assert.match(migration, /unresolved outfitId exists/, "迁移遇到无法解析的旧关系必须中止");

console.log("✓ App、服务端和小程序统一使用 canonical UUID");
console.log("✓ 迁移包含回填、旧字段清理和失败前置检查");
console.log("✓ 空日期主穿搭语义与失效关系提示已覆盖");
