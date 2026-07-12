"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";

import { OnlinePageError } from "@/components/online/online-page-error";
import { OnlinePageLoader } from "@/components/online/online-page-loader";
import type { AuthSessionSnapshot } from "@/lib/auth-session-store";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";
import { onlineErrorMessage } from "@/lib/online/online-error";
import { OnlineWorkspaceRepository, type OnlineWorkspaceSnapshot } from "@/lib/online/online-repository";
import { purgeLegacyLocalBusinessData } from "@/lib/online/purge-local-business-data";

interface OnlineWorkspaceContextValue {
  repository: OnlineWorkspaceRepository;
  initialSnapshot: OnlineWorkspaceSnapshot;
  imageRefreshVersion: number;
  recoverImages: (force?: boolean) => Promise<boolean>;
}

const OnlineWorkspaceContext = createContext<OnlineWorkspaceContextValue | null>(null);

export function useOnlineWorkspaceGate(): OnlineWorkspaceContextValue | null {
  return useContext(OnlineWorkspaceContext);
}

type WorkspaceGateState =
  | { status: "loading" }
  | { status: "ready"; snapshot: OnlineWorkspaceSnapshot }
  | { status: "error"; message: string };

export function WorkspaceGate({
  session,
  onRecoverSession,
  children,
}: {
  session: AuthSessionSnapshot;
  onRecoverSession?: () => Promise<AuthSessionSnapshot | null>;
  children: React.ReactNode;
}) {
  const repositoryRef = useRef<OnlineWorkspaceRepository | null>(null);
  const recoveryPromiseRef = useRef<Promise<boolean> | null>(null);
  const lastRecoveryAtRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const [state, setState] = useState<WorkspaceGateState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [imageRefreshVersion, setImageRefreshVersion] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  const recoverImages = useCallback(async (force = false) => {
    if (recoveryPromiseRef.current) return recoveryPromiseRef.current;
    const now = Date.now();
    if (!force && now - lastRecoveryAtRef.current < 3_000) return false;
    const promise = (async () => {
      lastRecoveryAtRef.current = Date.now();
      await onRecoverSession?.().catch(() => null);
      repositoryRef.current?.images.clear();
      setImageRefreshVersion((value) => value + 1);
      return true;
    })();
    recoveryPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      recoveryPromiseRef.current = null;
    }
  }, [onRecoverSession]);

  useEffect(() => {
    const recoverAfterBackground = () => {
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt && Date.now() - hiddenAt > 30_000) void recoverImages(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      recoverAfterBackground();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    let removed = false;
    let appStateHandle: { remove: () => void } | null = null;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (removed) return;
      if (!isActive) hiddenAtRef.current = Date.now();
      else recoverAfterBackground();
    }).then((handle) => {
      if (removed) handle.remove();
      else appStateHandle = handle;
    });
    return () => {
      removed = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      appStateHandle?.remove();
    };
  }, [recoverImages]);

  useEffect(() => {
    const repository = new OnlineWorkspaceRepository(session);
    repositoryRef.current = repository;
    let cancelled = false;
    setState({ status: "loading" });
    void repository.getOverview().then(async (snapshot) => {
      try {
        const result = await purgeLegacyLocalBusinessData();
        recordDiagnosticEvent("workspace", "legacy_local_business_data_purged", {
          phase: "succeeded",
          severity: "info",
          metadata: result as unknown as Record<string, unknown>,
        });
      } catch (error) {
        recordDiagnosticEvent("workspace", "legacy_local_business_data_purge_failed", {
          phase: "failed",
          severity: "warning",
          errorCode: error instanceof Error ? error.message : "LOCAL_PURGE_FAILED",
        });
      }
      if (!cancelled) setState({ status: "ready", snapshot });
    }, (error) => {
      if (!cancelled) setState({ status: "error", message: onlineErrorMessage(error) });
    });
    return () => {
      cancelled = true;
      repository.dispose();
      if (repositoryRef.current === repository) repositoryRef.current = null;
    };
  }, [attempt, session.accessToken, session.deviceId]);

  if (state.status === "loading") return <OnlinePageLoader />;
  if (state.status === "error") return <OnlinePageError message={state.message} onRetry={retry} />;
  return (
    <OnlineWorkspaceContext.Provider value={{ repository: repositoryRef.current!, initialSnapshot: state.snapshot, imageRefreshVersion, recoverImages }}>
      {children}
    </OnlineWorkspaceContext.Provider>
  );
}
