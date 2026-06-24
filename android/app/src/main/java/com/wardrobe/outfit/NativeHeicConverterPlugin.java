package com.wardrobe.outfit;

import android.graphics.Bitmap;
import android.graphics.ImageDecoder;
import android.os.Build;
import android.util.Base64;
import android.util.Size;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeHeicConverter")
public class NativeHeicConverterPlugin extends Plugin {
    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(2);
    private static final String ERROR_MESSAGE = "Android 原生 HEIC 转换失败";
    private static final int DEFAULT_MAX_SIDE = 3000;
    private static final int DEFAULT_QUALITY = 92;

    @PluginMethod
    public void convert(PluginCall call) {
        String dataBase64 = call.getString("dataBase64");
        if (dataBase64 == null || dataBase64.trim().isEmpty()) {
            call.reject(ERROR_MESSAGE);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject(ERROR_MESSAGE);
            return;
        }

        int maxSide = clamp(call.getInt("maxSide", DEFAULT_MAX_SIDE), 512, 4000);
        int quality = clamp(call.getInt("quality", DEFAULT_QUALITY), 1, 100);

        EXECUTOR.execute(() -> {
            Bitmap bitmap = null;
            ByteArrayOutputStream output = null;
            try {
                byte[] input = Base64.decode(dataBase64, Base64.DEFAULT);
                ImageDecoder.Source source = ImageDecoder.createSource(ByteBuffer.wrap(input));
                bitmap = ImageDecoder.decodeBitmap(source, (decoder, info, src) -> {
                    decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                    Size size = info.getSize();
                    int width = Math.max(1, size.getWidth());
                    int height = Math.max(1, size.getHeight());
                    int longest = Math.max(width, height);
                    if (longest > maxSide) {
                        float scale = maxSide / (float) longest;
                        decoder.setTargetSize(
                            Math.max(1, Math.round(width * scale)),
                            Math.max(1, Math.round(height * scale))
                        );
                    }
                });

                output = new ByteArrayOutputStream();
                if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)) {
                    throw new IllegalStateException(ERROR_MESSAGE);
                }

                byte[] bytes = output.toByteArray();
                JSObject ret = new JSObject();
                ret.put("dataBase64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                ret.put("mimeType", "image/jpeg");
                ret.put("width", bitmap.getWidth());
                ret.put("height", bitmap.getHeight());
                ret.put("outputBytes", bytes.length);
                call.resolve(ret);
            } catch (Exception error) {
                call.reject(ERROR_MESSAGE);
            } finally {
                if (bitmap != null && !bitmap.isRecycled()) {
                    bitmap.recycle();
                }
                if (output != null) {
                    try {
                        output.close();
                    } catch (Exception ignored) {
                    }
                }
            }
        });
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
