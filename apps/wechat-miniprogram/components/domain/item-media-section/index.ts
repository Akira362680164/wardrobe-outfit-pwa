declare const Component: any;

Component({
  properties: { imageUrl: String, inspirationImages: Array },
  methods: {
    preview(this: any, event: any) { this.triggerEvent("preview", event.currentTarget.dataset); },
    add(this: any) { this.triggerEvent("add"); },
    remove(this: any, event: any) { this.triggerEvent("remove", event.currentTarget.dataset); },
  },
});
export {};
