import { getCapsuleGeometry } from "../../../utils/capsule-layout";

declare const Component: any;

Component({
  options: { multipleSlots: true },
  properties: {
    title: String,
    subtitle: String,
    showBack: { type: Boolean, value: true },
    guardedBack: { type: Boolean, value: false },
  },
  data: {
    topRpx: 0,
    heightRpx: 88,
    rightSlotRpx: 112,
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
      this.setData({
        topRpx: geometry.topRpx,
        heightRpx: geometry.heightRpx,
        rightSlotRpx: geometry.rightInsetRpx + 16,
      });
    },
    requestBack(this: any) {
      this.triggerEvent("back");
    },
  },
});

export {};
