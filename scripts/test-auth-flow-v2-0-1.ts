// v2.0.1 auth flow regression test
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const authApi = read("src/lib/cloud-auth-api.ts");
const authProvider = read("src/components/auth/auth-provider.tsx");
const authGate = read("src/components/auth/auth-gate.tsx");
const authFormValidation = read("src/lib/auth-form-validation.ts");
const sessionStore = read("src/lib/auth-session-store.ts");
const legalDoc = read("src/components/auth/legal-document-view.tsx");
const termsPage = read("src/app/legal/terms/page.tsx");
const privacyPage = read("src/app/legal/privacy/page.tsx");
const accountViews = read("src/components/auth/account-views.tsx");
const manifest = read("android/app/src/main/AndroidManifest.xml");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

console.log("\n=== v2.0.1 Auth Flow ===");

// 1. Server endpoint
check("客户端 register() 调用 POST /api/auth/register", /\/api\/auth\/register/.test(authApi));

// 2. No pending verification
check("AuthPhase 不含 pending_verification", !/pending_verification/.test(authProvider));
check("客户端无 requestRegistrationStatus", !/requestRegistrationStatus/.test(authApi));
check("客户端无 completeRegistration", !/completeRegistration/.test(authApi));
check("AuthProvider 无 checkRegistration", !/checkRegistration/.test(authProvider));
check("AuthProvider 无 completePendingRegistration", !/completePendingRegistration/.test(authProvider));
check("auth-gate 无 PendingVerificationForm", !/PendingVerificationForm/.test(authGate));

// 3. AuthView state machine
check("AuthView 包含 login/register/terms/privacy", /"login" \| "register" \| "terms" \| "privacy"/.test(authGate));

// 4. No cloud_ready dependency for buttons
check("auth-gate 无 ensureCloudReady", !/ensureCloudReady/.test(authGate));
check("auth-gate 无 connectivity !== cloud_ready 禁用逻辑", !/connectivity !== "cloud_ready"/.test(authGate));

// 5. Form validation
check("isValidAuthPhone 存在", /isValidAuthPhone/.test(authFormValidation));
check("isLoginFormValid 存在", /isLoginFormValid/.test(authFormValidation));
check("isRegisterFormValid 存在", /isRegisterFormValid/.test(authFormValidation));
check("login 和 register 共用同一手机号正则", authFormValidation.includes("1[3-9]") && authFormValidation.includes("isLoginFormValid") && authFormValidation.includes("isRegisterFormValid"));

// 6. Legal pages use shared component
check("legal-document-view 组件存在", /LegalDocumentView/.test(legalDoc));
check("terms page 使用共享组件", /LegalDocumentView/.test(termsPage));
check("privacy page 使用共享组件", /LegalDocumentView/.test(privacyPage));

// 7. No Link to legal from register
check("注册页不用 Next Link 跳转法律页", !/href=.*legal/.test(authGate) || /onOpenTerms/.test(authGate));

// 8. History navigation
check("auth-gate 使用 history.pushState 管理导航", /pushState/.test(authGate) && /popstate/.test(authGate));
check("history state 只存 authView 不含密码", /HISTORY_KEY/.test(authGate) && !/pushState.*password/i.test(authGate));

// 9. Android back button
check("auth-gate 注册 backButton 监听", /backButton/.test(authGate) && /App\.addListener/.test(authGate));
check("登录页 back 弹出退出确认", /showExitDialog/.test(authGate));
check("退出确认调用 App.exitApp", /App\.exitApp/.test(authGate));

// 10. Text cleanup
check("登录页无阶段 1A", !/阶段 1A/.test(authGate));
check("登录页无登录需要连接云端", !/登录需要连接云端/.test(authGate));
check("登录页无登录后打开本机账号工作区", !/登录后打开本机账号工作区/.test(authGate));
check("注册页无开发验证", !/开发验证/.test(authGate));
check("注册页无注册需要连接云端", !/注册需要连接云端/.test(authGate));
check("注册页无暂不接入短信", !/暂不接入短信/.test(authGate));
check("账号页无阶段 1A", !/阶段 1A/.test(accountViews));
check("法律页无内部测试标签", !/内部测试/.test(termsPage) && !/内部测试/.test(privacyPage));
check("法律页无阶段 1A", !/阶段 1A/.test(termsPage) && !/阶段 1A/.test(privacyPage));
check("Blocked 页标题已更新", /本机已有其他账号数据/.test(authGate));

// 11. Old data migration
check("pendingRegistration 会被清理", /pendingRegistration/.test(authProvider) && /_removed/.test(authProvider));

// 12. Password safety
check("密码不写入 sessionStorage/localStorage", !/setItem.*password/i.test(authGate));
check("session store 不含 savePendingRegistration", !/savePendingRegistration/.test(sessionStore));

// 13. Android cleartext
check("AndroidManifest usesCleartextTraffic=true", /usesCleartextTraffic="true"/.test(manifest));

// 14. Network error messages
check("cloud-auth-api 包含网络不可达错误", /网络连接失败，请检查网络后重试/.test(authApi));
check("cloud-auth-api 包含服务暂不可用错误", /账号服务暂时不可用，请稍后重试/.test(authApi));

console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
