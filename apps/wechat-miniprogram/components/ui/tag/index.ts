declare const Component: any;
Component({
  properties: {
    tone: { type: String, value: "primary" },
    selected: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
  },
  methods: {
    onTap(this: any) {
      if (this.properties.disabled) return;
      this.triggerEvent("tap");
    },
  },
});

export {};
