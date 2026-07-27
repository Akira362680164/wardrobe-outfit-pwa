import type { AppRoute } from "@/lib/app-route";

export const WARDORA_HOME_EMERGENCY_OFF_ENV = "NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF";

/**
 * Wardora 新首页是正式默认。只有构建时显式设置 emergency-off=true
 * 才回到旧衣橱首页，避免环境变量漏配导致静默回滚。
 */
export function isWardoraHomeFeedEnabled(
  emergencyOff = process.env.NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF,
): boolean {
  return emergencyOff !== "true";
}

export function getWardoraHomeRoute(
  emergencyOff = process.env.NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF,
): Extract<AppRoute, { name: "home_feed" | "wardrobe_home" }> {
  return isWardoraHomeFeedEnabled(emergencyOff)
    ? { name: "home_feed" }
    : { name: "wardrobe_home" };
}
