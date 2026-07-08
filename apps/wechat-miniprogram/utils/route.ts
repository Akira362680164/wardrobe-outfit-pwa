import { isLoggedIn } from "../stores/session";

const HOME = "/pages/home/index";
const LOGIN = "/pages/login/index";

export function goHome(): void {
  wx.switchTab({ url: HOME });
}

export function goLogin(redirect?: string): void {
  const suffix = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  wx.redirectTo({ url: `${LOGIN}${suffix}` });
}

export function requireAuth(next: () => void, redirect?: string): void {
  if (isLoggedIn()) {
    next();
    return;
  }
  goLogin(redirect);
}
