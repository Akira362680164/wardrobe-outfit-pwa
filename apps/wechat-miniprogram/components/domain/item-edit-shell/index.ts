declare const Component: any;

Component({
  options: { multipleSlots: true },
  properties: {
    title: String,
    subtitle: String,
    imageUrl: String,
    imageLabel: String,
    imageFallback: String,
  },
});

export {};
