import { calculateSubPageTopBarLayout, getCapsuleGeometry } from "../../../utils/capsule-layout";

declare const Component: any;

Component({
  options: { multipleSlots: true },
  properties: {
    title: String,
    subtitle: String,
    centeredTitle: { type: Boolean, value: false },
    showBack: { type: Boolean, value: true },
    guardedBack: { type: Boolean, value: false },
    hasRightAction: { type: Boolean, value: false },
    rightActionWidthRpx: { type: Number, value: 96 },
  },
  data: {
    topRpx: 0,
    heightRpx: 88,
    rightSlotRpx: 112,
    titleLeftRpx: 96,
    titleRightRpx: 96,
  },
  lifetimes: {
    attached(this: any) {
      this.updateGeometry();
    },
  },
  pageLifetimes: {
    show(this: any) {
      this.updateGeometry();
    },
  },
  methods: {
    updateGeometry(this: any) {
      const geometry = getCapsuleGeometry();
      const layout = calculateSubPageTopBarLayout(
        geometry,
        Boolean(this.data.hasRightAction),
        Number(this.data.rightActionWidthRpx) || 96,
      );
      this.setData({
        topRpx: geometry.topRpx,
        heightRpx: geometry.heightRpx,
        rightSlotRpx: layout.rightSlotRpx,
        titleLeftRpx: layout.titleLeftRpx,
        titleRightRpx: layout.titleRightRpx,
      });
    },
    requestBack(this: any) {
      this.triggerEvent("back");
    },
  },
});

export {};
