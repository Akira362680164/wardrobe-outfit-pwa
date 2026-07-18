import type { PermissionState } from "@capacitor/core";
import type { PermissionStatus } from "@capacitor/geolocation";
import type { WeatherLocationRef } from "@wardrobe/cloud-contracts";

export type LocationPermissionOutcome = "granted" | "prompt" | "denied";

export function classifyLocationPermission(status: Pick<PermissionStatus, "location" | "coarseLocation">): LocationPermissionOutcome {
  if (status.coarseLocation === "granted" || status.location === "granted") return "granted";
  if (status.coarseLocation === "prompt" || status.coarseLocation === "prompt-with-rationale" || status.location === "prompt" || status.location === "prompt-with-rationale") return "prompt";
  return "denied";
}

export function sanitizeResolvedLocationCandidates(candidates: readonly WeatherLocationRef[]): readonly WeatherLocationRef[] {
  return candidates.map((candidate) => ({ locationId: candidate.locationId, displayName: candidate.displayName, timezone: candidate.timezone }));
}

export interface CoarseDeviceCoordinates { readonly longitude: number; readonly latitude: number }

export async function readCoarseDeviceCoordinates(): Promise<{ permission: LocationPermissionOutcome; coordinates?: CoarseDeviceCoordinates }> {
  const { Geolocation } = await import("@capacitor/geolocation");
  let status = await Geolocation.checkPermissions();
  if (classifyLocationPermission(status) === "prompt") {
    status = await Geolocation.requestPermissions({ permissions: ["coarseLocation"] });
  }
  const permission = classifyLocationPermission(status);
  if (permission !== "granted") return { permission };
  const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
  return { permission, coordinates: { longitude: position.coords.longitude, latitude: position.coords.latitude } };
}

export function isPermissionState(value: unknown): value is PermissionState {
  return value === "prompt" || value === "prompt-with-rationale" || value === "granted" || value === "denied";
}

export async function openApplicationSettings(): Promise<boolean> {
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return false;
  const plugin = registerPlugin<{ open(): Promise<void> }>("WardoraSettings");
  await plugin.open();
  return true;
}
