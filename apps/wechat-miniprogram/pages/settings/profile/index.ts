import { HttpError } from "../../../services/http";
import {
  createClientMutationId,
  fetchTryOnProfile,
  saveTryOnProfile,
  type MiniTryOnProfile,
} from "../../../services/workspace";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";

Page({
  data: {
    contentTopRpx: 0,
    loading: false,
    saving: false,
    error: "",
    conflict: false,
    profile: null as MiniTryOnProfile | null,
    fitGender: "unspecified",
    heightCm: "",
    bodyType: "",
    bodyTypeCustom: "",
    shoulderWidth: "",
    legRatio: "",
    hairDescription: "",
    skinToneDescription: "",
    styleNote: "",
    fitOptions: [
      ["menswear", "男装版型"],
      ["womenswear", "女装版型"],
      ["unisex", "中性风格"],
      ["unspecified", "不限定"],
    ],
    bodyOptions: [
      ["slim", "偏瘦"],
      ["balanced", "匀称"],
      ["curvy", "曲线感"],
      ["plus", "丰满"],
      ["custom", "自定义"],
    ],
    shoulderOptions: [
      ["narrow", "偏窄"],
      ["normal", "正常"],
      ["wide", "偏宽"],
    ],
    legOptions: [
      ["short", "偏短"],
      ["normal", "正常"],
      ["long", "偏长"],
    ],
    mutationId: createClientMutationId(),
  },
  onLoad(this: any) {
    this.setData({ contentTopRpx: getCapsuleGeometry().contentTopRpx });
    void this.load();
  },
  async load(this: any) {
    this.setData({ loading: true, error: "" });
    try {
      const p = await fetchTryOnProfile();
      this.setData({
        loading: false,
        profile: p,
        fitGender: p?.fitGender || "unspecified",
        heightCm: p?.heightCm ? String(p.heightCm) : "",
        bodyType: p?.bodyType || "",
        bodyTypeCustom: p?.bodyTypeCustom || "",
        shoulderWidth: p?.shoulderWidth || "",
        legRatio: p?.legRatio || "",
        hairDescription: p?.hairDescription || "",
        skinToneDescription: p?.skinToneDescription || "",
        styleNote: p?.styleNote || "",
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : "读取画像失败",
      });
    }
  },
  input(this: any, event: any) {
    this.setData({
      [event.currentTarget.dataset.field]: event.detail.value,
      mutationId: createClientMutationId(),
      conflict: false,
    });
  },
  choose(this: any, event: any) {
    this.setData({
      [event.currentTarget.dataset.field]: event.currentTarget.dataset.value,
      mutationId: createClientMutationId(),
      conflict: false,
    });
  },
  async save(this: any) {
    if (this.data.saving) return;
    const profile = this.data.profile as MiniTryOnProfile | null;
    this.setData({ saving: true, error: "" });
    try {
      const saved = await saveTryOnProfile({
        current: profile,
        clientMutationId: this.data.mutationId,
        payload: {
          fitGender: this.data.fitGender,
          heightCm: this.data.heightCm ? Number(this.data.heightCm) : undefined,
          bodyType: this.data.bodyType || undefined,
          bodyTypeCustom: this.data.bodyTypeCustom || undefined,
          shoulderWidth: this.data.shoulderWidth || undefined,
          legRatio: this.data.legRatio || undefined,
          hairDescription: this.data.hairDescription || undefined,
          skinToneDescription: this.data.skinToneDescription || undefined,
          styleNote: this.data.styleNote || undefined,
          enabled: profile?.enabled ?? false,
        },
      });
      this.setData({ profile: saved, saving: false, conflict: false });
      wx.showToast({ title: "穿衣画像已保存", icon: "success" });
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 409) {
        const latest = await fetchTryOnProfile();
        this.setData({ profile: latest, saving: false, conflict: true });
        return;
      }
      this.setData({
        saving: false,
        error: error instanceof Error ? error.message : "保存失败",
      });
    }
  },
});
