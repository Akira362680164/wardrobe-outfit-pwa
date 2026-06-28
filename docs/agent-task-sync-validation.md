# Agent 任务包：老账号新设备真机同步验证

## 目标

在已连接的 MEIZU 21 Pro 上验证当前 HEAD：用户用老账号登录一台本地数据为空的设备后，衣物、衣橱位置、套装、种草、穿搭计划和试穿参考照能否从云端恢复。

本任务只做验证，不修改业务源码，不自动启动 subagent。发现缺陷只记录，不现场修复。

## 安全边界

- `pm clear`、卸载 App、使用个人参考照、删除云端测试数据前，必须分别获得用户明确确认。
- 清数据前必须确认用户已完成备份，且本机没有尚未同步的重要数据。
- 不读取、记录或回显密码、MiniMax Key、用户照片原图和备份内容。
- 缺少固定签名、APK 元数据不符、存在 tracked 未提交改动、typecheck/构建失败时，停止进入清数据阶段。
- 测试写入使用 `SYNC-<RUN_ID>-` 前缀并记录实体名称；未经确认不清理。
- 报告中的手机号写成 `133****8876`，截图若包含个人数据需在交付说明中标记为本机敏感文件。

## 阶段 0：准备与构建

```bash
set -o pipefail
cd "/Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP"

VERSION=$(node -p "require('./package.json').version")
CURRENT_COMMIT=$(git rev-parse HEAD)
CURRENT_COMMIT_SHORT=$(git rev-parse --short HEAD)
CURRENT_COMMIT_MSG=$(git log -1 --format='%s')
RUN_ID=$(date '+%Y%m%d-%H%M%S')
TEST_DIR="$PWD/review-artifacts/device-test-${VERSION}-${RUN_ID}"
mkdir -p "$TEST_DIR"

git branch --show-current
git status --short
git worktree list
```

允许既有 untracked 文件，但如 `git status --porcelain --untracked-files=no` 非空则停止：构建出的 APK 不能宣称对应当前 HEAD。

读取 `AGENTS.md`、`README.md`、`package.json`、`VERSION_HISTORY.md` 最新接力记录、`android/app/build.gradle`、当前数据写入入口和 `src/lib/cloud-sync/sync-engine.ts`。记录当前存储路径、同步入口及已知风险。

确认固定签名：

```bash
test -f android/signing/wardrobe-fixed.jks
test -f android/signing/wardrobe-signing.properties
```

运行门禁并保留真实退出码：

```bash
npm run typecheck 2>&1 | tee "$TEST_DIR/typecheck.log"
npm run android:apk 2>&1 | tee "$TEST_DIR/android-apk.log"
```

`android:apk` 的 post 脚本会把 release APK 移到 `apk-local/`。从本轮构建日志解析实际路径，不假设项目根目录存在 APK：

```bash
APK_REL=$(sed -n 's/^   APK → \(.*\.apk\) ([0-9.]*MB)$/\1/p' "$TEST_DIR/android-apk.log" | tail -1)
APK=$(cd "$(dirname "$APK_REL")" && pwd)/$(basename "$APK_REL")
test -f "$APK"

BUILD_TOOLS=$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
"$BUILD_TOOLS/aapt" dump badging "$APK" | sed -n '1,3p' | tee "$TEST_DIR/apk-badging.log"
"$BUILD_TOOLS/apksigner" verify --print-certs "$APK" | tee "$TEST_DIR/apk-signature.log"
```

必须确认包名为 `com.wardrobe.outfit`、versionName 等于 `$VERSION`、签名主体包含 `CN=fangzheng`。从 badging 读取：

```bash
APK_VERSION_NAME=$(sed -n "s/.*versionName='\([^']*\)'.*/\1/p" "$TEST_DIR/apk-badging.log" | head -1)
APK_VERSION_CODE=$(sed -n "s/.*versionCode='\([^']*\)'.*/\1/p" "$TEST_DIR/apk-badging.log" | head -1)
```

## 阶段 1：设备与破坏性操作确认

```bash
adb devices -l | tee "$TEST_DIR/adb-devices.log"
SERIAL=481QFGFH23AY7
adb -s "$SERIAL" shell getprop ro.product.model
adb -s "$SERIAL" shell getprop ro.build.version.release
adb -s "$SERIAL" shell dumpsys package com.wardrobe.outfit | rg 'versionCode=|versionName=' | tee "$TEST_DIR/device-version-before.log"
```

只有目标序列号状态为 `device` 且没有第二台已授权设备时才继续。随后暂停并询问用户：

> 即将清除 `com.wardrobe.outfit` 的本地数据，以模拟老账号登录新设备。这会删除手机中尚未同步的衣橱数据、登录状态和本机 MiniMax Key。请确认已备份且允许清除。

没有明确确认不得执行以下命令。确认后只用一次 `pm clear`；不重复卸载：

```bash
adb -s "$SERIAL" shell pm clear com.wardrobe.outfit
adb -s "$SERIAL" install -r "$APK"
adb -s "$SERIAL" logcat -c
adb -s "$SERIAL" shell monkey -p com.wardrobe.outfit -c android.intent.category.LAUNCHER 1
```

