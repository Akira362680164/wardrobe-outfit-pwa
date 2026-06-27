import { randomBytes } from "node:crypto";

export function generateCaseId(): string {
  const now = new Date();
  const yyyymmdd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `WD-${yyyymmdd}-${suffix}`;
}
