import assert from "node:assert/strict";

import type { GarmentIntakeDraft } from "../src/lib/intake-draft";
import { resolveIntakeSubmissionItems } from "../src/components/garment-intake-flow";

const draft = {
  id: "draft-1",
  kind: "garment",
  useTransparentImage: { value: false, source: "user", confidence: "high" },
  name: { value: "衬衫", source: "user", confidence: "high" },
  category: { value: "tops", source: "user", confidence: "high" },
  colors: { value: { mode: "single", primary: "white" }, source: "user", confidence: "high" },
  seasons: { value: ["all"], source: "user", confidence: "high" },
  styles: { value: ["casual"], source: "user", confidence: "high" },
  formality: { value: 3, source: "user", confidence: "high" },
  warmth: { value: 2, source: "user", confidence: "high" },
  locationId: { value: "home", source: "user", confidence: "high" },
  status: { value: "active", source: "user", confidence: "high" },
  processingIssues: [],
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
} as GarmentIntakeDraft;

let counter = 0;
const createId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const first = resolveIntakeSubmissionItems([draft], [], createId);
const retry = resolveIntakeSubmissionItems([draft], first, createId);
assert.equal(retry[0].clientMutationId, first[0].clientMutationId, "unchanged retry reuses mutation ID");

const changed = resolveIntakeSubmissionItems([
  { ...draft, name: { ...draft.name, value: "白色衬衫" }, updatedAt: "2026-06-30T00:01:00.000Z" },
], retry, createId);
assert.notEqual(changed[0].clientMutationId, retry[0].clientMutationId, "editing a draft rotates mutation ID");

console.log("✓ intake submit state: retry ID reuse and edit rotation");

