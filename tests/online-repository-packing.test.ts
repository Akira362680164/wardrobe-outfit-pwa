import assert from "node:assert/strict";
import test from "node:test";
import { packingItems } from "@/lib/online/online-repository";

const entity = (payload: Record<string, unknown>) => ({
  id: "00000000-0000-4000-8000-000000000001",
  revision: 1,
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  payload,
});

test("reads the canonical server packingChecklist field", () => {
    assert.deepEqual(packingItems([entity({ packingChecklist: [{ id: "manual", label: "保留物品" }] })]), [
      { id: "manual", label: "保留物品" },
    ]);
});

test("keeps backward compatibility with packingChecklistItems", () => {
    assert.deepEqual(packingItems([entity({ packingChecklistItems: [{ id: "legacy" }] })]), [{ id: "legacy" }]);
});
