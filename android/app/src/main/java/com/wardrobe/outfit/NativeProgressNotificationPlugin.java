package com.wardrobe.outfit;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.HashMap;
import java.util.Map;

/**
 * NativeProgressNotification (v0.9.27-dev)
 *
 * 统一的"App 内耗时任务 → Android 系统通知栏"桥接层。
 * 取代 v0.9.26 之前由 NativeMiniMaxForegroundService 提供的通用
 * "AI 请求正在后台处理中" 通知, 改为按 taskId 区分的 per-task 通知。
 *
 * 设计目标:
 *  - 浏览器 / 非 Android 原生环境: 所有方法直接 no-op, 不抛错。
 *  - 通知 channel: wardrobe_progress, importance LOW (无响铃 / 振动)。
 *  - 每个 taskId 映射到固定 int notificationId, 避免重复创建。
 *  - 软进度 ≤ 99% 时 ongoing=true, 系统不能轻易清掉。
 *  - complete / fail 自动解除 ongoing + 短暂停留 (1500 / 2500ms) 后消失。
 *  - 所有更新走 setOnlyAlertOnce(true), 不重复响铃。
 *  - Android 13+ (TIRAMISU) 需要 POST_NOTIFICATIONS 运行时权限。
 *
 * 通知内容脱敏:
 *  - 通知栏是公共区域, 调用方必须自己先 sanitize (见
 *    src/lib/native-progress-notification.ts 的 sanitizeText / sanitizeTitle)。
 *  - Java 侧再做一次长度截断作为最后兜底。
 */
