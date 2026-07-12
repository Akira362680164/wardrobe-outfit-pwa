import type { AssetMutation } from "../services/assets";

export type IntakeKind = "garment" | "wishlist";

export interface IntakeDraft {
  imagePath: string;
  stablePath?: string;
  name: string;
  category: string;
  subcategory?: string;
  color: string;
  season: string;
  seasons?: string[];
  note: string;
  styles?: string[];
  temperatureRange?: { minC?: number; maxC?: number };
  formality?: number;
  warmth?: number;
  material?: string;
  fitGender?: string;
  fitNotes?: string;
  locationId?: string;
  status?: string;
  price?: string;
  productUrl?: string;
  confidence?: number;
  needsReview?: boolean;
  source?: "manual" | "ai";
  aiTag?: Record<string, unknown>;
}

export type IntakeQueueItemStatus =
  | "selected"
  | "uploading"
  | "ready"
  | "recognizing"
  | "needs_confirm"
  | "confirmed"
  | "saving"
  | "saved"
  | "failed";

export interface IntakeQueueItem {
  clientItemId: string;
  clientMutationId: string;
  imagePath: string;
  stablePath: string;
  sourcePath: string;
  processedPath: string;
  temporarySessionId?: string;
  status: IntakeQueueItemStatus;
  error: string;
  assetMutations: AssetMutation[];
  draft: IntakeDraft;
  serverEntityId?: string;
}

let queue: IntakeQueueItem[] = [];
let intakeKind: IntakeKind = "garment";
let lastCreatedId = "";
let pendingCropResult = "";
let lastSaveResult = { succeeded: 0, failed: 0, savedIds: [] as string[], failedItemIds: [] as string[] };

export function setIntakeKind(kind: IntakeKind): void {
  intakeKind = kind;
}

export function getIntakeKind(): IntakeKind {
  return intakeKind;
}

export function setPendingCropResult(path: string): void {
  pendingCropResult = path;
}

export function consumePendingCropResult(): string {
  const path = pendingCropResult;
  pendingCropResult = "";
  return path;
}

export function setIntakeDraft(next: IntakeDraft): void {
  queue = [draftToQueueItem(next)];
}

export function getIntakeDraft(): IntakeDraft | null {
  return (queue.find((item) => item.status === "ready") ?? queue[0])?.draft ?? null;
}

export function clearIntakeDraft(): void {
  queue = [];
}

export function setIntakeQueue(next: IntakeQueueItem[]): void {
  queue = next;
}

export function getIntakeQueue(): IntakeQueueItem[] {
  return queue;
}

export function updateIntakeQueueItem(clientItemId: string, patch: Partial<IntakeQueueItem>): void {
  queue = queue.map((item) => item.clientItemId === clientItemId ? { ...item, ...patch, draft: patch.draft ?? item.draft } : item);
}

export function setLastIntakeSaveResult(result: { succeeded: number; failed: number; savedIds: string[]; failedItemIds: string[] }): void {
  lastSaveResult = result;
}

export function getLastIntakeSaveResult(): { succeeded: number; failed: number; savedIds: string[]; failedItemIds: string[] } {
  return lastSaveResult;
}

export function clearSavedIntakeQueueItems(): void {
  queue = queue.filter((item) => item.status === "failed");
}

export function setLastCreatedGarmentId(id: string): void {
  lastCreatedId = id;
}

export function getLastCreatedGarmentId(): string {
  return lastCreatedId;
}

function draftToQueueItem(draft: IntakeDraft): IntakeQueueItem {
  const id = `intake-${Date.now()}`;
  const stablePath = draft.stablePath ?? draft.imagePath;
  return {
    clientItemId: id,
    clientMutationId: id,
    imagePath: draft.imagePath,
    stablePath,
    sourcePath: draft.imagePath,
    processedPath: stablePath,
    status: "selected",
    error: "",
    assetMutations: [],
    draft: { ...draft, stablePath },
  };
}
