"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { WorkspaceGate } from "@/components/auth/workspace-gate";
import { WardrobeApp } from "@/components/wardrobe-app";

export function AppRoot() {
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
  return (
    <WorkspaceGate session={auth.session} onRecoverSession={auth.refreshSession}>
      <WardrobeApp
        key={auth.user.id}
        cloudAuth={{
          user: auth.user,
          deviceId: auth.deviceId,
          deviceLabel: auth.deviceLabel,
          accessToken: auth.session.accessToken,
          isBusy: auth.isBusy,
          onLogout: auth.logout,
          onAccountDeleted: auth.completeAccountDeletion,
          onChangePassword: auth.changePassword,
        }}
      />
    </WorkspaceGate>
  );
}
