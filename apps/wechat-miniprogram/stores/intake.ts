export interface IntakeDraft {
  imagePath: string;
  name: string;
  category: string;
  color: string;
  season: string;
  note: string;
}

let draft: IntakeDraft | null = null;
let lastCreatedId = "";

export function setIntakeDraft(next: IntakeDraft): void {
  draft = next;
}

export function getIntakeDraft(): IntakeDraft | null {
  return draft;
}

export function clearIntakeDraft(): void {
  draft = null;
}

export function setLastCreatedGarmentId(id: string): void {
  lastCreatedId = id;
}

export function getLastCreatedGarmentId(): string {
  return lastCreatedId;
}
