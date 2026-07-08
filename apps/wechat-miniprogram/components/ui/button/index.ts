declare const Component: any;
Component({
  options: { multipleSlots: true },
  properties: {
    variant: { type: String, value: "primary" },
    size: { type: String, value: "md" },
    block: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
  },
  methods: {
    onTap(this: any, event: any) {
      if (this.properties.disabled || this.properties.loading) return;
      this.triggerEvent("tap", event.detail);
    },
  },
});

export {};
