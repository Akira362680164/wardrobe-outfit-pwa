# Android、APK 与真实设备验证

本文承接本机根 `AGENTS.md` 的 Android 操作细则。强制边界仍以 `AGENTS.md` 为准；凡涉及 Android 原生代码、Capacitor 同步、移动端高风险交互或 APK 交付，必须继续阅读本文。

## 1. 适用范围与最低门禁

- 逻辑、类型或数据结构改动：运行 `npm run typecheck` 和相关逻辑测试。
- UI、路由、构建或 Capacitor 同步：运行 `npm run build`。
- APK 交付：递增 `package.json` 版本，检查固定签名文件，运行 `npm run android:apk`，并把产物按 `衣橱穿搭助手-vX.Y.Z.apk` 放在项目根目录。
- Android、图片显示、网络恢复、裁切、同步、返回键或触摸交互等高风险链路：必须安装真实 APK，在模拟器或真机完成验证；浏览器 Dev Server 只能用于迭代，不能代替最终 Android 验收。
- 测试完成后必须记录设备、Android 版本、APK 元数据、安装方式、覆盖路径、日志摘要和未覆盖风险。

## 2. 固定签名与 APK 元数据

- 应用包名为 `com.wardrobe.outfit`，应用名保持 `衣橱穿搭助手`，除非用户明确要求变更。
- `android/app/build.gradle` 从 `package.json` 推导 `versionName` 和 `versionCode`，不得手工制造不一致版本。
- debug/release 均必须使用 `android/signing/wardrobe-fixed.jks`、`android/signing/wardrobe-signing.properties` 和 alias `wardrobe-fixed`，签名者 CN 必须为 `fangzheng`。
- 固定签名文件缺失时必须停止构建并询问用户，不得临时生成新 key 或退回默认 debug keystore。
- APK、keystore、签名 properties、`android/local.properties`、Gradle build 目录和 `android/app/src/main/assets/public` 不进入 Git。

构建前检查：

```bash
test -f android/signing/wardrobe-fixed.jks
test -f android/signing/wardrobe-signing.properties
npm run android:apk
```

产物元数据检查：

```bash
APK="项目内待安装 APK 的绝对路径"
BUILD_TOOLS="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
"$BUILD_TOOLS/aapt" dump badging "$APK" | sed -n '1,3p'
"$BUILD_TOOLS/apksigner" verify --print-certs "$APK"
```

## 3. 模拟器启动

本机已知 AVD 为 `wardrobe-test`（Pixel 6 / API 35 / arm64-v8a / Google APIs），`ANDROID_HOME=/Users/fangzheng/Library/Android/sdk`。

```bash
"$ANDROID_HOME/emulator/emulator" -list-avds
"$ANDROID_HOME/emulator/emulator" -avd wardrobe-test -no-window -no-audio -no-boot-anim &

until adb devices 2>/dev/null | grep -q 'device$'; do sleep 2; done
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')" = "1" ]; do sleep 2; done

adb devices -l
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
```

若 AVD 不存在，先确认本机 SDK 状态再创建；不得在未确认磁盘和网络条件时擅自安装大型系统镜像。

## 4. 安装、启动与日志

多设备环境必须显式指定序列号：

```bash
adb devices -l
SERIAL="目标设备序列号"
APK="项目内待安装 APK 的绝对路径"

adb -s "$SERIAL" install -r "$APK"
adb -s "$SERIAL" logcat -c
adb -s "$SERIAL" shell monkey -p com.wardrobe.outfit -c android.intent.category.LAUNCHER 1
adb -s "$SERIAL" shell dumpsys package com.wardrobe.outfit | rg 'versionCode=|versionName='
adb -s "$SERIAL" shell dumpsys window | rg 'mCurrentFocus|mFocusedApp'
adb -s "$SERIAL" shell pidof com.wardrobe.outfit
adb -s "$SERIAL" logcat -d -t 1000 | rg 'FATAL|AndroidRuntime|com\.wardrobe\.outfit' > "<log_file>"
```

验证至少覆盖启动、本次改动主路径、Android 返回键、竖屏窄屏和崩溃/严重错误日志。横屏不再是默认验收目标，除非用户明确要求。

## 5. 清数据、卸载与线上恢复

涉及首次启动、登录、线上读取、数据恢复或持久化边界时必须覆盖清数据或卸载重装：

```bash
adb -s "$SERIAL" shell pm clear com.wardrobe.outfit
# 或者需要完全重装时：
adb -s "$SERIAL" uninstall com.wardrobe.outfit
adb -s "$SERIAL" install "$APK"
```

重新登录后确认业务数据和图片直接从服务器恢复，且没有创建本地业务数据库、Outbox、持久图片缓存或隐藏同步队列。不得主动读取或导出设备上的 MiniMax Key、用户照片、衣橱数据和备份文件。

## 6. 真实 APK E2E

`android:verify:full` 只覆盖 APK 元数据、签名、安装、启动、前台窗口、logcat、返回键、截图和清数据启动，不等同于完整业务链路。

- `npm run android:e2e:smoke`：注册/退出/重登、默认衣橱、主 Tab 和全局新建入口。
- `npm run android:e2e:critical`：单品、种草、套装计划、穿着一致性、账号隔离和进程恢复。
- `npm run android:e2e:full`：串行执行 Smoke、Critical 和完整图片/删除引用/故障重试/幂等/无 Key/返回键链路。
- `npm run android:e2e:ai-live`：只有显式设置 `ALLOW_LIVE_AI_TEST=true E2E_AI_MODE=live ANDROID_E2E_AI_LIVE=1 MINIMAX_API_KEY=...` 才允许运行。

业务 E2E 默认必须指向测试 API，不得指向生产 API。常用变量包括 `APK_PATH`、`ANDROID_E2E_API_BASE_URL`、`ANDROID_SERIAL`、`APK_EXPECTED_SIGNER_CN=fangzheng` 和 `RESULTS_DIR`。故障注入只允许在明确的测试环境和 `E2E_FAULT_TOKEN` 下运行。

## 7. 真机安装常见阻塞

- `adb devices -l` 显示 `device` 只证明 USB 调试已授权，不代表 USB 安装已授权。
- `Performing Streamed Install` 长时间不返回时，先提醒用户保持手机解锁并处理系统安装确认，不要反复更改安全设置。
- `INSTALL_FAILED_USER_RESTRICTED` 通常表示用户拒绝了该包安装。可以只读检查 `adb shell settings get secure usb_install_item_com.wardrobe.outfit`，但不得用 `settings put` 绕过手机确认。
- 相机、通知等运行时权限与 USB 安装权限不同；必须在用户真实触发功能时由系统申请，Agent 不得批量越权授权。

## 8. 收口

- 模拟器验证完成后执行 `adb -s emulator-5554 emu kill` 释放资源。
- 在 `VERSION_HISTORY.md` 记录真实覆盖范围和未验证风险；没有跑真机/模拟器时不得写成 Android 已通过。
- 最终回复只摘要 APK 路径、版本、签名、设备、验证路径和风险，不复制用户数据或整份日志。
