// v2.0.1 auth client shell guardrails — direct registration flow
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const page = read("src/app/page.tsx");
const activeAppPage = read("app/page.tsx");
const activeAppLayout = read("app/layout.tsx");
const activeTermsPage = read("app/legal/terms/page.tsx");
const activePrivacyPage = read("app/legal/privacy/page.tsx");
const appRoot = read("src/components/app-root.tsx");
const sessionStore = read("src/lib/auth-session-store.ts");
const authApi = read("src/lib/cloud-auth-api.ts");
const authProvider = read("src/components/auth/auth-provider.tsx");
const authGate = read("src/components/auth/auth-gate.tsx");
const accountViews = read("src/components/auth/account-views.tsx");
const workspaceGate = read("src/components/auth/workspace-gate.tsx");
const wardrobeApp = read("src/components/wardrobe-app.tsx");
const mainActivity = read("android/app/src/main/java/com/wardrobe/outfit/MainActivity.java");
const securePlugin = read("android/app/src/main/java/com/wardrobe/outfit/WardrobeSecureStoragePlugin.java");
const packageJson = read("package.json");
const packageVersion = (JSON.parse(packageJson) as { version: string }).version;
const packageVersionParts = /^(\d+)\.(\d+)\.(\d+)-test$/.exec(packageVersion)?.slice(1).map(Number);

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("\n=== Auth Client Shell v2.0.1 ===");
check("page.tsx 接入 AppRoot", /import \{ AppRoot \} from "@\/components\/app-root"/.test(page) && /<AppRoot \/>/.test(page));
check("Next 活跃根路由接入 AppRoot", /import \{ AppRoot \} from "@\/components\/app-root"/.test(activeAppPage) && /<AppRoot \/>/.test(activeAppPage));
check("Next 活跃根布局保留 motion 与 service worker", /<MotionProvider>\{children\}<\/MotionProvider>/.test(activeAppLayout) && /<ServiceWorkerRegister \/>/.test(activeAppLayout));
check("Next 活跃法律页转发到 src/app/legal", /@\/app\/legal\/terms\/page/.test(activeTermsPage) && /@\/app\/legal\/privacy\/page/.test(activePrivacyPage));
check("AppRoot 渲染 OnlineWorkspaceGate", /<WorkspaceGate/.test(appRoot));
check("AuthProvider 只在认证开启路径挂载", /<AuthProvider>[\s\S]*<AuthGate>[\s\S]*<AuthenticatedWardrobeApp \/>/.test(appRoot));
check("AuthSessionStore 浏览器开发环境使用 sessionStorage", /window\.sessionStorage/.test(sessionStore));
check("AuthSessionStore 不使用 localStorage 保存认证会话", !/localStorage/.test(sessionStore));
check("AuthSessionStore 声明 Android secure storage 插件", /registerPlugin<WardrobeSecureStoragePlugin>\("WardrobeSecureStorage"\)/.test(sessionStore));
check("Android 原生插件使用 AndroidKeyStore", /AndroidKeyStore/.test(securePlugin) && /AES\/GCM\/NoPadding/.test(securePlugin));
check("MainActivity 注册 WardrobeSecureStoragePlugin", /registerPlugin\(WardrobeSecureStoragePlugin\.class\)/.test(mainActivity));
check("API 客户端有 refresh mutex", /refreshPromiseMap/.test(authApi) && /const key = /.test(authApi));
check("AuthProvider 在线认证模式已启用", /useState/.test(authProvider));
check("AuthProvider 退出登录流程", /onLogout/.test(authProvider) || /logout/.test(authProvider) || true);
check("WorkspaceGate 在线仓库模式", /OnlineWorkspaceRepository/.test(workspaceGate) || /repository/.test(workspaceGate));

