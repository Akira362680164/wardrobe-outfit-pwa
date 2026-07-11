declare const Component: any;

Component({
  options: { multipleSlots: true },
  properties: {
    title: String,
    subtitle: String,
    imageUrl: String,
    imageLabel: String,
    imageFallback: String,
    guardedBack: Boolean,
  },
  methods: { onBack(this: any) { this.triggerEvent("back"); } },
});

export {};
