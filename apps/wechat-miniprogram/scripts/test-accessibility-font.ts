import assert from "node:assert/strict";
import { accessibilityFontStyle } from "../utils/accessibility-font";

assert.equal(
  accessibilityFontStyle(16),
  "--font-title:44rpx;--font-section:34rpx;--font-body:28rpx;--font-caption:24rpx;--font-label:22rpx",
);
assert.equal(
  accessibilityFontStyle(23),
  "--font-title:63.25rpx;--font-section:48.88rpx;--font-body:40.25rpx;--font-caption:34.5rpx;--font-label:31.63rpx",
);
assert.equal(accessibilityFontStyle(80), accessibilityFontStyle(24));
assert.equal(accessibilityFontStyle(Number.NaN), accessibilityFontStyle(16));

console.log("miniprogram accessibility font scaling passed");
