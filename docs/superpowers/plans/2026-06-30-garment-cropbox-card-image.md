# Garment Crop Box and Card Image Implementation Plan

> **For agentic workers:** Execute inline in the current session. Do not start a subagent unless the user explicitly requests one.

**Goal:** Make every newly recorded wardrobe item persist a normalized crop box and make the wardrobe home card render its thumbnail instead of the complete original image.

**Architecture:** Normalize a missing crop box only at the new-garment persistence boundary, leaving drafts and all existing records untouched. Move the carousel source-selection branch into the existing pure `carousel-logic.ts` module so card/detail/review behavior has a runnable regression test, then reuse it from the React carousel.

**Tech Stack:** TypeScript, React 19, Next.js 15, Node `assert`, Capacitor Android.

## Global Constraints

- Only newly recorded wardrobe garments receive the default full-image crop box `{ x: 0, y: 0, width: 1, height: 1 }`.
- Do not migrate, backfill, rewrite, or normalize existing garment records.
- Keep `imageDataUrl` as the complete original image and `thumbnailDataUrl` as the card/list image.
- An automatically assigned full-image crop box keeps `cropRevision = 0`; a real user crop keeps the existing revision semantics.
- Do not change Dexie or Workspace schemas and do not add dependencies.
- Do not start a subagent; the user has not requested one.
- Do not make intermediate commits. Commit the complete code, tests, version history, and this plan once after all local gates pass.
- Do not install or test the APK on an Android emulator or physical device. The user will perform Android acceptance testing.
- Build and inspect the fixed-signature APK for user delivery, but record Android interaction as unverified.

---

## File Structure

- Modify `src/lib/intake-save-adapters.ts`: normalize the crop box at the new wardrobe-item save boundary.
- Modify `src/lib/carousel-logic.ts`: own the pure card/detail/review image-source decision.
- Modify `src/components/swipe-image-carousel.tsx`: consume the tested source-selection helper.
- Modify `scripts/test-intake-draft.ts`: verify cropped and uncropped new-item persistence semantics.
- Modify `scripts/test-carousel-logic.ts`: verify card/detail/review source selection.
- Modify `package.json` and `package-lock.json`: bump `2.0.17-test` to `2.0.18-test` for APK delivery.
- Modify `VERSION_HISTORY.md`: record implementation, local gates, APK facts, risk, and user-owned Android acceptance.
- Keep `docs/superpowers/plans/2026-06-30-garment-cropbox-card-image.md` uncommitted until the final code commit.

---

### Task 1: Add failing persistence and carousel-source regressions

**Files:**
- Modify: `scripts/test-intake-draft.ts`
- Modify: `scripts/test-carousel-logic.ts`

**Interfaces:**
- Consumes: `garmentDraftToWardrobeItem(draft, options)` from `src/lib/intake-save-adapters.ts`.
- Produces: required behavior for `resolveCarouselImageSource(input)` to be implemented in Task 2.

- [ ] **Step 1: Add the uncropped full-image crop-box assertion**

Immediately after the existing uncropped revision assertions in `scripts/test-intake-draft.ts`, add:

```ts
assert.deepEqual(
  uncroppedWardrobeItem.cropBox,
  { x: 0, y: 0, width: 1, height: 1 },
  "未裁切新单品应保存全图 cropBox",
);
```

- [ ] **Step 2: Add carousel source-selection tests**

Update the import in `scripts/test-carousel-logic.ts`:

```ts
import {
  clampCarouselIndex,
  getSwipeNextIndex,
  resolveCarouselImageSource,
} from "../src/lib/carousel-logic";
```

Before the final failure check, add:

