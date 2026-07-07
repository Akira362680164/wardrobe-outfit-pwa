import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  ALLOW_LIVE_AI_TEST: "true",
  E2E_AI_MODE: "live",
};

const result = spawnSync(
  "bash",
  ["./scripts/run-e2e-local.sh", "e2e/specs/v03-alpha-live-capture.spec.ts"],
  { stdio: "inherit", env },
);

process.exit(result.status ?? 1);
