import { abandonTemporaryAssetSessions, uploadPreparedImageAssets, type AssetMutation } from "./assets";

export type IntakeAssetKind = "garment" | "wishlist" | "inspiration" | "tryonProfile";
export type IntakeImageStatus = "selected" | "uploading" | "ready" | "failed";

export interface IntakeSessionImage {
  id: string;
  sourcePath: string;
  processedPath: string;
  status: IntakeImageStatus;
  error: string;
  clientMutationId: string;
  temporarySessionId?: string;
  assetMutations: AssetMutation[];
}

export interface IntakeAssetSession {
  id: string;
  kind: IntakeAssetKind;
  images: IntakeSessionImage[];
  currentImageId: string;
}

const sessions = new Map<string, IntakeAssetSession>();

export function createIntakeSession(kind: IntakeAssetKind, id = newId("session")): IntakeAssetSession {
  const session = { id, kind, images: [], currentImageId: "" };
  sessions.set(id, session);
  return snapshot(session);
}

export function getIntakeSession(id: string): IntakeAssetSession | undefined {
  const session = sessions.get(id);
  return session ? snapshot(session) : undefined;
}

export function appendImage(sessionId: string, sourcePath: string, processedPath = sourcePath): IntakeSessionImage {
  const session = required(sessionId);
  const image: IntakeSessionImage = {
    id: newId("image"), sourcePath, processedPath, status: "selected", error: "",
    clientMutationId: newId("mutation"), assetMutations: [],
  };
  session.images.push(image);
  session.currentImageId = image.id;
  return { ...image, assetMutations: [] };
}

export function replaceImage(sessionId: string, imageId: string, processedPath: string): IntakeSessionImage {
  const image = requiredImage(required(sessionId), imageId);
  image.processedPath = processedPath;
  image.status = "selected";
  image.error = "";
  image.temporarySessionId = undefined;
  image.assetMutations = [];
  return { ...image, assetMutations: [] };
}

export async function removeImage(sessionId: string, imageId: string): Promise<void> {
  const session = required(sessionId);
  const image = requiredImage(session, imageId);
  if (image.temporarySessionId) await abandonTemporaryAssetSessions([image.temporarySessionId]);
  session.images = session.images.filter((entry) => entry.id !== imageId);
  if (session.currentImageId === imageId) session.currentImageId = session.images[0]?.id ?? "";
}

export async function clearSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  await abandonTemporaryAssetSessions(session.images.flatMap((image) => image.temporarySessionId ? [image.temporarySessionId] : []));
  sessions.delete(sessionId);
}

export async function commitAssetMutations(sessionId: string, imageId: string): Promise<AssetMutation[]> {
  const session = required(sessionId);
  const image = requiredImage(session, imageId);
  image.status = "uploading";
  image.error = "";
  try {
    const result = await uploadPreparedImageAssets({
      clientMutationId: image.clientMutationId,
      entityType: entityTypeFor(session.kind),
      fieldName: "imageDataUrl",
      originalPath: image.sourcePath,
      processedPath: image.processedPath,
    });
    image.temporarySessionId = result.sessionId;
    image.assetMutations = result.assetMutations;
    image.status = "ready";
    return result.assetMutations;
  } catch (error) {
    image.status = "failed";
    image.error = error instanceof Error ? error.message : "图片上传失败";
    throw error;
  }
}

export const abandonTemporaryAssets = clearSession;

function entityTypeFor(kind: IntakeAssetKind): "garment" | "wishlistItem" | "profile" {
  if (kind === "wishlist") return "wishlistItem";
  if (kind === "tryonProfile") return "profile";
  return "garment";
}

function required(id: string): IntakeAssetSession {
  const session = sessions.get(id);
  if (!session) throw new Error("录入会话不存在或已退出");
  return session;
}

function requiredImage(session: IntakeAssetSession, imageId: string): IntakeSessionImage {
  const image = session.images.find((entry) => entry.id === imageId);
  if (!image) throw new Error("图片不存在");
  return image;
}

function snapshot(session: IntakeAssetSession): IntakeAssetSession {
  return { ...session, images: session.images.map((image) => ({ ...image, assetMutations: [...image.assetMutations] })) };
}

function newId(_prefix: string): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
