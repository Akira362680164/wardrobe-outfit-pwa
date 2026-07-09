import type { AssetMutation } from "../services/assets";

export interface IntakeDraft {
  imagePath: string;
  stablePath?: string;
  name: string;
  category: string;
  color: string;
  season: string;
  note: string;
  styles?: string[];
  confidence?: number;
  needsReview?: boolean;
  source?: "manual" | "ai";
  aiTag?: Record<string, unknown>;
}

export type IntakeQueueItemStatus = "selected" | "uploading" | "ready" | "failed";

export interface IntakeQueueItem {
  clientItemId: string;
  clientMutationId: string;
  imagePath: string;
  stablePath: string;
  status: IntakeQueueItemStatus;
  error: string;
  assetMutations: AssetMutation[];
  draft: IntakeDraft;
}

let queue: IntakeQueueItem[] = [];
let lastCreatedId = "";

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
    status: "selected",
    error: "",
    assetMutations: [],
    draft: { ...draft, stablePath },
  };
}
