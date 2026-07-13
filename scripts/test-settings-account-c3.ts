import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getNavigationMotionStates } from "../src/components/navigation-motion";
import { createSettingsPageTransition } from "../src/components/auth/settings-subpage-motion";

const root = join(__dirname, "..");
const app = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const motion = readFileSync(join(root, "src/components/auth/settings-subpage-motion.tsx"), "utf8");
const account = readFileSync(join(root, "src/components/auth/account-views.tsx"), "utf8");
const authProvider = readFileSync(join(root, "src/components/auth/auth-provider.tsx"), "utf8");
const authGate = readFileSync(join(root, "src/components/auth/auth-gate.tsx"), "utf8");
const deletion = readFileSync(join(root, "src/components/auth/account-deletion-view.tsx"), "utf8");

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed += 1;
  console.log(`  ✅ ${name}`);
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

console.log("\n=== C3 settings navigation ===");
const push = createSettingsPageTransition(1, "home", "profile", "push");
const pop = createSettingsPageTransition(2, "profile", "home", "pop");
check("settings transition keeps id/from/to/direction atomic", push.id === 1
  && push.fromPage === "home"
  && push.toPage === "profile"
  && push.direction === "push");
check("settings pop targets its list hierarchy", pop.fromPage === "profile"
  && pop.toPage === "home"
  && pop.direction === "pop");

const pushStates = getNavigationMotionStates("push", false);
const popStates = getNavigationMotionStates("pop", false);
const reducedStates = getNavigationMotionStates("push", true);
check("nested push/pop exactly reuse C1 +24/-6 paths", pushStates.enter.x === 24
  && pushStates.exit.x === -6
  && popStates.exit.x === pushStates.enter.x
  && popStates.enter.x === pushStates.exit.x);
check("reduced motion removes nested displacement", !("x" in reducedStates.enter)
  && !("y" in reducedStates.enter));
check("nested transitions are interruptible sync presence", /AnimatePresence mode="sync"/.test(motion)
  && !/mode="wait"/.test(motion));
check("exiting nested page is inert and cannot receive pointer input", /pointerEvents: isPresent \? "auto" : "none"/.test(motion)
  && /inert=\{isPresent \? undefined : true\}/.test(motion));
check("settings list scroll is saved and restored from layout effect", /useLayoutEffect\(\(\) => \{[\s\S]*?renderedPageRef\.current === "home"[\s\S]*?readPresentedWindowScrollY\(\)[\s\S]*?transition\.toPage === "home"[\s\S]*?restoreWindowScrollBeforePaint/.test(motion));

const settingsRuntime = section(app, "function SettingsView", "function ClosetNameField");
check("SettingsView has one nested navigation owner", /<SettingsSubpageMotion transition=\{settingsNavigation\.transition\}>/.test(settingsRuntime)
  && !/setSubPage/.test(settingsRuntime));
check("settings subpage ownership clears when its route unmounts", /hasSubPageRef\.current = subPage !== null;[\s\S]{0,120}hasSubPageRef\.current = false;/.test(settingsRuntime));
check("all four settings destinations use the same push API", ["profile", "photos", "minimax", "wardrobes"].every((page) => settingsRuntime.includes(`navigateSettingsPage("${page}")`)));
check("wardrobe sheets remain mounted outside the moving page", settingsRuntime.indexOf("</SettingsSubpageMotion>")
  < settingsRuntime.indexOf("open={showAddWardrobe}"));
check("wardrobe page and explicit controls reject busy exit", /<WardrobeListPage[\s\S]*?busy=\{wardrobeMutation !== null\}/.test(settingsRuntime)
  && /dismissible=\{wardrobeMutation === null\}/.test(settingsRuntime));
check("diagnostic upload keeps a non-dismissible progress layer", /const diagnosticBusy =/.test(settingsRuntime)
  && /dismissible=\{!diagnosticBusy\}/.test(settingsRuntime)
  && /正在上传诊断数据/.test(settingsRuntime));

console.log("\n=== C3 failure retention and readback ===");
const saveSettings = section(app, "async function saveSettings", "async function seedDemoItems");
check("MiniMax validates before writing local settings", saveSettings.indexOf("validateMiniMaxKey")
  < saveSettings.indexOf("saveMiniMaxSettings"));
check("invalid MiniMax key returns without persisting", /if \(!result\.valid\) return false;/.test(saveSettings));
check("MiniMax only pops after successful save", /const saved = await onSave\(draft\);\s*if \(saved\) onSaved\(\);/.test(app));
check("wardrobe mutations close only after awaited action/readback", /await action\(\);\s*onSuccess\(\);/.test(settingsRuntime));
check("wardrobe parent callbacks read back server state", (app.match(/await refreshState\(\);/g) ?? []).length >= 4);
check("profile success adopts the server-returned entity", /const saved = rethrowIfFailed\(await repoSaveProfile\(profile\)/.test(app)
  && /setSavedTryOnProfile\(saved\)/.test(app));

console.log("\n=== C3 account and reset transactions ===");
check("account primary color uses semantic token", !/bg-\[#2F6B4F\]/.test(account)
  && (account.match(/bg-denim text-white/g) ?? []).length >= 2);
check("binding save reads account security before closing editor", /const refreshed = await authApi\.getAccountSecurity[\s\S]{0,120}setSecurity\(refreshed\);\s*setEditMode\(null\);/.test(account));
check("password change reads security with its effective token before success navigation", /readbackAccessToken = await auth\.onChangePassword[\s\S]{0,900}await authApi\.getAccountSecurity\(readbackAccessToken\);\s*onDone\(\);/.test(account));
check("AuthProvider returns the fresh token used by password change", /await authApi\.changePassword\([\s\S]{0,180}return current\.accessToken;/.test(authProvider));
check("post-write readback failures keep the page with an explicit unconfirmed message", (account.match(/服务器状态暂未读回/g) ?? []).length === 2
  && (account.match(/let writeCompleted = false;/g) ?? []).length === 2);
check("account editor cancel and deep links lock during transaction", /accountMutationBusy[\s\S]*?disabled=\{accountMutationBusy\}/.test(account)
  && /disabled=\{accountMutationBusy \|\| editMode !== null\}/.test(account));
check("password inputs, modes, Back and submit share one busy fact", /const passwordMutationBusy = auth\.isBusy \|\| sendingCode \|\| submitting/.test(account)
  && (account.match(/disabled=\{passwordMutationBusy\}/g) ?? []).length >= 6);
check("forgot-password reset busy reaches AuthGate root Back", /auth\.isBusy \|\| authFlowTransactionBusy/.test(authGate)
  && /onBusyChange=\{setAuthFlowTransactionBusy\}/.test(authGate)
  && /disabled=\{resetTransactionBusy\}/.test(authGate));
check("final deletion remains topmost and non-dismissible while busy", /variant="destructive"[\s\S]{0,260}dismissible=\{!busy\}/.test(deletion)
  && /pageBackBlocked = busy \|\| sendingCode \|\| stage === "processing"/.test(deletion));
check("account deletion success waits for status readback", /getAccountDeletionStatus\(receiptToken\)/.test(deletion)
  && /result\.status === "completed"/.test(deletion)
  && /setReceiptToken\(result\.receiptToken\);\s*setStage\("processing"\);/.test(deletion)
  && !/setStage\(result\.status === "completed"/.test(deletion));

console.log(`\n${passed} C3 settings/account checks passed`);
