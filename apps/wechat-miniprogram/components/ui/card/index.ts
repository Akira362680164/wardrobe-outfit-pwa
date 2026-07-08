declare const Component: any;
Component({
  options: { multipleSlots: true },
  properties: {
    variant: { type: String, value: "surface" },
    title: String,
    subtitle: String,
    pressable: { type: Boolean, value: false },
    selected: { type: Boolean, value: false },
  },
  methods: {
    onTap(this: any, event: any) {
      if (!this.properties.pressable) return;
      this.triggerEvent("tap", event.detail);
    },
  },
});

export {};
