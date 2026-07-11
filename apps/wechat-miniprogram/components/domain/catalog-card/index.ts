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
    selected: Boolean,
  },
  methods: {
    onTap(this: any) {
      this.triggerEvent("select", { id: this.properties.itemId || this.properties.id });
    },
    onLongPress(this: any) {
      this.triggerEvent("longpress", { id: this.properties.itemId || this.properties.id });
    },
  },
});

export {};
