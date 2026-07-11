import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";

export interface ParitySession {
  accessToken: string;
  refreshToken?: string;
  deviceId: string;
  user?: { id: string; maskedPhone?: string };
}

export interface WorkspaceEntity {
  id: string;
  revision: number;
  payload: Record<string, unknown>;
  assetRefs?: Record<string, unknown>;
}

export interface WorkspaceOverview {
  garments: WorkspaceEntity[];
  outfits: WorkspaceEntity[];
  wishlistItems: WorkspaceEntity[];
  locations: WorkspaceEntity[];
  tripPlans?: WorkspaceEntity[];
  outfitPlans: WorkspaceEntity[];
  wearEvents: WorkspaceEntity[];
  profiles?: WorkspaceEntity[];
}

export class ParityApiClient {
  readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly correlation: { runId: string; caseId: string; actionId: string; platform: "app" | "mini" },
    options: { allowNonLocal?: boolean } = {},
  ) {
    const url = new URL(baseUrl);
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) && !options.allowNonLocal) {
      throw new Error(`Parity seed refuses non-local API host: ${url.hostname}`);
    }
    this.baseUrl = baseUrl.replace(/\/$/u, "");
  }

  async register(phone: string, password: string, deviceId: string): Promise<ParitySession> {
    const session = await this.request<Omit<ParitySession, "deviceId">>("/api/auth/register", { method: "POST", body: { phone, password, deviceId, deviceLabel: `Parity ${this.correlation.platform}` } });
    return { ...session, deviceId };
  }

  async login(phone: string, password: string, deviceId: string): Promise<ParitySession> {
    const session = await this.request<Omit<ParitySession, "deviceId">>("/api/auth/login", { method: "POST", body: { account: phone, password, deviceId, deviceLabel: `Parity ${this.correlation.platform}` } });
    return { ...session, deviceId };
  }

  async overview(session: ParitySession): Promise<WorkspaceOverview> {
    return await this.request<WorkspaceOverview>("/api/workspace/overview", { session });
  }

  async createEntity(
    session: ParitySession,
    resource: string,
    clientMutationId: string,
    payload: Record<string, unknown>,
    assetMutations: unknown[] = [],
  ): Promise<WorkspaceEntity> {
    const response = await this.request<{ status: string; entity?: WorkspaceEntity }>(`/api/workspace/${resource}`, {
      method: "POST",
      session,
      body: { clientMutationId, payload, assetMutations },
    });
    if (response.status !== "committed" || !response.entity) throw new Error(`create ${resource} did not commit`);
    return response.entity;
  }

  async uploadImageSession(
    session: ParitySession,
    entityType: "garment" | "wishlistItem" | "outfit" | "profile",
    imagePath: string,
    clientMutationId: string,
  ): Promise<unknown[]> {
    const body = await fs.readFile(imagePath);
    const checksum = createHash("sha256").update(body).digest("hex");
    const request = {
      clientMutationId,
      entityType,
      slots: ["original", "thumbnail"].map((variant) => ({
        fieldName: "imageDataUrl",
        variant,
        sha256: checksum,
        mimeType: "image/jpeg",
        sizeBytes: body.length,
      })),
    };
    const temporary = await this.request<{ sessionId: string; assets: Array<{ assetId: string; variant: string; fieldName: string }> }>(
      "/api/workspace/assets/sessions",
      { method: "POST", session, body: request },
    );
    for (const asset of temporary.assets) {
      await this.request(`/api/workspace/assets/sessions/${encodeURIComponent(temporary.sessionId)}/assets/${encodeURIComponent(asset.assetId)}`, {
        method: "PUT",
        session,
        rawBody: body,
        contentType: "image/jpeg",
      });
    }
    const status = await this.request<{ ready: boolean; assets: Array<{ assetId: string; fieldName: string }> }>(
      `/api/workspace/assets/sessions/${encodeURIComponent(temporary.sessionId)}`,
      { session },
    );
    if (!status.ready) throw new Error("temporary asset session is not ready after fixture upload");
    return [{ kind: "create_or_replace", fieldName: "imageDataUrl", temporaryAssetIds: status.assets.map((asset) => asset.assetId) }];
  }

  async request<T>(path: string, options: {
    method?: string;
    session?: ParitySession;
    body?: unknown;
    rawBody?: Uint8Array;
    contentType?: string;
  } = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "X-Parity-Run-Id": this.correlation.runId,
        "X-Parity-Case-Id": this.correlation.caseId,
        "X-Parity-Action-Id": this.correlation.actionId,
        "X-Parity-Platform": this.correlation.platform,
        ...(options.session ? { Authorization: `Bearer ${options.session.accessToken}`, "X-Wardrobe-Device-Id": options.session.deviceId } : {}),
        ...(options.body === undefined && options.rawBody === undefined ? {} : { "Content-Type": options.contentType ?? "application/json" }),
      },
      ...(options.rawBody ? { body: options.rawBody as BodyInit } : options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
    return data as T;
  }
}

export function deterministicUuid(...parts: string[]): string {
  const hex = createHash("sha256").update(parts.join(":"), "utf8").digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

export function deterministicPhone(...parts: string[]): string {
  const digits = createHash("sha256").update(parts.join(":"), "utf8").digest("hex")
    .split("")
    .map((character) => Number.parseInt(character, 16) % 10)
    .join("")
    .slice(0, 8);
  return `138${digits}`;
}

export function freshLegacyNumber(seed: string): number {
  return 1_700_000_000_000 + Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
}

export function randomActionId(): string {
  return randomUUID();
}
