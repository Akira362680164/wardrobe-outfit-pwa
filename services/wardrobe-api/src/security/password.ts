import argon2 from "argon2";

export const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(password: string) {
  return argon2.hash(password, ARGON2ID_OPTIONS);
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}