```ts
console.log("\n=== carousel image source ===");
const imageSources = {
  imageDataUrl: "data:image/webp;base64,THUMB",
  thumbnailSrc: "data:image/webp;base64,THUMB",
  displaySrc: "data:image/jpeg;base64,ORIGINAL",
};
checkEq(
  "card always uses thumbnail source",
  resolveCarouselImageSource({ ...imageSources, variant: "card", isDragging: false }),
  imageSources.thumbnailSrc,
);
checkEq(
  "detail at rest uses original display source",
  resolveCarouselImageSource({ ...imageSources, variant: "detail", isDragging: false }),
  imageSources.displaySrc,
);
checkEq(
  "detail while dragging uses thumbnail source",
  resolveCarouselImageSource({ ...imageSources, variant: "detail", isDragging: true }),
  imageSources.thumbnailSrc,
);
checkEq(
  "review at rest uses original display source",
  resolveCarouselImageSource({ ...imageSources, variant: "review", isDragging: false }),
  imageSources.displaySrc,
);
```

- [ ] **Step 3: Run both tests and verify they fail for the intended reasons**

Run:

```bash
npx tsx scripts/test-intake-draft.ts
npx tsx scripts/test-carousel-logic.ts
```

Expected:

- `test-intake-draft.ts` fails because the uncropped item currently has no `cropBox`.
- `test-carousel-logic.ts` fails to compile because `resolveCarouselImageSource` does not exist.

Do not commit.

---

### Task 2: Normalize new garment data and fix card image selection

**Files:**
- Modify: `src/lib/intake-save-adapters.ts`
- Modify: `src/lib/carousel-logic.ts`
- Modify: `src/components/swipe-image-carousel.tsx`

**Interfaces:**
- Produces: `resolveCarouselImageSource(input: CarouselImageSourceInput): string`.
- Consumes: the existing `GarmentIntakeDraft`, `WardrobeItem`, and `SwipeImageCarouselVariant` value set.

- [ ] **Step 1: Normalize only newly saved garment records**

In `garmentDraftToWardrobeItem`, compute the crop fields before the returned object:

```ts
const cropBox = draft.cropBox ?? { x: 0, y: 0, width: 1, height: 1 };
const cropRevision = draft.cropRevision ?? (draft.cropBox ? 1 : 0);
```

Use those values in the returned `WardrobeItem`:

```ts
cropBox,
cropRevision,
thumbnailCropRevision: draft.thumbnailCropRevision ?? cropRevision,
```

Do not change `wishlistDraftToWishlistItem`, `garmentDraftToWishlistItem`, Workspace mappers, migrations, backfill, or read-time normalization.

- [ ] **Step 2: Add the pure carousel source selector**

Append to `src/lib/carousel-logic.ts`:

```ts
export type CarouselImageVariant = "card" | "detail" | "review";

export interface CarouselImageSourceInput {
  variant: CarouselImageVariant;
  isDragging: boolean;
  imageDataUrl: string;
  thumbnailSrc?: string;
  displaySrc?: string;
}

export function resolveCarouselImageSource(input: CarouselImageSourceInput): string {
  if (input.variant === "card") return input.thumbnailSrc ?? input.imageDataUrl;
  if (input.isDragging && input.thumbnailSrc) return input.thumbnailSrc;
  return input.displaySrc ?? input.imageDataUrl;
}
```

This helper must never fall back from a card thumbnail to `displaySrc`, because `displaySrc` is the complete original image.

- [ ] **Step 3: Reuse the helper in the carousel**

Extend the existing import from `@/lib/carousel-logic` in `src/components/swipe-image-carousel.tsx`:

```ts
import {
  clampCarouselIndex,
  getSwipeNextIndex,
  resolveCarouselImageSource,
} from "@/lib/carousel-logic";
```

Replace the current `src` conditional with:

```ts
const src = resolveCarouselImageSource({
  variant,
  isDragging,
  imageDataUrl: slide.imageDataUrl,
  thumbnailSrc: slide.thumbnailSrc,
  displaySrc: slide.displaySrc,
});
```

