package com.wardrobe.outfit;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * NativeMiniMaxForegroundService (v0.9.27-dev 降级)
 *
 * v0.9.27-dev 起, 通知职责统一交给 NativeProgressNotificationPlugin;
 * 本 service 仍然存在, 但只作为 "保持 MiniMax 后台 HTTP 请求不被
 * Android 杀死" 的 keep-alive 机制, 用户可见通知降级到 IMPORTANCE_MIN
 * + PRIORITY_MIN (在通知栏的"其他/无声"区折叠显示, 不抢主通知的注意力)。
 *
 * 通知 ID 2048 与 per-task 通知 (1001-1100) 不冲突, 不会互相覆盖。
 *
 * 如果将来决定完全依赖 per-task 通知 (放弃 keep-alive), 可以再删掉
 * 本 service + 删掉 NativeMiniMaxPlugin 里的 startTask / finishTask 调用。
 */
public class NativeMiniMaxForegroundService extends Service {
    private static final String CHANNEL_ID = "native_minimax_tasks";
    private static final int NOTIFICATION_ID = 2048;
    private static final String ACTION_START = "com.wardrobe.outfit.NativeMiniMaxForegroundService.START";
    private static final String ACTION_STOP = "com.wardrobe.outfit.NativeMiniMaxForegroundService.STOP";
    private static final AtomicInteger ACTIVE_REQUESTS = new AtomicInteger(0);

    public static void startTask(Context context) {
        ACTIVE_REQUESTS.incrementAndGet();
        Intent intent = new Intent(context, NativeMiniMaxForegroundService.class);
        intent.setAction(ACTION_START);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void finishTask(Context context) {
        int remaining = ACTIVE_REQUESTS.decrementAndGet();
        if (remaining <= 0) {
            ACTIVE_REQUESTS.set(0);
            Intent intent = new Intent(context, NativeMiniMaxForegroundService.class);
            intent.setAction(ACTION_STOP);
            context.startService(intent);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildKeepAliveNotification());
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * 仅供 keep-alive 用的最小可见通知: 固定标题, 无文字内容,
     * IMPORTANCE_MIN + PRIORITY_MIN, 在通知栏的"其他通知"区折叠,
     * 不会和 per-task 通知 (NativeProgressNotificationPlugin, channel wardrobe_progress) 重复显示。
     */
    private Notification buildKeepAliveNotification() {
        ensureNotificationChannel();
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_wardrobe)
            .setContentTitle("衣橱穿搭助手")
            .setContentText("")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "AI 后台任务",
            NotificationManager.IMPORTANCE_MIN
        );
        channel.setDescription("保持 AI 请求在后台继续运行 (本通知通常隐藏)");
        channel.setShowBadge(false);
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    @SuppressWarnings("deprecation")
    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }
}
