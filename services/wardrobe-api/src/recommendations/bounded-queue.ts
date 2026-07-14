export class BoundedAsyncQueue<T> {
  private items: T[] = [];
  private readers: Array<(value: T | null) => void> = [];
  private writers: Array<() => void> = [];
  private closed = false;
  peakSize = 0;
  constructor(readonly capacity = 64) { if (!Number.isInteger(capacity) || capacity < 1) throw new Error("queue capacity must be positive"); }
  async push(item: T): Promise<void> { while (!this.closed && this.items.length >= this.capacity && this.readers.length === 0) await new Promise<void>((resolve) => this.writers.push(resolve)); if (this.closed) throw new Error("queue closed"); const reader = this.readers.shift(); if (reader) reader(item); else { this.items.push(item); this.peakSize = Math.max(this.peakSize, this.items.length); } }
  async shift(): Promise<T | null> { const item = this.items.shift(); if (item !== undefined) { this.writers.shift()?.(); return item; } if (this.closed) return null; return new Promise((resolve) => this.readers.push(resolve)); }
  close() { this.closed = true; for (const reader of this.readers.splice(0)) reader(null); for (const writer of this.writers.splice(0)) writer(); }
  get size() { return this.items.length; }
}
