"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { WorkspaceGate } from "@/components/auth/workspace-gate";
import { WardrobeApp } from "@/components/wardrobe-app";
import { isAccountWorkspaceEnabled, loadWorkspaceRegistry } from "@/lib/workspace-registry";

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
  if (!auth.user || !auth.session) return null;
  const workspace = accountWorkspaceEnabled ? loadWorkspaceRegistry().workspaces[auth.user.id] : undefined;
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
  return <WorkspaceGate session={auth.session}>{app}</WorkspaceGate>;
}
