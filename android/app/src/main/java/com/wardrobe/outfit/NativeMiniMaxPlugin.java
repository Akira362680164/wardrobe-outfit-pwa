package com.wardrobe.outfit;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONTokener;

/**
 * NativeMiniMax (v0.9.27-dev)
 *
 * 纯网络请求插件: 走 Android 原生 HttpURLConnection, 避开 WebView
 * CORS 限制。用户可见的进度通知交给 NativeProgressNotificationPlugin,
 * 本插件不再带 notificationTitle / notificationText 参数 (旧参数被
 * 安全忽略, 向后兼容)。
 *
 * 进程保活仍由 NativeMiniMaxForegroundService 提供 (channel
 * native_minimax_tasks, IMPORTANCE_MIN, 折叠在通知栏 "其他" 区),
 * 避免 Android 在 app 切后台时杀掉长 MiniMax HTTP 请求。
 */
@CapacitorPlugin(name = "NativeMiniMax")
public class NativeMiniMaxPlugin extends Plugin {
    private static final ExecutorService EXECUTOR = Executors.newCachedThreadPool();

    @PluginMethod
    public void post(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("缺少请求地址");
            return;
        }

        JSObject headers = call.getObject("headers", new JSObject());
        Object data = call.getData().opt("data");
        int connectTimeout = call.getInt("connectTimeout", 60000);
        int readTimeout = call.getInt("readTimeout", 60000);
        // v0.9.27-dev: notificationTitle / notificationText 参数被忽略,
        // 用户可见进度统一走 NativeProgressNotificationPlugin。
        // 保留读取只为避免前端漏传时报 unknown key 警告。
        call.getString("notificationTitle");
        call.getString("notificationText");
        String body = data == null ? "{}" : data.toString();

        NativeMiniMaxForegroundService.startTask(getContext());
        EXECUTOR.execute(() -> {
            try {
                NativeHttpResult result = postJson(url, headers, body, connectTimeout, readTimeout);
                JSObject response = new JSObject();
                response.put("status", result.status);
                response.put("data", parseResponseBody(result.body));
                call.resolve(response);
            } catch (Exception error) {
                call.reject(error.getMessage() != null ? error.getMessage() : "原生后台请求失败", error);
            } finally {
                NativeMiniMaxForegroundService.finishTask(getContext());
            }
        });
    }

    private NativeHttpResult postJson(String urlString, JSObject headers, String body, int connectTimeout, int readTimeout) throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(connectTimeout);
            connection.setReadTimeout(readTimeout);
            connection.setDoOutput(true);

            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                connection.setRequestProperty(key, headers.optString(key));
            }

            byte[] payload = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            return new NativeHttpResult(status, readStream(stream));
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private Object parseResponseBody(String body) {
        if (body == null || body.trim().isEmpty()) return "";
        try {
            return new JSONTokener(body).nextValue();
        } catch (Exception ignored) {
            return body;
        }
    }

    private String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private static class NativeHttpResult {
        final int status;
        final String body;

        NativeHttpResult(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }
}
