import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as dbSchema from "../src/db/schema.js";
import { WorkspaceCommandService } from "../src/workspace/command-service.js";

const url =
  process.env.WARDROBE_RECOMMENDATION_TEST_DATABASE_URL ??
  "postgresql:///wardrobe_test";
const schema = `run_workspace_garment_wear_${process.pid}`;
const admin = new Pool({ connectionString: url, max: 3 });
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const migrationsDir = resolve(process.cwd(), "migrations");
let pool: Pool;

beforeAll(async () => {
  await admin.query(`drop schema if exists ${quote(schema)} cascade`);
  await admin.query(`create schema ${quote(schema)}`);
  const client = await admin.connect();
  try {
    await client.query(`set search_path to ${quote(schema)}`);
    for (const file of readdirSync(migrationsDir)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort()) {
      await client.query(readFileSync(resolve(migrationsDir, file), "utf8"));
    }
  } finally {
    client.release();
  }
  pool = new Pool({
    connectionString: url,
    options: `-c search_path=${schema}`,
    max: 8,
  });
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await admin.query(`drop schema if exists ${quote(schema)} cascade`);
  await admin.end();
}, 30_000);

describe("authoritative garment wear cancellation", () => {
  it("records and cancels a direct garment wear without losing other dates", async () => {
    const userId = randomUUID();
    const garmentId = randomUUID();
    const date = "2026-07-28";
    const earlier = "2026-07-04";
    await seedUser(userId);
    await seedGarment(userId, garmentId, 1, [earlier]);
    await seedGarmentWearEvent(userId, garmentId, earlier);
    const service = commandService();

    const marked = await service.markWorn({
      resource: "garments",
      entityId: garmentId,
      userId,
      deviceId: "device-direct",
      command: {
        clientMutationId: randomUUID(),
        expectedRevision: 1,
        wornAt: `${date}T12:00:00.000Z`,
      },
    });
    expect(marked.entity?.payload.wornDates).toEqual([earlier, date]);

    const mutationId = randomUUID();
    const cancelled = await service.cancelWorn({
      resource: "garments",
      entityId: garmentId,
      userId,
      deviceId: "device-direct",
      command: {
        clientMutationId: mutationId,
        expectedRevision: 2,
        date,
        payload: {},
      },
    });
    expect(cancelled.revision).toBe(3);
    expect(cancelled.entity?.payload).toMatchObject({
      worn: false,
      wornAt: null,
      wearEventId: null,
      wornDates: [earlier],
    });
    expect(await activeGarmentWearEvents(userId, garmentId, date)).toBe(0);
    expect(await activeGarmentWearEvents(userId, garmentId, earlier)).toBe(1);

    const replay = await service.cancelWorn({
      resource: "garments",
      entityId: garmentId,
      userId,
      deviceId: "device-direct",
      command: {
        clientMutationId: mutationId,
        expectedRevision: 2,
        date,
        payload: {},
      },
    });
    expect(replay).toEqual(cancelled);
    expect((await garment(garmentId)).revision).toBe(3);

    await expect(service.cancelWorn({
      resource: "garments",
      entityId: garmentId,
      userId,
      deviceId: "device-direct",
      command: {
        clientMutationId: randomUUID(),
        expectedRevision: 2,
        date,
        payload: {},
      },
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("removes the target date written by a recommendation plan", async () => {
    const userId = randomUUID();
    const garmentId = randomUUID();
    const planId = randomUUID();
    const date = "2026-07-28";
    const earlier = "2026-07-03";
    await seedUser(userId);
    await seedGarment(userId, garmentId, 1, [earlier]);
    await pool.query(
      "insert into outfit_plans(id,user_id,origin_device_id,payload,plan_date) values($1,$2,'seed',$3::jsonb,$4)",
      [
        planId,
        userId,
        JSON.stringify({
          sourceType: "daily_recommendation",
          date,
          status: "planned",
          isPrimary: true,
          role: "primary",
          garmentIds: [garmentId],
          garmentSnapshots: [
            { garmentId, name: "白衬衫", role: "tops", category: "tops" },
          ],
        }),
        date,
      ],
    );

    const service = commandService();
    await service.markWorn({
      resource: "outfit-plans",
      entityId: planId,
      userId,
      deviceId: "device-plan",
      command: {
        clientMutationId: randomUUID(),
        expectedRevision: 1,
        wornAt: `${date}T12:00:00.000Z`,
      },
    });
    const before = await garment(garmentId);
    expect(before.revision).toBe(2);
    expect(before.payload.wornDates).toContain(date);

    const cancelled = await service.cancelWorn({
      resource: "garments",
      entityId: garmentId,
      userId,
      deviceId: "device-plan",
      command: {
        clientMutationId: randomUUID(),
        expectedRevision: before.revision,
        date,
        payload: {},
      },
    });

    expect(cancelled.entity?.payload.wornDates).toEqual([earlier]);
    const after = await garment(garmentId);
    expect(after.payload.wornDates).toEqual([earlier]);
    expect(await activeGarmentWearEvents(userId, garmentId, date)).toBe(0);
    const plan = await pool.query(
      "select payload from outfit_plans where id=$1",
      [planId],
    );
    expect(plan.rows[0].payload.status).toBe("worn");
  });

  it("removes only the target garment date written by an outfit", async () => {
    const userId = randomUUID();
    const targetId = randomUUID();
    const otherId = randomUUID();
    const outfitId = randomUUID();
    const date = "2026-07-28";
    await seedUser(userId);
    await seedGarment(userId, targetId, 11);
    await seedGarment(userId, otherId, 12);
    await pool.query(
      "insert into outfits(id,user_id,origin_device_id,payload) values($1,$2,'seed',$3::jsonb)",
      [
        outfitId,
        userId,
        JSON.stringify({
          name: "通勤套装",
          legacyItemIds: [11, 12],
          itemIds: [11, 12],
          wornDates: [],
        }),
      ],
    );
    const service = commandService();
    await service.markWorn({
      resource: "outfits",
      entityId: outfitId,
      userId,
      deviceId: "device-outfit",
      command: {
        clientMutationId: randomUUID(),
        expectedRevision: 1,
        wornAt: `${date}T12:00:00.000Z`,
      },
    });

    const before = await garment(targetId);
    expect(before.payload.wornDates).toContain(date);
    const cancelled = await service.cancelWorn({
      resource: "garments",
      entityId: targetId,
      userId,
      deviceId: "device-outfit",
      command: {
        clientMutationId: randomUUID(),
        expectedRevision: before.revision,
        date,
        payload: {},
      },
    });

    expect(cancelled.entity?.payload.wornDates).not.toContain(date);
    expect((await garment(targetId)).payload.wornDates).not.toContain(date);
    expect((await garment(otherId)).payload.wornDates).toContain(date);
    expect(await activeGarmentWearEvents(userId, targetId, date)).toBe(0);
    expect(await activeGarmentWearEvents(userId, otherId, date)).toBe(1);
    const outfit = await pool.query(
      "select payload from outfits where id=$1",
      [outfitId],
    );
    expect(outfit.rows[0].payload.wornDates).toContain(date);
  });

  it("keeps another user's same-day wear isolated", async () => {
    const ownerId = randomUUID();
    const otherUserId = randomUUID();
    const ownerGarmentId = randomUUID();
    const otherGarmentId = randomUUID();
    const date = "2026-07-28";
    await seedUser(ownerId);
    await seedUser(otherUserId);
    await seedGarment(ownerId, ownerGarmentId, 21, [date]);
    await seedGarment(otherUserId, otherGarmentId, 22, [date]);
    const service = commandService();

    await service.cancelWorn({
      resource: "garments",
      entityId: ownerGarmentId,
      userId: ownerId,
      deviceId: "device-owner",
      command: {
        clientMutationId: randomUUID(),
        expectedRevision: 1,
        date,
        payload: {},
      },
    });

    expect((await garment(ownerGarmentId)).payload.wornDates).not.toContain(date);
    expect((await garment(otherGarmentId)).payload.wornDates).toContain(date);
    await expect(service.cancelWorn({
      resource: "garments",
      entityId: otherGarmentId,
      userId: ownerId,
      deviceId: "device-owner",
      command: {
        clientMutationId: randomUUID(),
        expectedRevision: 1,
        date,
        payload: {},
      },
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});

function commandService() {
  return new WorkspaceCommandService(drizzle(pool, { schema: dbSchema }));
}

async function seedUser(userId: string) {
  await pool.query("insert into users(id) values($1)", [userId]);
}

async function seedGarment(
  userId: string,
  garmentId: string,
  legacyItemId: number,
  wornDates: string[] = [],
) {
  await pool.query(
    "insert into garments(id,user_id,origin_device_id,payload) values($1,$2,'seed',$3::jsonb)",
    [
      garmentId,
      userId,
      JSON.stringify(garmentPayload(legacyItemId, wornDates)),
    ],
  );
}

async function seedGarmentWearEvent(
  userId: string,
  garmentId: string,
  date: string,
) {
  await pool.query(
    `insert into wear_events(
       id,user_id,garment_id,worn_at,origin_device_id,payload
     ) values($1,$2,$3,$4,'seed',$5::jsonb)`,
    [
      randomUUID(),
      userId,
      garmentId,
      `${date}T12:00:00.000Z`,
      JSON.stringify({ garmentId, wornAt: `${date}T12:00:00.000Z` }),
    ],
  );
}

function garmentPayload(legacyItemId: number, wornDates: string[]) {
  return {
    name: "白衬衫",
    legacyItemId,
    category: "tops",
    colors: { mode: "single", primary: "白" },
    seasons: ["spring"],
    styles: ["commute"],
    status: "active",
    wornDates,
  };
}

async function garment(id: string) {
  const result = await pool.query(
    "select revision,payload from garments where id=$1",
    [id],
  );
  return result.rows[0] as {
    revision: number;
    payload: Record<string, unknown> & { wornDates?: string[] };
  };
}

async function activeGarmentWearEvents(
  userId: string,
  garmentId: string,
  date: string,
) {
  const result = await pool.query(
    `select count(*)::int as count
       from wear_events
      where user_id=$1
        and garment_id=$2
        and deleted_at is null
        and worn_at::date=$3::date`,
    [userId, garmentId, date],
  );
  return result.rows[0].count as number;
}
