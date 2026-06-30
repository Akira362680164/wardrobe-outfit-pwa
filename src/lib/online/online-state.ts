export type OnlineListState<T> =
  | { status: "loading"; data: null }
  | { status: "ready" | "refreshing"; data: T }
  | { status: "error"; data: null; message: string }
  | { status: "refresh_error"; data: T; message: string };

export function beginOnlineLoad<T>(state: OnlineListState<T>): OnlineListState<T> {
  return state.data === null ? { status: "loading", data: null } : { status: "refreshing", data: state.data };
}

export function finishOnlineLoad<T>(data: T): OnlineListState<T> {
  return { status: "ready", data };
}

export function failOnlineLoad<T>(state: OnlineListState<T>, message: string): OnlineListState<T> {
  return state.data === null
    ? { status: "error", data: null, message }
    : { status: "refresh_error", data: state.data, message };
}

export function initialOnlineState<T>(): OnlineListState<T> {
  return { status: "loading", data: null };
}
