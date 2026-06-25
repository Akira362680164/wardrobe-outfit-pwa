import { readFile } from "node:fs/promises";

import { importPKCS8, importSPKI } from "jose";

export const JWT_ALGORITHM = "RS256";
export const JWT_PRIVATE_KEY_PATH = "/run/secrets/jwt-private.pem";
export const JWT_PUBLIC_KEY_PATH = "/run/secrets/jwt-public.pem";

export async function importJwtKeyPairFromPem(privateKeyPem: string, publicKeyPem: string) {
  const [privateKey, publicKey] = await Promise.all([
    importPKCS8(privateKeyPem, JWT_ALGORITHM),
    importSPKI(publicKeyPem, JWT_ALGORITHM),
  ]);
  return { privateKey, publicKey };
}

export async function loadJwtKeyPair(
  privateKeyPath = JWT_PRIVATE_KEY_PATH,
  publicKeyPath = JWT_PUBLIC_KEY_PATH,
) {
  const [privateKeyPem, publicKeyPem] = await Promise.all([
    readFile(privateKeyPath, "utf8"),
    readFile(publicKeyPath, "utf8"),
  ]);
  return importJwtKeyPairFromPem(privateKeyPem, publicKeyPem);
}
