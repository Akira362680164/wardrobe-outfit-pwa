declare function App<T extends object>(options: T & { onLaunch?: () => void }): void;
declare function Page<T extends object>(options: T): void;
declare function getApp<T extends object = Record<string, unknown>>(): T;

declare namespace WechatMiniprogram {
  interface SafeArea {
    bottom: number;
  }

  interface SystemInfo {
    safeArea?: SafeArea;
    screenHeight?: number;
    statusBarHeight?: number;
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
  showToast(options: { title: string; icon?: "success" | "error" | "loading" | "none"; duration?: number }): void;
  switchTab(options: { url: string }): void;
  redirectTo(options: { url: string }): void;
  navigateTo(options: { url: string }): void;
  setNavigationBarTitle(options: { title: string }): void;
};
