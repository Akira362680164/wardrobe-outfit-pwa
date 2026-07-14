import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { ImageCropSuggestionSchema, expandCropBoxEachSide, type ImageCropSuggestion } from "@wardrobe/cloud-contracts";
import { WorkspaceApiError } from "../workspace/errors.js";

export interface CropSidecar {
  suggest(input: { clientItemId: string; mimeType: string; image: Buffer }): Promise<ImageCropSuggestion>;
  start?(): void;
  isReady?(): boolean;
  close?(): Promise<void>;
}

export class ImageCropService {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly sidecar: CropSidecar = new ProcessCropSidecar(), private readonly concurrency = envInt("IMAGE_CROP_CONCURRENCY", 1), private readonly queueLimit = envInt("IMAGE_CROP_QUEUE_LIMIT", 20)) {}

  start() { this.sidecar.start?.(); }
  isReady() { return this.sidecar.isReady?.() ?? true; }
  async close() { await this.sidecar.close?.(); }

  async suggest(input: { clientItemId: string; mimeType: string; image: Buffer }): Promise<ImageCropSuggestion> {
    await this.acquire();
    try {
      return await this.sidecar.suggest(input);
    } catch (error) {
      if (error instanceof WorkspaceApiError) throw error;
      throw new WorkspaceApiError(503, "server", "自动裁切暂不可用，请手工调整", true);
    } finally {
      this.release();
    }
  }

  private async acquire() {
    if (this.active < this.concurrency) { this.active += 1; return; }
    if (this.waiting.length >= this.queueLimit) throw new WorkspaceApiError(503, "server", "自动裁切繁忙，请手工调整", true);
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
  }

  private release() {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}

type PendingRequest = {
  clientItemId: string;
  resolve: (value: ImageCropSuggestion) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class ProcessCropSidecar implements CropSidecar {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private stopping = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private outputBuffer = "";
  private readonly pending = new Map<string, PendingRequest>();

  start() {
    if (this.stopping || this.child) return;
    const command = process.env.IMAGE_CROP_SIDECAR_COMMAND;
    const modelPath = process.env.IMAGE_CROP_MODEL_PATH;
    if (!command || !modelPath) return;
    this.spawnWorker(command, modelPath);
  }

  isReady() { return this.ready && this.child !== null; }

  async suggest(input: { clientItemId: string; mimeType: string; image: Buffer }): Promise<ImageCropSuggestion> {
    if (!this.child) this.start();
    if (!this.isReady() || !this.child) {
      throw new WorkspaceApiError(503, "server", "自动裁切正在准备，请稍后重试或手工调整", true);
    }
    const requestId = randomUUID();
    const timeoutMs = envInt("IMAGE_CROP_TIMEOUT_MS", 12_000);
    return new Promise<ImageCropSuggestion>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new WorkspaceApiError(504, "server", "自动裁切超时，请手工调整", true));
        this.child?.kill("SIGKILL");
      }, timeoutMs);
      this.pending.set(requestId, { clientItemId: input.clientItemId, resolve, reject, timer });
      const payload = JSON.stringify({ requestId, clientItemId: input.clientItemId, mimeType: input.mimeType, imageBase64: input.image.toString("base64") }) + "\n";
      this.child!.stdin.write(payload, (error) => {
        if (!error) return;
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.reject(error);
      });
    });
  }

  async close() {
    this.stopping = true;
    this.ready = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const child = this.child;
    this.child = null;
    this.rejectAll(new Error("crop sidecar closed"));
    child?.kill("SIGTERM");
  }

  private spawnWorker(command: string, modelPath: string) {
    const child = spawn(command, ["--model", modelPath, "--persistent"], { env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    this.child = child;
    this.ready = false;
    this.outputBuffer = "";
    child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer) => this.consumeOutput(chunk));
    child.stdin.on("error", () => { /* close/timeout path owns recovery */ });
    child.on("error", (error) => this.handleExit(child, error));
    child.on("close", () => this.handleExit(child, new Error("crop sidecar exited")));
  }

  private consumeOutput(chunk: Buffer) {
    this.outputBuffer += chunk.toString("utf8");
    if (Buffer.byteLength(this.outputBuffer) > 64 * 1024) {
      this.child?.kill("SIGKILL");
      return;
    }
    for (;;) {
      const newline = this.outputBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.outputBuffer.slice(0, newline);
      this.outputBuffer = this.outputBuffer.slice(newline + 1);
      if (!line) continue;
      this.handleMessage(line);
    }
  }

  private handleMessage(line: string) {
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(line) as Record<string, unknown>; } catch { this.child?.kill("SIGKILL"); return; }
    if (raw.type === "ready") { this.ready = true; return; }
    const requestId = typeof raw.requestId === "string" ? raw.requestId : "";
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    if (raw.type === "error") { pending.reject(new Error("crop sidecar request failed")); return; }
    try {
      const cropBox = expandCropBoxEachSide(raw.cropBox as never, 0.2);
      pending.resolve(ImageCropSuggestionSchema.parse({ ...raw, clientItemId: pending.clientItemId, cropBox, source: "u2netp", coordinateSpace: "exif-corrected-normalized-top-left" }));
    } catch (error) { pending.reject(error); }
  }

  private handleExit(child: ChildProcessWithoutNullStreams, error: unknown) {
    if (this.child !== child) return;
    this.child = null;
    this.ready = false;
    this.outputBuffer = "";
    this.rejectAll(error);
    if (this.stopping || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start();
    }, envInt("IMAGE_CROP_RESTART_DELAY_MS", 250));
    this.restartTimer.unref?.();
  }

  private rejectAll(error: unknown) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export async function isImageCropConfigured(): Promise<boolean> {
  const command = process.env.IMAGE_CROP_SIDECAR_COMMAND;
  const modelPath = process.env.IMAGE_CROP_MODEL_PATH;
  if (!command || !modelPath) return false;
  try {
    await Promise.all([access(command, constants.X_OK), access(modelPath, constants.R_OK)]);
    return true;
  } catch { return false; }
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
