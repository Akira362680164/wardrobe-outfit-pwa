import { clampCarouselIndex, getSwipeNextIndex } from "../src/lib/carousel-logic";

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

if (fail > 0) {
  console.error(`\ncarousel logic tests failed: ${fail}/${pass + fail}`);
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`\ncarousel logic tests passed: ${pass}/${pass + fail}`);
