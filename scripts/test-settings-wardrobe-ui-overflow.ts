import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const app = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const account = readFileSync(join(root, "src/components/auth/account-views.tsx"), "utf8");
const scrollLock = readFileSync(join(root, "src/lib/use-scroll-lock.ts"), "utf8");

assert.match(app, /grid min-w-0 grid-cols-\[minmax\(0,1fr\)\] gap-4/);
assert.match(app, /grid min-w-0 grid-cols-\[minmax\(0,1fr\)\] gap-3\.5 \[&>\.surface\]:shadow-none/);
assert.match(app, /min-w-0 flex-1 truncate text-sm font-semibold text-ink/);
assert.doesNotMatch(app, /<section className="min-w-0 overflow-hidden">/);
assert.match(account, /grid min-w-0 grid-cols-\[minmax\(0,1fr\)\] gap-3\.5/);
assert.match(scrollLock, /lockCount \+= 1;\s*if \(lockCount === 1\) \{\s*try \{\s*applyLock\(\);/);

console.log("settings + wardrobe UI overflow regression: passed");
