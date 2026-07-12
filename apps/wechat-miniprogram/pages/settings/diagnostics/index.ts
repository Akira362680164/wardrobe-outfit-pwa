import { describeDiagnosticError, uploadMiniProgramDiagnostic } from "../../../services/diagnostics";

Page({
  data: {
    rows: [
      "诊断上传必须由用户主动点击并确认。",
      "诊断内容不会包含衣物原图、AI Key、密码或备份文件。",
      "诊断数据只用于定位问题，上传成功后 30 天自动过期。",
    ],
    phase: "idle" as "idle" | "describing" | "building" | "authorizing" | "uploading" | "success" | "failed",
    description: "",
    statusMessage: "",
    caseId: "",
    uploadedAt: "",
    errorMessage: "",
    canSubmit: false,
    confirmOpen: false,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "诊断" });
  },

  startUpload() {
    this.setData({ phase: "describing", statusMessage: "请描述遇到的问题", errorMessage: "" });
  },

  updateDescription(event: WechatMiniprogram.InputEvent) {
    const description = event.detail.value.slice(0, 1000);
    this.setData({ description, canSubmit: description.trim().length > 0 });
  },

  cancelDescription() {
    this.setData({ phase: "idle", statusMessage: "", errorMessage: "" });
  },

  confirmUpload() {
    const description = this.data.description.trim();
    if (!description) {
      wx.showToast({ title: "请先描述遇到的问题", icon: "none" });
      return;
    }
    this.setData({ confirmOpen: true });
  },

  closeConfirm(this: any) {
    if (this.data.phase === "describing") this.setData({ confirmOpen: false });
  },

  confirmUploadNow(this: any) {
    const description = this.data.description.trim();
    this.setData({ confirmOpen: false });
    void this.performUpload(description);
  },

  retryUpload() {
    void this.performUpload(this.data.description.trim());
  },

  async performUpload(description: string) {
    if (!description) {
      this.setData({ phase: "describing", errorMessage: "请描述遇到的问题" });
      return;
    }
    this.setData({ phase: "building", statusMessage: "正在整理诊断数据…", errorMessage: "", caseId: "" });
    try {
      const uploaded = await uploadMiniProgramDiagnostic(description, (progress) => {
        this.setData({ phase: progress.phase, statusMessage: progress.message, caseId: progress.caseId ?? this.data.caseId });
      });
      this.setData({
        phase: "success",
        statusMessage: "上传成功",
        caseId: uploaded.caseId,
        uploadedAt: uploaded.uploadedAt,
        errorMessage: "",
        description: "",
        canSubmit: false,
      });
    } catch (error) {
      const failed = describeDiagnosticError(error);
      this.setData({
        phase: "failed",
        statusMessage: "上传失败",
        caseId: failed.caseId ?? this.data.caseId,
        errorMessage: failed.message,
      });
    }
  },
});
