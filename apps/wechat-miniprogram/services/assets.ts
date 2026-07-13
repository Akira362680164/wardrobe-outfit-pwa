import { buildAuthHeaders, getConfiguredApiBaseUrl, recoverSession, request } from "./http";
import { getRuntimeSessionScope } from "../stores/session";

export interface AssetRef {
  assetId: string;
  variants: string[];
  sha256?: string;
  variantSha256?: Record<string, string>;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface TemporaryAssetSlotRequest {
  fieldName: string;
  variant: "original" | "thumbnail";
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface TemporaryAssetSession {
  sessionId: string;
  clientMutationId: string;
  assets: Array<TemporaryAssetSlotRequest & { assetId: string; uploadStatus: "pending" | "uploaded" | "failed" }>;
  expiresAt: string;
  ready?: boolean;
}

export type AssetMutation =
  | { kind: "create_or_replace"; fieldName: string; temporaryAssetIds: string[] }
  | { kind: "remove"; fieldName: string };

export interface LocalImageAssetInput {
  filePath: string;
  stablePath?: string;
  originalPath?: string;
  processedPath?: string;
  fieldName?: string;
  clientItemId?: string;
  clientMutationId?: string;
}

export interface ChosenImage {
  imagePath: string;
  stablePath: string;
  size?: number;
}

export interface UploadImageForCreateResult {
  clientItemId?: string;
  clientMutationId: string;
  image: LocalImageAssetInput;
  assetMutations?: AssetMutation[];
  error?: string;
}

export interface PreparedImageAssetResult {
  sessionId: string;
  assetMutations: AssetMutation[];
}

export class ImageSelectionCanceledError extends Error {
  constructor() {
    super("用户取消选择图片");
    this.name = "ImageSelectionCanceledError";
  }
}

const downloadedAssetImages = new Map<string, Promise<string>>();

export function clearDownloadedAssetImageCache(): void {
  downloadedAssetImages.clear();
}

export async function chooseSingleImage(sourceType: Array<"album" | "camera"> = ["album", "camera"]): Promise<string> {
  const image = (await chooseImages(sourceType, 1))[0];
  if (!image?.stablePath) throw new ImageSelectionCanceledError();
  return image.stablePath;
}

export async function chooseImages(sourceType: Array<"album" | "camera"> = ["album", "camera"], maxCount = 10): Promise<ChosenImage[]> {
  const count = Math.min(Math.max(Math.floor(maxCount), 1), 10);
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ["image"],
      sourceType,
      success: async (result) => {
        try {
          const files = result.tempFiles.filter((file) => Boolean(file.tempFilePath)).slice(0, count);
          if (!files.length) throw new Error("没有选择图片");
          resolve(await Promise.all(files.map(async (file, index) => ({
            imagePath: file.tempFilePath,
            stablePath: await copyToStableIntakePath(file.tempFilePath, index),
            size: file.size,
          }))));
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => {
        if (isImageSelectionCancel(error)) resolve([]);
        else reject(new Error("选择图片失败"));
      },
    });
  });
}

export async function cropImageWithNativeEditor(src: string): Promise<string | null> {
  const cropImage = (wx as typeof wx & {
    cropImage?: (options: { src: string; cropScale?: string; success: (result: { tempFilePath: string }) => void; fail: (error: unknown) => void }) => void;
  }).cropImage;
  if (!cropImage) throw new Error("当前微信版本不支持图片裁剪，请升级微信后重试");
  return new Promise((resolve, reject) => cropImage({
    src,
    success: (result) => resolve(result.tempFilePath),
    fail: (error) => isImageSelectionCancel(error) ? resolve(null) : reject(new Error("裁剪图片失败")),
  }));
}

function isImageSelectionCancel(error: unknown): boolean {
  const errMsg = typeof (error as { errMsg?: unknown })?.errMsg === "string" ? (error as { errMsg: string }).errMsg : "";
  return /cancel|取消/i.test(errMsg);
}

export async function downloadAssetImage(ref?: AssetRef, variant: "thumbnail" | "original" = "thumbnail"): Promise<string> {
  if (!ref?.assetId) return "";
  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) return "";
  const targetVariant = ref.variants?.includes(variant) ? variant : "original";
  const cacheKey = `${getRuntimeSessionScope()}:${ref.assetId}:${targetVariant}`;
  const cached = downloadedAssetImages.get(cacheKey);
  if (cached) return cached;
  const download = new Promise<string>((resolve) => {
    wx.downloadFile({
      url: `${baseUrl}/api/assets/${encodeURIComponent(ref.assetId)}/${targetVariant}/content`,
      header: buildAuthHeaders(),
      timeout: 30000,
      success: (result) => resolve(result.statusCode < 400 ? result.tempFilePath : ""),
      fail: () => resolve(""),
    });
  }).then((path) => {
    if (!path) downloadedAssetImages.delete(cacheKey);
    return path;
  });
  downloadedAssetImages.set(cacheKey, download);
  return download;
}

