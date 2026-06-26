"use client";

import { useEffect, useState } from "react";
import type { AuthSessionSnapshot } from "@/lib/auth-session-store";
import { openWorkspaceForSession, type AccountWorkspaceRecord } from "@/lib/workspace-registry";

type WorkspaceGateState =
  | { status: "preparing" }
  | { status: "ready"; workspace: AccountWorkspaceRecord }
  | { status: "failed"; message: string };

export function WorkspaceGate({
  session,
  children,
}: {
  session: AuthSessionSnapshot;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<WorkspaceGateState>({ status: "preparing" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "preparing" });
    try {
      const workspace = openWorkspaceForSession(session);
      if (!cancelled) setState({ status: "ready", workspace });
    } catch (error) {
      const message = error instanceof Error ? error.message : "本机衣橱工作区准备失败";
      if (!cancelled) setState({ status: "failed", message });
    }
    return () => {
      cancelled = true;
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
