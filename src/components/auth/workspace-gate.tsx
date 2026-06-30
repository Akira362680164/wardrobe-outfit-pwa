"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

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
  children,
}: {
  session: AuthSessionSnapshot;
  children: React.ReactNode;
}) {
  const repositoryRef = useRef<OnlineWorkspaceRepository | null>(null);
  const [state, setState] = useState<WorkspaceGateState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

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
    <OnlineWorkspaceContext.Provider value={{ repository: repositoryRef.current!, initialSnapshot: state.snapshot }}>
      {children}
    </OnlineWorkspaceContext.Provider>
  );
}
