let compatibilityCounter = 0;

export function createUuid(cryptoSource: Pick<Crypto, "randomUUID" | "getRandomValues"> | undefined = globalThis.crypto): string {
  if (typeof cryptoSource?.randomUUID === "function") return cryptoSource.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoSource?.getRandomValues === "function") {
    cryptoSource.getRandomValues(bytes);
  } else {
    const counter = ++compatibilityCounter;
    let state = (Date.now() ^ counter ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    for (let index = 0; index < bytes.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      bytes[index] = (state + counter + index * 37) & 0xff;
    }
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