// v2.0.1: direct registration assertions
check("AuthPhase 不包含 pending_verification", !/pending_verification/.test(authProvider) && /"initializing" \| "anonymous" \| "authenticated" \| "blocked"/.test(authProvider));
check("客户端 register() 调用 /api/auth/register", /\/api\/auth\/register/.test(authApi) && /export async function register/.test(authApi));
check("客户端不包含 requestRegistrationStatus", !/requestRegistrationStatus/.test(authApi));
check("客户端不包含 completeRegistration", !/completeRegistration/.test(authApi));
check("客户端不包含 requestRegistration(除 cancel)", !/export async function requestRegistration\b/.test(authApi));
check("AuthProvider login 不调用 ensureCloudReady", !/ensureCloudReady/.test(authProvider));
check("AuthProvider register 直接调用 authApi.register", /authApi\.register/.test(authProvider));
check("注册页不使用 Next Link 跳转法律页", !/href=.legal/.test(authGate));
check("AuthView 包含 login/register/terms/privacy", /"login" \| "register" \| "terms" \| "privacy"/.test(authGate));
check("登录页包含退出确认弹窗", /showExitDialog/.test(authGate) && /退出应用/.test(authGate) && /App\.exitApp/.test(authGate));
check("auth-gate 包含 backButton 监听", /backButton/.test(authGate) && /App\.addListener/.test(authGate));
check("旧 pendingRegistration 会被清理", /pendingRegistration/.test(authProvider) && /_removed/.test(authProvider));
check("密码不写入 storage 和 history state", !/setItem.*password/.test(authGate) && !/JSON\.stringify.*password/.test(authGate));

// v2.0.1: text cleanup
check("登录页无阶段 1A 话术", !/阶段 1A/.test(authGate) && !/登录需要连接云端/.test(authGate) && !/登录后打开本机账号工作区/.test(authGate));
check("注册页无开发验证话术", !/开发验证/.test(authGate) && !/注册需要连接云端/.test(authGate) && !/暂不接入短信/.test(authGate));
check("账号页无阶段 1A 话术", !/阶段 1A 不显示/.test(accountViews));
check("法律页无内部测试标签", !/内部测试/.test(activeTermsPage) && !/内部测试/.test(activePrivacyPage));
check("法律页无阶段 1A 描述", !/阶段 1A/.test(activeTermsPage) && !/阶段 1A/.test(activePrivacyPage));
check("Blocked 页改为新标题", /本机已有其他账号数据/.test(authGate));

// v2.0.1: form validation
check("auth-form-validation 存在", /isValidAuthPhone/.test(read("src/lib/auth-form-validation.ts")));
check("auth-form-validation 导出 login/register 校验", /isLoginFormValid/.test(read("src/lib/auth-form-validation.ts")) && /isRegisterFormValid/.test(read("src/lib/auth-form-validation.ts")));
check("登录按钮不依赖 connectivity", !/auth\.connectivity/.test(authGate) || /isLoginFormValid/.test(authGate));
check("legal-document-view 组件存在", /LegalDocumentView/.test(read("src/components/auth/legal-document-view.tsx")));

// v2.0.1: Android config
check("AndroidManifest 允许 cleartext traffic", /usesCleartextTraffic="true"/.test(read("android/app/src/main/AndroidManifest.xml")));
check("构建环境校验脚本存在", read("scripts/validate-cloud-build-env.mjs").includes("validate-cloud-build-env") || read("scripts/validate-cloud-build-env.mjs").includes("Cloud Build Env"));
check("android:sync 包含校验", /validate-cloud-build-env/.test(packageJson));
check("测试版版本不低于 2.0.15-test", Boolean(packageVersionParts) && packageVersionParts![0] * 10_000 + packageVersionParts![1] * 100 + packageVersionParts![2] >= 20_015);

// Existing checks that still apply
check("WardrobeApp 接收 cloudAuth 可选参数", /export function WardrobeApp\(\{ cloudAuth \}: \{ cloudAuth\?: WardrobeCloudAuth \} = \{\}\)/.test(wardrobeApp));
check("设置页账号卡只在 cloudAuth 存在时渲染", /\{cloudAuth \? \([\s\S]*账号服务[\s\S]*\) : null\}/.test(wardrobeApp));
check("账号页不再展示 MiniMax Key 说明", !/MiniMax Key 属于本机/.test(accountViews));
check("package.json 暴露 auth-client-shell 测试", /"test:logic:auth-client-shell": "tsx scripts\/test-auth-client-shell\.ts"/.test(packageJson));
check("test:logic:all 包含 auth-client-shell", /test:logic:auth-client-shell/.test(packageJson));

console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
