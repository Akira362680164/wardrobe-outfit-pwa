import { useBackHandlerRegistration } from "@/components/overlay-root";

/**
 * Stable Android back button handler.
 *
 * Registers with the single BackCoordinator. The native listener lives at
 * OverlayRoot; callers only contribute ordered page-level decisions.
 *
 * @param handler - returning `true` means the event was consumed (no default back behavior).
 * @param enabled - whether to activate the handler.
 * @param priority - higher values run first. Root fallback handlers should use a negative value.
 */
export function useStableBackHandler(
  handler: () => boolean | void,
  enabled = true,
  priority = 0,
): void {
  useBackHandlerRegistration(handler, enabled, priority);
}
