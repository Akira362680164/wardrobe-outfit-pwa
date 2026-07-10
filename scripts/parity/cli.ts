#!/usr/bin/env node
import path from "node:path";
import { generateInventory } from "./inventory";
import { createBaselineLock } from "./lock";
import { checkInstrumentation, validateInventory } from "./validate";

interface CliArgs {
  command: string;
  values: Map<string, string>;
}

function parseArgs(argv: string[]): CliArgs {
  const [command = "help", ...rest] = argv;
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      values.set(key, "true");
    } else {
      values.set(key, value);
      index += 1;
    }
  }
  return { command, values };
}

function value(args: CliArgs, key: string, fallback?: string): string {
  const found = args.values.get(key) ?? fallback;
  if (found === undefined) throw new Error(`Missing required option --${key}`);
  return found;
}

function defaultRunId(kind: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/u, "Z").replace("T", "-");
  return `parity-${kind}-${stamp}`;
}

function printHelp(): void {
  console.log(`Usage:
  tsx scripts/parity/cli.ts lock --run-kind build|audit|repair|regression [options]
  tsx scripts/parity/cli.ts inventory --run-id <runId> [options]
  tsx scripts/parity/cli.ts inventory-check --run-id <runId>
  tsx scripts/parity/cli.ts instrumentation-check --run-id <runId>

Common options:
  --app-ref main
  --mini-ref wechat/miniprogram
  --app-root <absolute path>
  --mini-root <absolute path>
  --output-root artifacts/parity
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const outputRoot = path.resolve(cwd, value(args, "output-root", "artifacts/parity"));
  const appRoot = path.resolve(value(args, "app-root", cwd));
  const miniRoot = path.resolve(value(args, "mini-root", cwd));

  if (args.command === "help" || args.command === "--help") {
    printHelp();
    return;
  }
  if (args.command === "lock") {
    const runKind = value(args, "run-kind", "build") as "build" | "audit" | "repair" | "regression";
    if (!["build", "audit", "repair", "regression"].includes(runKind)) throw new Error(`Invalid --run-kind: ${runKind}`);
    const runId = value(args, "run-id", defaultRunId(runKind));
    const result = await createBaselineLock({
      cwd,
      runId,
      runKind,
      appRef: value(args, "app-ref", "main"),
      miniRef: value(args, "mini-ref", "wechat/miniprogram"),
      appRoot,
      miniRoot,
      outputRoot,
      previewMiniSha: args.values.get("preview-mini-sha"),
    });
    console.log(JSON.stringify({ ok: true, runId, baselineLock: result.outputFile }, null, 2));
    return;
  }
  if (args.command === "inventory") {
    const runId = value(args, "run-id");
    const result = await generateInventory({ cwd, appRoot, miniRoot, runRoot: path.join(outputRoot, runId) });
    console.log(JSON.stringify({
      ok: true,
      runId,
      app: {
        screens: result.app.screens.length,
        actions: result.app.actions.length,
        overlays: result.app.overlays.length,
        transitions: result.app.transitions.length,
        sideEffects: result.app.sideEffects.length,
        unresolved: result.app.unresolved.length,
      },
      mini: {
        screens: result.mini.screens.length,
        actions: result.mini.actions.length,
        overlays: result.mini.overlays.length,
        transitions: result.mini.transitions.length,
        sideEffects: result.mini.sideEffects.length,
        unresolved: result.mini.unresolved.length,
      },
    }, null, 2));
    return;
  }
  if (args.command === "inventory-check" || args.command === "instrumentation-check") {
    const runId = value(args, "run-id");
    const runRoot = path.join(outputRoot, runId);
    const result = args.command === "inventory-check"
      ? await validateInventory(runRoot)
      : await checkInstrumentation(runRoot);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
    return;
  }
  throw new Error(`Unsupported parity command: ${args.command}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = message.startsWith("BASELINE_CHANGED") ? 3 : 2;
});
