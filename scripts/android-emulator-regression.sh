#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-full}"
APK_PATH="${APK_PATH:-}"
SERIAL="${ANDROID_SERIAL:-}"
AVD_NAME="${ANDROID_AVD_NAME:-wardrobe-test}"
PACKAGE_NAME="com.wardrobe.outfit"
RESULTS_DIR="${RESULTS_DIR:-$ROOT_DIR/test-results/android-emulator}"
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$RESULTS_DIR/$STAMP"
STARTED_EMULATOR="false"

mkdir -p "$RUN_DIR"

log() { printf '%s\n' "$*"; }
fail() { log "❌ $*"; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"; }

case "$MODE" in
  metadata|launch|interaction|fresh|full) ;;
  *) fail "未知模式：$MODE，可选：metadata / launch / interaction / fresh / full" ;;
esac

require_cmd adb
require_cmd shasum
require_cmd rg

ANDROID_HOME_VALUE="${ANDROID_HOME:-}"
[[ -n "$ANDROID_HOME_VALUE" ]] || fail "缺少 ANDROID_HOME"

EMULATOR_BIN="$ANDROID_HOME_VALUE/emulator/emulator"
BUILD_TOOLS="$(find "$ANDROID_HOME_VALUE/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
[[ -n "$BUILD_TOOLS" && -d "$BUILD_TOOLS" ]] || fail "找不到 Android build-tools"

AAPT="$BUILD_TOOLS/aapt"
APKSIGNER="$BUILD_TOOLS/apksigner"
[[ -x "$AAPT" ]] || fail "缺少 aapt：$AAPT"
[[ -x "$APKSIGNER" ]] || fail "缺少 apksigner：$APKSIGNER"

