export type OverlayKind =
  | "sheet"
  | "dialog"
  | "alertdialog"
  | "popover"
  | "lightbox"
  | "cropper"
  | "fullscreen";

export type OverlayDismissReason = "android-back" | "escape" | "backdrop";

export interface OverlayFocusTarget {
  focus: (options?: FocusOptions) => void;
  isConnected?: boolean;
}

export interface OverlayEntry {
  id: string;
  kind: OverlayKind;
  dismissible: boolean;
  onDismiss: (reason: OverlayDismissReason) => void;
  canDismiss?: (reason: OverlayDismissReason) => boolean;
  onDismissBlocked?: (reason: OverlayDismissReason) => void;
  restoreFocusTo?: OverlayFocusTarget | null;
}

export interface OverlayStackItem {
  id: string;
  kind: OverlayKind;
  dismissible: boolean;
}

export interface OverlayStackSnapshot {
  entries: readonly OverlayStackItem[];
  topmostId: string | null;
}

export interface OverlayDismissResult {
  handled: boolean;
  dismissed: boolean;
  blocked: boolean;
  overlayId: string | null;
}

const EMPTY_SNAPSHOT: OverlayStackSnapshot = Object.freeze({
  entries: Object.freeze([]),
  topmostId: null,
});

function focusSafely(target: OverlayFocusTarget | null | undefined): void {
  if (!target || target.isConnected === false) return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

function scheduleAfterPresentationUpdate(callback: () => void): void {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(callback);
    return;
  }
  queueMicrotask(callback);
}

/**
 * Registration order is presentation order: the most recently registered
 * overlay is the only layer allowed to consume dismissal or focus.
 */
export class OverlayStackStore {
  private entries: OverlayEntry[] = [];
  private listeners = new Set<() => void>();
  private snapshot: OverlayStackSnapshot = EMPTY_SNAPSHOT;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): OverlayStackSnapshot => this.snapshot;

  getServerSnapshot = (): OverlayStackSnapshot => EMPTY_SNAPSHOT;

  register(entry: OverlayEntry): () => void {
    if (this.entries.some((candidate) => candidate.id === entry.id)) {
      throw new Error(`Overlay id already registered: ${entry.id}`);
    }
    this.entries = [...this.entries, entry];
    this.publish();

    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      this.unregister(entry.id);
    };
  }

  update(id: string, patch: Partial<Omit<OverlayEntry, "id">>): void {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const updated = { ...this.entries[index], ...patch, id };
    this.entries = this.entries.map((entry, entryIndex) => (entryIndex === index ? updated : entry));
    this.publish();
  }

  unregister(id: string): void {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const entry = this.entries[index];
    const wasTopmost = index === this.entries.length - 1;
    this.entries = this.entries.filter((candidate) => candidate.id !== id);
    this.publish();
    if (wasTopmost) {
      const expectedTopmostId = this.getTopmost()?.id ?? null;
      scheduleAfterPresentationUpdate(() => {
        if ((this.getTopmost()?.id ?? null) !== expectedTopmostId) return;
        focusSafely(entry.restoreFocusTo);
      });
    }
  }

  getTopmost(): OverlayEntry | null {
    return this.entries[this.entries.length - 1] ?? null;
  }

  isTopmost(id: string): boolean {
    return this.getTopmost()?.id === id;
  }

  requestDismiss(reason: OverlayDismissReason, requestedId?: string): OverlayDismissResult {
    const topmost = this.getTopmost();
    if (!topmost || (requestedId !== undefined && topmost.id !== requestedId)) {
      return { handled: false, dismissed: false, blocked: false, overlayId: null };
    }

    const canDismiss = topmost.dismissible && (topmost.canDismiss?.(reason) ?? true);
    if (!canDismiss) {
      topmost.onDismissBlocked?.(reason);
      return { handled: true, dismissed: false, blocked: true, overlayId: topmost.id };
    }

    topmost.onDismiss(reason);
    return { handled: true, dismissed: true, blocked: false, overlayId: topmost.id };
  }

  private publish(): void {
    const stackItems = this.entries.map(({ id, kind, dismissible }) => Object.freeze({ id, kind, dismissible }));
    this.snapshot = Object.freeze({
      entries: Object.freeze(stackItems),
      topmostId: stackItems[stackItems.length - 1]?.id ?? null,
    });
    this.listeners.forEach((listener) => listener());
  }
}
