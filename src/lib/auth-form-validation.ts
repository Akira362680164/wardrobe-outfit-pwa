// ponytail: shared auth validation kept small enough to read at call sites

export function isValidAuthPhone(phone: string): boolean {
  const compact = phone.trim().replace(/[\s().-]/g, "");
  // +86 中国大陆 11 位手机号
  if (/^\+861[3-9]\d{9}$/.test(compact)) return true;
  // 86 前缀
  if (/^861[3-9]\d{9}$/.test(compact)) return true;
  // 纯 11 位
  if (/^1[3-9]\d{9}$/.test(compact)) return true;
  // 国际 E.164
  return /^\+[1-9]\d{7,14}$/.test(compact);
}

export function isValidAuthEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidLoginAccount(account: string): boolean {
  const value = account.trim();
  if (!value) return false;
  return value.includes("@") ? isValidAuthEmail(value) : isValidAuthPhone(value);
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "密码至少需要 8 位";
  if (password.length > 256) return "密码不能超过 256 位";
  return null;
}

export interface LoginFormState {
  account: string;
  password: string;
  accepted: boolean;
}

export interface RegisterFormState {
  email: string;
  emailCode: string;
  password: string;
  confirmPassword: string;
  phone: string;
  accepted: boolean;
}

export function isLoginFormValid(state: LoginFormState): boolean {
  return isValidLoginAccount(state.account) && validatePassword(state.password) === null;
}

export function isRegisterFormValid(state: RegisterFormState): boolean {
  const phone = state.phone.trim();
  return (
    isValidAuthEmail(state.email) &&
    /^\d{6}$/.test(state.emailCode.trim()) &&
    validatePassword(state.password) === null &&
    state.password === state.confirmPassword &&
    (!phone || isValidAuthPhone(phone))
  );
}
