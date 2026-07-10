export type SiteBuildTarget = "app" | "website";

export function getSiteBuildTarget(): SiteBuildTarget {
  return process.env.WARDORA_BUILD_TARGET === "website" ? "website" : "app";
}

export function isWebsiteBuild(): boolean {
  return getSiteBuildTarget() === "website";
}
