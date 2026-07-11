import type { AuthSessionSnapshot } from "@/lib/auth-session-store";

export type AuthSessionRecovery = (options: { force: boolean }) => Promise<AuthSessionSnapshot | null>;

let recovery: AuthSessionRecovery | null = null;
let recoveryPromise: Promise<AuthSessionSnapshot | null> | null = null;

export function registerAuthSessionRecovery(next: AuthSessionRecovery | null): () => void {
  recovery = next;
  return () => {
    if (recovery === next) recovery = null;
  };
}

export function recoverRegisteredSession(options: { force: boolean }): Promise<AuthSessionSnapshot | null> {
  if (!recovery) return Promise.resolve(null);
  if (recoveryPromise) return recoveryPromise;
  recoveryPromise = recovery(options).finally(() => {
    recoveryPromise = null;
  });
  return recoveryPromise;
}
