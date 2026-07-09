import { request } from "./http";

export interface MiniMaxSettings {
  apiKey: string;
  apiHost: string;
  model: string;
  timeoutMs: number;
}

export interface AiGarmentTag {
  candidateNames: string[];
  category: string;
  colors: AiColorInfo;
  seasons: string[];
  styles: string[];
  temperatureRange?: { minC?: number; maxC?: number };
  material?: string;
  formality: number;
  warmth: number;
  confidence: number;
  needsReview: boolean;
  notes?: string;
  fitGender?: string;
  fitNotes?: string;
}

export type AiColorInfo =
  | { mode: "single"; primary: string }
  | { mode: "main_with_accent"; primary: string; accents?: string[] }
  | { mode: "multicolor"; primaries?: string[] };

export interface AiOutfitMetadata {
  name?: string;
  seasons?: string[];
  sceneTags?: string[];
  styleTags?: string[];
  pairingTags?: string[];
  temperatureRange?: { minC?: number; maxC?: number };
  notes?: string;
}

export type AiEnhancementKind = "wardrobe-diagnosis" | "garment-style-advice" | "wishlist-assessment" | "outfit-ai-suggestion";

export interface RecognizeGarmentImageInput {
  clientItemId: string;
  stablePath: string;
  fallbackName?: string;
}

export type RecognizeGarmentImageResult =
  | { clientItemId: string; status: "succeeded"; tag: AiGarmentTag }
  | { clientItemId: string; status: "failed"; error: string };

type PreparedBatchItem = {
  clientItemId: string;
  imageDataUrl: string;
  fallbackName: string;
};

const STORAGE_KEY = "wardrobe-miniprogram-minimax-settings";
const AI_RECOGNITION_MAX_BATCH_ITEMS = 10;
const AI_RECOGNITION_MAX_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_SETTINGS: MiniMaxSettings = {
  apiKey: "",
  apiHost: "https://api.minimaxi.com",
  model: "MiniMax-M3",
  timeoutMs: 60000,
};

export function loadMiniMaxSettings(): MiniMaxSettings {
  const saved = wx.getStorageSync(STORAGE_KEY);
  if (!saved || typeof saved !== "object") return { ...DEFAULT_SETTINGS };
  const record = saved as Partial<MiniMaxSettings>;
  return {
    apiKey: typeof record.apiKey === "string" ? record.apiKey : "",
    apiHost: typeof record.apiHost === "string" && record.apiHost ? record.apiHost : DEFAULT_SETTINGS.apiHost,
    model: typeof record.model === "string" && record.model ? record.model : DEFAULT_SETTINGS.model,
    timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : DEFAULT_SETTINGS.timeoutMs,
  };
}

export function saveMiniMaxSettings(settings: MiniMaxSettings): void {
  wx.setStorageSync(STORAGE_KEY, {
    apiKey: settings.apiKey.trim(),
    apiHost: settings.apiHost.trim() || DEFAULT_SETTINGS.apiHost,
    model: settings.model.trim() || DEFAULT_SETTINGS.model,
    timeoutMs: settings.timeoutMs,
  });
}

export function clearMiniMaxSettings(): void {
  wx.removeStorageSync(STORAGE_KEY);
}

export function hasMiniMaxKey(): boolean {
  return Boolean(loadMiniMaxSettings().apiKey.trim());
}

export async function recognizeGarmentImage(filePath: string): Promise<AiGarmentTag> {
  const response = await request<{ tag: AiGarmentTag }>({
    method: "POST",
    path: "/api/workspace/ai/intake/garment-recognition",
    data: {
      miniMax: runtimeSettings(),
      imageDataUrl: await imageSourceToDataUrl(filePath),
      fallbackName: fileNameFromPath(filePath),
    },
    timeoutMs: 120000,
  });
  return response.tag;
}

export async function recognizeGarmentImages(items: RecognizeGarmentImageInput[]): Promise<RecognizeGarmentImageResult[]> {
  const miniMax = runtimeSettings();
  const prepared: PreparedBatchItem[] = [];
  const results: RecognizeGarmentImageResult[] = [];

  for (const item of items) {
    try {
      prepared.push({
        clientItemId: item.clientItemId,
        imageDataUrl: await imageSourceToDataUrl(item.stablePath),
        fallbackName: item.fallbackName || fileNameFromPath(item.stablePath),
      });
    } catch (error) {
      results.push({ clientItemId: item.clientItemId, status: "failed", error: errorMessage(error, "读取图片失败") });
    }
  }

  const plan = planRecognitionBatches(prepared, miniMax);
  results.push(...plan.tooLargeItems.map((item) => ({
    clientItemId: item.clientItemId,
    status: "failed" as const,
    error: "图片超过 8MB AI 请求限制，请重新选择或裁切",
  })));

  for (const chunk of plan.chunks) {
    try {
      const response = await request<{ items: RecognizeGarmentImageResult[] }>({
        method: "POST",
        path: "/api/workspace/ai/intake/garment-recognition/batch",
        data: {
          miniMax,
          items: chunk,
        },
        timeoutMs: 120000,
      });
      const byId = new Map(response.items.map((item) => [item.clientItemId, item]));
      results.push(...chunk.map((item) => byId.get(item.clientItemId) ?? {
        clientItemId: item.clientItemId,
        status: "failed" as const,
        error: "服务器未返回该图片识别结果",
      }));
    } catch (error) {
      const message = errorMessage(error, "批量识别失败，请重试");
      results.push(...chunk.map((item) => ({ clientItemId: item.clientItemId, status: "failed" as const, error: message })));
    }
  }

  const byId = new Map(results.map((item) => [item.clientItemId, item]));
  return items.map((item) => byId.get(item.clientItemId) ?? {
    clientItemId: item.clientItemId,
    status: "failed" as const,
    error: "识别失败，请重试",
  });
}