用户在手机上自行输入账号密码。Agent 不接触密码。登录后验证 bootstrap、首页数据和无启动崩溃，并保存截图。

## 阶段 2：创建最小数据并验证本地持久化

测试名称统一以前缀 `SYNC-$RUN_ID-` 开头。每类只创建一个最小对象：

| 类型 | 测试名称/内容 | 操作后检查 | 冷启动检查 |
|---|---|---|---|
| 衣物 | `SYNC-$RUN_ID-衣物` | 卡片及图片可见 | 仍可见 |
| 衣橱位置 | `SYNC-$RUN_ID-位置` | 位置可选，测试衣物可归入 | 位置与关联不丢 |
| 套装 | `SYNC-$RUN_ID-套装` | 使用已有两件衣物保存 | 套装、成员和标签不丢 |
| 种草 | `SYNC-$RUN_ID-种草` | 保存一件，不执行转衣橱 | 卡片及图片可见 |
| 穿搭计划 | `SYNC-$RUN_ID-计划` | 创建计划并关联测试套装 | 日期和关联不丢 |
| 试穿参考照 | 使用专用非个人测试图片 | 预览可见 | 图片仍可见 |

每类保存后立即截图。全部创建完成后统一冷启动一次：

```bash
adb -s "$SERIAL" shell am force-stop com.wardrobe.outfit
adb -s "$SERIAL" shell monkey -p com.wardrobe.outfit -c android.intent.category.LAUNCHER 1
```

MiniMax Key 不属于云同步对象，只在附加检查中验证“冷启动保留、清数据后丢失”，且不得回显 Key。

## 阶段 3：云端 push 门禁

清数据前必须证明全部测试对象已推送成功。不能把“页面上可见”当成云端已接收的证据。

至少满足以下证据之一，并在报告中说明来源：

- App 同步状态明确显示完成，且无待处理/冲突/失败；
- 可访问的同步诊断显示本轮 outbox 全部为 `applied`；
- 通过受支持的服务端只读接口查到所有测试名称或实体 ID。

若只能看到模糊 logcat、无法排除 pending/conflict/failed，则本阶段为 `BLOCKED`，不得清数据。记录证据截图或日志，并确认没有 `FATAL EXCEPTION`。

## 阶段 4：一次清数据并集中验证恢复

再次暂停，告知用户已确认 push 成功，并请求第二次清数据授权。确认后：

```bash
adb -s "$SERIAL" shell pm clear com.wardrobe.outfit
adb -s "$SERIAL" logcat -c
adb -s "$SERIAL" shell monkey -p com.wardrobe.outfit -c android.intent.category.LAUNCHER 1
```

用户自行登录 `133****8876`。bootstrap 完成后逐项核对阶段 2 的六类数据：对象本身、关键字段、实体关系和图片预览都必须恢复。逐类截图，不因“卡片数量相同”直接判定通过。

## 阶段 5：附加错误路径（可选，不计入核心同步结论）

仅在用户明确要求并允许继续写入测试数据时执行：

1. 离线保存一件测试衣物，确认本地可见。
2. 恢复联网，等待 push 明确成功，再冷启动确认。
3. 草稿中途强制停止，确认草稿恢复。

不执行“离线保存后立即清数据”作为常规测试：结果必然丢失，且不能提供新的同步链路证据。

## 阶段 6：报告

输出到 `$TEST_DIR/sync-report.md` 和 `$TEST_DIR/sync-report.json`。Markdown 给人阅读；JSON 至少包含：

```json
{
  "runId": "YYYYMMDD-HHMMSS",
  "versionName": "",
  "versionCode": "",
  "commit": "",
  "device": { "serial": "481QFGFH23AY7", "model": "MEIZU 21 Pro", "android": "" },
  "accountMasked": "133****8876",
  "apk": { "path": "", "sha256": "", "signer": "CN=fangzheng" },
  "gates": { "typecheck": "PASS", "build": "PASS", "pushConfirmed": "PASS" },
  "cases": [
    { "type": "garment", "name": "", "created": "PASS", "coldStart": "PASS", "cloudRestore": "PASS", "evidence": [] }
  ],
  "crashes": [],
  "findings": [],
  "notCovered": [],
  "overall": "PASS"
}
```

报告目录名含时间戳，禁止覆盖旧测试。`overall=PASS` 必须同时满足：六类对象均创建成功、冷启动存在、push 有明确证据、清数据后从云端恢复，且无相关崩溃。

测试数据清理是单独的破坏性操作。报告列出测试名称和 ID，由用户决定保留或授权删除；不得自动清理。

## 完成定义

- 当前 HEAD、APK 路径、版本和固定签名均有证据。
- 清数据前后均获得用户明确授权。
- 六类数据完成创建、冷启动、push 门禁和一次集中恢复。
- Markdown 与 JSON 报告存在且互相一致。
- 未修改业务源码；缺陷仅记录。
