declare const Component: any;
Component({
  properties: {
    open: { type: Boolean, value: false },
    title: String,
    description: String,
    showClose: { type: Boolean, value: true },
    closeOnMask: { type: Boolean, value: true },
    strong: { type: Boolean, value: true },
  },
  methods: {
    noop() {},
    onMaskTap(this: any) {
      if (!this.properties.closeOnMask) return;
      this.triggerEvent("close");
    },
    onClose(this: any) { this.triggerEvent("close"); },
  },
});

export {};
