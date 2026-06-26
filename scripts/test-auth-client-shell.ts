// Phase 1A auth client shell source-level guardrails
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
const workspaceRegistry = read("src/lib/workspace-registry.ts");
const mainActivity = read("android/app/src/main/java/com/wardrobe/outfit/MainActivity.java");
const securePlugin = read("android/app/src/main/java/com/wardrobe/outfit/WardrobeSecureStoragePlugin.java");
const packageJson = read("package.json");

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

console.log("\n=== Auth Client Shell ===");
check("page.tsx 接入 AppRoot", /import \{ AppRoot \} from "@\/components\/app-root"/.test(page) && /<AppRoot \/>/.test(page));
check("Next 活跃根路由接入 AppRoot", /import \{ AppRoot \} from "@\/components\/app-root"/.test(activeAppPage) && /<AppRoot \/>/.test(activeAppPage));
check("Next 活跃根布局保留 motion 与 service worker", /<MotionProvider>\{children\}<\/MotionProvider>/.test(activeAppLayout) && /<ServiceWorkerRegister \/>/.test(activeAppLayout));
check("Next 活跃法律页转发到 src/app/legal", /@\/app\/legal\/terms\/page/.test(activeTermsPage) && /@\/app\/legal\/privacy\/page/.test(activePrivacyPage));
check("AppRoot 默认关闭认证时直接渲染 WardrobeApp", /NEXT_PUBLIC_CLOUD_AUTH_ENABLED === "true"/.test(appRoot) && /if \(!cloudAuthEnabled\) return <WardrobeApp \/>/.test(appRoot));
check("AuthProvider 只在认证开启路径挂载", /<AuthProvider>[\s\S]*<AuthGate>[\s\S]*<AuthenticatedWardrobeApp \/>/.test(appRoot));
check("AppRoot 用账号工作区开关挂载 WorkspaceGate", /NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED/.test(workspaceRegistry) && /<WorkspaceGate session=\{auth\.session\}>\{app\}<\/WorkspaceGate>/.test(appRoot));
check("AuthSessionStore 浏览器开发环境使用 sessionStorage", /window\.sessionStorage/.test(sessionStore));
check("AuthSessionStore 不使用 localStorage 保存认证会话", !/localStorage/.test(sessionStore));
check("AuthSessionStore 声明 Android secure storage 插件", /registerPlugin<WardrobeSecureStoragePlugin>\("WardrobeSecureStorage"\)/.test(sessionStore));
check("Android 原生插件使用 AndroidKeyStore", /AndroidKeyStore/.test(securePlugin) && /AES\/GCM\/NoPadding/.test(securePlugin));
check("MainActivity 注册 WardrobeSecureStoragePlugin", /registerPlugin\(WardrobeSecureStoragePlugin\.class\)/.test(mainActivity));
check("API 客户端使用 POST 注册状态接口", /\/api\/auth\/registrations\/\$\{encodeURIComponent\(input\.registrationId\)\}\/status/.test(authApi) && /method: "POST"/.test(authApi));
check("API 客户端有 refresh mutex", /let refreshPromise: Promise<AuthTokenPayload> \| null = null/.test(authApi) && /refreshPromise \?\?=/.test(authApi));
check("AuthProvider 默认绑定 localOwner 防止阶段 1A 本机串号", /!isAccountWorkspaceEnabled\(\)[\s\S]*bindLocalOwnerIfNeeded/.test(authProvider) && /setPhase\("blocked"\)/.test(authProvider));
check("AuthProvider 退出时标记账号工作区主动退出", /markCurrentWorkspaceLoggedOut\(current\)/.test(authProvider) && /markWorkspaceLoggedOut\(snapshot\.user\.id\)/.test(authProvider));
check("WorkspaceGate 打开当前账号工作区后再渲染子节点", /openWorkspaceForSession/.test(workspaceGate) && /state\.status === "ready"[\s\S]*children/.test(workspaceGate));
check("WorkspaceRegistry 包含 dbName/schema/generation/logout/offline 字段", /dbName: string/.test(workspaceRegistry) && /schemaVersion: number/.test(workspaceRegistry) && /activeWorkspaceGeneration: number/.test(workspaceRegistry) && /explicitlyLoggedOutAt/.test(workspaceRegistry) && /offlineAccessUntil/.test(workspaceRegistry));
check("WorkspaceRegistry 提供迟到响应三重检查", /isWorkspaceResponseCurrent/.test(workspaceRegistry) && /current\.userId === response\.userId/.test(workspaceRegistry) && /current\.dbName === response\.dbName/.test(workspaceRegistry) && /current\.activeWorkspaceGeneration === response\.workspaceGeneration/.test(workspaceRegistry));
check("注册页明确阶段 1A 开发验证占位", /阶段 1A 使用开发验证/.test(authGate));
check("注册页链接到阶段 1A 用户协议和隐私政策", /href="\/legal\/terms"/.test(authGate) && /href="\/legal\/privacy"/.test(authGate));
check("WardrobeApp 接收 cloudAuth 可选参数", /export function WardrobeApp\(\{ cloudAuth \}: \{ cloudAuth\?: WardrobeCloudAuth \} = \{\}\)/.test(wardrobeApp));
check("设置页账号卡只在 cloudAuth 存在时渲染", /\{cloudAuth \? \([\s\S]*账号服务[\s\S]*\) : null\}/.test(wardrobeApp));
check("账号页说明阶段 1A 不显示云端同步状态", /阶段 1A 不显示云端同步状态/.test(accountViews));
check("账号页说明 MiniMax Key 属于本机", /MiniMax Key 属于本机/.test(accountViews));
check("package.json 暴露 auth-client-shell 测试", /"test:logic:auth-client-shell": "tsx scripts\/test-auth-client-shell\.ts"/.test(packageJson));
check("test:logic:all 包含 auth-client-shell", /test:logic:auth-client-shell/.test(packageJson));
check("package.json 暴露 workspace-registry 测试", /"test:logic:workspace-registry": "tsx scripts\/test-workspace-registry\.ts"/.test(packageJson));
check("test:logic:all 包含 workspace-registry", /test:logic:workspace-registry/.test(packageJson));

console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
