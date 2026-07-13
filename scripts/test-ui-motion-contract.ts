#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const scannerRepoRoot = resolve(__dirname, "..");
const root = resolve(process.env.MOTION_CONTRACT_ROOT ?? process.cwd());
const scansExternalRuntime = root !== scannerRepoRoot;
const sourceRoots = ["src/app", "src/components", "src/lib"];

type ViolationCode =
  | "raw-fixed-modal"
  | "native-back-owner"
  | "unnamed-dialog"
  | "raw-press-scale"
  | "reduced-smooth-scroll"
  | "reduced-height-auto"
  | "reduced-stagger"
  | "reduced-infinite-motion"
  | "contract-entrypoint";

interface Violation {
  code: ViolationCode;
  file: string;
  line: number;
  message: string;
}

function listFiles(dir: string): string[] {
  const absolute = join(root, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    const rel = relative(root, path);
    return statSync(path).isDirectory() ? listFiles(rel) : [rel];
  });
}

function lineAt(source: string, index: number): number {
  return source.slice(0, Math.max(0, index)).split("\n").length;
}

function addViolation(
  violations: Violation[],
  code: ViolationCode,
  file: string,
  source: string,
  index: number,
  message: string,
): void {
  violations.push({ code, file, line: lineAt(source, index), message });
}

function jsxTagName(node: ts.JsxOpeningLikeElement, sourceFile: ts.SourceFile): string {
  return node.tagName.getText(sourceFile);
}

function jsxAttribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function jsxAttributeText(
  node: ts.JsxOpeningLikeElement,
  name: string,
  sourceFile: ts.SourceFile,
): string {
  return jsxAttribute(node, name)?.initializer?.getText(sourceFile) ?? "";
}

function hasExplicitAccessibleName(node: ts.JsxOpeningLikeElement): boolean {
  return ["aria-label", "aria-labelledby", "ariaLabel", "ariaLabelledBy"].some((name) => {
    const initializer = jsxAttribute(node, name)?.initializer;
    if (!initializer) return false;
    if (ts.isStringLiteral(initializer)) return initializer.text.trim().length > 0;
    if (!ts.isJsxExpression(initializer) || !initializer.expression) return true;
    if (ts.isStringLiteral(initializer.expression)) return initializer.expression.text.trim().length > 0;
    return !/^(?:false|null|true|undefined)$/.test(initializer.expression.getText());
  });
}

function isInsideJsxTag(
  node: ts.Node,
  tagName: string,
  sourceFile: ts.SourceFile,
): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isJsxElement(current)
      && jsxTagName(current.openingElement, sourceFile) === tagName
    ) return true;
    current = current.parent;
  }
  return false;
}

function containsReducedMotionGate(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let current: ts.Node | undefined = node;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isConditionalExpression(current) && /reduc/i.test(current.condition.getText(sourceFile))) return true;
    if (ts.isIfStatement(current) && /reduc/i.test(current.expression.getText(sourceFile))) return true;
    if (ts.isBinaryExpression(current) && /reduc/i.test(current.left.getText(sourceFile))) return true;
    current = current.parent;
  }
  return false;
}

