#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const stagedOnly = process.argv.includes("--staged");

function lines(output) {
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

const changed = new Set(
  stagedOnly
    ? lines(git(["diff", "--cached", "--name-only"]))
    : [
        ...lines(git(["diff", "--name-only", "HEAD"])),
        ...lines(git(["ls-files", "--others", "--exclude-standard"])),
      ],
);

const numstat = lines(
  stagedOnly ? git(["diff", "--cached", "--numstat"]) : git(["diff", "--numstat", "HEAD"]),
);

let added = 0;
let deleted = 0;
for (const line of numstat) {
  const [a, d] = line.split(/\s+/);
  if (/^\d+$/.test(a)) added += Number(a);
  if (/^\d+$/.test(d)) deleted += Number(d);
}
const totalLines = added + deleted;
const files = [...changed].sort();

const docsOnly = files.length > 0 && files.every((file) => (
  file === ".gitignore" ||
  file === "AGENTS.md" ||
  file === "README.md" ||
  file === "VERSION_HISTORY.md" ||
  file === "CLAUDE.md" ||
  file === "MINIMAX.md" ||
  /^.*\.md$/.test(file)
));

const highRules = [
  ["data/schema/backup", /^(src\/lib\/(db|backup|types)\.ts)$/],
  ["AI/network/privacy", /^(src\/lib\/(device-minimax|image|recommendations)\.ts)$/],
  ["Android/APK/version/build", /^(android\/|capacitor\.config\.ts$|package(-lock)?\.json$)/],
  ["cropper/image/touch", /^(src\/components\/image-crop-editor\.tsx|src\/lib\/cropper-math\.ts)$/],
  ["main mobile app surface", /^src\/components\/wardrobe-app\.tsx$/],
  ["motion or mobile interaction primitives", /^src\/components\/motion-common\.tsx$|^src\/lib\/motion-tokens\.ts$/],
];

const mediumRules = [
  ["source code changed", /^(src\/|app\/|scripts\/)/],
  ["test coverage changed", /^scripts\/test-/],
  ["build config changed", /^(next\.config\.ts|tailwind\.config\.ts|tsconfig\.json|postcss\.config\.mjs)$/],
];

const reasons = [];
let level = "low";

if (files.length === 0) {
  reasons.push("No changed files detected.");
} else if (docsOnly) {
  reasons.push("Docs/history/rules-only change.");
} else {
  for (const [label, pattern] of highRules) {
    if (files.some((file) => pattern.test(file))) {
      reasons.push(`High-risk path: ${label}.`);
      level = "high";
    }
  }

  if (files.length >= 5) {
    reasons.push(`High-risk size: ${files.length} files changed.`);
    level = "high";
  }
  if (totalLines >= 250) {
    reasons.push(`High-risk diff size: ${totalLines} changed lines.`);
    level = "high";
  }

  if (level !== "high") {
    for (const [label, pattern] of mediumRules) {
      if (files.some((file) => pattern.test(file))) {
        reasons.push(`Medium-risk path: ${label}.`);
        level = "medium";
      }
    }
    if (files.length >= 2 || totalLines >= 80) {
      reasons.push(`Medium-risk size: ${files.length} files, ${totalLines} changed lines.`);
      level = "medium";
    }
  }
}

const verdict =
  level === "high"
    ? "Risk gate: HIGH. Strengthen local verification. Start subagent review only if the user explicitly asks for it."
    : level === "medium"
      ? "Risk gate: MEDIUM. Add targeted local verification. Start subagent review only if the user explicitly asks for it."
      : "Risk gate: LOW. Basic checks are usually enough. Do not start subagent review unless the user asks for it.";

console.log(`risk_gate=${level}`);
console.log("subagent_trigger=user_request_only");
console.log(`mode=${stagedOnly ? "staged" : "working-tree"}`);
console.log(`files=${files.length}`);
console.log(`changed_lines=${totalLines}`);
console.log(verdict);
console.log("");
console.log("Reasons:");
for (const reason of reasons) console.log(`- ${reason}`);
if (files.length) {
  console.log("");
  console.log("Changed files:");
  for (const file of files) console.log(`- ${file}`);
}
