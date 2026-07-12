import {
  chooseImages,
  uploadPreparedImageAssets,
  type AssetMutation,
} from "../../../services/assets";
import {
  createClientMutationId,
  fetchTryOnProfile,
  saveTryOnProfile,
  type MiniTryOnProfile,
} from "../../../services/workspace";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";
import { consumeCropResult, startCropJob } from "../../../stores/crop-job";

type Target = "fullBody" | "face";
Page({
  data: {
    contentTopRpx: 0,
    loading: false,
    saving: false,
    error: "",
    profile: null as MiniTryOnProfile | null,
    enabled: false,
    fullBodyPath: "",
    facePath: "",
    cropTarget: "" as Target | "",
    removeFields: [] as string[],
  },
  onLoad(this: any) {
    this.setData({ contentTopRpx: getCapsuleGeometry().contentTopRpx });
    void this.load();
  },
  onShow(this: any) {
    const target = this.data.cropTarget as Target | "";
    if (!target) return;
    const result = consumeCropResult("profile", target);
    if (!result) { this.setData({ cropTarget: "" }); return; }
    this.setData(target === "fullBody" ? { fullBodyPath: result.processedPath, cropTarget: "" } : { facePath: result.processedPath, cropTarget: "" });
  },
  async load(this: any) {
    this.setData({ loading: true, error: "" });
    try {
      const p = await fetchTryOnProfile();
      this.setData({
        loading: false,
        profile: p,
        enabled: p?.enabled ?? false,
        fullBodyPath: p?.fullBodyImageUrl || "",
        facePath: p?.faceImageUrl || "",
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : "读取参考照失败",
      });
    }
  },
  toggle(this: any, event: any) {
    this.setData({ enabled: event.detail.value });
  },
  async choose(this: any, event: any) {
    const target = event.currentTarget.dataset.target as Target;
    const [image] = await chooseImages(["album", "camera"], 1);
    if (!image) return;
    this.setData({ cropTarget: target });
    const job = startCropJob({ target: "profile", targetId: target, sourcePath: image.stablePath, rotationDeg: 0, cropRatio: "3:4" });
    wx.navigateTo({ url: `/pages/intake/crop/index?jobId=${encodeURIComponent(job.id)}` });
  },
  preview(this: any, event: any) {
    const current = event.currentTarget.dataset.src;
    if (current)
      (
        wx as typeof wx & {
          previewImage: (o: { current: string; urls: string[] }) => void;
        }
      ).previewImage({
        current,
        urls: [this.data.fullBodyPath, this.data.facePath].filter(Boolean),
      });
  },
  remove(this: any, event: any) {
    const target = event.currentTarget.dataset.target as Target;
    const field =
      target === "fullBody" ? "fullBodyImageDataUrl" : "faceImageDataUrl";
    this.setData(
      target === "fullBody"
        ? { fullBodyPath: "", removeFields: [...this.data.removeFields, field] }
        : { facePath: "", removeFields: [...this.data.removeFields, field] },
    );
  },
  async save(this: any) {
    if (this.data.saving) return;
    const profile = this.data.profile as MiniTryOnProfile | null;
    this.setData({ saving: true, error: "" });
    try {
      const mutations: AssetMutation[] = [
        ...new Set(this.data.removeFields as string[]),
      ].map((fieldName) => ({ kind: "remove" as const, fieldName }));
      for (const [target, path] of [
        ["fullBody", this.data.fullBodyPath],
        ["face", this.data.facePath],
      ] as const) {
        const old =
          target === "fullBody"
            ? profile?.fullBodyImageUrl
            : profile?.faceImageUrl;
        if (path && path !== old) {
          const fieldName =
            target === "fullBody" ? "fullBodyImageDataUrl" : "faceImageDataUrl";
          const uploaded = await uploadPreparedImageAssets({
            clientMutationId: createClientMutationId(),
            entityType: "profile",
            fieldName,
            originalPath: path,
            processedPath: path,
          });
          mutations.push(...uploaded.assetMutations);
        }
      }
      const saved = await saveTryOnProfile({
        current: profile,
        clientMutationId: createClientMutationId(),
        payload: { ...(profile?.rawPayload ?? {}), enabled: this.data.enabled },
        assetMutations: mutations,
      });
      this.setData({
        profile: saved,
        saving: false,
        removeFields: [],
        fullBodyPath: saved.fullBodyImageUrl,
        facePath: saved.faceImageUrl,
      });
      wx.showToast({ title: "参考照片已保存", icon: "success" });
    } catch (error) {
      this.setData({
        saving: false,
        error: error instanceof Error ? error.message : "保存失败",
      });
    }
  },
});
