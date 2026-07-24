import assert from "node:assert/strict";
import {
  garmentWearState,
  serverConfirmedGarmentCancel,
  serverConfirmedGarmentMark,
} from "../services/workspace-wear-state";

const dateKey = "2026-07-24";
const markedPayload = {
  worn: true,
  wornAt: `${dateKey}T12:00:00.000Z`,
  wearEventId: "d8cd76b8-6b86-4e10-8f31-a7b28a5f955f",
  wornDates: [],
};

assert.deepEqual(garmentWearState(markedPayload).wornDates, [dateKey]);
assert.equal(serverConfirmedGarmentMark(markedPayload, dateKey), true);
assert.equal(
  serverConfirmedGarmentMark(
    { ...markedPayload, wornAt: "2026-07-23T12:00:00.000Z" },
    dateKey,
  ),
  false,
);
assert.equal(
  serverConfirmedGarmentMark({ ...markedPayload, wearEventId: null }, dateKey),
  false,
);

const cancelledPayload = {
  worn: false,
  wornAt: null,
  wearEventId: null,
  wornDates: [],
};
assert.equal(serverConfirmedGarmentCancel(cancelledPayload), true);
assert.equal(
  serverConfirmedGarmentCancel({ ...cancelledPayload, worn: true }),
  false,
);
assert.equal(
  serverConfirmedGarmentCancel({
    ...cancelledPayload,
    wornAt: `${dateKey}T12:00:00.000Z`,
  }),
  false,
);

assert.deepEqual(
  garmentWearState({
    ...markedPayload,
    wornDates: ["2026-07-20", dateKey, dateKey, "invalid"],
  }).wornDates,
  ["2026-07-20", dateKey],
);

console.log("workspace garment wear state passed");
