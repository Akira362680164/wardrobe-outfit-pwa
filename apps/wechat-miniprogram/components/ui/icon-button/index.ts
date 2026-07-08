declare const Component: any;
Component({
  properties: {
    icon: { type: String, value: "settings" },
    label: { type: String, value: "操作" },
    variant: { type: String, value: "ghost" },
    size: { type: String, value: "md" },
    iconSize: { type: Number, value: 40 },
    disabled: { type: Boolean, value: false },
  },
  methods: {
    onTap(this: any, event: any) {
      if (this.properties.disabled) return;
      this.triggerEvent("tap", event.detail);
    },
  },
});

export {};
