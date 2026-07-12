declare const Component: any;

export {};

Component({
  properties: {
    active: { type: Boolean, value: false },
  },
  data: {
    shown: false,
  },
  observers: {
    active(this: any, value: boolean) {
      this.setData({ shown: Boolean(value) });
    },
  },
  methods: {
    beforeLeave(this: any) {
      if (!this.data.active) return;
      this.triggerEvent("back");
      setTimeout(() => {
        if (this.data.active) this.setData({ shown: true });
      }, 0);
    },
  },
});
