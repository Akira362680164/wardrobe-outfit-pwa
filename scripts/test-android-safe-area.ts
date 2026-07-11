import assert from "node:assert/strict";
import fs from "node:fs";

const activity = fs.readFileSync("android/app/src/main/java/com/wardrobe/outfit/MainActivity.java", "utf8");
const styles = fs.readFileSync("android/app/src/main/res/values/styles.xml", "utf8");
const shell = fs.readFileSync("src/components/intake-flow-shell.tsx", "utf8");

assert.match(activity, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), false\)/);
assert.match(activity, /WindowInsetsCompat\.Type\.systemBars\(\)/);
assert.match(activity, /--android-safe-area-top/);
assert.match(activity, /--android-safe-area-bottom/);
assert.match(activity, /(public|protected) void onResume/);
assert.doesNotMatch(activity, /Build\.MODEL|MEIZU|Pixel|paddingTop|paddingBottom/);
assert.match(styles, /android:statusBarColor[^\n]+transparent/);
assert.match(styles, /android:navigationBarColor[^\n]+transparent/);
assert.match(shell, /max\(env\(safe-area-inset-top/);
assert.match(shell, /var\(--android-safe-area-bottom/);
console.log("android safe area contract passed");
