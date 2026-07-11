package com.wardrobe.outfit;

import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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
        configureEdgeToEdgeInsets();
    }

    @Override
    public void onResume() {
        super.onResume();
        configureEdgeToEdgeInsets();
    }

    private void configureEdgeToEdgeInsets() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            publishInsetsToWebView(bars.top, bars.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
    }

    private void publishInsetsToWebView(int topPx, int bottomPx) {
        if (bridge == null || bridge.getWebView() == null) return;
        String script = "document.documentElement.style.setProperty('--android-safe-area-top','" + topPx + "px');"
            + "document.documentElement.style.setProperty('--android-safe-area-bottom','" + bottomPx + "px');";
        bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(script, null));
    }
}
