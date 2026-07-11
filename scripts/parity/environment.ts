import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./lib/fs";
import { runCommand } from "./lib/process";
import type { BaselineLock } from "./types";
import type { ValidationResult } from "./validate";

function parseEnv(raw: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    output[key] = value;
  }
  return output;
}

export async function validateParityEnvironment(options: {
  runRoot: string;
  envFile: string;
}): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let env: Record<string, string> = {};
  try {
    env = parseEnv(await fs.readFile(options.envFile, "utf8"));
  } catch (error) {
    errors.push(`cannot read env file: ${error instanceof Error ? error.message : String(error)}`);
  }
  const required = ["E2E_DATABASE_URL", "E2E_STORAGE_ROOT", "E2E_JWT_PRIVATE_KEY_PATH", "E2E_JWT_PUBLIC_KEY_PATH"];
  for (const key of required) if (!env[key]) errors.push(`missing ${key}`);
  let databaseHost = "";
  let databaseName = "";
  if (env.E2E_DATABASE_URL) {
    try {
      const url = new URL(env.E2E_DATABASE_URL);
      databaseHost = url.hostname || "localhost";
      databaseName = url.pathname.replace(/^\//u, "");
      if (!["localhost", "127.0.0.1", "::1", ""].includes(databaseHost)) errors.push(`database host is not local: ${databaseHost}`);
      if (databaseName !== "wardrobe_e2e") errors.push(`database must be wardrobe_e2e, got ${databaseName}`);
    } catch (error) {
      errors.push(`invalid E2E_DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (env.E2E_STORAGE_ROOT) {
    const storage = path.resolve(env.E2E_STORAGE_ROOT);
    if (storage === "/" || storage === path.parse(storage).root) errors.push("E2E_STORAGE_ROOT cannot be a filesystem root");
    if (!/(?:e2e|test|parity)/iu.test(storage)) errors.push("E2E_STORAGE_ROOT must visibly identify an e2e/test/parity directory");
  }
  for (const key of ["E2E_JWT_PRIVATE_KEY_PATH", "E2E_JWT_PUBLIC_KEY_PATH"]) {
    if (env[key]) {
      try { await fs.access(env[key]); } catch { errors.push(`${key} does not exist`); }
    }
  }
  let databaseReachable = false;
  if (env.E2E_DATABASE_URL) {
    const ready = await runCommand("pg_isready", ["-d", env.E2E_DATABASE_URL], { allowFailure: true });
    databaseReachable = ready.code === 0;
    if (!databaseReachable) errors.push("wardrobe_e2e PostgreSQL is not reachable");
  }
  const lock = await readJson<BaselineLock>(path.join(options.runRoot, "baseline-lock.json"));
  const adb = await runCommand("adb", ["-s", lock.deviceProfile.serial, "get-state"], { allowFailure: true });
  const androidReady = adb.code === 0 && adb.stdout.trim() === "device";
  if (!androidReady) errors.push(`Android device is not ready: ${lock.deviceProfile.serial || "missing serial"}`);
  if (lock.previewMiniSha !== lock.miniSha) errors.push("preview mini SHA does not match locked mini SHA");
  if (!lock.minimaxKeyAvailable) warnings.push("MiniMax Key was not available when baseline lock was created");
  const metrics = {
    requiredVariables: required.length,
    configuredVariables: required.filter((key) => Boolean(env[key])).length,
    databaseLocal: ["localhost", "127.0.0.1", "::1", ""].includes(databaseHost) ? 1 : 0,
    databaseNameAllowed: databaseName === "wardrobe_e2e" ? 1 : 0,
    databaseReachable: databaseReachable ? 1 : 0,
    androidReady: androidReady ? 1 : 0,
    previewShaMatches: lock.previewMiniSha === lock.miniSha ? 1 : 0,
    minimaxKeyAvailable: lock.minimaxKeyAvailable ? 1 : 0,
  };
  const result = { valid: errors.length === 0, errors, warnings, metrics };
  await writeJson(path.join(options.runRoot, "environment", "validation.json"), result);
  return result;
}
