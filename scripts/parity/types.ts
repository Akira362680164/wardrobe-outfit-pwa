export type Platform = "app" | "mini";

export type TransitionType =
  | "push"
  | "replace"
  | "tab"
  | "reset"
  | "pop"
  | "overlay-open"
  | "overlay-close"
  | "state-change"
  | "external"
  | "host-native"
  | "none";

export type SideEffectType =
  | "NONE"
  | "LOCAL_STATE"
  | "BACKEND_READ"
  | "BACKEND_WRITE"
  | "ASYNC_JOB"
  | "OBJECT_UPLOAD"
  | "THIRD_PARTY"
  | "HOST_NATIVE";

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface ScreenInventoryItem {
  id: string;
  platform: Platform;
  kind: "route" | "internal" | "component";
  source: SourceLocation;
  routeHint?: string;
  stateHint?: string;
  evidence: string;
}

export interface ActionInventoryItem {
  id: string;
  platform: Platform;
  screenId: string;
  event: string;
  handler?: string;
  parityId?: string;
  source: SourceLocation;
  visibleWhen?: string;
  transitionHint?: TransitionType;
  sideEffectHint?: SideEffectType;
  evidence: string;
}

export interface OverlayInventoryItem {
  id: string;
  platform: Platform;
  screenId: string;
  kind: string;
  source: SourceLocation;
  triggerHint?: string;
  evidence: string;
}

export interface TransitionInventoryItem {
  id: string;
  platform: Platform;
  screenId: string;
  type: TransitionType;
  targetHint?: string;
  source: SourceLocation;
  evidence: string;
}

export interface SideEffectInventoryItem {
  id: string;
  platform: Platform;
  screenId: string;
  type: SideEffectType;
  methodHint?: string;
  targetHint?: string;
  source: SourceLocation;
  evidence: string;
}

export interface UnresolvedInventoryItem {
  id: string;
  platform: Platform;
  category: "screen" | "action" | "overlay" | "transition" | "side-effect";
  source: SourceLocation;
  reason: string;
  evidence: string;
}

export interface UnresolvedResolution {
  id: string;
  status: "RESOLVED";
  classification: "STATIC_TARGETS" | "DERIVED_TARGETS" | "UNREACHABLE_DEFECT";
  targets: string[];
  rationale: string;
  reviewedBy: string;
  reviewedAt: string;
}

export interface InventoryBundle {
  schemaVersion: 1;
  generatedAt: string;
  platform: Platform;
  ref: string;
  sha: string;
  treeHash: string;
  root: string;
  screens: ScreenInventoryItem[];
  actions: ActionInventoryItem[];
  overlays: OverlayInventoryItem[];
  transitions: TransitionInventoryItem[];
  sideEffects: SideEffectInventoryItem[];
  unresolved: UnresolvedInventoryItem[];
}

export interface DeviceProfile {
  serial: string;
  model: string;
  androidVersion: string;
  sdk: string;
  screenWidth: number;
  screenHeight: number;
  density: number;
  locale: string;
  fontScale: number;
  theme: string;
  timezone: string;
  frozenTime: string;
}

export interface BaselineLock {
  schemaVersion: 1;
  runId: string;
  runKind: "build" | "audit" | "repair" | "regression";
  source: "local-branch-head";
  remoteFetched: false;
  createdAt: string;
  appRef: string;
  appSha: string;
  appTreeHash: string;
  miniRef: string;
  miniSha: string;
  miniTreeHash: string;
  rootWorktreeDirty: boolean;
  miniWorktreeDirty: boolean;
  nodeVersion: string;
  packageManagerVersion: string;
  lockfileHashes: Record<string, string>;
  backendBaseUrl: string;
  backendVersion: string;
  androidBuildHash: string;
  wechatDevToolsVersion: string;
  wechatClientVersion: string;
  previewMiniSha: string;
  testApiConfigured: boolean;
  fixtureResetConfigured: boolean;
  e2eFaultTokenAvailable: boolean;
  minimaxKeyAvailable: boolean;
  liveAiEnabled: boolean;
  deviceProfile: DeviceProfile;
}

export type ScreenMappingStatus =
  | "EQUIVALENT"
  | "APP_ONLY_DEFECT"
  | "MINI_ONLY_DEFECT"
  | "MINI_ONLY_PLATFORM"
  | "HOST_WRAPPER"
  | "LOGIN_EXCLUDED"
  | "UNMAPPED";

export interface ManifestPlatformScreen {
  routes: string[];
  sourceInventoryIds: string[];
  sourceFiles: string[];
}

export interface ManifestState {
  id: string;
  fixture: string;
  checkpoint: boolean;
  expectedOn: Platform[];
}

export interface ManifestAction {
  id: string;
  event: string;
  requiredOn: Platform[];
  sourceActionIds: Partial<Record<Platform, string[]>>;
  expectedTransition: TransitionType;
  target?: string;
  sideEffect: SideEffectType;
  serverAssertion?: string;
  notApplicable?: Partial<Record<Platform, string>>;
}

export interface ScreenManifest {
  id: string;
  domain: string;
  sourceOfTruth: "app";
  mappingStatus: ScreenMappingStatus;
  app: ManifestPlatformScreen;
  mini: ManifestPlatformScreen;
  fixtures: string[];
  entryPaths: Array<{ id: string; actions: string[] }>;
  states: ManifestState[];
  requiredActions: ManifestAction[];
  overlays: string[];
  checkpoints: string[];
  platformExceptionIds: string[];
}

export interface DomainManifest {
  schemaVersion: 1;
  domain: string;
  screens: ScreenManifest[];
}

export interface ScreenMapEntry {
  id: string;
  domain: string;
  mappingStatus: ScreenMappingStatus;
  appInventoryIds: string[];
  miniInventoryIds: string[];
  notes: string;
}

export interface ScreenMapManifest {
  schemaVersion: 1;
  screens: ScreenMapEntry[];
}

export interface AppSourceDisposition {
  id: string;
  classification: "STATE_OF_SCREEN" | "COMPONENT_OF_SCREEN" | "SHARED_SCREEN_INFRASTRUCTURE";
  targets: string[];
  rationale: string;
}

export type DefectSeverity = "P0" | "P1" | "P2" | "P3";
export type DefectStatus = "OPEN" | "FIXED_UNVERIFIED" | "VERIFIED" | "WAIVED_BY_HUMAN";

export interface StaticDefect {
  defectId: string;
  severity: DefectSeverity;
  category: string;
  screenId: string;
  actionId?: string;
  confirmation: "STATIC_CONFIRMED" | "RUNTIME_CONFIRMATION_REQUIRED";
  expected: string;
  actual: string;
  sourceEvidence: string[];
  acceptanceCriteria: string[];
  suspectedFiles: string[];
  status: DefectStatus;
}
