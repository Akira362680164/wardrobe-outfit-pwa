import { createHmac } from "node:crypto";

let cachedSecret: Buffer | null = null;

export function hmacSha256Base64Url(value: string, secret = loadAuthHmacSecret()): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

export function loadAuthHmacSecret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const configured = process.env.AUTH_HMAC_SECRET ?? process.env.AUTH_HMAC_PEPPER;
  if (configured) {
    cachedSecret = Buffer.from(configured, "utf8");
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_HMAC_SECRET is required in production");
  }
  // ponytail: dev/test fallback only; production must configure AUTH_HMAC_SECRET.
  cachedSecret = Buffer.from("wardrobe-auth-dev-hmac-secret", "utf8");
  return cachedSecret;
}
