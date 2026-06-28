// ponytail: FNV-1a 32-bit, collision acceptable for single-user wardrobe (<2^16 items).
export function hashWorkspaceIdToNumber(uuid: string): number {
  let h = 2166136261;
  for (let i = 0; i < uuid.length; i++) {
    h ^= uuid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) || 1;
}
