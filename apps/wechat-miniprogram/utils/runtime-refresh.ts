export type RuntimeRefreshDomain = "garments" | "outfits" | "wishlist" | "planning";

export type RuntimeRefreshResult<T> =
  | { status: "skipped"; accepted: false }
  | { status: "fulfilled"; accepted: boolean; value: T };

type DomainState = {
  dirty: boolean;
  version: number;
  lastLoadedAt: number;
  inFlight?: Promise<RuntimeRefreshResult<unknown>>;
};

const DEFAULT_MAX_AGE_MS = 30_000;
const states = new Map<RuntimeRefreshDomain, DomainState>();
let runtimeGeneration = 0;

function stateFor(domain: RuntimeRefreshDomain): DomainState {
  const existing = states.get(domain);
  if (existing) return existing;
  const created: DomainState = { dirty: true, version: 0, lastLoadedAt: 0 };
  states.set(domain, created);
  return created;
}

export function markRuntimeDomainDirty(domain: RuntimeRefreshDomain): void {
  const state = stateFor(domain);
  state.dirty = true;
  state.version += 1;
}

export function shouldRefreshRuntimeDomain(
  domain: RuntimeRefreshDomain,
  options: { force?: boolean; hasData?: boolean; maxAgeMs?: number; now?: number } = {},
): boolean {
  const state = stateFor(domain);
  if (options.force || !options.hasData || state.dirty || !state.lastLoadedAt) return true;
  return (options.now ?? Date.now()) - state.lastLoadedAt >= (options.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
}

export async function runRuntimeDomainRefresh<T>(
  domain: RuntimeRefreshDomain,
  loader: () => Promise<T>,
  options: { force?: boolean; hasData?: boolean; maxAgeMs?: number; now?: number } = {},
): Promise<RuntimeRefreshResult<T>> {
  const state = stateFor(domain);
  if (state.inFlight) return state.inFlight as Promise<RuntimeRefreshResult<T>>;
  if (!shouldRefreshRuntimeDomain(domain, options)) return { status: "skipped", accepted: false };

  const startedGeneration = runtimeGeneration;
  const startedVersion = state.version;
  const request = loader().then((value): RuntimeRefreshResult<T> => {
    const accepted = startedGeneration === runtimeGeneration;
    if (accepted) {
      state.lastLoadedAt = options.now ?? Date.now();
      if (state.version === startedVersion) state.dirty = false;
    }
    return { status: "fulfilled", accepted, value };
  }).finally(() => {
    if (state.inFlight === request) state.inFlight = undefined;
  });
  state.inFlight = request as Promise<RuntimeRefreshResult<unknown>>;
  return request;
}

export function resetRuntimeRefreshState(): void {
  runtimeGeneration += 1;
  states.clear();
}

export function getRuntimeRefreshSnapshot(domain: RuntimeRefreshDomain): Readonly<Omit<DomainState, "inFlight"> & { inFlight: boolean }> {
  const state = stateFor(domain);
  return { dirty: state.dirty, version: state.version, lastLoadedAt: state.lastLoadedAt, inFlight: Boolean(state.inFlight) };
}
