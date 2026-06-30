// src/lib/cloud-sync/connectivity.ts
// v1.1.37 cloud 1B B6: connectivity state machine.

"use client";

import { Capacitor, CapacitorHttp } from "@capacitor/core";

export type ConnectivityState =
  | "unknown"
  | "probing"
  | "offline"
  | "cloud_unreachable"
  | "cloud_degraded"
  | "cloud_ready";

const PROBE_TIMEOUT_MS = 5_000;
const PROBE_RETRY_DELAY_MS = 500;

export function isNetworkOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export async function getSystemNetworkConnected(): Promise<boolean> {
  if (!isNetworkOnline()) return false;
  const network = getCapacitorNetworkPlugin();
  if (!network) return true;
  try {
    const status = await network.getStatus();
    return status.connected !== false;
  } catch {
    return true;
  }
}

export async function probeCloudConnectivity(): Promise<ConnectivityState> {
  if (!(await getSystemNetworkConnected())) return "offline";

  const health = await probeEndpoint("/api/health", true);
  if (health === "cloud_unreachable" || health === "cloud_degraded") return health;
  if (health !== "ok") return "cloud_unreachable";

  const ready = await probeEndpoint("/api/ready", false);
  if (ready === "ok") return "cloud_ready";
  if (ready === "cloud_degraded") return "cloud_degraded";
  return "cloud_unreachable";
}

export function isCloudReady(state: ConnectivityState): boolean {
  return state === "cloud_ready";
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

type ProbeResult = "ok" | "cloud_unreachable" | "cloud_degraded";

async function probeEndpoint(path: string, retryNetworkError: boolean): Promise<ProbeResult> {
  const first = await requestProbe(path);
  if (first === "cloud_unreachable" && retryNetworkError) {
    await delay(PROBE_RETRY_DELAY_MS);
    return requestProbe(path);
  }
  return first;
}

async function requestProbe(path: string): Promise<ProbeResult> {
  const url = buildUrl(path);
  try {
    if (Capacitor.isNativePlatform() && /^https?:\/\//.test(url)) {
      const response = await CapacitorHttp.request({
        method: "GET",
        url,
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store",
        },
        connectTimeout: PROBE_TIMEOUT_MS,
        readTimeout: PROBE_TIMEOUT_MS,
      });
      return classifyProbeStatus(response.status);
    }

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store",
        },
        signal: controller.signal,
      });
      return classifyProbeStatus(response.status);
    } finally {
      globalThis.clearTimeout(timeout);
    }
  } catch {
    return "cloud_unreachable";
  }
}

export function classifyProbeStatus(status: number): ProbeResult {
  if (status === 200) return "ok";
  if (status === 502 || status === 503 || status === 504) return "cloud_degraded";
  return "cloud_unreachable";
}

function buildUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_WARDROBE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  if (!baseUrl) return path;
  return `${baseUrl}${path}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function getCapacitorNetworkPlugin(): { getStatus: () => Promise<{ connected?: boolean }> } | null {
  const maybeCapacitor = (globalThis as { Capacitor?: { Plugins?: { Network?: { getStatus?: () => Promise<{ connected?: boolean }> } } } }).Capacitor;
  const network = maybeCapacitor?.Plugins?.Network;
  return typeof network?.getStatus === "function" ? { getStatus: network.getStatus.bind(network) } : null;
}
