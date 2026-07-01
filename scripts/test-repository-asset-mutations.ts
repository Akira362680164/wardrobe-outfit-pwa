import assert from "node:assert/strict";

import { resolveAssetMutations, withoutImages } from "../src/lib/repository/wardrobe-repository";

const currentAsset = "11111111-1111-4111-8111-111111111111";
const reusedAsset = "22222222-2222-4222-8222-222222222222";
const temporaryAsset = "33333333-3333-4333-8333-333333333333";
const mapping = [{ formalField: "mainImage", assetField: "imageDataUrl", originalField: "localOriginalDataUrl", thumbnailField: "localThumbnailDataUrl" }];
const current = { mainImage: { asset: { assetId: currentAsset } } };

assert.deepEqual(resolveAssetMutations({
  current,
  patch: { localThumbnailDataUrl: "data:image/png;base64,thumb" },
  mappings: mapping,
  inputs: [{ fieldName: "imageDataUrl", variant: "thumbnail", image: "data:image/png;base64,thumb" }],
  uploaded: [{ kind: "create_or_replace", fieldName: "imageDataUrl", temporaryAssetIds: [temporaryAsset] }],
}), [{ kind: "update_thumbnail", fieldName: "imageDataUrl", assetId: currentAsset, temporaryAssetId: temporaryAsset }]);

assert.deepEqual(resolveAssetMutations({ current, patch: { mainImage: undefined }, mappings: mapping, inputs: [], uploaded: [] }), [
  { kind: "remove", fieldName: "imageDataUrl" },
]);
assert.deepEqual(resolveAssetMutations({ current, patch: { mainImage: { asset: { assetId: reusedAsset } } }, mappings: mapping, inputs: [], uploaded: [] }), [
  { kind: "reuse", fieldName: "imageDataUrl", assetId: reusedAsset },
]);

const currentReferenceAsset = "44444444-4444-4444-8444-444444444444";
const nextReferenceAsset = "55555555-5555-4555-8555-555555555555";
assert.deepEqual(resolveAssetMutations({
  current: { referenceOutfitImages: [
    { id: "keep", image: { asset: { assetId: currentReferenceAsset } } },
    { id: "remove", image: { asset: { assetId: currentReferenceAsset } } },
  ] },
  patch: { referenceOutfitImages: [
    { id: "keep", image: { asset: { assetId: nextReferenceAsset } } },
    { id: "upload", localOriginalDataUrl: "data:image/png;base64,new" },
  ] },
  mappings: [],
  listMappings: [{ collectionField: "referenceOutfitImages", fieldName: (id) => `referenceOutfitImage:${id}` }],
  inputs: [{ fieldName: "referenceOutfitImage:upload", variant: "original", image: "data:image/png;base64,new" }],
  uploaded: [{ kind: "create_or_replace", fieldName: "referenceOutfitImage:upload", temporaryAssetIds: [temporaryAsset] }],
}), [
  { kind: "reuse", fieldName: "referenceOutfitImage:keep", assetId: nextReferenceAsset },
  { kind: "create_or_replace", fieldName: "referenceOutfitImage:upload", temporaryAssetIds: [temporaryAsset] },
  { kind: "remove", fieldName: "referenceOutfitImage:remove" },
]);

assert.deepEqual(resolveAssetMutations({
  current: { fullBodyImage: { asset: { assetId: currentAsset } } },
  patch: { fullBodyImage: undefined },
  mappings: [{ formalField: "fullBodyImage", assetField: "fullBodyImageDataUrl", originalField: "localFullBodyImageDataUrl" }],
  inputs: [],
  uploaded: [],
}), [{ kind: "remove", fieldName: "fullBodyImageDataUrl" }]);
assert.deepEqual(resolveAssetMutations({
  patch: { localOriginalDataUrl: "data:image/png;base64,raw" }, mappings: mapping,
  inputs: [{ fieldName: "imageDataUrl", variant: "original", image: "data:image/png;base64,raw" }],
  uploaded: [{ kind: "create_or_replace", fieldName: "imageDataUrl", temporaryAssetIds: [temporaryAsset] }],
}), [{ kind: "create_or_replace", fieldName: "imageDataUrl", temporaryAssetIds: [temporaryAsset] }]);

const payload = withoutImages({
  name: "测试",
  localOriginalDataUrl: "data:image/png;base64,raw",
  localThumbnailDataUrl: "data:image/png;base64,thumb",
  localCropBox: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
  mainImage: { asset: { assetId: currentAsset } },
  serverEntityId: "entity",
  serverRevision: 2,
}, "cropBox");
assert.deepEqual(payload, { name: "测试", cropBox: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 } });
assert.equal(Object.keys(payload).some((key) => key.startsWith("local")), false);

console.log("repository asset mutation semantics passed");
