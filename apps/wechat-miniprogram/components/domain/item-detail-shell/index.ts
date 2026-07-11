declare const Component: any;

Component({
  options: { multipleSlots: true },
  properties: {
    title: String,
    topTitle: String,
    meta: String,
    eyebrow: String,
    imageUrl: String,
    heroLabel: String,
    heroFallback: String,
  },
});

export {};
