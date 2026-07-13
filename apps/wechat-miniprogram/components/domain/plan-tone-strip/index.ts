declare const Component: any;

Component({
  properties: {
    plans: { type: Array, value: [] },
  },
  methods: {
    selectPlan(this: any, event: any) {
      this.triggerEvent("select", { id: String(event.currentTarget.dataset.id || "") });
    },
  },
});

export {};
