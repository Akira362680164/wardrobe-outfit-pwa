import { WorkspaceApiError } from "../workspace/errors.js";
import sharp from "sharp";

export const CROP_MAX_IMAGE_BYTES = 7_500_000;
export const CROP_MAX_PIXELS = 40_000_000;

export async function decodeAndValidateCropImage(imageBase64: string, declaredMime: string): Promise<Buffer> {
  const image = Buffer.from(imageBase64, "base64");
  if (!image.length || image.length > CROP_MAX_IMAGE_BYTES) throw invalid("图片大小超出自动裁切限制");
  const detected = detectMime(image);
  if (!detected || detected !== declaredMime) throw invalid("图片格式与内容不一致");
  const dimensions = readDimensions(image, detected);
  if (!dimensions || dimensions.width * dimensions.height > CROP_MAX_PIXELS) throw invalid("图片像素尺寸超出自动裁切限制");
  try {
    const decoded = sharp(image, { failOn: "warning", limitInputPixels: CROP_MAX_PIXELS });
    const metadata = await decoded.metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > CROP_MAX_PIXELS) throw invalid("图片像素尺寸超出自动裁切限制");
    const stats = await decoded.stats();
    const alpha = metadata.hasAlpha ? stats.channels.at(-1) : undefined;
    if (alpha && alpha.max === 0) throw invalid("透明图片无法自动裁切");
    const colorChannels = stats.channels.slice(0, Math.min(3, stats.channels.length));
    if (colorChannels.length && colorChannels.every((channel) => channel.max - channel.min <= 1)) throw invalid("空白图片无法自动裁切");
  } catch (error) {
    if (error instanceof WorkspaceApiError) throw error;
    throw invalid("图片无法解码");
  }
  return image;
}

function detectMime(data: Buffer): string | undefined {
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data.length >= 12 && data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (data.length >= 30 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return undefined;
}

function readDimensions(data: Buffer, mime: string): { width: number; height: number } | undefined {
  if (mime === "image/png") return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (mime === "image/webp") return readWebpDimensions(data);
  for (let offset = 2; offset + 9 < data.length;) {
    if (data[offset] !== 0xff) return undefined;
    const marker = data[offset + 1]!;
    const length = data.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > data.length) return undefined;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

function readWebpDimensions(data: Buffer): { width: number; height: number } | undefined {
  const kind = data.toString("ascii", 12, 16);
  if (kind === "VP8X" && data.length >= 30) return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  if (kind === "VP8L" && data.length >= 25) {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return undefined;
}

function invalid(message: string) {
  return new WorkspaceApiError(400, "invalid_request", message, false);
}
