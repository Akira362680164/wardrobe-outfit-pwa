import { createHash, createHmac } from "node:crypto";

export interface CosConfig {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  expiresSeconds: number;
  protocol: "https" | "http";
}

export function loadCosConfig(env: Record<string, string | undefined> = process.env): CosConfig | null {
  const bucket = env.COS_BUCKET?.trim();
  const region = env.COS_REGION?.trim();
  const secretId = env.COS_SECRET_ID?.trim();
  const secretKey = env.COS_SECRET_KEY?.trim();
  if (!bucket || !region || !secretId || !secretKey) return null;
  return {
    bucket,
    region,
    secretId,
    secretKey,
    expiresSeconds: Math.min(Math.max(Number(env.COS_UPLOAD_EXPIRES_SECONDS ?? 600) || 600, 60), 3600),
    protocol: env.COS_PROTOCOL === "http" ? "http" : "https",
  };
}

export function createCosPutObjectPresignedUrl(input: {
  config: CosConfig;
  objectKey: string;
  now: Date;
}): string {
  return createCosPresignedUrl({ ...input, method: "put", expiresSeconds: input.config.expiresSeconds });
}

export function createCosGetObjectPresignedUrl(input: {
  config: CosConfig;
  objectKey: string;
  now: Date;
  expiresSeconds?: number;
}): string {
  return createCosPresignedUrl({
    config: input.config,
    objectKey: input.objectKey,
    now: input.now,
    method: "get",
    expiresSeconds: input.expiresSeconds ?? input.config.expiresSeconds,
  });
}

export function createCosHeadObjectPresignedUrl(input: {
  config: CosConfig;
  objectKey: string;
  now: Date;
}): string {
  return createCosPresignedUrl({ ...input, method: "head", expiresSeconds: 300 });
}

export function createCosDeleteObjectPresignedUrl(input: {
  config: CosConfig;
  objectKey: string;
  now: Date;
}): string {
  return createCosPresignedUrl({ ...input, method: "delete", expiresSeconds: 300 });
}

export async function verifyCosObject(input: {
  config: CosConfig;
  objectKey: string;
  expectedSizeBytes: number;
  expectedMimeType: string;
}): Promise<void> {
  const now = new Date();
  const headUrl = createCosHeadObjectPresignedUrl({
    config: input.config,
    objectKey: input.objectKey,
    now,
  });

  const response = await fetch(headUrl, { method: "HEAD" });
  if (!response.ok) {
    throw new CosError(422, "cos_object_not_found", `COS object not accessible (status ${response.status})`);
  }
  const contentLength = response.headers.get("content-length");
  const contentType = response.headers.get("content-type");
  if (contentLength && Number(contentLength) !== input.expectedSizeBytes) {
    throw new CosError(422, "cos_size_mismatch", `COS size ${contentLength} != expected ${input.expectedSizeBytes}`);
  }
  if (contentType && contentType.toLowerCase() !== input.expectedMimeType.toLowerCase()) {
    throw new CosError(422, "cos_type_mismatch", `COS type ${contentType} != expected ${input.expectedMimeType}`);
  }
}

export class CosError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function createCosPresignedUrl(input: {
  config: CosConfig;
  objectKey: string;
  now: Date;
  method: string;
  expiresSeconds: number;
}): string {
  const start = Math.floor(input.now.getTime() / 1000);
  const end = start + input.expiresSeconds;
  const keyTime = `${start};${end}`;
  const host = `${input.config.bucket}.cos.${input.config.region}.myqcloud.com`;
  const uri = `/${input.objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const httpString = `${input.method.toLowerCase()}\n${uri}\n\nhost=${host}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signKey = hmacSha1Hex(input.config.secretKey, keyTime);
  const signature = hmacSha1Hex(signKey, stringToSign);
  const authorization = [
    "q-sign-algorithm=sha1",
    `q-ak=${input.config.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    "q-header-list=host",
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
  const url = new URL(`${input.config.protocol}://${host}${uri}`);
  url.searchParams.set("sign", authorization);
  return url.toString();
}

function sha1Hex(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function hmacSha1Hex(key: string, value: string): string {
  return createHmac("sha1", key).update(value).digest("hex");
}
