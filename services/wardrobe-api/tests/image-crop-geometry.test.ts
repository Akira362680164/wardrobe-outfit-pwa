import { describe, expect, it } from "vitest";
import { composeNestedCropBoxes, expandCropBoxEachSide, rotateNormalizedCropBox } from "@wardrobe/cloud-contracts";

describe("shared image crop geometry", () => {
  it("expands twenty percent on every side", () => expectBox(expandCropBoxEachSide({ x: .3, y: .3, width: .2, height: .25 }), { x: .26, y: .25, width: .28, height: .35 }));
  it("clamps edge expansion", () => expect(expandCropBoxEachSide({ x: 0, y: .9, width: .2, height: .1 })).toEqual({ x: 0, y: .88, width: .24000000000000002, height: .12 }));
  it("composes full and center crops", () => { expect(composeNestedCropBoxes({ x: 0, y: 0, width: 1, height: 1 }, { x: .2, y: .3, width: .5, height: .4 })).toEqual({ x: .2, y: .3, width: .49999999999999994, height: .39999999999999997 }); expect(composeNestedCropBoxes({ x: .1, y: .2, width: .5, height: .6 }, { x: .2, y: .25, width: .4, height: .5 })).toEqual({ x: .2, y: .35, width: .2, height: .29999999999999993 }); });
  it("keeps pre-crop for invalid secondary", () => expect(composeNestedCropBoxes({ x: .1, y: .2, width: .5, height: .6 }, { x: .8, y: 0, width: .4, height: 1 })).toEqual({ x: .1, y: .2, width: .5, height: .6 }));
  it("maps 90, 180 and 270 degree rotations", () => { const box = { x: .1, y: .2, width: .3, height: .4 }; expectBox(rotateNormalizedCropBox(box, 90), { x: .4, y: .1, width: .4, height: .3 }); expectBox(rotateNormalizedCropBox(box, 180), { x: .6, y: .4, width: .3, height: .4 }); expectBox(rotateNormalizedCropBox(box, 270), { x: .2, y: .6, width: .4, height: .3 }); });
});

function expectBox(actual: { x: number; y: number; width: number; height: number }, expected: { x: number; y: number; width: number; height: number }) { expect(actual.x).toBeCloseTo(expected.x, 12); expect(actual.y).toBeCloseTo(expected.y, 12); expect(actual.width).toBeCloseTo(expected.width, 12); expect(actual.height).toBeCloseTo(expected.height, 12); }
