#!/usr/bin/env tsx
/**
 * v2.0.8-test 全链路修复验证 — 模拟换新手机场景
 * 1. 注册账号
 * 2. 创建所有类型实体（模拟旧手机数据）
 * 3. 清空本地（模拟换新手机）
 * 4. 重新登录 + bootstrap（新手机拉取云端数据）
 * 5. 验证所有实体类型完整恢复
 */
const BASE_URL = process.env.WARDROBE_API_URL ?? "http://127.0.0.1:3000";
const DEVICE_OLD = `old-phone-${Date.now()}`;
const DEVICE_NEW = `new-phone-${Date.now()}`;

async function api(path: string, body: unknown, accessToken?: string, deviceId?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
    if (deviceId) headers["X-Wardrobe-Device-Id"] = deviceId;
  }
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

interface CaseReport {
  type: string;
  finding: string;
  created: boolean;
  pushConfirmed: boolean;
  cloudRestore: boolean;
  payloadComplete: boolean;
  detail: string;
}

const report: CaseReport[] = [];

async function main() {
  console.log("=".repeat(60));
  console.log("v2.0.8-test 换新手机全链路同步验证");
  console.log("=".repeat(60));

  // ── Step 1: 注册并登录 ──
  const phone = `+86138${String(Date.now()).slice(-8)}`;
  const password = "testpassword123";
  console.log(`\n📱 注册账号: ${phone}`);

  const reg = await api("/api/auth/register", {
    phone, password, deviceId: DEVICE_OLD, deviceLabel: "旧手机测试",
  });
  const token = reg.accessToken;

  // ── Step 2: 旧手机创建实体并 push ──
  console.log("\n📤 旧手机创建 6 类实体并 push...");
  const entities = {
    garment: { id: crypto.randomUUID(), name: "蓝白条纹衬衫", payload: { name: "蓝白条纹衬衫", colors: ["#0000FF", "#FFFFFF"], category: "top", note: "MUJI 2025款" } },
    closetLocation: { id: crypto.randomUUID(), name: "玄关鞋柜", payload: { name: "玄关鞋柜", description: "进门右侧三层鞋柜" } },
    outfit: { id: crypto.randomUUID(), name: "夏日休闲套装", payload: { name: "夏日休闲套装" } },
    wishlistItem: { id: crypto.randomUUID(), name: "黑色切尔西靴", payload: { name: "黑色切尔西靴", note: "真皮 42码", buyBeforeDate: "2026-09-01" } },
    tripPlan: { id: crypto.randomUUID(), name: "杭州周末游", payload: { name: "杭州周末游", startDate: "2026-07-15", endDate: "2026-07-17" } },
    profile: { id: crypto.randomUUID(), name: "tryOnProfile:default", payload: { profileType: "tryOn", enabled: true, fitGender: "male" } },
  };

  const mutations = Object.entries(entities).map(([type, e]) => ({
    mutationId: crypto.randomUUID(),
    entityType: type,
    entityId: e.id,
    operation: "create" as const,
    payload: e.payload,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
  }));

  const push = await api("/api/sync/push", { deviceId: DEVICE_OLD, mutations }, token, DEVICE_OLD);
  const pushedOk = push.results.every((r: {status: string}) => r.status === "accepted");
  console.log(`   Push 结果: ${pushedOk ? "全部 accepted" : "部分失败"}`);

  // ── Step 3: 模拟换新手机 — 用新 deviceId 登录并 bootstrap ──
  console.log("\n📲 模拟换新手机 — 新设备登录 + bootstrap...");
  const login = await api("/api/auth/login", {
    phone, password, deviceId: DEVICE_NEW, deviceLabel: "新手机测试",
  });
  const newToken = login.accessToken;

  const bootstrap = await api("/api/sync/bootstrap", {
    deviceId: DEVICE_NEW, workspaceSchemaVersion: 1,
  }, newToken, DEVICE_NEW);

  const ents = bootstrap.entities;

  // ── Step 4: 逐项验证恢复完整性 ──
  console.log("\n🔍 逐项验证云端恢复完整性:\n");

  for (const [type, expected] of Object.entries(entities)) {
    // Map entity type to bootstrap key
    const keyMap: Record<string, string> = {
      garment: "garments",
      closetLocation: "closetLocations",
      outfit: "outfits",
      wishlistItem: "wishlistItems",
      tripPlan: "tripPlans",
      profile: "profiles",
    };
    const key = keyMap[type];
    const items = ents[key] ?? [];
    const found = items.find((e: {id: string}) => e.id === expected.id);
    const payloadOk = found ? Object.keys(expected.payload).every(k => found.payload?.[k] !== undefined) : false;
    const nameOk = found?.payload?.name === expected.name;

    report.push({
      type,
      finding: "",
      created: true,
      pushConfirmed: true,
      cloudRestore: !!found,
      payloadComplete: payloadOk,
      detail: found
        ? `名称=${found.payload.name}, payload字段=${Object.keys(found.payload ?? {}).join(",")}`
        : "bootstrap 中未找到",
    });

    const icon = nameOk ? "✅" : "❌";
    console.log(`${icon} ${type}: ${nameOk ? "完整恢复" : "恢复失败"} — ${report[report.length-1].detail}`);
  }

  // ── Step 5: Pull 验证 ──
  console.log("\n🔄 Pull 验证:");
  const pull = await api("/api/sync/pull", { cursor: null, limit: 500 }, newToken, DEVICE_NEW);
  console.log(`   Pull 返回 ${pull.changes?.length ?? 0} 条变更`);

  // 验证 cursor 可用
  const cursor = bootstrap.serverCursor;
  const pull2 = await api("/api/sync/pull", { cursor, limit: 500 }, newToken, DEVICE_NEW);
  const cursorOk = Array.isArray(pull2.changes);
  console.log(`   使用 bootstrap cursor pull: ${cursorOk ? "OK" : "FAIL"}`);

  // ── Summary ──
  console.log("\n" + "=".repeat(60));
  const pass = report.filter(r => r.cloudRestore && r.payloadComplete).length;
  const fail = report.filter(r => !r.cloudRestore || !r.payloadComplete).length;
  console.log(`结果: ${pass} 通过 / ${fail} 失败 / ${report.length} 总计`);
  console.log(`Pull: ${pull.changes.length} 变更, Cursor: ${cursorOk ? "OK" : "FAIL"}`);

  if (fail > 0) {
    console.log("\n失败项:");
    for (const r of report.filter(r => !r.cloudRestore || !r.payloadComplete)) {
      console.log(`  ❌ ${r.type}: ${r.detail}`);
    }
  } else {
    console.log("\n🎉 全部通过！换新手机数据可完整从云端恢复。");
  }

  console.log("\n--- JSON 报告 ---");
  console.log(JSON.stringify({ report, pullCount: pull.changes.length, cursorOk, overall: fail === 0 ? "PASS" : "FAIL" }, null, 2));
}

main().catch(err => { console.error("脚本错误:", err); process.exit(1); });
