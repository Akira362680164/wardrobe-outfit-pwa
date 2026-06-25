"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { WardrobeApp } from "@/components/wardrobe-app";

const cloudAuthEnabled = process.env.NEXT_PUBLIC_CLOUD_AUTH_ENABLED === "true";

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
  if (!auth.user) return null;
  return (
    <WardrobeApp
      cloudAuth={{
        user: auth.user,
        deviceId: auth.deviceId,
        deviceLabel: auth.deviceLabel,
        isBusy: auth.isBusy,
        onLogout: auth.logout,
        onLogoutAll: auth.logoutAll,
        onChangePassword: auth.changePassword,
      }}
    />
  );
}
