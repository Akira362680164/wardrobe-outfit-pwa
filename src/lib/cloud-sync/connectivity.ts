// src/lib/cloud-sync/connectivity.ts
// v1.1.37 cloud 1B B4: 最小 connectivity 判定
// B4 只做 navigator.onLine 判定：false 不发请求；true 才进入 push/pull。
// 完整状态机（cloud_unreachable / cloud_degraded / cloud_ready / rate_limited）
// 属于 B6，本文件不引入 B6 概念。

"use client";

export function isNetworkOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export interface ConnectivityListener {
  disconnect(): void;
}

export function subscribeNetworkChanges(onChange: (online: boolean) => void): ConnectivityListener {
  if (typeof window === "undefined") {
    return { disconnect: () => undefined };
  }
  const handleOnline = () => onChange(true);
  const handleOffline = () => onChange(false);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  return {
    disconnect: () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    },
  };
}
