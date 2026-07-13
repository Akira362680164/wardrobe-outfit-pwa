declare const Component: any;

Component({
  properties: {
    card: { type: Object, value: {} },
  },
  methods: {
    selectPlan(this: any, event: any) {
      this.triggerEvent("planselect", { id: String(event.currentTarget.dataset.id || "") });
    },
    openOutfit(this: any, event: any) {
      this.triggerEvent("outfitselect", { id: String(event.currentTarget.dataset.id || "") });
    },
    selectAction(this: any, event: any) {
      this.triggerEvent("action", {
        action: String(event.currentTarget.dataset.action || ""),
        planId: String(event.currentTarget.dataset.planId || ""),
      });
    },
    selectEmptyAction(this: any) {
      this.triggerEvent("action", { action: "empty_primary" });
    },
    deleteBackup(this: any, event: any) {
      this.triggerEvent("backupdelete", { id: String(event.currentTarget.dataset.id || "") });
    },
  },
});

export {};
