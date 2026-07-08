declare const Component: any;
Component({
  properties: {
    label: String,
    value: { type: String, value: "" },
    placeholder: String,
    type: { type: String, value: "text" },
    hint: String,
    error: String,
    disabled: { type: Boolean, value: false },
    maxlength: { type: Number, value: -1 },
    clearable: { type: Boolean, value: true },
  },
  methods: {
    onInput(this: any, event: any) {
      const value = event.detail.value;
      this.triggerEvent("input", { value });
      this.triggerEvent("change", { value });
    },
    onFocus(this: any, event: any) { this.triggerEvent("focus", event.detail); },
    onBlur(this: any, event: any) { this.triggerEvent("blur", event.detail); },
    onClear(this: any) {
      this.triggerEvent("input", { value: "" });
      this.triggerEvent("change", { value: "" });
      this.triggerEvent("clear");
    },
  },
});

export {};
