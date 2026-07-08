import { buildAuthHeaders, getConfiguredApiBaseUrl, request } from "./http";

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

export interface AssetMutation {
  kind: "create_or_replace";
  fieldName: string;
  temporaryAssetIds: string[];
}

export interface LocalImageAssetInput {
  filePath: string;
  fieldName?: string;
}

export async function chooseSingleImage(sourceType: Array<"album" | "camera"> = ["album", "camera"]): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType,
      success: (result) => {
        const file = result.tempFiles[0];
        if (!file?.tempFilePath) reject(new Error("没有选择图片"));
        else resolve(file.tempFilePath);
      },
      fail: () => reject(new Error("选择图片失败")),
    });
  });
}

export async function downloadAssetImage(ref?: AssetRef, variant: "thumbnail" | "original" = "thumbnail"): Promise<string> {
  if (!ref?.assetId) return "";
  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) return "";
  const targetVariant = ref.variants?.includes(variant) ? variant : "original";
  return new Promise((resolve) => {
    wx.downloadFile({
      url: `${baseUrl}/api/assets/${encodeURIComponent(ref.assetId)}/${targetVariant}/content`,
      header: buildAuthHeaders(),
      timeout: 30000,
      success: (result) => resolve(result.statusCode < 400 ? result.tempFilePath : ""),
      fail: () => resolve(""),
    });
  });
}

export async function uploadImageForCreate(input: {
  clientMutationId: string;
  entityType: "garment" | "outfit" | "wishlistItem" | "profile";
  image: LocalImageAssetInput;
}): Promise<AssetMutation[]> {
  const fieldName = input.image.fieldName ?? "imageDataUrl";
  const metadata = await getLocalImageMetadata(input.image.filePath, fieldName);
  const slots: TemporaryAssetSlotRequest[] = [
    { ...metadata, variant: "original" },
    // ponytail: reuse the selected image as thumbnail until miniapp-side resizing is needed.
    { ...metadata, variant: "thumbnail" },
  ];
  const session = await request<TemporaryAssetSession>({
    method: "POST",
    path: "/api/workspace/assets/sessions",
    data: { clientMutationId: input.clientMutationId, entityType: input.entityType, slots },
  });

  const bytes = await readFileBytes(input.image.filePath);
  for (const asset of session.assets) {
    await uploadTemporaryBytes(session.sessionId, asset.assetId, bytes, asset.mimeType);
  }

  const status = await request<TemporaryAssetSession>({
    path: `/api/workspace/assets/sessions/${encodeURIComponent(session.sessionId)}`,
  });
  const uploaded = status.assets.filter((asset) => asset.fieldName === fieldName).map((asset) => asset.assetId);
  if (!status.ready || uploaded.length < 2) throw new Error("图片上传尚未完成，请重试");
  return [{ kind: "create_or_replace", fieldName, temporaryAssetIds: uploaded }];
}

async function uploadTemporaryBytes(sessionId: string, assetId: string, data: ArrayBuffer, mimeType: string): Promise<void> {
  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) throw new Error("请先配置后端 API 域名");
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/api/workspace/assets/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(assetId)}`,
      method: "PUT",
      data,
      header: { ...buildAuthHeaders(), "Content-Type": mimeType },
      timeout: 60000,
      success: (result) => {
        if (result.statusCode < 400) resolve();
        else reject(new Error("图片上传失败，请稍后重试"));
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
    mimeType: mimeTypeForPath(filePath),
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
        if (result.data instanceof ArrayBuffer) resolve(result.data);
        else reject(new Error("图片读取格式无效"));
      },
      fail: () => reject(new Error("读取图片失败")),
    });
  });
}

function mimeTypeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
