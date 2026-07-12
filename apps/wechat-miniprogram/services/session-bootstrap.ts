import { clearSession, getSession, hydrateSession, isLoggedIn, type SessionState } from "../stores/session";
import { recoverSession } from "./http";

export async function bootstrapSession(): Promise<SessionState | null> {
  const hydrated = hydrateSession();
  if (!hydrated) return null;
  if (!isLoggedIn()) {
    clearSession();
    return null;
  }

  try {
    return await recoverSession();
  } catch {
    const retained = getSession();
    return retained && isLoggedIn() ? retained : null;
  }
}
