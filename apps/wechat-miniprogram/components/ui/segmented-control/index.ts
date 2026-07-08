declare const Component: any;
Component({
  properties: {
    options: { type: Array, value: [] },
    value: { type: String, value: "" },
  },
  methods: {
    onSelect(this: any, event: any) {
      const value = event.currentTarget.dataset.value;
      if (!value || value === this.properties.value) return;
      this.triggerEvent("change", { value });
    },
  },
});

export {};