cleanup() {
  if [[ "$STARTED_EMULATOR" == "true" && -n "${SERIAL:-}" ]]; then
    adb -s "$SERIAL" emu kill >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

find_apk() {
  if [[ -n "$APK_PATH" ]]; then
    printf '%s\n' "$APK_PATH"
    return
  fi
  find "$ROOT_DIR" \( -path "$ROOT_DIR/apk-local/*.apk" -o -path "$ROOT_DIR/衣橱穿搭助手-v*.apk" \) -type f 2>/dev/null | sort | tail -1 || true
}

select_device() {
  if [[ -n "$SERIAL" ]]; then
    printf '%s\n' "$SERIAL"
    return
  fi
  local emulator_serial
  emulator_serial="$(adb devices | awk 'NR>1 && $1 ~ /^emulator-/ && $2=="device" {print $1; exit}')"
  if [[ -n "$emulator_serial" ]]; then
    printf '%s\n' "$emulator_serial"
    return
  fi
  adb devices | awk 'NR>1 && $2=="device" {print $1; exit}'
}

start_emulator_if_needed() {
  SERIAL="$(select_device)"
  if [[ -n "$SERIAL" ]]; then
    log "使用已有设备：$SERIAL"
    return
  fi

  [[ -x "$EMULATOR_BIN" ]] || fail "缺少 emulator：$EMULATOR_BIN"
  "$EMULATOR_BIN" -list-avds > "$RUN_DIR/avd-list.log"
  rg -qx "$AVD_NAME" "$RUN_DIR/avd-list.log" || fail "找不到 AVD：$AVD_NAME"

  log "启动模拟器：$AVD_NAME"
  "$EMULATOR_BIN" -avd "$AVD_NAME" -no-window -no-audio -no-boot-anim > "$RUN_DIR/emulator.log" 2>&1 &
  STARTED_EMULATOR="true"

  for _ in {1..60}; do
    SERIAL="$(adb devices | awk 'NR>1 && $1 ~ /^emulator-/ && $2=="device" {print $1; exit}')"
    [[ -n "$SERIAL" ]] && break
    sleep 2
  done
  [[ -n "$SERIAL" ]] || fail "模拟器启动超时：adb 未发现 device"

  for _ in {1..90}; do
    local booted
    booted="$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n' || true)"
    [[ "$booted" == "1" ]] && return
    sleep 2
  done
  fail "模拟器启动超时：sys.boot_completed != 1"
}

assert_no_crash() {
  local source_log="$1"
  local crash_log="$2"
  rg 'FATAL EXCEPTION|AndroidRuntime|Process: com\.wardrobe\.outfit' "$source_log" > "$crash_log" || true
  if [[ -s "$crash_log" ]]; then
    fail "发现 Android 致命日志：$crash_log"
  fi
}

launch_app() {
  local log_file="$1"
  adb -s "$SERIAL" shell am start -W -n "$PACKAGE_NAME/.MainActivity" > "$log_file" 2>&1 ||     adb -s "$SERIAL" shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1 >> "$log_file" 2>&1 || true
}

APK_PATH="$(find_apk)"
[[ -n "$APK_PATH" ]] || fail "未找到 APK，请通过 APK_PATH 指定"
[[ -f "$APK_PATH" ]] || fail "APK 不存在：$APK_PATH"

BADGING="$RUN_DIR/apk-badging.log"
SIGNATURE="$RUN_DIR/apk-signature.log"
"$AAPT" dump badging "$APK_PATH" > "$BADGING"
"$APKSIGNER" verify --print-certs "$APK_PATH" > "$SIGNATURE"

PKG_NAME="$(sed -n "s/^package: name='\([^']*\)'.*/\1/p" "$BADGING" | head -1)"
VERSION_NAME="$(sed -n "s/^package: name='[^']*' versionCode='[^']*' versionName='\([^']*\)'.*/\1/p" "$BADGING" | head -1)"
VERSION_CODE="$(sed -n "s/^package: name='[^']*' versionCode='\([^']*\)'.*/\1/p" "$BADGING" | head -1)"
PACKAGE_JSON_VERSION="$(node -e "console.log(require('./package.json').version)" 2>/dev/null || true)"

[[ "$PKG_NAME" == "$PACKAGE_NAME" ]] || fail "包名不匹配：$PKG_NAME"
[[ -n "$VERSION_NAME" && -n "$VERSION_CODE" ]] || fail "无法读取 APK 版本信息"
[[ "$VERSION_NAME" == "$PACKAGE_JSON_VERSION" ]] || fail "APK versionName=$VERSION_NAME 与 package.json=$PACKAGE_JSON_VERSION 不一致"
rg -q "CN=fangzheng" "$SIGNATURE" || fail "APK 签名未包含 CN=fangzheng"
shasum -a 256 "$APK_PATH" | tee "$RUN_DIR/apk-sha256.log" >/dev/null

cat > "$RUN_DIR/summary.md" <<SUMMARY
# Android Emulator Regression

- Mode: $MODE
- APK: $APK_PATH
- Package: $PKG_NAME
- Version: $VERSION_NAME ($VERSION_CODE)
- Results: $RUN_DIR
SUMMARY

log "=== Android 模拟器回归 ==="
log "模式：$MODE"
log "APK：$APK_PATH"
log "包名：$PKG_NAME"
log "版本：$VERSION_NAME ($VERSION_CODE)"
log "结果目录：$RUN_DIR"

if [[ "$MODE" == "metadata" ]]; then
  log "✅ metadata 校验完成"
  exit 0
fi

adb devices -l > "$RUN_DIR/adb-devices-before.log"
start_emulator_if_needed
adb devices -l > "$RUN_DIR/adb-devices-after.log"
adb -s "$SERIAL" get-state >/dev/null
adb -s "$SERIAL" shell getprop ro.build.version.release > "$RUN_DIR/device-android-version.log"
adb -s "$SERIAL" shell getprop ro.product.model > "$RUN_DIR/device-model.log"
adb -s "$SERIAL" shell dumpsys package "$PACKAGE_NAME" | rg 'versionCode=|versionName=' > "$RUN_DIR/device-package-before.log" || true

if [[ "$MODE" == "fresh" ]]; then
  adb -s "$SERIAL" shell pm clear "$PACKAGE_NAME" > "$RUN_DIR/pm-clear.log" || true
fi

adb -s "$SERIAL" install -r "$APK_PATH" > "$RUN_DIR/install.log"
adb -s "$SERIAL" logcat -c
launch_app "$RUN_DIR/launch.log"
sleep 8
adb -s "$SERIAL" shell dumpsys window | rg 'mCurrentFocus|mFocusedApp' > "$RUN_DIR/window-focus.log" || true
adb -s "$SERIAL" shell dumpsys package "$PACKAGE_NAME" | rg 'versionCode=|versionName=' > "$RUN_DIR/device-package-after.log" || true
adb -s "$SERIAL" shell pidof "$PACKAGE_NAME" > "$RUN_DIR/pid.log" || true
adb -s "$SERIAL" logcat -d -t 1000 > "$RUN_DIR/logcat-target.log"
assert_no_crash "$RUN_DIR/logcat-target.log" "$RUN_DIR/logcat-crash.log"
[[ -s "$RUN_DIR/pid.log" ]] || fail "App 未启动进程"
rg -q "$PACKAGE_NAME" "$RUN_DIR/window-focus.log" || fail "前台窗口不是 $PACKAGE_NAME"

if [[ "$MODE" == "interaction" || "$MODE" == "full" ]]; then
  adb -s "$SERIAL" shell input keyevent KEYCODE_BACK > "$RUN_DIR/back-press.log" || true
  launch_app "$RUN_DIR/relaunch-after-back.log"
  sleep 2
  adb -s "$SERIAL" shell settings put system accelerometer_rotation 0 > "$RUN_DIR/rotate-lock.log" || true
  adb -s "$SERIAL" shell settings put system user_rotation 0 > "$RUN_DIR/portrait-lock.log" || true
  sleep 1
  adb -s "$SERIAL" exec-out screencap -p > "$RUN_DIR/portrait.png" || true
  adb -s "$SERIAL" shell settings put system user_rotation 1 > "$RUN_DIR/landscape-lock.log" || true
  sleep 2
  adb -s "$SERIAL" exec-out screencap -p > "$RUN_DIR/landscape.png" || true
  adb -s "$SERIAL" shell settings put system accelerometer_rotation 1 > "$RUN_DIR/rotation-restore.log" || true
  adb -s "$SERIAL" logcat -d -t 1000 > "$RUN_DIR/logcat-after-interaction.log"
  assert_no_crash "$RUN_DIR/logcat-after-interaction.log" "$RUN_DIR/logcat-crash-after-interaction.log"
fi

if [[ "$MODE" == "fresh" || "$MODE" == "full" ]]; then
  adb -s "$SERIAL" shell pm clear "$PACKAGE_NAME" > "$RUN_DIR/pm-clear-after.log" || true
  adb -s "$SERIAL" logcat -c
  launch_app "$RUN_DIR/launch-after-clear.log"
  sleep 4
  adb -s "$SERIAL" logcat -d -t 1000 > "$RUN_DIR/logcat-after-clear.log"
  assert_no_crash "$RUN_DIR/logcat-after-clear.log" "$RUN_DIR/logcat-crash-after-clear.log"
fi

cat >> "$RUN_DIR/summary.md" <<SUMMARY

## Device

- Serial: $SERIAL
- Android: $(cat "$RUN_DIR/device-android-version.log" 2>/dev/null || true)
- Model: $(cat "$RUN_DIR/device-model.log" 2>/dev/null || true)
- Started emulator by script: $STARTED_EMULATOR

## Artifacts

- apk-badging.log
- apk-signature.log
- apk-sha256.log
- install.log
- launch.log
- window-focus.log
- logcat-crash.log
- portrait.png / landscape.png when interaction/full
SUMMARY

log "✅ Android 模拟器回归完成"
log "结果目录：$RUN_DIR"
