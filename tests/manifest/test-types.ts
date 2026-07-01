export type TestLayer =
  | "contract"
  | "unit"
  | "component"
  | "integration"
  | "api"
  | "e2e"
  | "android"
  | "vendor-device"
  | "postrelease";

export type TestStatus =
  | "PASSED"
  | "FAILED"
  | "ERROR"
  | "SKIPPED"
  | "NOT_RUN";

export type ExecutionPolicy = "scheduled" | "manual";

export interface ExecutionNode {
  name: string;
  platform?: string;
}

export interface TestEntry {
  testId: string;
  layer: TestLayer;
  filePath: string;
  description?: string;
  tags?: string[];
  blocking?: boolean;
  executionPolicy?: ExecutionPolicy;
  executionNodes?: ExecutionNode[];
  inputDescription?: string;
  expectedOutput?: string;
  expectedEvidence?: string;
  timeoutMs?: number;
  isolation?: string;
  oldScriptPath?: string;
  mappingStatus?: "MIGRATED" | "SUPERSEDED" | "RETAINED" | "DEPRECATED" | "UNCLASSIFIED";
}

export interface RunResultJson {
  testId: string;
  layer: TestLayer;
  status: TestStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  commit: string;
  branch: string;
  environment: Record<string, unknown>;
  passed: number;
  failed: number;
  skipped: number;
  notRun: number;
  flaky: number;
  evidence: string[];
}

export interface TestManifest {
  entries: TestEntry[];
  generatedAt: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
