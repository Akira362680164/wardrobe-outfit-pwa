import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeHeicConvertOptions {
  dataBase64: string;
  fileName?: string;
  maxSide?: number;
  quality?: number;
}

export interface NativeHeicConvertResult {
  dataBase64: string;
  mimeType: "image/jpeg";
  width?: number;
  height?: number;
  outputBytes?: number;
}

interface NativeHeicConverterPlugin {
  convert(options: NativeHeicConvertOptions): Promise<NativeHeicConvertResult>;
}

const NativeHeicConverter = registerPlugin<NativeHeicConverterPlugin>("NativeHeicConverter");
const HEIC_EXT_RE = /\.hei[cf]$/i;

export async function convertHeicToJpegNative(
  file: File,
  options: { maxSide?: number; quality?: number } = {},
): Promise<File | null> {
  if (
    Capacitor.getPlatform() !== "android"
    || !Capacitor.isPluginAvailable("NativeHeicConverter")
  ) {
    return null;
  }

  try {
    const dataBase64 = arrayBufferToBase64(await file.arrayBuffer());
    const result = await NativeHeicConverter.convert({
      dataBase64,
      fileName: file.name,
      maxSide: options.maxSide,
      quality: options.quality,
    });
    if (!result.dataBase64 || result.mimeType !== "image/jpeg") return null;
    const bytes = base64ToUint8Array(result.dataBase64);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const newName = file.name.replace(HEIC_EXT_RE, ".jpg") || `${file.name}.jpg`;
    return new File([buffer], newName, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
