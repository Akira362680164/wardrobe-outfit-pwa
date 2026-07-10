import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const authGate = read("src/components/auth/auth-gate.tsx");
const authApi = read("src/lib/cloud-auth-api.ts");
const validation = read("src/lib/auth-form-validation.ts");
const accountViews = read("src/components/auth/account-views.tsx");
const sessionStore = read("src/lib/auth-session-store.ts");

assert(authGate.includes("邮箱或手机号"), "login page must accept email or phone");
assert(authGate.includes("通过邮箱注册"), "login page must expose email registration");
assert(authGate.includes("找回密码"), "login page must expose password reset");
assert(authGate.includes("发送邮箱验证码"), "register/reset flow must confirm sending email code");
assert(authGate.includes("确认发送"), "email code flow must require second confirmation");
assert((authGate.match(/setCountdown\(response\.cooldownSeconds\)/g) ?? []).length >= 2, "register and reset must use the server cooldown");
assert(accountViews.includes("setCountdown(response.cooldownSeconds)"), "change password must use the server cooldown");
assert(!authGate.includes("setCountdown(30)") && !accountViews.includes("setCountdown(30)"), "App email countdown must not hard-code 30 seconds");
assert(authGate.includes("手机号（选填）"), "register page must label phone as optional");
assert(authGate.includes("手机号暂不验证，仅作为手机号加密码登录名使用。"), "register page must explain phone is only a login name");
assert(authApi.includes("/api/auth/email/send-code"), "API client must send email verification codes");
assert(authApi.includes("/api/auth/password/reset/request"), "API client must request password reset codes");
assert(authApi.includes("/api/auth/password/reset/confirm"), "API client must confirm password resets");
assert(authApi.includes("/api/auth/password/change/request-code"), "API client must request change-password email codes without raw email");
assert(authApi.includes("/api/auth/password/change-with-email-code"), "API client must change password through email code");
assert(authApi.includes("/api/auth/account/security"), "API client must load account security state");
assert(authApi.includes("account: string"), "login API must use account field");
assert(validation.includes("isValidLoginAccount"), "validation must support email or phone login");
assert(validation.includes("(!phone || isValidAuthPhone(phone))"), "register validation must keep phone optional");
assert(accountViews.includes("账号安全"), "account page title must be account security");
assert(accountViews.includes("邮箱") && accountViews.includes("手机号") && accountViews.includes("微信") && accountViews.includes("密码"), "account page must show all security bindings");
assert(accountViews.includes("当前密码") && accountViews.includes("邮箱验证码"), "change-password page must expose both password modes");
assert(accountViews.includes("requestPasswordChangeCode"), "change-password email mode must request code from current session");
assert(sessionStore.includes("emailMasked") && sessionStore.includes("phoneVerified"), "session user snapshot must keep email and phone verification fields");

console.log("app email auth flow checks passed");