export async function uploadImageForCreate(input: {
  clientMutationId: string;
  entityType: "garment" | "outfit" | "wishlistItem" | "profile";
  image: LocalImageAssetInput;
}): Promise<AssetMutation[]> {
  const fieldName = input.image.fieldName ?? "imageDataUrl";
  const originalPath = await ensureStableImagePath(input.image.originalPath ?? input.image.stablePath ?? input.image.filePath);
  const processedPath = await ensureStableImagePath(input.image.processedPath ?? input.image.filePath);
  const prepared = await uploadPreparedImageAssets({
    clientMutationId: input.clientMutationId,
    entityType: input.entityType,
    fieldName,
    originalPath,
    processedPath,
  });
  return prepared.assetMutations;
}

export async function uploadPreparedImageAssets(input: {
  clientMutationId: string;
  entityType: "garment" | "outfit" | "wishlistItem" | "profile";
  fieldName: string;
  originalPath: string;
  processedPath: string;
}): Promise<PreparedImageAssetResult> {
  const originalPath = await ensureStableImagePath(input.originalPath);
  const processedPath = await ensureStableImagePath(input.processedPath);
  const thumbnailPath = await createThumbnail(processedPath);
  const [originalMetadata, thumbnailMetadata] = await Promise.all([
    getLocalImageMetadata(originalPath, input.fieldName),
    getLocalImageMetadata(thumbnailPath, input.fieldName),
  ]);
  const slots: TemporaryAssetSlotRequest[] = [
    { ...originalMetadata, variant: "original" },
    { ...thumbnailMetadata, variant: "thumbnail" },
  ];
  const session = await request<TemporaryAssetSession>({
    method: "POST",
    path: "/api/workspace/assets/sessions",
    data: { clientMutationId: input.clientMutationId, entityType: input.entityType, slots },
  });
  for (const asset of session.assets) {
    const path = asset.variant === "thumbnail" ? thumbnailPath : originalPath;
    await uploadTemporaryBytes(session.sessionId, asset.assetId, await readFileBytes(path), asset.mimeType);
  }

  const status = await request<TemporaryAssetSession>({
    path: `/api/workspace/assets/sessions/${encodeURIComponent(session.sessionId)}`,
  });
  const uploaded = status.assets.filter((asset) => asset.fieldName === input.fieldName).map((asset) => asset.assetId);
  if (!status.ready || uploaded.length < 2) throw new Error("图片上传尚未完成，请重试");
  return { sessionId: session.sessionId, assetMutations: [{ kind: "create_or_replace", fieldName: input.fieldName, temporaryAssetIds: uploaded }] };
}

export async function abandonTemporaryAssetSessions(sessionIds: string[]): Promise<void> {
  await Promise.all([...new Set(sessionIds.filter(Boolean))].map(async (sessionId) => {
    try { await request({ method: "DELETE", path: `/api/workspace/assets/sessions/${encodeURIComponent(sessionId)}` }); }
    catch { /* Expired/already-bound sessions need no client retry. */ }
  }));
}

export async function uploadImagesForCreate(input: {
  entityType: "garment" | "outfit" | "wishlistItem" | "profile";
  images: LocalImageAssetInput[];
}): Promise<UploadImageForCreateResult[]> {
  return Promise.all(input.images.map(async (image) => {
    const clientMutationId = image.clientMutationId;
    if (!clientMutationId) {
      return {
        clientItemId: image.clientItemId,
        clientMutationId: "",
        image,
        error: "缺少图片 clientMutationId",
      };
    }
    try {
      return {
        clientItemId: image.clientItemId,
        clientMutationId,
        image,
        assetMutations: await uploadImageForCreate({ clientMutationId, entityType: input.entityType, image }),
      };
    } catch (error) {
      return {
        clientItemId: image.clientItemId,
        clientMutationId,
        image,
        error: error instanceof Error ? error.message : "图片上传失败",
      };
    }
  }));
}

async function uploadTemporaryBytes(sessionId: string, assetId: string, data: ArrayBuffer, mimeType: string): Promise<void> {
  return uploadTemporaryBytesWithRefresh(sessionId, assetId, data, mimeType, false);
}