Do not change the earlier `original-cropped` branch. Cropped and uncropped detail images must continue through `OriginalCroppedImage`.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npx tsx scripts/test-intake-draft.ts
npx tsx scripts/test-carousel-logic.ts
npm run test:logic:images
npm run test:logic:detail-shell
```

Expected: all commands exit `0`; carousel tests report all four source-selection cases passed.

Do not commit.

---

### Task 3: Version, local gates, signed APK, and one final commit

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `VERSION_HISTORY.md`
- Include: `docs/superpowers/plans/2026-06-30-garment-cropbox-card-image.md`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: version `2.0.18-test`, fixed-signature APK `衣橱穿搭助手-v2.0.18-test.apk`, and one complete Git commit.

- [ ] **Step 1: Bump the package version**

Run:

```bash
npm version 2.0.18-test --no-git-tag-version
```

Expected: both `package.json` and the root package entries in `package-lock.json` become `2.0.18-test`; no Git commit or tag is created.

- [ ] **Step 2: Run all local quality gates**

Run sequentially:

```bash
npm run typecheck
npm run test:logic:all
npm run build
git diff --check
node scripts/review-gate.mjs
```

Expected:

- Every command exits `0`.
- Review gate reports `high` because this changes mobile image behavior and APK delivery.
- No Android emulator or physical device is started.

- [ ] **Step 3: Build and inspect the fixed-signature APK without installing it**

First verify the signing inputs exist:

```bash
test -f android/signing/wardrobe-fixed.jks
test -f android/signing/wardrobe-signing.properties
```

Then build:

```bash
npm run android:apk
```

Copy the release artifact:

```bash
cp android/app/build/outputs/apk/release/app-release.apk "衣橱穿搭助手-v2.0.18-test.apk"
```

Inspect it without ADB:

```bash
BUILD_TOOLS="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
"$BUILD_TOOLS/aapt" dump badging "衣橱穿搭助手-v2.0.18-test.apk" | sed -n '1,3p'
"$BUILD_TOOLS/apksigner" verify --print-certs "衣橱穿搭助手-v2.0.18-test.apk"
shasum -a 256 "衣橱穿搭助手-v2.0.18-test.apk"
```

Expected:

- Package: `com.wardrobe.outfit`.
- `versionName=2.0.18-test` and `versionCode=20018`.
- Signer DN contains `CN=fangzheng`.
- APK exists at the project root and is not staged.

- [ ] **Step 4: Update the version history**

Add a new top entry to `VERSION_HISTORY.md` containing:

- Version transition `2.0.17-test -> 2.0.18-test` and Android `20017 -> 20018`.
- Root cause: card variant selected `displaySrc` instead of the thumbnail.
- New-data rule: missing crop boxes become `{ x: 0, y: 0, width: 1, height: 1 }` only in `garmentDraftToWardrobeItem`.
- Explicit exclusions: no old-record migration, backfill, read-time normalization, or schema change.
- Exact results from the targeted tests, full logic suite, typecheck, build, review gate, APK inspection, signer, file size, and SHA-256.
- Risk gate: `high`.
- `未触发 subagent：用户未通知。`
- Unverified risk: per the user's instruction, no emulator or physical-device installation was performed; the user owns Android acceptance.

- [ ] **Step 5: Review and stage only this task's files**

Run:

```bash
git status --short
git diff -- src/lib/intake-save-adapters.ts src/lib/carousel-logic.ts src/components/swipe-image-carousel.tsx scripts/test-intake-draft.ts scripts/test-carousel-logic.ts package.json package-lock.json VERSION_HISTORY.md docs/superpowers/plans/2026-06-30-garment-cropbox-card-image.md
git diff --check
```

Stage only:

```bash
git add -- \
  src/lib/intake-save-adapters.ts \
  src/lib/carousel-logic.ts \
  src/components/swipe-image-carousel.tsx \
  scripts/test-intake-draft.ts \
  scripts/test-carousel-logic.ts \
  package.json \
  package-lock.json \
  VERSION_HISTORY.md \
  docs/superpowers/plans/2026-06-30-garment-cropbox-card-image.md
```

Confirm `衣橱穿搭助手-v2.0.18-test.apk` is not staged.

- [ ] **Step 6: Create the single final commit**

Run:

```bash
git diff --cached --check
git diff --cached --stat
git commit -m "v2.0.18-test fix garment card crop display"
```

Expected: one commit contains the complete implementation, tests, plan, package version, and version history. No generated asset or APK is committed.
