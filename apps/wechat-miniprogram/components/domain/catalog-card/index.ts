declare const Component: any;

Component({
  properties: {
    id: String,
    itemId: String,
    imageUrl: String,
    fallback: String,
    title: String,
    meta: String,
    submeta: String,
    badge: String,
    categoryLabel: String,
    colors: { type: Array, value: null },
    summary: String,
    tone: { type: String, value: "primary" },
  },
  methods: {
    onTap(this: any) {
      this.triggerEvent("select", { id: this.properties.itemId || this.properties.id });
    },
  },
});

export {};
