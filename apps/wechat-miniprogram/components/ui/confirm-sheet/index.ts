declare const Component: any;

Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: "请确认" },
    content: { type: String, value: "" },
    cancelText: { type: String, value: "取消" },
    confirmText: { type: String, value: "确认" },
    danger: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
  },
  methods: {
    stop() {},
    onBackdrop(this: any) { if (!this.data.loading) this.triggerEvent("close"); },
    cancel(this: any) { if (!this.data.loading) this.triggerEvent("close"); },
    confirm(this: any) { if (!this.data.loading) this.triggerEvent("confirm"); },
  },
});