export async function generateOutfitMetadata(input: {
  name?: string;
  itemIds: number[];
  outfitItems: Array<{
    id: number;
    name: string;
    category: string;
    colors?: AiColorInfo;
    seasons?: string[];
    styles?: string[];
    temperatureRange?: { minC?: number; maxC?: number };
  }>;
}): Promise<AiOutfitMetadata> {
  return request<AiOutfitMetadata>({
    method: "POST",
    path: "/api/workspace/ai/intake/outfit-metadata",
    data: { miniMax: runtimeSettings(), ...input },
    timeoutMs: 120000,
  });
}

export async function aiEnhance<T>(kind: AiEnhancementKind, input: Record<string, unknown>): Promise<T> {
  return request<T>({
    method: "POST",
    path: `/api/workspace/ai/enhance/${kind}`,
    data: { miniMax: runtimeSettings(), input },
    timeoutMs: 120000,
  });
}

export function colorLabel(colors: AiColorInfo | undefined): string {
  if (!colors) return "未标注";
  if (colors.mode === "single") return colors.primary || "未标注";
  if (colors.mode === "main_with_accent") return [colors.primary, ...(colors.accents ?? [])].filter(Boolean).slice(0, 3).join(" / ") || "未标注";
  return (colors.primaries ?? []).filter(Boolean).slice(0, 3).join(" / ") || "多色";
}

function runtimeSettings(): MiniMaxSettings {
  const settings = loadMiniMaxSettings();
  if (!settings.apiKey.trim()) throw new Error("请先在设置中填写 MiniMax Key");
  return settings;
}

function planRecognitionBatches(items: PreparedBatchItem[], miniMax: MiniMaxSettings): { chunks: PreparedBatchItem[][]; tooLargeItems: PreparedBatchItem[] } {
  const chunks: PreparedBatchItem[][] = [];
  const tooLargeItems: PreparedBatchItem[] = [];
  let current: PreparedBatchItem[] = [];

  for (const item of items) {
    if (recognitionBatchBodyBytes([item], miniMax) >= AI_RECOGNITION_MAX_BODY_BYTES) {
      if (current.length) {
        chunks.push(current);
        current = [];
      }
      tooLargeItems.push(item);
      continue;
    }

    const next = [...current, item];
    if (next.length > AI_RECOGNITION_MAX_BATCH_ITEMS || recognitionBatchBodyBytes(next, miniMax) >= AI_RECOGNITION_MAX_BODY_BYTES) {
      if (current.length) chunks.push(current);
      current = [item];
    } else {
      current = next;
    }
  }

  if (current.length) chunks.push(current);
  return { chunks, tooLargeItems };
}

function recognitionBatchBodyBytes(items: PreparedBatchItem[], miniMax: MiniMaxSettings): number {
  return utf8ByteLength(JSON.stringify({ miniMax, items }));
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xd800 && code <= 0xdbff ? (i += 1, 4) : 3;
  }
  return bytes;
}

async function imageSourceToDataUrl(source: string): Promise<string> {
  if (source.startsWith("data:image/")) return source;
  const filePath = /^https?:\/\//.test(source) ? await downloadToTempFile(source) : source;
  const base64 = await readFileBase64(filePath);
  return `data:${mimeTypeForPath(filePath)};base64,${base64}`;
}

function downloadToTempFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      timeout: 60000,
      success: (result) => {
        if (result.statusCode < 400 && result.tempFilePath) resolve(result.tempFilePath);
        else reject(new Error("读取图片失败"));
      },
      fail: () => reject(new Error("读取图片失败")),
    });
  });
}

function readFileBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (result) => {
        if (typeof result.data === "string") resolve(result.data);
        else reject(new Error("图片读取格式无效"));
      },
      fail: () => reject(new Error("读取图片失败")),
    });
  });
}

function fileNameFromPath(path: string): string {
  return path.split(/[/?#]/).filter(Boolean).pop() || "garment.jpg";
}

function mimeTypeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
