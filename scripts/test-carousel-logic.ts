import {
  applyCarouselDragDelta,
  applyCarouselEdgeResistance,
  clampCarouselIndex,
  estimateGestureVelocity,
  getSwipeNextIndex,
  projectGestureEndpoint,
  recordGestureVelocitySample,
  resolveCarouselImageSource,
  resolveCarouselRelease,
  resolveGestureAxisIntent,
  rubberBandDistance,
  unRubberBandDistance,
  type GestureVelocitySample,
} from "../src/lib/carousel-logic";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function checkEq<T>(name: string, actual: T, expected: T): void {
  if (Object.is(actual, expected)) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push(`${name}: actual=${String(actual)} expected=${String(expected)}`);
    console.log(`  ❌ ${name}: actual=${String(actual)} expected=${String(expected)}`);
  }
}

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("\n=== carousel index clamp ===");
checkEq("empty slides clamp to 0", clampCarouselIndex(3, 0), 0);
checkEq("negative index clamp to first", clampCarouselIndex(-1, 3), 0);
checkEq("third thumbnail selects third image", clampCarouselIndex(2, 3), 2);
checkEq("index beyond last clamps to last", clampCarouselIndex(4, 3), 2);
checkEq("NaN index clamps to first", clampCarouselIndex(Number.NaN, 3), 0);

console.log("\n=== carousel swipe next index ===");
checkEq("last image cannot swipe beyond last", getSwipeNextIndex(2, "next", 3), 2);
checkEq("first image cannot swipe before first", getSwipeNextIndex(0, "previous", 3), 0);
checkEq("second image swipes to third", getSwipeNextIndex(1, "next", 3), 2);
checkEq("second image swipes back to first", getSwipeNextIndex(1, "previous", 3), 0);
checkEq("add slide counted once", clampCarouselIndex(3, 4), 3);

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
  "detail pointerdown keeps original display source",
  resolveCarouselImageSource({ ...imageSources, variant: "detail", isDragging: true }),
  imageSources.displaySrc,
);
checkEq(
  "review at rest uses original display source",
  resolveCarouselImageSource({ ...imageSources, variant: "review", isDragging: false }),
  imageSources.displaySrc,
);

console.log("\n=== carousel axis intent ===");
checkEq("movement inside 9px dead zone stays pending", resolveGestureAxisIntent(8, 2), "pending");
checkEq("horizontal movement locks after threshold", resolveGestureAxisIntent(10, 2), "horizontal");
checkEq("vertical page scroll wins", resolveGestureAxisIntent(5, 12), "vertical");
checkEq("near diagonal waits for a clearer intent", resolveGestureAxisIntent(12, 11.5), "pending");

console.log("\n=== carousel rubber band ===");
const edge60 = applyCarouselEdgeResistance(60, 3, 390);
const edge180 = applyCarouselEdgeResistance(180, 3, 390);
check("edge drag stays in finger direction", edge60 > 0);
check("edge drag is resisted", edge60 < 60 && edge180 < 180);
check("edge resistance grows progressively", edge180 / 180 < edge60 / 60);
const roundTrip = unRubberBandDistance(rubberBandDistance(125, 390), 390);
check("rubber-band curve has stable interruption inverse", Math.abs(roundTrip - 125) < 0.001, String(roundTrip));
const interrupted = applyCarouselDragDelta(edge60, 0, 3, 390);
check("new pointer takes over edge presentation without a jump", Math.abs(interrupted - edge60) < 0.001, `${interrupted} vs ${edge60}`);

console.log("\n=== carousel short velocity history ===");
const samples: GestureVelocitySample[] = [];
for (const sample of [
  { position: 0, time: 0 },
  { position: -40, time: 30 },
  { position: -80, time: 60 },
  { position: -68, time: 80 },
  { position: -38, time: 100 },
]) recordGestureVelocitySample(samples, sample);
const reversalVelocity = estimateGestureVelocity(samples);
check("fast reversal discards the old direction", reversalVelocity > 0, String(reversalVelocity));
const oldSamples: GestureVelocitySample[] = [];
recordGestureVelocitySample(oldSamples, { position: 0, time: 0 });
recordGestureVelocitySample(oldSamples, { position: -100, time: 20 });
recordGestureVelocitySample(oldSamples, { position: -100, time: 200 });
check("holding before release decays old flick velocity", Math.abs(estimateGestureVelocity(oldSamples)) < 600, String(estimateGestureVelocity(oldSamples)));

console.log("\n=== carousel projected release ===");
const projected = projectGestureEndpoint(-60, -700);
check("Apple projection continues in release direction", projected < -60, String(projected));
const slowRelease = resolveCarouselRelease({ positionX: -48, velocityX: -80, currentIndex: 0, slideCount: 3, pageWidth: 390 });
checkEq("slow short drag springs back", slowRelease.targetIndex, 0);
const flickRelease = resolveCarouselRelease({ positionX: -48, velocityX: -700, currentIndex: 0, slideCount: 3, pageWidth: 390 });
checkEq("short fast flick advances", flickRelease.targetIndex, 1);
checkEq("release target is exact page snap", flickRelease.targetX, -390);
const reverseRelease = resolveCarouselRelease({ positionX: -250, velocityX: 900, currentIndex: 1, slideCount: 3, pageWidth: 390 });
checkEq("reverse flick returns to previous page", reverseRelease.targetIndex, 0);
const lastEdge = resolveCarouselRelease({ positionX: -850, velocityX: -1200, currentIndex: 2, slideCount: 3, pageWidth: 390 });
checkEq("last page cannot project beyond the edge", lastEdge.targetIndex, 2);

if (fail > 0) {
  console.error(`\ncarousel logic tests failed: ${fail}/${pass + fail}`);
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`\ncarousel logic tests passed: ${pass}/${pass + fail}`);
