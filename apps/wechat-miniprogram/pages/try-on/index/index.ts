import { generateTryOnPreview, hasMiniMaxKey } from "../../../services/ai";
import {
  chooseImages,
  cropImageWithNativeEditor,
  uploadPreparedImageAssets,
} from "../../../services/assets";
import {
  createClientMutationId,
  fetchGarments,
  fetchTryOnProfile,
  saveTryOnProfile,
  type MiniGarment,
  type MiniTryOnProfile,
} from "../../../services/workspace";

Page({
  data: {
    loading: false,
    error: "",
    needsSettings: false,
    profile: null as MiniTryOnProfile | null,
    garments: [] as MiniGarment[],
    selectedIds: [] as string[],
    selectedMap: {} as Record<string, boolean>,
    referencePath: "",
    prompt: "",
    preview: "",
    saving: false,
  },
  onLoad() {
    wx.setNavigationBarTitle({ title: "AI 试穿" });
    void this.load();
  },
  async load(this: any) {
    this.setData({ loading: true, error: "", needsSettings: false });
    try {
      const [profile, garments] = await Promise.all([
        fetchTryOnProfile(),
        fetchGarments(),
      ]);
      this.setData({
        loading: false,
        profile,
        garments,
        referencePath: profile?.fullBodyImageUrl || "",
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : "读取试穿资料失败",
      });
    }
  },
  toggleGarment(this: any, event: any) {
    const id = event.currentTarget.dataset.id;
    const ids = this.data.selectedIds as string[];
    const selectedIds = ids.includes(id)
      ? ids.filter((entry) => entry !== id)
      : [...ids, id].slice(-8);
    this.setData({
      selectedIds,
      selectedMap: Object.fromEntries(
        selectedIds.map((entry) => [entry, true]),
      ),
    });
  },
  async chooseReference(this: any) {
    const [image] = await chooseImages(["album", "camera"], 1);
    if (!image) return;
    const cropped = await cropImageWithNativeEditor(image.stablePath);
    if (cropped) this.setData({ referencePath: cropped });
  },
  input(this: any, event: any) {
    this.setData({ prompt: event.detail.value });
  },
  async generate(this: any) {
    if (this.data.loading) return;
    if (!hasMiniMaxKey()) {
      this.setData({
        error: "请先在设置中填写 MiniMax Key",
        needsSettings: true,
      });
      return;
    }
    const selected = (this.data.garments as MiniGarment[]).filter(
      (item) => this.data.selectedMap[item.id],
    );
    if (!this.data.referencePath || !selected.length) {
      this.setData({
        error: "请先选择参考照和至少一件衣物",
        needsSettings: false,
      });
      return;
    }
    this.setData({
      loading: true,
      error: "",
      needsSettings: false,
      preview: "",
    });
    try {
      const result = await generateTryOnPreview({
        referenceImagePath: this.data.referencePath,
        garmentImagePaths: selected
          .map((item) => item.imageUrl)
          .filter(Boolean),
        prompt: this.data.prompt,
      });
      this.setData({ preview: result.imageDataUrl });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "生成失败，请重试";
      this.setData({
        error: message,
        needsSettings: message.includes("MiniMax"),
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  async savePreview(this: any) {
    const profile = this.data.profile as MiniTryOnProfile | null;
    if (!profile || !this.data.preview || this.data.saving) return;
    this.setData({ saving: true });
    try {
      const path = await dataUrlToTempFile(this.data.preview);
      const id = createClientMutationId();
      const fieldName = `tryOnPreview.${id}`;
      const uploaded = await uploadPreparedImageAssets({
        clientMutationId: createClientMutationId(),
        entityType: "profile",
        fieldName,
        originalPath: path,
        processedPath: path,
      });
      const now = new Date().toISOString();
      const refs = [
        ...previewMetadata(profile),
        {
          id,
          fieldName,
          caption: this.data.prompt || "AI 试穿",
          createdAt: now,
          updatedAt: now,
        },
      ];
      const saved = await saveTryOnProfile({
        current: profile,
        clientMutationId: createClientMutationId(),
        payload: { ...profile.rawPayload, tryOnPreviews: refs },
        assetMutations: uploaded.assetMutations,
      });
      this.setData({ profile: saved, saving: false });
      wx.showToast({ title: "试穿预览已保存", icon: "success" });
    } catch (error) {
      this.setData({
        saving: false,
        error: error instanceof Error ? error.message : "保存失败",
      });
    }
  },
  async deletePreview(this: any, event: any) {
    const profile = this.data.profile as MiniTryOnProfile | null;
    const id = event.currentTarget.dataset.id;
    if (!profile || !id) return;
    const target = profile.tryOnPreviews.find((item) => item.id === id);
    if (!target) return;
    const saved = await saveTryOnProfile({
      current: profile,
      clientMutationId: createClientMutationId(),
      payload: {
        ...profile.rawPayload,
        tryOnPreviews: previewMetadata(profile).filter(
          (item) => item.id !== id,
        ),
      },
      assetMutations: [{ kind: "remove", fieldName: target.fieldName }],
    });
    this.setData({ profile: saved });
  },
  openSettings() {
    wx.switchTab({ url: "/pages/settings/index/index" });
  },
});
function previewMetadata(
  profile: MiniTryOnProfile,
): Array<{
  id: string;
  fieldName: string;
  caption?: string;
  createdAt?: string;
  updatedAt?: string;
}> {
  return Array.isArray(profile.rawPayload.tryOnPreviews)
    ? profile.rawPayload.tryOnPreviews.filter(
        (item): item is { id: string; fieldName: string } =>
          Boolean(
            item &&
            typeof item === "object" &&
            "id" in item &&
            "fieldName" in item,
          ),
      )
    : [];
}
function dataUrlToTempFile(dataUrl: string): Promise<string> {
  const match = /^data:image\/([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return Promise.reject(new Error("试穿结果格式无效"));
  const path = `${wx.env.USER_DATA_PATH}/tryon-${Date.now()}.${match[1] === "png" ? "png" : "jpg"}`;
  const fs = wx.getFileSystemManager() as ReturnType<
    typeof wx.getFileSystemManager
  > & {
    writeFile: (options: {
      filePath: string;
      data: string;
      encoding: string;
      success: () => void;
      fail: () => void;
    }) => void;
  };
  return new Promise((resolve, reject) =>
    fs.writeFile({
      filePath: path,
      data: match[2],
      encoding: "base64",
      success: () => resolve(path),
      fail: () => reject(new Error("保存试穿预览失败")),
    }),
  );
}
