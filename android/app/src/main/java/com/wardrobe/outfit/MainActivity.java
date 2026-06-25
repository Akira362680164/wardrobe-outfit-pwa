package com.wardrobe.outfit;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // v0.9.27-dev: 注册新原生插件 NativeProgressNotification,
        // 用于把 App 内耗时任务进度同步到 Android 系统通知栏。
        // NativeMiniMax 仍注册 (用于后台 MiniMax HTTP 请求)。
        registerPlugin(NativeMiniMaxPlugin.class);
        registerPlugin(NativeProgressNotificationPlugin.class);
        registerPlugin(NativeHeicConverterPlugin.class);
        registerPlugin(LongTermBackupPlugin.class);
        registerPlugin(WardrobeSecureStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
