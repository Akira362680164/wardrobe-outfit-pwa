"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthSessionSnapshot } from "@/lib/auth-session-store";
import { computeBackoffMs, runBootstrap, runSyncOnce } from "@/lib/cloud-sync/sync-engine";
import { probeCloudConnectivity, subscribeNetworkChanges, type ConnectivityState } from "@/lib/cloud-sync/connectivity";
import { scheduleAssetRecovery } from "@/lib/cloud-sync/asset-recovery";
import { AccountImageCache } from "@/lib/cloud-sync/image-cache";
import { ensureDefaultWorkspaceLocation } from "@/lib/cloud-sync/location-bridge";
import {
  isCloudSyncEnabled,
  isWorkspaceOfflineAuthorized,
  loadWorkspaceRegistry,
  openWorkspaceForSession,
  type AccountWorkspaceRecord,
} from "@/lib/workspace-registry";

type WorkspaceGateState =
  | { status: "preparing" }
  | { status: "bootstrapping"; message: string }
  | { status: "ready"; workspace: AccountWorkspaceRecord }
  | { status: "failed"; message: string };

export function WorkspaceGate({
  session,
  children,
  onReady,
}: {
  session: AuthSessionSnapshot;
  children: React.ReactNode;
  onReady?: (workspace: AccountWorkspaceRecord) => void;
}) {
  const [state, setState] = useState<WorkspaceGateState>({ status: "preparing" });
  const workspaceRef = useRef<AccountWorkspaceRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    let syncTimer: number | null = null;
    let syncInFlight = false;
    let attemptCount = 0;

    const scheduleSync = (workspace: AccountWorkspaceRecord, cloud: ConnectivityState = "unknown") => {
      if (cancelled || !session.accessToken || !isCloudSyncEnabled()) return;
      if (syncTimer) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(async () => {
        // P1-N03: 防止重叠 runSyncOnce
        if (syncInFlight) return;
        const nextCloud = cloud === "cloud_ready" ? cloud : await probeCloudConnectivity();
        if (cancelled || nextCloud !== "cloud_ready") {
          attemptCount++;
          scheduleSync(workspace);
          return;
        }
        syncInFlight = true;
        try {
          const result = await runSyncOnce({
            workspace,
            accessToken: session.accessToken!,
            deviceId: session.deviceId,
          });
          if (cancelled) return;
          if (result.skipped && result.reason !== "sync_disabled") {
            attemptCount++;
            scheduleSync(workspace);
          } else {
            attemptCount = 0;
            // P1-N02: 成功后若队列未空则立即安排下一轮
            if (!result.skipped) scheduleSync(workspace, nextCloud);
          }
        } finally {
          syncInFlight = false;
        }
      }, computeBackoffMs(attemptCount));
    };

    const probeAndSync = async (workspace: AccountWorkspaceRecord) => {
      const cloud = await probeCloudConnectivity();
      if (!cancelled && cloud === "cloud_ready") scheduleSync(workspace, cloud);
    };

    setState({ status: "preparing" });
    workspaceRef.current = null;
    const listener = subscribeNetworkChanges(() => {
      const workspace = workspaceRef.current;
      if (workspace) void probeAndSync(workspace);
    });
    const handleVisibility = () => {
      const workspace = workspaceRef.current;
      if (workspace && document.visibilityState === "visible") void probeAndSync(workspace);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    void (async () => {
      try {
        if (!session.user) throw new Error("账号会话缺少用户信息");
        const existing = loadWorkspaceRegistry().workspaces[session.user.id];
        const hasLocalWorkspace = Boolean(existing && !existing.explicitlyLoggedOutAt);
        if (existing && isWorkspaceOfflineAuthorized(existing)) {
          const workspace = openWorkspaceForSession(session);
          const defaultLocation = await ensureDefaultWorkspaceLocation(workspace, session.deviceId);
          if (!defaultLocation.bridged) throw new Error("默认衣橱初始化失败，请稍后重试");
          workspaceRef.current = workspace;
          if (!cancelled) { setState({ status: "ready", workspace }); onReady?.(workspace); }
          void probeAndSync(workspace);
          return;
        }

        const cloud = await probeCloudConnectivity();
        if (cloud !== "cloud_ready") {
          throw new Error(hasLocalWorkspace ? "离线授权已失效，请联网重新登录" : "首次打开账号衣橱需要连接云端");
        }
        if (!session.accessToken) throw new Error("请重新登录后再打开账号衣橱");

        const workspace = openWorkspaceForSession(session);
        if (!hasLocalWorkspace) {
          if (!isCloudSyncEnabled()) throw new Error("云端同步未开启，无法首次准备账号衣橱");
          if (!cancelled) setState({ status: "bootstrapping", message: "正在从云端准备账号衣橱" });
          const result = await runBootstrap({
            workspace,
            accessToken: session.accessToken,
            deviceId: session.deviceId,
          });
          if (!result.bootstrapped && result.reason !== "sync_disabled") {
            throw new Error("云端衣橱初始化失败，请稍后重试");
          }
          // fire-and-forget: 新设备恢复首屏缩略图，不阻塞进入App
          const imageCache = new AccountImageCache(workspace.userIdHash);
          scheduleAssetRecovery(imageCache);
        }
        const defaultLocation = await ensureDefaultWorkspaceLocation(workspace, session.deviceId);
        if (!defaultLocation.bridged) throw new Error("默认衣橱初始化失败，请稍后重试");
        workspaceRef.current = workspace;
        if (!cancelled) { setState({ status: "ready", workspace }); onReady?.(workspace); }
        scheduleSync(workspace, cloud);
      } catch (error) {
        const message = error instanceof Error ? error.message : "本机衣橱工作区准备失败";
        if (!cancelled) setState({ status: "failed", message });
      }
    })();

    return () => {
      cancelled = true;
      workspaceRef.current = null;
      if (syncTimer) window.clearTimeout(syncTimer);
      listener.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session]);

  if (state.status === "ready") return <>{children}</>;

  return (
    <main className="min-h-screen bg-mist px-5 py-8 text-ink">
      <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center text-center">
        <div className="mb-4 h-10 w-10 rounded-full border-2 border-ink/15 border-t-ink/70" />
        <h1 className="text-lg font-semibold">正在准备本机衣橱</h1>
        <p className="mt-2 text-sm leading-6 text-ink/60">
          {state.status === "failed" ? state.message : "正在打开当前账号的本机工作区。"}
        </p>
      </div>
    </main>
  );
}
