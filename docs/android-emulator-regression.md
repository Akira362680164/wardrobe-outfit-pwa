# Android Emulator Regression

这套脚本用于补齐 Playwright 浏览器 E2E 覆盖不到的 Android APK / WebView 风险。

## 目标

- 校验 APK 的包名、版本、签名和 SHA-256。
- 验证 APK 能在 `wardrobe-test` 模拟器上安装、启动、退到后台再返回。
- 验证横竖屏切换、返回键、首次启动和清数据重装流程。
- 把崩溃日志和关键截图沉淀到 `test-results/android-emulator/<timestamp>/`。

## 脚本

- `npm run android:verify:metadata`
- `npm run android:verify:launch`
- `npm run android:verify:interaction`
- `npm run android:verify:fresh`
- `npm run android:verify:full`

## 模式说明

### metadata

只校验 APK 信息，不启动模拟器。

检查项：
- `com.wardrobe.outfit`
- `versionName` / `versionCode`
- 固定签名 `CN=fangzheng`
- SHA-256

### launch

自动启动 `wardrobe-test` 或复用现有设备，安装 APK，使用 `am start -W` 打开 App，并检查前台窗口、进程和崩溃日志。

### interaction

在 launch 基础上补充：
- Android 返回键
- 竖屏 / 横屏截图
- 旋转锁定与恢复

### fresh

清除 `com.wardrobe.outfit` 的应用数据后重装并启动，验证首次启动不崩溃。

### full

组合执行 metadata、launch、interaction 和 fresh；如果脚本启动了模拟器，结束时会自动关闭释放资源。

## 结果目录

每次运行都会写入一个独立目录：

```text
test-results/android-emulator/<timestamp>/
```

目录里会有：
- `apk-badging.log`
- `apk-signature.log`
- `apk-sha256.log`
- `adb-devices.log`
- `install.log`
- `launch.log`
- `window-focus.log`
- `logcat-crash.log`
- `portrait.png`
- `landscape.png`
- `summary.md`

## 边界

脚本会优先复用 `ANDROID_SERIAL` 指定设备；未指定时优先选择已连接的 `emulator-*`，没有设备时自动启动 `ANDROID_AVD_NAME`（默认 `wardrobe-test`）。

这套脚本不替代：
- `npm run test:e2e` 的浏览器业务全链路
- 真机厂商权限弹窗
- 相机 / 相册系统选择器
- MiniMax live 调用

它的定位是 APK smoke 与 Android 回归门禁。
