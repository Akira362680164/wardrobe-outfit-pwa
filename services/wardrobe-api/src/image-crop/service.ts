import { spawn } from "node:child_process";
import { ImageCropSuggestionSchema, expandCropBoxEachSide, type ImageCropSuggestion } from "@wardrobe/cloud-contracts";
import { WorkspaceApiError } from "../workspace/errors.js";

export interface CropSidecar {
  suggest(input: { clientItemId: string; mimeType: string; image: Buffer }): Promise<ImageCropSuggestion>;
}

export class ImageCropService {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly sidecar: CropSidecar = new ProcessCropSidecar(), private readonly concurrency = envInt("IMAGE_CROP_CONCURRENCY", 2), private readonly queueLimit = envInt("IMAGE_CROP_QUEUE_LIMIT", 20)) {}

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

export class ProcessCropSidecar implements CropSidecar {
  async suggest(input: { clientItemId: string; mimeType: string; image: Buffer }): Promise<ImageCropSuggestion> {
    const command = process.env.IMAGE_CROP_SIDECAR_COMMAND;
    const modelPath = process.env.IMAGE_CROP_MODEL_PATH;
    if (!command || !modelPath) throw new WorkspaceApiError(503, "server", "自动裁切模型尚未配置，请手工调整", true);
    const timeoutMs = envInt("IMAGE_CROP_TIMEOUT_MS", 12_000);
    return new Promise<ImageCropSuggestion>((resolve, reject) => {
      const child = spawn(command, ["--model", modelPath], { env: { ...process.env, PYTHONUNBUFFERED: "1" } });
      child.stderr.resume();
      const chunks: Buffer[] = [];
      let outputBytes = 0;
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new WorkspaceApiError(504, "server", "自动裁切超时，请手工调整", true)); }, timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > 64 * 1024) { child.kill("SIGKILL"); return; }
        chunks.push(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 || outputBytes > 64 * 1024) return reject(new Error("crop sidecar failed"));
        try {
          const raw = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
          const cropBox = expandCropBoxEachSide(raw.cropBox as any, 0.2);
          resolve(ImageCropSuggestionSchema.parse({ ...raw, clientItemId: input.clientItemId, cropBox, source: "u2netp", coordinateSpace: "exif-corrected-normalized-top-left" }));
        } catch (error) { reject(error); }
      });
      child.stdin.end(JSON.stringify({ clientItemId: input.clientItemId, mimeType: input.mimeType, imageBase64: input.image.toString("base64") }));
    });
  }
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
