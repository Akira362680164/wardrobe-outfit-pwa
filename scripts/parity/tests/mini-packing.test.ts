import assert from "node:assert/strict";
import test from "node:test";
import { captureMiniPackingEvidence, type MiniPackingDriver, type MiniPackingEvidenceSink, type PackingTripReadback } from "../adapters/mini-packing";

test("captures four phases and verifies every mutation through forced reload and GET", async () => {
    let revision = 1;
    let checklist = [{ id: "item-1", label: "上衣", checked: false, quantity: 1 }];
    const read = (): PackingTripReadback => ({ id: "trip-1", revision, checklist: checklist.map((item) => ({ ...item })) });
    let reloads = 0;
    let apiReads = 0;
    const driver: MiniPackingDriver = {
      connect: async () => undefined, openTrip: async () => undefined, waitForStable: async () => undefined,
      capture: async () => ({ screenshot: Buffer.from("png"), uiTree: {}, route: { path: "pages/trips/detail/index" }, network: [{ url: "http://127.0.0.1:3100/api/workspace/trip-plans/trip-1", status: 200 }],
      }),
      forceReloadTrip: async () => { reloads += 1; }, callMethod: async () => undefined, inputParityId: async () => undefined,
      tapParityId: async (parityId) => {
        if (parityId.endsWith("toggle.item-1")) checklist[0].checked = !checklist[0].checked;
        if (parityId.endsWith("packing.save")) checklist.push({ id: "manual-1", label: "parity-充电器", checked: false, quantity: 1 });
        if (parityId.endsWith("packing.all")) checklist = checklist.map((item) => ({ ...item, checked: true }));
        if (parityId.endsWith("packing.reset")) checklist = checklist.map((item) => ({ ...item, checked: false }));
        if (/toggle\.item-1$|packing\.(save|all|reset)$/.test(parityId)) revision += 1;
      },
    };
    const checkpoints: string[] = [];
    const readbacks: string[] = [];
    const sink: MiniPackingEvidenceSink = {
      checkpoint: async (action, phase) => { checkpoints.push(`${action}:${phase}`); },
      serverReadback: async (action) => { readbacks.push(action); },
      execution: async () => undefined,
    };
    const api = { getTrip: async () => { apiReads += 1; return read(); } };
    const results = await captureMiniPackingEvidence({ driver, api, sink, fixtureId: "calendar.with_trip", tripId: "trip-1", packingItemId: "item-1" });

    assert.equal(results.length, 4);
    assert.ok(results.every((result) => result.status === "PASS"));
    assert.equal(checkpoints.length, 16);
    assert.deepEqual(readbacks, results.map((result) => result.actionId));
    assert.equal(reloads, 4);
    assert.equal(apiReads, 8);
    assert.ok(results.every((result) => (result.serverAssertion.revisionAfter ?? 0) > result.serverAssertion.revisionBefore));
});

test("records DEFECT when GET readback revision does not advance", async () => {
    const trip = { id: "trip-1", revision: 1, checklist: [{ id: "item-1", label: "上衣", checked: false }] };
    const driver: MiniPackingDriver = {
      connect: async () => undefined, openTrip: async () => undefined, tapParityId: async () => undefined,
      inputParityId: async () => undefined, callMethod: async () => undefined, waitForStable: async () => undefined,
      forceReloadTrip: async () => undefined,
      capture: async () => ({ screenshot: Buffer.from("png"), uiTree: {}, route: {}, network: [] }),
    };
    const executions: string[] = [];
    const sink: MiniPackingEvidenceSink = {
      checkpoint: async () => undefined, serverReadback: async () => undefined,
      execution: async (_action, result) => { executions.push(result.status); },
    };
    const results = await captureMiniPackingEvidence({ driver, api: { getTrip: async () => trip }, sink, fixtureId: "calendar.with_trip", tripId: "trip-1", packingItemId: "item-1" });
    assert.ok(results.every((result) => result.status === "DEFECT"));
    assert.deepEqual(executions, ["DEFECT", "DEFECT", "DEFECT", "DEFECT"]);
});
