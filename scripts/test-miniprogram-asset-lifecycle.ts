import assert from "node:assert/strict";
import fs from "node:fs";

import { appendImage, clearSession, createIntakeSession, getIntakeSession, removeImage, replaceImage } from "../apps/wechat-miniprogram/services/intake-session";

async function main() {
  const session = createIntakeSession("garment");
  const first = appendImage(session.id, "/tmp/source-a.jpg", "/tmp/processed-a.jpg");
  const second = appendImage(session.id, "/tmp/source-b.jpg", "/tmp/processed-b.jpg");

assert.equal(getIntakeSession(session.id)?.images.length, 2);
assert.equal(replaceImage(session.id, first.id, "/tmp/cropped-a.jpg").processedPath, "/tmp/cropped-a.jpg");
assert.equal(getIntakeSession(session.id)?.images.find((image) => image.id === first.id)?.sourcePath, "/tmp/source-a.jpg");
  await removeImage(session.id, second.id);
assert.equal(getIntakeSession(session.id)?.images.length, 1);
  await clearSession(session.id);
assert.equal(getIntakeSession(session.id), undefined);

const assets = fs.readFileSync("apps/wechat-miniprogram/services/assets.ts", "utf8");
assert.match(assets, /cropImageWithNativeEditor/);
assert.match(assets, /compressImage/);
assert.match(assets, /compressedWidth: 480/);
assert.match(assets, /variant === "thumbnail" \? thumbnailPath : originalPath/);
assert.match(assets, /if \(!status\.ready \|\| uploaded\.length < 2\)/);
assert.match(assets, /method: "DELETE"/);
assert.doesNotMatch(assets, /reuse the selected image as thumbnail/);

  console.log("miniprogram asset lifecycle passed");
}

void main();
