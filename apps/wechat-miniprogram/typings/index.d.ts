declare function App<T extends object>(options: T & { onLaunch?: () => void }): void;
type MiniPageData<T> = T extends { data: infer D } ? D : Record<string, unknown>;
type MiniPageInstance<T> = T & {
  data: MiniPageData<T>;
  setData(data: Partial<MiniPageData<T>>): void;
};

declare function Page<T extends object>(options: T & ThisType<MiniPageInstance<T>>): void;
declare function getApp<T extends object = Record<string, unknown>>(): T;

declare namespace WechatMiniprogram {
  interface SafeArea {
    bottom: number;
  }

  interface SystemInfo {
    safeArea?: SafeArea;
    model?: string;
    platform?: string;
    screenHeight?: number;
    statusBarHeight?: number;
    system?: string;
  }

  interface RequestSuccessCallbackResult<T = unknown> {
    statusCode: number;
    data: T;
    header?: Record<string, string>;
  }

  interface UploadFileSuccessCallbackResult {
    statusCode: number;
    data: string;
    header?: Record<string, string>;
  }

  interface LoginSuccessCallbackResult {
    code?: string;
    errMsg?: string;
  }

  interface GetPhoneNumberEvent {
    detail: {
      code?: string;
      errMsg?: string;
    };
  }

  interface InputEvent {
    detail: {
      value: string;
    };
  }

  interface ChooseMediaTempFile {
    tempFilePath: string;
    size: number;
    fileType?: "image" | "video";
  }

  interface GetFileInfoSuccessCallbackResult {
    size: number;
    digest: string;
  }

  interface GetImageInfoSuccessCallbackResult {
    width: number;
    height: number;
    path: string;
  }

  interface DownloadFileSuccessCallbackResult {
    statusCode: number;
    tempFilePath: string;
    header?: Record<string, string>;
  }

  interface FileSystemManager {
    readFile(options: {
      filePath: string;
      success(result: { data: ArrayBuffer | string }): void;
      fail(error: unknown): void;
    }): void;
  }
}

declare const wx: {
  getSystemInfoSync(): WechatMiniprogram.SystemInfo;
  request<T = unknown>(options: {
    url: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    data?: unknown;
    header?: Record<string, string>;
    timeout?: number;
    success(result: WechatMiniprogram.RequestSuccessCallbackResult<T>): void;
    fail(error: unknown): void;
  }): void;
  uploadFile(options: {
    url: string;
    filePath: string;
    name: string;
    formData?: Record<string, string>;
    header?: Record<string, string>;
    timeout?: number;
    success(result: WechatMiniprogram.UploadFileSuccessCallbackResult): void;
    fail(error: unknown): void;
  }): void;
  downloadFile(options: {
    url: string;
    header?: Record<string, string>;
    timeout?: number;
    success(result: WechatMiniprogram.DownloadFileSuccessCallbackResult): void;
    fail(error: unknown): void;
  }): void;
  chooseMedia(options: {
    count?: number;
    mediaType?: Array<"image" | "video">;
    sourceType?: Array<"album" | "camera">;
    success(result: { tempFiles: WechatMiniprogram.ChooseMediaTempFile[] }): void;
    fail(error: unknown): void;
  }): void;
  getFileInfo(options: {
    filePath: string;
    digestAlgorithm?: "md5" | "sha1" | "sha256";
    success(result: WechatMiniprogram.GetFileInfoSuccessCallbackResult): void;
    fail(error: unknown): void;
  }): void;
  getImageInfo(options: {
    src: string;
    success(result: WechatMiniprogram.GetImageInfoSuccessCallbackResult): void;
    fail(error: unknown): void;
  }): void;
  getFileSystemManager(): WechatMiniprogram.FileSystemManager;
  login(options: {
    success(result: WechatMiniprogram.LoginSuccessCallbackResult): void;
    fail(error: unknown): void;
  }): void;
  showToast(options: { title: string; icon?: "success" | "error" | "loading" | "none"; duration?: number }): void;
  switchTab(options: { url: string }): void;
  redirectTo(options: { url: string }): void;
  navigateTo(options: { url: string }): void;
  navigateBack(options?: { delta?: number }): void;
  setNavigationBarTitle(options: { title: string }): void;
};