@CapacitorPlugin(
    name = "NativeProgressNotification",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class NativeProgressNotificationPlugin extends Plugin {
    private static final String CHANNEL_ID = "wardrobe_progress";
    private static final String CHANNEL_NAME = "任务进度";
    private static final String CHANNEL_DESCRIPTION = "AI 识别 / 备份等耗时任务的进度通知";

    private static final int NOTIFICATION_ID_BASE = 1001;
    // Auto-dismiss 持续时间 (毫秒)
    private static final long COMPLETE_AUTO_DISMISS_MS = 1500L;
    private static final long FAIL_AUTO_DISMISS_MS = 2500L;

    // taskId → notificationId 稳定映射, 让同一 taskId 重复任务覆盖旧通知。
    private static final Map<String, Integer> TASK_ID_TO_NOTIFICATION = new HashMap<>();
    static {
        TASK_ID_TO_NOTIFICATION.put("garment_detection", 1001);
        TASK_ID_TO_NOTIFICATION.put("batch_garment_detection", 1002);
        TASK_ID_TO_NOTIFICATION.put("shopping_image_analysis", 1003);
        TASK_ID_TO_NOTIFICATION.put("shopping_assessment", 1004);
        TASK_ID_TO_NOTIFICATION.put("outfit_recommendation", 1005);
        TASK_ID_TO_NOTIFICATION.put("wardrobe_diagnosis", 1006);
        TASK_ID_TO_NOTIFICATION.put("try_on_preview", 1007);
        TASK_ID_TO_NOTIFICATION.put("backup_export", 1008);
        TASK_ID_TO_NOTIFICATION.put("backup_import", 1009);
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void ensurePermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Android < 13: 不需要运行时权限
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            String taskId = requiredTaskId(call);
            String title = readString(call, "title", "处理中");
            String text = readString(call, "text", "");
            int percent = readPercent(call, 0);
            postNotification(call, taskId, title, text, percent, true);
            call.resolve();
        } catch (Exception error) {
            // 任何原生异常都吞掉, 通知失败不能拖垮主流程
            if (getBridge() != null) {
                Logger.warn("NativeProgressNotification start failed: " + error.getMessage());
            }
            call.resolve();
        }
    }

    @PluginMethod
    public void update(PluginCall call) {
        try {
            String taskId = requiredTaskId(call);
            String title = readString(call, "title", "处理中");
            String text = readString(call, "text", "");
            int percent = readPercent(call, 0);
            boolean ongoing = call.getBoolean("ongoing", true);
            postNotification(call, taskId, title, text, percent, ongoing);
            call.resolve();
        } catch (Exception error) {
            if (getBridge() != null) {
                Logger.warn("NativeProgressNotification update failed: " + error.getMessage());
            }
            call.resolve();
        }
    }

    @PluginMethod
    public void complete(PluginCall call) {
        try {
            String taskId = requiredTaskId(call);
            String title = readString(call, "title", "已完成");
            String text = readString(call, "text", "已完成");
            postNotification(call, taskId, title, text, 100, false);
            scheduleAutoDismiss(taskId, COMPLETE_AUTO_DISMISS_MS);
            call.resolve();
        } catch (Exception error) {
            if (getBridge() != null) {
                Logger.warn("NativeProgressNotification complete failed: " + error.getMessage());
            }
            call.resolve();
        }
    }

    @PluginMethod
    public void fail(PluginCall call) {
        try {
            String taskId = requiredTaskId(call);
            String title = readString(call, "title", "失败");
            String text = readString(call, "text", "失败");
            postNotification(call, taskId, title, text, 100, false);
            scheduleAutoDismiss(taskId, FAIL_AUTO_DISMISS_MS);
            call.resolve();
        } catch (Exception error) {
            if (getBridge() != null) {
                Logger.warn("NativeProgressNotification fail failed: " + error.getMessage());
            }
            call.resolve();
        }
    }

    @PluginMethod
    public void dismiss(PluginCall call) {
        try {
            String taskId = requiredTaskId(call);
            int nid = notificationIdFor(taskId);
            NotificationManager manager = (NotificationManager) getContext()
                .getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(nid);
            call.resolve();
        } catch (Exception error) {
            if (getBridge() != null) {
                Logger.warn("NativeProgressNotification dismiss failed: " + error.getMessage());
            }
            call.resolve();
        }
    }

    // ===== internals =====

    private void postNotification(
        PluginCall call,
        String taskId,
        String title,
        String text,
        int percent,
        boolean ongoing
    ) {
        if (getContext() == null) return;
        ensureNotificationChannel(getContext());

        int nid = notificationIdFor(taskId);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_wardrobe)
            .setContentTitle(truncate(title, 40))
            .setContentText(truncate(text, 80))
            .setOngoing(ongoing)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW);

        if (percent > 0 && percent < 100) {
            builder.setProgress(100, percent, false);
        } else if (percent >= 100) {
            builder.setProgress(100, 100, false);
        } else {
            // percent == 0: 还没有进度, 用 indeterminate 给视觉提示
            builder.setProgress(0, 0, true);
        }

        Notification notification = builder.build();

        NotificationManager manager = (NotificationManager) getContext()
            .getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        // 即使没拿到 POST_NOTIFICATIONS 权限, 调用 notify 也只是静默失败,
        // 不会抛错, 不影响主流程。
        try {
            manager.notify(nid, notification);
        } catch (SecurityException ignored) {
            // Android 13+ 未授权时可能抛 SecurityException, 静默吞掉
        }
    }

    private void scheduleAutoDismiss(String taskId, long delayMs) {
        final int nid = notificationIdFor(taskId);
        mainHandler.postDelayed(() -> {
            try {
                NotificationManager manager = (NotificationManager) getContext()
                    .getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) manager.cancel(nid);
            } catch (Exception ignored) {
                // ignore
            }
        }, delayMs);
    }

    private int notificationIdFor(String taskId) {
        if (taskId == null) return NOTIFICATION_ID_BASE;
        Integer id = TASK_ID_TO_NOTIFICATION.get(taskId);
        if (id != null) return id;
        // 未知 taskId: 用稳定 hash, 范围 1100-1199 避免与已知 taskId 冲突
        return 1100 + (Math.abs(taskId.hashCode()) % 100);
    }

    private String requiredTaskId(PluginCall call) {
        String taskId = call.getString("taskId");
        if (taskId == null || taskId.trim().isEmpty()) {
            taskId = "unknown";
        }
        return taskId;
    }

    private String readString(PluginCall call, String key, String fallback) {
        String value = call.getString(key);
        return (value == null) ? fallback : value;
    }

    private int readPercent(PluginCall call, int fallback) {
        Integer value = call.getInt("percent");
        if (value == null) return fallback;
        if (value < 0) return 0;
        if (value > 100) return 100;
        return value;
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        if (s.length() <= max) return s;
        return s.substring(0, max);
    }

    private void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(
            Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(CHANNEL_DESCRIPTION);
        channel.setShowBadge(false);
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }
}
