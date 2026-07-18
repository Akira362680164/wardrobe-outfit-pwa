export interface MiniAbortSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

export class MiniAbortController {
  private readonly listeners = new Set<() => void>();
  private abortedState = false;
  readonly signal: MiniAbortSignal;

  constructor() {
    const controller = this;
    this.signal = {
      get aborted() { return controller.abortedState; },
      addEventListener: (_type, listener) => {
        if (controller.abortedState) listener();
        else controller.listeners.add(listener);
      },
      removeEventListener: (_type, listener) => { controller.listeners.delete(listener); },
    };
  }

  abort(): void {
    if (this.abortedState) return;
    this.abortedState = true;
    const listeners = [...this.listeners];
    this.listeners.clear();
    listeners.forEach((listener) => listener());
  }
}
