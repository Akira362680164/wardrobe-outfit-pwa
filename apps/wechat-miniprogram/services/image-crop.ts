import { request } from "./http";

export interface CropBox { x: number; y: number; width: number; height: number }
export interface CropSuggestionResponse { revision: number; suggestion: { clientItemId: string; cropBox: CropBox; confidence: number; needsReview: boolean; reasonCodes: string[]; modelVersion: string } }

export async function requestCropSuggestion(input: { clientItemId: string; revision: number; filePath: string }): Promise<CropSuggestionResponse> {
  const info = await getImageInfo(input.filePath);
  const mimeType = info.type === "png" ? "image/png" : info.type === "webp" ? "image/webp" : "image/jpeg";
  const imageBase64 = await readBase64(input.filePath);
  return request({ method: "POST", path: "/api/workspace/images/crop-suggestion", data: { clientItemId: input.clientItemId, revision: input.revision, mimeType, imageBase64 }, timeoutMs: 15_000, toast: false });
}

export async function applyCropBoxToOriginal(filePath: string, box: CropBox): Promise<string> {
  const info = await getImageInfo(filePath);
  const api = wx as any;
  if (typeof api.createOffscreenCanvas !== "function") return filePath;
  const canvas = api.createOffscreenCanvas({ type: "2d", width: Math.max(1, Math.round(info.width * box.width)), height: Math.max(1, Math.round(info.height * box.height)) });
  const image = canvas.createImage();
  await new Promise<void>((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = filePath; });
  canvas.getContext("2d").drawImage(image, info.width * box.x, info.height * box.y, info.width * box.width, info.height * box.height, 0, 0, canvas.width, canvas.height);
  return new Promise<string>((resolve, reject) => api.canvasToTempFilePath({ canvas, fileType: "jpg", quality: 0.92, success: (result: { tempFilePath: string }) => resolve(result.tempFilePath), fail: reject }));
}

export async function createTenByTenGridFile(filePath: string): Promise<string> {
  const info = await getImageInfo(filePath);
  const api = wx as any;
  if (typeof api.createOffscreenCanvas !== "function") throw new Error("当前微信版本无法生成识别网格");
  const canvas = api.createOffscreenCanvas({ type: "2d", width: info.width, height: info.height });
  const image = canvas.createImage();
  await new Promise<void>((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = filePath; });
  const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
  context.strokeStyle = "rgba(255,64,64,.82)"; context.fillStyle = "rgba(255,255,255,.92)"; context.lineWidth = Math.max(1, Math.round(Math.min(info.width, info.height) / 500)); context.font = `bold ${Math.max(12, Math.round(Math.min(info.width, info.height) / 35))}px sans-serif`;
  for (let index = 0; index <= 10; index += 1) { const x = info.width * index / 10; const y = info.height * index / 10; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, info.height); context.stroke(); context.beginPath(); context.moveTo(0, y); context.lineTo(info.width, y); context.stroke(); if (index < 10) context.fillText(String(index), x + 3, Math.max(16, y + 20)); }
  return new Promise<string>((resolve, reject) => api.canvasToTempFilePath({ canvas, fileType: "jpg", quality: 0.94, success: (result: { tempFilePath: string }) => resolve(result.tempFilePath), fail: reject }));
}

export async function rotateOriginalFile(filePath: string, clockwiseDegrees: 90 | 270): Promise<string> {
  const info = await getImageInfo(filePath); const api = wx as any;
  if (typeof api.createOffscreenCanvas !== "function") throw new Error("当前微信版本无法旋转图片");
  const canvas = api.createOffscreenCanvas({ type: "2d", width: info.height, height: info.width }); const image = canvas.createImage();
  await new Promise<void>((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = filePath; });
  const context = canvas.getContext("2d"); context.translate(canvas.width / 2, canvas.height / 2); context.rotate(clockwiseDegrees * Math.PI / 180); context.drawImage(image, -info.width / 2, -info.height / 2);
  return new Promise<string>((resolve, reject) => api.canvasToTempFilePath({ canvas, fileType: "jpg", quality: 0.95, success: (result: { tempFilePath: string }) => resolve(result.tempFilePath), fail: reject }));
}

function readBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath, encoding: "base64", success: (result) => resolve(String(result.data)), fail: reject }));
}

function getImageInfo(src: string): Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult> {
  return new Promise((resolve, reject) => wx.getImageInfo({ src, success: resolve, fail: reject }));
}
