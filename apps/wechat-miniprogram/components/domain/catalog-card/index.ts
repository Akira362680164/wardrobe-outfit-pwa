declare const Component: any;

Component({
  properties: {
    id: String,
    imageUrl: String,
    fallback: String,
    title: String,
    meta: String,
    submeta: String,
    badge: String,
    tone: { type: String, value: "primary" },
  },
  methods: {
    onTap(this: any) {
      this.triggerEvent("select", { id: this.properties.id });
    },
  },
});

export {};