async function uploadTemporaryBytesWithRefresh(sessionId: string, assetId: string, data: ArrayBuffer, mimeType: string, replayed: boolean): Promise<void> {
  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) throw new Error("请先配置后端 API 域名");
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/api/workspace/assets/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(assetId)}`,
      method: "PUT",
      data,
      header: { ...buildAuthHeaders(), "Content-Type": mimeType },
      timeout: 60000,
      success: async (result) => {
        if (result.statusCode < 400) resolve();
        else if (result.statusCode === 401 && !replayed) {
          try {
            await recoverSession(true);
            await uploadTemporaryBytesWithRefresh(sessionId, assetId, data, mimeType, true);
            resolve();
          } catch (error) {
            reject(error);
          }
        } else reject(new Error("图片上传失败，请稍后重试"));
      },
      fail: () => reject(new Error("图片上传失败，请检查网络")),
    });
  });
}

async function getLocalImageMetadata(filePath: string, fieldName: string): Promise<Omit<TemporaryAssetSlotRequest, "variant">> {
  const [file, image] = await Promise.all([getFileInfo(filePath), getImageInfo(filePath)]);
  return {
    fieldName,
    sha256: file.digest,
    mimeType: mimeTypeForImageType(image.type) || mimeTypeForPath(filePath),
    sizeBytes: file.size,
    width: image.width,
    height: image.height,
  };
}

function getFileInfo(filePath: string): Promise<WechatMiniprogram.GetFileInfoSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.getFileInfo({ filePath, digestAlgorithm: "sha256", success: resolve, fail: () => reject(new Error("读取图片信息失败")) });
  });
}

function getImageInfo(src: string): Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src, success: resolve, fail: () => reject(new Error("读取图片尺寸失败")) });
  });
}

function readFileBytes(filePath: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (result) => {
        const data: unknown = result.data;
        if (data instanceof ArrayBuffer) resolve(data);
        else if (typeof data === "string") resolve(wx.base64ToArrayBuffer(data));
        else if (ArrayBuffer.isView(data)) {
          const view = data as ArrayBufferView;
          const bytes = new Uint8Array(view.byteLength);
          bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
          resolve(bytes.buffer);
        }
        else reject(new Error("图片读取格式无效"));
      },
      fail: () => reject(new Error("读取图片失败")),
    });
  });
}

async function ensureStableImagePath(filePath: string): Promise<string> {
  if (filePath.startsWith(intakeDirPath())) return filePath;
  return copyToStableIntakePath(filePath, 0);
}

async function createThumbnail(filePath: string): Promise<string> {
  const compressImage = (wx as typeof wx & {
    compressImage?: (options: { src: string; quality: number; compressedWidth: number; success: (result: { tempFilePath: string }) => void; fail: () => void }) => void;
  }).compressImage;
  if (!compressImage) throw new Error("当前微信版本无法生成缩略图，请升级微信后重试");
  const compressed = await new Promise<string>((resolve, reject) => compressImage({
    src: filePath,
    quality: 72,
    compressedWidth: 480,
    success: (result) => resolve(result.tempFilePath),
    fail: () => reject(new Error("生成缩略图失败")),
  }));
  return ensureStableImagePath(compressed);
}

async function copyToStableIntakePath(filePath: string, index: number): Promise<string> {
  await ensureIntakeDir();
  const destPath = `${intakeDirPath()}/intake-${Date.now()}-${index}.${extensionForPath(filePath)}`;
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().copyFile({
      srcPath: filePath,
      destPath,
      success: () => resolve(destPath),
      fail: () => reject(new Error("复制图片失败，请重试")),
    });
  });
}

function ensureIntakeDir(): Promise<void> {
  return new Promise((resolve) => {
    wx.getFileSystemManager().mkdir({
      dirPath: intakeDirPath(),
      recursive: true,
      success: () => resolve(),
      fail: () => resolve(),
    });
  });
}

function intakeDirPath(): string {
  return `${wx.env.USER_DATA_PATH}/intake`;
}

function extensionForPath(path: string): string {
  const lower = path.toLowerCase().split(/[?#]/)[0];
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".webp")) return "webp";
  if (lower.endsWith(".gif")) return "gif";
  if (lower.endsWith(".heic")) return "heic";
  if (lower.endsWith(".heif")) return "heif";
  return "jpg";
}

function mimeTypeForImageType(type?: string): string {
  const normalized = type?.toLowerCase();
  if (!normalized) return "";
  if (normalized.startsWith("image/")) return normalized;
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  if (normalized === "gif") return "image/gif";
  if (normalized === "heic") return "image/heic";
  if (normalized === "heif") return "image/heif";
  return "";
}

function mimeTypeForPath(path: string): string {
  const lower = path.toLowerCase().split(/[?#]/)[0];
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}
