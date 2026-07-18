import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RecommendationPlanCancelService } from "../src/recommendations/cancel-service.js";

const databaseUrl = process.env.WARDROBE_RECOMMENDATION_TEST_DATABASE_URL ?? "postgresql:///wardrobe_test";
const run = describe;
const schema = `run_recommendation_cancel_${process.pid}`;
let pool: Pool;

run("recommendation cancel primary real PostgreSQL transaction", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
    const admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`create schema ${schema}`);
    await admin.query(`create table ${schema}.outfit_plans (id uuid primary key,user_id uuid not null,revision int not null,origin_device_id text not null,payload jsonb not null,plan_date date not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz)`);
    await admin.query(`create table ${schema}.sync_mutations (user_id uuid not null,mutation_id uuid not null,entity_type text not null,entity_id uuid not null,operation text not null,status text not null,result_revision int,payload jsonb not null,response_json jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(user_id,mutation_id))`);
    await admin.query(`create table ${schema}.sync_changes (user_id uuid not null,change_seq bigint not null,entity_type text not null,entity_id uuid not null,operation text not null,revision int not null,payload jsonb not null,primary key(user_id,change_seq))`);
    await admin.end();
  });
  afterAll(async () => {
    await pool?.end();
    const admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  });

  async function seed() {
    const userId = randomUUID(), primary = randomUUID(), backup = randomUUID(), date = "2026-07-18";
    await pool.query("insert into outfit_plans(id,user_id,revision,origin_device_id,payload,plan_date) values($1,$3,4,'seed',$4,$5),($2,$3,2,'seed',$6,$5)", [primary, backup, userId, { date, status: "planned", role: "primary", isPrimary: true }, date, { date, status: "planned", role: "backup", isPrimary: false }]);
    return { userId, primary, backup, date, command: { clientMutationId: randomUUID(), targetDate: date, primary: { planEntryId: primary, expectedRevision: 4 }, promoteBackup: { planEntryId: backup, expectedRevision: 2 } } };
  }

  it("cancels and promotes atomically, then replays the same mutation", async () => {
    const s = await seed(); const service = new RecommendationPlanCancelService(pool);
    const first = await service.cancel(s.userId, "device-a", s.command);
    expect(first).toMatchObject({ status: "committed", idempotentReplay: false, activePrimary: { planEntryId: s.backup, revision: 3 } });
    const replay = await service.cancel(s.userId, "device-a", s.command);
    expect(replay).toMatchObject({ idempotentReplay: true, canceledPrimary: { planEntryId: s.primary, revision: 5 } });
    const rows = await pool.query("select id,revision,payload from outfit_plans where user_id=$1 order by id", [s.userId]);
    expect(rows.rows.find((row) => row.id === s.primary).payload).toMatchObject({ status: "canceled", isPrimary: false });
    expect(rows.rows.find((row) => row.id === s.backup).payload).toMatchObject({ status: "planned", role: "primary", isPrimary: true });
  });

  it("supports cancel-only and rejects a worn primary without half-state", async () => {
    const s = await seed(); const service = new RecommendationPlanCancelService(pool);
    const result = await service.cancel(s.userId, "device-a", { ...s.command, promoteBackup: undefined });
    expect(result.activePrimary).toBeNull();
    const worn = await seed(); await pool.query("update outfit_plans set payload=jsonb_set(payload,'{status}','\"worn\"') where id=$1", [worn.primary]);
    await expect(service.cancel(worn.userId, "device-a", worn.command)).rejects.toMatchObject({ statusCode: 409, details: { reasonCode: "plan_already_worn" } });
    expect((await pool.query("select payload->>'status' status from outfit_plans where id=$1", [worn.backup])).rows[0].status).toBe("planned");
  });

  it("serializes two-device races and rolls back every injected failure", async () => {
    const s = await seed();
    const a = new RecommendationPlanCancelService(pool), b = new RecommendationPlanCancelService(pool);
    const settled = await Promise.allSettled([a.cancel(s.userId, "device-a", s.command), b.cancel(s.userId, "device-b", { ...s.command, clientMutationId: randomUUID() })]);
    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const injected = await seed();
    const failing = new RecommendationPlanCancelService(pool, { fault: (stage) => { if (stage === "afterPrimaryCancel") throw new Error("injected"); } });
    await expect(failing.cancel(injected.userId, "device-x", injected.command)).rejects.toThrow("injected");
    const rows = await pool.query("select id,revision,payload from outfit_plans where user_id=$1", [injected.userId]);
    expect(rows.rows.find((row) => row.id === injected.primary)).toMatchObject({ revision: 4 });
    expect(rows.rows.find((row) => row.id === injected.backup)).toMatchObject({ revision: 2 });
  });
});