function propertyName(node: ts.PropertyAssignment, sourceFile: ts.SourceFile): string {
  return node.name.getText(sourceFile).replace(/["']/g, "");
}

function isMotionAnimationObject(
  property: ts.PropertyAssignment,
  source: string,
  sourceFile: ts.SourceFile,
): boolean {
  let current: ts.Node | undefined = property;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isJsxAttribute(current)) {
      return /^(?:initial|animate|exit|variants|transition|while[A-Z])$/.test(current.name.getText(sourceFile));
    }
    if (ts.isPropertyAssignment(current)) {
      if (/^(?:initial|animate|exit|variants|transition)$/.test(propertyName(current, sourceFile))) return true;
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      const escaped = current.name.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:initial|animate|exit|variants|transition)=\\{${escaped}\\}`).test(source);
    }
    current = current.parent;
  }
  return false;
}

function scanTypeScriptSource(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const kind = extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = jsxTagName(node, sourceFile);
      const className = jsxAttributeText(node, "className", sourceFile);

      if (/\bfixed\b/.test(className) && /\binset-0\b/.test(className)) {
        const start = node.getStart(sourceFile);
        if (!isInsideJsxTag(node, "OverlayPortal", sourceFile) || !/\buseOverlayLayer\s*\(/.test(source)) {
          addViolation(
            violations,
            "raw-fixed-modal",
            file,
            source,
            start,
            "fixed inset-0 surface must live inside OverlayPortal and register with useOverlayLayer",
          );
        }
      }

      if (/(?:^|\s|:)active:scale-/.test(className) || jsxAttribute(node, "whileTap")) {
        addViolation(
          violations,
          "raw-press-scale",
          file,
          source,
          node.getStart(sourceFile),
          "press feedback must use AppPressable/app-press-feedback instead of local active:scale or whileTap",
        );
      }

      if (tagName === "MotionSheet" && !hasExplicitAccessibleName(node)) {
        addViolation(
          violations,
          "unnamed-dialog",
          file,
          source,
          node.getStart(sourceFile),
          "every MotionSheet instance must pass ariaLabel or ariaLabelledBy explicitly",
        );
      }

      const role = jsxAttributeText(node, "role", sourceFile);
      if (/["'](?:dialog|alertdialog|menu)["']/.test(role) && !hasExplicitAccessibleName(node)) {
        addViolation(
          violations,
          "unnamed-dialog",
          file,
          source,
          node.getStart(sourceFile),
          `role ${role} must have an explicit accessible name`,
        );
      }

      const variants = jsxAttributeText(node, "variants", sourceFile);
      if (/\bstaggerReveal\b/.test(variants) && !containsReducedMotionGate(node, sourceFile)) {
        addViolation(
          violations,
          "reduced-stagger",
          file,
          source,
          node.getStart(sourceFile),
          "stagger variants must be removed or selected through a nearby reduced-motion branch",
        );
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const listenerName = node.expression.name.text;
      const firstArgument = node.arguments[0];
      if (
        listenerName === "addListener"
        && firstArgument
        && ts.isStringLiteral(firstArgument)
        && firstArgument.text === "backButton"
        && file !== "src/components/overlay-root.tsx"
      ) {
        addViolation(
          violations,
          "native-back-owner",
          file,
          source,
          node.getStart(sourceFile),
          "OverlayRoot is the only allowed native backButton listener owner",
        );
      }
    }

    if (ts.isStringLiteral(node) && node.text === "smooth") {
      let parent: ts.Node | undefined = node.parent;
      let belongsToScrollBehavior = false;
      while (parent && !ts.isSourceFile(parent)) {
        if (ts.isPropertyAssignment(parent) && propertyName(parent, sourceFile) === "behavior") {
          belongsToScrollBehavior = true;
          break;
        }
        parent = parent.parent;
      }
      if (belongsToScrollBehavior && !containsReducedMotionGate(node, sourceFile)) {
        addViolation(
          violations,
          "reduced-smooth-scroll",
          file,
          source,
          node.getStart(sourceFile),
          "programmatic smooth scrolling must choose instant/auto in the same reduced-motion branch",
        );
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node, sourceFile);
      const initializerText = node.initializer.getText(sourceFile);
      if (name === "height" && /^["']auto["'](?:\s+as\s+const)?$/.test(initializerText) && isMotionAnimationObject(node, source, sourceFile)) {
        addViolation(
          violations,
          "reduced-height-auto",
          file,
          source,
          node.getStart(sourceFile),
          "motion variants must not animate height:auto; use position/clip/opacity or instant layout",
        );
      }
      if (name === "staggerChildren" && !containsReducedMotionGate(node, sourceFile)) {
        addViolation(
          violations,
          "reduced-stagger",
          file,
          source,
          node.getStart(sourceFile),
          "staggerChildren requires an adjacent reduced-motion branch",
        );
      }
      if (name === "repeat" && initializerText === "Infinity" && !containsReducedMotionGate(node, sourceFile)) {
        addViolation(
          violations,
          "reduced-infinite-motion",
          file,
          source,
          node.getStart(sourceFile),
          "infinite motion requires an adjacent reduced-motion static branch",
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function scanCssSource(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const rawFullscreen = /[^{}]+\{[^{}]*\bposition:\s*fixed\s*;[^{}]*\binset:\s*0\s*;?[^{}]*\}|[^{}]+\{[^{}]*\binset:\s*0\s*;[^{}]*\bposition:\s*fixed\s*;?[^{}]*\}/g;
  for (const match of source.matchAll(rawFullscreen)) {
    addViolation(
      violations,
      "raw-fixed-modal",
      file,
      source,
      match.index ?? 0,
      "full-screen fixed CSS surfaces must be implemented by the shared OverlayPortal runtime",
    );
  }

  const rawActiveScale = /:active[^{}]*\{[^{}]*\btransform:\s*scale(?:3d)?\(/g;
  for (const match of source.matchAll(rawActiveScale)) {
    addViolation(
      violations,
      "raw-press-scale",
      file,
      source,
      match.index ?? 0,
      "local :active scale feedback is forbidden; use the shared press feedback class",
    );
  }

  if (/scroll-behavior:\s*smooth/.test(source)) {
    const hasReducedOverride = /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?scroll-behavior:\s*(?:auto|initial)/.test(source);
    if (!hasReducedOverride) {
      const index = source.search(/scroll-behavior:\s*smooth/);
      addViolation(
        violations,
        "reduced-smooth-scroll",
        file,
        source,
        index,
        "CSS smooth scrolling requires a prefers-reduced-motion override",
      );
    }
  }

  return violations;
}

function verifyScannerFixtures(): void {
  const raw = scanTypeScriptSource("fixture.tsx", `export function Bad() { return <div className="fixed inset-0 active:scale-95" role="dialog" />; }`);
  assert.ok(raw.some((item) => item.code === "raw-fixed-modal"));
  assert.ok(raw.some((item) => item.code === "raw-press-scale"));
  assert.ok(raw.some((item) => item.code === "unnamed-dialog"));

  const emptyName = scanTypeScriptSource("fixture.tsx", `export const BadSheet = () => <MotionSheet ariaLabel="" />;`);
  assert.ok(emptyName.some((item) => item.code === "unnamed-dialog"));

  const forbiddenMotion = scanTypeScriptSource("fixture.tsx", `
    App.addListener("backButton", () => undefined);
    const bad = <motion.div animate={{ height: "auto" }} transition={{ repeat: Infinity }} variants={staggerReveal} />;
    element.scrollIntoView({ behavior: "smooth" });
  `);
  for (const code of [
    "native-back-owner",
    "reduced-height-auto",
    "reduced-infinite-motion",
    "reduced-stagger",
    "reduced-smooth-scroll",
  ] satisfies ViolationCode[]) {
    assert.ok(forbiddenMotion.some((item) => item.code === code), `fixture must catch ${code}`);
  }

  const forbiddenCss = scanCssSource("fixture.css", `
    .dialog { position: fixed; inset: 0; }
    .button:active { transform: scale(.98); }
    html { scroll-behavior: smooth; }
  `);
  for (const code of ["raw-fixed-modal", "raw-press-scale", "reduced-smooth-scroll"] satisfies ViolationCode[]) {
    assert.ok(forbiddenCss.some((item) => item.code === code), `CSS fixture must catch ${code}`);
  }

  const shared = scanTypeScriptSource("fixture.tsx", `
    function Good() {
      useOverlayLayer({ kind: "fullscreen" });
      return <OverlayPortal><div className="fixed inset-0" role="dialog" aria-label="已命名" /></OverlayPortal>;
    }
  `);
  assert.deepEqual(shared, []);

  const reduced = scanTypeScriptSource("fixture.tsx", `
    const node = <motion.div transition={reduceMotion ? { duration: 0 } : { repeat: Infinity }} />;
    element.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth" });
  `);
  assert.deepEqual(reduced, []);

  const reducedCss = scanCssSource("fixture.css", `
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  `);
  assert.deepEqual(reducedCss, []);
}

function verifyContractEntrypoints(): Violation[] {
  const violations: Violation[] = [];
  const file = "package.json";
  const source = readFileSync(join(root, file), "utf8");
  const pkg = JSON.parse(source) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  const combined = scripts["test:logic:ui-contracts"] ?? "";
  const expected = [
    "test:logic:ui-motion-contract",
    "test:logic:ui-spec-preview",
    "test:logic:ui-token-contract",
    "test:logic:ui-overlay-contract",
    "test:logic:back-priority-regression",
    "test:logic:ui-overflow",
    "test:logic:component-reuse",
  ];
  for (const command of expected) {
    if (!combined.includes(`npm run ${command}`)) {
      addViolation(violations, "contract-entrypoint", file, source, 0, `test:logic:ui-contracts must include ${command}`);
    }
  }
  if (!(scripts["test:logic:all"] ?? "").includes("npm run test:logic:ui-contracts")) {
    addViolation(violations, "contract-entrypoint", file, source, 0, "test:logic:all must include test:logic:ui-contracts");
  }
  return violations;
}

verifyScannerFixtures();

const sourceFiles = sourceRoots
  .flatMap(listFiles)
  .filter((file) => /\.(?:ts|tsx|css)$/.test(file));
const violations = sourceFiles.flatMap((file) => {
  const source = readFileSync(join(root, file), "utf8");
  return extname(file) === ".css"
    ? scanCssSource(file, source)
    : scanTypeScriptSource(file, source);
});

const overlayRoot = "src/components/overlay-root.tsx";
const overlaySource = readFileSync(join(root, overlayRoot), "utf8");
const rootListenerCount = (overlaySource.match(/\.addListener\(\s*["']backButton["']/g) ?? []).length;
if (rootListenerCount !== 1) {
  addViolation(
    violations,
    "native-back-owner",
    overlayRoot,
    overlaySource,
    0,
    `OverlayRoot must own exactly one native backButton listener; found ${rootListenerCount}`,
  );
}

// A cross-worktree runtime probe intentionally validates source only: its package.json
// cannot contain this branch's new gate until integration. Normal in-repo runs still
// enforce both package entrypoints.
if (!scansExternalRuntime) violations.push(...verifyContractEntrypoints());
violations.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.code.localeCompare(right.code));

if (violations.length > 0) {
  console.error(`ui motion contract: ${violations.length} violation(s)`);
  for (const violation of violations) {
    console.error(`  [${violation.code}] ${violation.file}:${violation.line} ${violation.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`ui motion contract: passed (${sourceFiles.length} source files scanned)`);
}
