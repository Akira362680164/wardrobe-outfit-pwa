import type { OverlayDismissReason, OverlayDismissResult, OverlayStackStore } from "@/lib/overlay-stack";

export type BackHandler = () => boolean | void;

export interface BackHandlerEntry {
  id: string;
  handler: BackHandler;
  /** Higher priority is consulted first. Registration order breaks ties. */
  priority?: number;
}

interface RegisteredBackHandler extends BackHandlerEntry {
  order: number;
}

export interface BackHandlerResult {
  handled: boolean;
  handlerId: string | null;
}

export interface CoordinatedBackResult {
  handled: boolean;
  source: "overlay" | "page" | "none";
  overlay: OverlayDismissResult;
  handlerId: string | null;
}

const UNHANDLED_OVERLAY: OverlayDismissResult = Object.freeze({
  handled: false,
  dismissed: false,
  blocked: false,
  overlayId: null,
});

export class BackHandlerStore {
  private entries: RegisteredBackHandler[] = [];
  private nextOrder = 0;

  register(entry: BackHandlerEntry): () => void {
    const registered: RegisteredBackHandler = {
      ...entry,
      priority: entry.priority ?? 0,
      order: this.nextOrder++,
    };
    this.entries = [...this.entries, registered];

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.entries = this.entries.filter((candidate) => candidate !== registered);
    };
  }

  requestBack(): BackHandlerResult {
    const ordered = [...this.entries].sort((left, right) => {
      const priorityDelta = (right.priority ?? 0) - (left.priority ?? 0);
      return priorityDelta !== 0 ? priorityDelta : right.order - left.order;
    });

    for (const entry of ordered) {
      if (entry.handler() === true) {
        return { handled: true, handlerId: entry.id };
      }
    }
    return { handled: false, handlerId: null };
  }
}

/**
 * The only dispatch algorithm used by Android Back and Escape.
 * It never asks a page handler after an overlay consumed or rejected dismissal.
 */
export function coordinateBackRequest(
  overlayStack: OverlayStackStore,
  backHandlers: BackHandlerStore,
  reason: Extract<OverlayDismissReason, "android-back" | "escape">,
): CoordinatedBackResult {
  const overlay = overlayStack.requestDismiss(reason);
  if (overlay.handled) {
    return { handled: true, source: "overlay", overlay, handlerId: null };
  }

  const page = backHandlers.requestBack();
  if (page.handled) {
    return { handled: true, source: "page", overlay: UNHANDLED_OVERLAY, handlerId: page.handlerId };
  }

  return { handled: false, source: "none", overlay: UNHANDLED_OVERLAY, handlerId: null };
}
