declare const Component: any;
Component({
  properties: {
    icon: { type: String, value: "wardrobe" },
    title: { type: String, value: "暂无内容" },
    description: String,
    actionText: String,
    actionVariant: { type: String, value: "secondary" },
  },
  methods: { onAction(this: any) { this.triggerEvent("action"); } },
});

export {};
