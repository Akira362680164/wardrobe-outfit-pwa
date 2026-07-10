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
