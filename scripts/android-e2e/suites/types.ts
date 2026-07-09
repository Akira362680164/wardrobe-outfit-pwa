import type { expect as playwrightExpect, Page } from "@playwright/test";

export interface AndroidE2EAccount {
  phone: string;
  password: string;
}

export interface WorkspaceEntity {
  id: string;
  revision: number;
  payload: Record<string, unknown>;
}

export interface WorkspaceOverview {
  garments: WorkspaceEntity[];
  outfits: WorkspaceEntity[];
  wishlistItems: WorkspaceEntity[];
  locations: WorkspaceEntity[];
  outfitPlans: WorkspaceEntity[];
  wearEvents: WorkspaceEntity[];
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  deviceId: string;
  user?: { id: string; maskedPhone: string };
}

export interface AndroidE2EApi {
  register(account: AndroidE2EAccount, deviceId?: string): Promise<AuthSession>;
  login(account: AndroidE2EAccount, deviceId?: string): Promise<AuthSession>;
  overview(session: AuthSession): Promise<WorkspaceOverview>;
  getWorkspaceOverview(session: AuthSession): Promise<WorkspaceOverview>;
  create(session: AuthSession, resource: string, payload: Record<string, unknown>): Promise<{ entity: WorkspaceEntity }>;
  update(session: AuthSession, resource: string, entity: WorkspaceEntity, payload: Record<string, unknown>): Promise<{ entity: WorkspaceEntity }>;
  remove(session: AuthSession, resource: string, entity: WorkspaceEntity): Promise<void>;
  post<T>(session: AuthSession, path: string, body: Record<string, unknown>): Promise<T>;
  request<T>(session: AuthSession, path: string, options?: { method?: string; body?: unknown }): Promise<T>;
  workspace<T>(session: AuthSession, path: string, options?: { method?: string; body?: unknown }): Promise<T>;
}

export interface AndroidE2EDevice {
  restartApp(): Promise<Page | void>;
  startApp(packageName?: string): Promise<Page | void>;
  clearAppData(packageName?: string): Promise<void>;
  forceStop(packageName?: string): Promise<void>;
}

export interface AndroidE2EArtifacts {
  screenshot(page: Page, name: string): Promise<void>;
  screenshot(name: string, page?: Page): Promise<void>;
  writeJson(name: string, value: unknown): Promise<void>;
  step(name: string): Promise<void>;
  step<T>(name: string, action: () => Promise<T>): Promise<T>;
  log(message: string): Promise<void>;
}

export interface AndroidE2EContext {
  page: Page;
  api: AndroidE2EApi;
  device: AndroidE2EDevice;
  artifacts: AndroidE2EArtifacts;
  expect: typeof playwrightExpect;
  freshAccount(): AndroidE2EAccount;
}

export interface AndroidE2ECase {
  id: string;
  title: string;
  run(ctx: AndroidE2EContext): Promise<void>;
}
