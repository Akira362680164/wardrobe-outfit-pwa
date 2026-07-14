import assert from "node:assert/strict";
import fs from "node:fs";

const activity = fs.readFileSync("android/app/src/main/java/com/wardrobe/outfit/MainActivity.java", "utf8");
const styles = fs.readFileSync("android/app/src/main/res/values/styles.xml", "utf8");
const shell = fs.readFileSync("src/components/intake-flow-shell.tsx", "utf8");
const cropEditor = fs.readFileSync("src/components/image-crop-editor.tsx", "utf8");
const globals = fs.readFileSync("src/app/globals.css", "utf8");
const capacitorConfig = fs.readFileSync("capacitor.config.ts", "utf8");

assert.match(activity, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), false\)/);
assert.match(activity, /WindowInsetsCompat\.Type\.systemBars\(\)/);
assert.match(activity, /--android-safe-area-top/);
assert.match(activity, /--android-safe-area-bottom/);
assert.match(activity, /(public|protected) void onResume/);
assert.doesNotMatch(activity, /Build\.MODEL|MEIZU|Pixel|paddingTop|paddingBottom/);
assert.match(styles, /android:statusBarColor[^\n]+transparent/);
assert.match(styles, /android:navigationBarColor[^\n]+transparent/);
assert.match(globals, /--intake-safe-area-top:\s*env\(safe-area-inset-top, 0px\)/);
assert.match(shell, /var\(--intake-safe-area-top, 0px\)/);
assert.doesNotMatch(shell, /paddingTop:\s*"[^"]*--android-safe-area-top/);
assert.match(cropEditor, /pt-\[calc\(var\(--intake-safe-area-top,0px\)\+0\.5rem\)\]/);
assert.match(shell, /var\(--android-safe-area-bottom/);
assert.match(capacitorConfig, /loggingBehavior:\s*"none"/);
console.log("android safe area contract passed");
