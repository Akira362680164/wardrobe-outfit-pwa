"use client";

import { useState } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { WorkspaceGate } from "@/components/auth/workspace-gate";
import { WardrobeApp } from "@/components/wardrobe-app";
import { isAccountWorkspaceEnabled, loadWorkspaceRegistry, type AccountWorkspaceRecord } from "@/lib/workspace-registry";

const cloudAuthEnabled = process.env.NEXT_PUBLIC_CLOUD_AUTH_ENABLED === "true";
const accountWorkspaceEnabled = isAccountWorkspaceEnabled();

export function AppRoot() {
  if (!cloudAuthEnabled) return <WardrobeApp />;

  return (
    <AuthProvider>
      <AuthGate>
        <AuthenticatedWardrobeApp />
      </AuthGate>
    </AuthProvider>
  );
}

function AuthenticatedWardrobeApp() {
  const auth = useAuth();
  const [workspace, setWorkspace] = useState<AccountWorkspaceRecord | undefined>(
    accountWorkspaceEnabled ? loadWorkspaceRegistry().workspaces[auth.user?.id ?? ""] : undefined,
  );
  if (!auth.user || !auth.session) return null;
  const app = (
    <WardrobeApp
      cloudAuth={{
        user: auth.user,
        deviceId: auth.deviceId,
        deviceLabel: auth.deviceLabel,
        accessToken: auth.session.accessToken,
        workspace,
        isBusy: auth.isBusy,
        onLogout: auth.logout,
        onLogoutAll: auth.logoutAll,
        onChangePassword: auth.changePassword,
      }}
    />
  );
  if (!accountWorkspaceEnabled) return app;
  return <WorkspaceGate session={auth.session} onReady={setWorkspace}>{app}</WorkspaceGate>;
}
