// ponytail: shared validation, one regex for phone across login/register

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

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "密码至少需要 8 位";
  if (password.length > 256) return "密码不能超过 256 位";
  return null;
}

export interface LoginFormState {
  phone: string;
  password: string;
}

export interface RegisterFormState {
  phone: string;
  password: string;
  confirmPassword: string;
  accepted: boolean;
}

export function isLoginFormValid(state: LoginFormState): boolean {
  return isValidAuthPhone(state.phone) && validatePassword(state.password) === null;
}

export function isRegisterFormValid(state: RegisterFormState): boolean {
  return (
    isValidAuthPhone(state.phone) &&
    validatePassword(state.password) === null &&
    state.password === state.confirmPassword &&
    state.accepted
  );
}
