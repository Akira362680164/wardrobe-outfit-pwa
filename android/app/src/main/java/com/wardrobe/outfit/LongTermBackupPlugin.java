package com.wardrobe.outfit;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

@CapacitorPlugin(name = "LongTermBackup")
public class LongTermBackupPlugin extends Plugin {

    private static final String BACKUP_DIR_NAME = "衣橱穿搭助手备份";
    private static final String RELATIVE_PATH = "Download/" + BACKUP_DIR_NAME + "/";
    // ponytail: 改用 application/octet-stream 避免 Android 文件下载器在 DISPLAY_NAME
    // 已带 .wardrobebackup 时仍强行追加 .zip 扩展名。
    private static final String MIME_TYPE = "application/octet-stream";
    private static final String ERROR_READ_REQUIRES_PICKER = "DEFAULT_BACKUP_READ_REQUIRES_PICKER";

    // ZIP security limits
    private static final int MAX_ENTRY_COUNT = 20000;
    private static final long MAX_MANIFEST_BYTES = 1_000_000L;
    private static final long MAX_METADATA_BYTES = 64_000_000L;
    private static final long MAX_IMAGE_ENTRY_BYTES = 40_000_000L;
    private static final long MAX_TOTAL_UNCOMPRESSED_BYTES = 2_000_000_000L;

    private static final Pattern ALLOWED_ENTRY_PATTERN =
        Pattern.compile("^(manifest\\.json|metadata\\.json|images/img_\\d{3}\\.txt)$");

    private final Map<String, File> exportSessions = new HashMap<>();
    private final Map<String, File> readSessions = new HashMap<>();
    private final Map<String, File> pendingSaveAsSessions = new HashMap<>();

    @PluginMethod
    public void startExportSession(PluginCall call) {
        String timestampFileName = call.getString("timestampFileName");
        String latestFileName = call.getString("latestFileName");

        if (timestampFileName == null || latestFileName == null) {
            call.reject("Missing required parameters");
            return;
        }

        try {
            File tempDir = new File(getContext().getCacheDir(), "export_" + System.currentTimeMillis());
            tempDir.mkdirs();
            exportSessions.put(tempDir.getAbsolutePath(), tempDir);

            File infoFile = new File(tempDir, "_info.txt");
            String info = timestampFileName + "\n" + latestFileName;
            FileOutputStream fos = new FileOutputStream(infoFile);
            fos.write(info.getBytes(StandardCharsets.UTF_8));
            fos.close();

            JSObject result = new JSObject();
            result.put("sessionId", tempDir.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            Logger.error("LongTermBackup startExportSession failed: " + e.getClass().getSimpleName(), null);
            call.reject("Failed to start export session: " + e.getMessage());
        }
    }

    @PluginMethod
    public void writeTextEntry(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String path = call.getString("path");
        String text = call.getString("text");

        if (sessionId == null || path == null || text == null) {
            call.reject("Missing required parameters");
            return;
        }

        File tempDir = exportSessions.get(sessionId);
        if (tempDir == null) {
            call.reject("Invalid session ID");
            return;
        }

        try {
            File outFile = new File(tempDir, path);
            outFile.getParentFile().mkdirs();
            FileOutputStream fos = new FileOutputStream(outFile);
            fos.write(text.getBytes(StandardCharsets.UTF_8));
            fos.close();
            call.resolve();
        } catch (Exception e) {
            Logger.error("LongTermBackup writeTextEntry failed: " + e.getClass().getSimpleName(), null);
            call.reject("Failed to write entry: " + e.getMessage());
        }
    }

    @PluginMethod
    public void commitDefaultExport(PluginCall call) {
        String sessionId = call.getString("sessionId");

        if (sessionId == null) {
            call.reject("Missing sessionId");
            return;
        }

        File tempDir = exportSessions.get(sessionId);
        if (tempDir == null) {
            call.reject("Invalid session ID");
            return;
        }

        try {
            File infoFile = new File(tempDir, "_info.txt");
            String[] infoLines = LongTermBackupTextIO.readUtf8Exactly(infoFile).split("\\R", -1);
            if (infoLines.length < 2 || infoLines[0].trim().isEmpty() || infoLines[1].trim().isEmpty()) {
                throw new IllegalArgumentException("备份导出信息格式不正确");
            }
            String timestampFileName = infoLines[0].trim();
            String latestFileName = infoLines[1].trim();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                writeViaMediaStore(tempDir, timestampFileName, latestFileName);
            } else {
                writeViaFileApi(tempDir, timestampFileName, latestFileName);
            }

            exportSessions.remove(sessionId);
            deleteDirectory(tempDir);

            JSObject result = new JSObject();
            // ponytail: latest 与 timestamp 同名时 latestPath 留空字符串，
            // 前端根据空值判断"无 latest 文件"。
            result.put("latestPath", timestampFileName.equals(latestFileName) ? "" : latestFileName);
            result.put("timestampPath", timestampFileName);
            call.resolve(result);
        } catch (Exception e) {
            Logger.error("LongTermBackup commitDefaultExport failed: " + e.getClass().getSimpleName(), null);
            call.reject("Failed to commit export: " + e.getMessage());
        }
    }

    private void writeViaMediaStore(File tempDir, String timestampFileName, String latestFileName) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();

        // Write timestamp file
        Uri timestampUri = insertMediaStorePending(resolver, timestampFileName);
        try (OutputStream os = resolver.openOutputStream(timestampUri)) {
            if (os == null) throw new Exception("Cannot open timestamp output stream");
            createZipFromDirectory(tempDir, os);
        }
        markMediaStoreComplete(resolver, timestampUri);

        // ponytail: 当 latestFileName 与 timestampFileName 相同（v1.1.34+ 默认行为），
        // 不要再写第二份，避免覆盖用户真实的时间戳备份或出现"最新备份"歧义。
        if (timestampFileName.equals(latestFileName)) {
            return;
        }
        // Write latest file (replace existing) - 仅在 latest 与 timestamp 不一致时执行
        Uri existingUri = findMediaStoreFile(resolver, latestFileName);
        if (existingUri != null) {
            resolver.delete(existingUri, null, null);
        }
        Uri latestUri = insertMediaStorePending(resolver, latestFileName);
        try (OutputStream os = resolver.openOutputStream(latestUri)) {
            if (os == null) throw new Exception("Cannot open latest output stream");
            createZipFromDirectory(tempDir, os);
        }
        markMediaStoreComplete(resolver, latestUri);
    }

    private Uri insertMediaStorePending(ContentResolver resolver, String displayName) {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, displayName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, MIME_TYPE);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, RELATIVE_PATH);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        return resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
    }

    private void markMediaStoreComplete(ContentResolver resolver, Uri uri) {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
    }

    private Uri findMediaStoreFile(ContentResolver resolver, String displayName) {
        try (Cursor cursor = resolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.MediaColumns._ID},
                MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?",
                new String[]{RELATIVE_PATH, displayName},
                null)) {
            if (cursor != null && cursor.moveToFirst()) {
                long id = cursor.getLong(0);
                return Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
            }
        } catch (Exception e) {
            // best-effort
        }
        return null;
    }

    private void writeViaFileApi(File tempDir, String timestampFileName, String latestFileName) throws Exception {
        File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File backupDir = new File(downloadsDir, BACKUP_DIR_NAME);
        if (!backupDir.exists()) {
            backupDir.mkdirs();
        }

        File latestZip = new File(backupDir, latestFileName);
        File timestampZip = new File(backupDir, timestampFileName);

        createZipFromDirectory(tempDir, timestampZip);
        // ponytail: 同名时不再写第二份。
        if (!timestampFileName.equals(latestFileName)) {
            createZipFromDirectory(tempDir, latestZip);
        }
    }

    @PluginMethod
    public void commitSaveAsExport(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String suggestedName = call.getString("suggestedName");

        if (sessionId == null) {
            call.reject("Missing sessionId");
            return;
        }

        File tempDir = exportSessions.get(sessionId);
        if (tempDir == null) {
            call.reject("Invalid session ID");
            return;
        }

        try {
            String fileName = suggestedName;
            if (fileName == null || fileName.isEmpty()) {
                fileName = "衣橱穿搭助手-" + System.currentTimeMillis() + ".wardrobebackup";
            }
            if (!fileName.endsWith(".wardrobebackup")) {
                fileName = fileName + ".wardrobebackup";
            }

            pendingSaveAsSessions.put(call.getCallbackId(), tempDir);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            // ponytail: 主类型用 application/octet-stream，避免部分系统在 EXTRA_TITLE
            // 已带 .wardrobebackup 时仍强行追加 .zip。
            intent.setType("application/octet-stream");
            intent.putExtra(Intent.EXTRA_TITLE, fileName);
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                "application/octet-stream",
                "application/zip",
                "application/x-zip-compressed",
                "*/*"
            });
            startActivityForResult(call, intent, "handleSaveAsResult");
        } catch (Exception e) {
            Logger.error("LongTermBackup commitSaveAsExport failed: " + e.getClass().getSimpleName(), null);
            call.reject("Failed to save backup: " + e.getMessage());
        }
    }

    @PluginMethod
    public void listDefaultBackups(PluginCall call) {
        try {
            JSArray filesArray;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                filesArray = listViaMediaStore();
            } else {
                filesArray = listViaFileApi();
            }

            JSObject result = new JSObject();
            result.put("files", filesArray);
            call.resolve(result);
        } catch (Exception e) {
            Logger.error("LongTermBackup listDefaultBackups failed: " + e.getClass().getSimpleName(), null);
            call.reject("无法读取默认长期备份目录: " + e.getMessage());
        }
    }

    // ponytail: 接受 .wardrobebackup 与系统/QQ 网盘追加的 .wardrobebackup.zip 两种扩展名。
    private boolean isBackupFileName(String name) {
        if (name == null) return false;
        return name.endsWith(".wardrobebackup") || name.endsWith(".wardrobebackup.zip");
    }

    private JSArray listViaMediaStore() {
        JSArray filesArray = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        try (Cursor cursor = resolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[]{
                    MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.SIZE,
                    MediaStore.MediaColumns.DATE_MODIFIED,
                },
                MediaStore.MediaColumns.RELATIVE_PATH + "=?",
                new String[]{RELATIVE_PATH},
                null)) {
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String name = cursor.getString(0);
                    if (!isBackupFileName(name)) continue;
                    long size = cursor.getLong(1);
                    long mtime = cursor.getLong(2) * 1000L;
                    JSObject fileInfo = new JSObject();
                    fileInfo.put("name", name);
                    fileInfo.put("displayName", name);
                    fileInfo.put("size", size);
                    fileInfo.put("modifiedAt", mtime);
                    fileInfo.put("mtime", mtime);
                    fileInfo.put("isLatest", false);
                    filesArray.put(fileInfo);
                }
            }
        }
        return filesArray;
    }

    private JSArray listViaFileApi() {
        JSArray filesArray = new JSArray();
        File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File backupDir = new File(downloadsDir, BACKUP_DIR_NAME);

        if (!backupDir.exists()) return filesArray;

        File[] files = backupDir.listFiles((dir, name) -> isBackupFileName(name));
        if (files == null) return filesArray;

        for (File file : files) {
            JSObject fileInfo = new JSObject();
            fileInfo.put("name", file.getName());
            fileInfo.put("displayName", file.getName());
            fileInfo.put("path", file.getAbsolutePath());
            fileInfo.put("size", file.length());
            fileInfo.put("modifiedAt", file.lastModified());
            fileInfo.put("mtime", file.lastModified());
            fileInfo.put("isLatest", false);
            filesArray.put(fileInfo);
        }
        return filesArray;
    }

    @PluginMethod
    public void openDefaultBackup(PluginCall call) {
        String fileName = call.getString("fileName");

        if (fileName == null) {
            call.reject("Missing fileName");
            return;
        }

        File tempDir = new File(getContext().getCacheDir(), "read_" + System.currentTimeMillis());
        boolean sessionOpened = false;

        try {
            tempDir.mkdirs();

            InputStream inputStream = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                inputStream = openViaMediaStore(fileName);
            } else {
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File backupDir = new File(downloadsDir, BACKUP_DIR_NAME);
                File targetFile = new File(backupDir, fileName);
                if (!targetFile.exists() && isBackupFileName(fileName) && !fileName.endsWith(".wardrobebackup.zip")) {
                    targetFile = new File(backupDir, fileName + ".zip");
                }
                if (!targetFile.exists()) {
                    deleteDirectory(tempDir);
                    JSObject errorResult = new JSObject();
                    errorResult.put("code", ERROR_READ_REQUIRES_PICKER);
                    errorResult.put("message", "文件不存在: " + fileName);
                    call.resolve(errorResult);
                    return;
                }
                inputStream = new FileInputStream(targetFile);
            }

            if (inputStream == null) {
                deleteDirectory(tempDir);
                JSObject errorResult = new JSObject();
                errorResult.put("code", ERROR_READ_REQUIRES_PICKER);
                errorResult.put("message", "默认备份目录不存在或文件不存在");
                call.resolve(errorResult);
                return;
            }

            try {
                extractZipSecure(inputStream, tempDir);
            } finally {
                inputStream.close();
            }
            readSessions.put(tempDir.getAbsolutePath(), tempDir);
            sessionOpened = true;

            JSObject result = new JSObject();
            result.put("readSessionId", tempDir.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            readSessions.remove(tempDir.getAbsolutePath());
            if (!sessionOpened) {
                deleteDirectory(tempDir);
            }
            Logger.error("LongTermBackup openDefaultBackup failed: " + e.getClass().getSimpleName(), null);
            JSObject errorResult = new JSObject();
            errorResult.put("code", ERROR_READ_REQUIRES_PICKER);
            errorResult.put("message", "无法读取备份文件: " + e.getMessage());
            call.resolve(errorResult);
        }
    }

    private InputStream openViaMediaStore(String fileName) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        // ponytail: 兼容 Android/QQ 把 .wardrobebackup 自动改名为 .wardrobebackup.zip 的情况。
        InputStream stream = queryMediaStoreInputStream(resolver, fileName);
        if (stream == null && isBackupFileName(fileName) && !fileName.endsWith(".wardrobebackup.zip")) {
            stream = queryMediaStoreInputStream(resolver, fileName + ".zip");
        }
        return stream;
    }

    private InputStream queryMediaStoreInputStream(ContentResolver resolver, String fileName) throws Exception {
        try (Cursor cursor = resolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.MediaColumns._ID},
                MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?",
                new String[]{RELATIVE_PATH, fileName},
                null)) {
            if (cursor != null && cursor.moveToFirst()) {
                long id = cursor.getLong(0);
                Uri uri = Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
                return resolver.openInputStream(uri);
            }
        }
        return null;
    }

    @PluginMethod
    public void openPickedBackup(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/octet-stream");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                "application/zip",
                "application/octet-stream",
                "application/x-zip-compressed",
                "*/*"
            });
            startActivityForResult(call, intent, "handlePickedBackupResult");
        } catch (Exception e) {
            Logger.error("LongTermBackup openPickedBackup failed: " + e.getClass().getSimpleName(), null);
            call.reject("无法打开系统文件选择器: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readTextEntry(PluginCall call) {
        String readSessionId = call.getString("readSessionId");
        String path = call.getString("path");

        if (readSessionId == null || path == null) {
            call.reject("Missing required parameters");
            return;
        }

        File tempDir = readSessions.get(readSessionId);
        if (tempDir == null) {
            call.reject("Invalid read session ID");
            return;
        }

        try {
            File targetFile = new File(tempDir, path);
            if (!targetFile.exists()) {
                call.reject("File not found: " + path);
                return;
            }

            String content = LongTermBackupTextIO.readUtf8Exactly(targetFile);

            JSObject result = new JSObject();
            result.put("text", content);
            call.resolve(result);
        } catch (Exception e) {
            Logger.error("LongTermBackup readTextEntry failed: " + e.getClass().getSimpleName(), null);
            call.reject("Failed to read entry: " + e.getMessage());
        }
    }

    @PluginMethod
    public void closeReadSession(PluginCall call) {
        String readSessionId = call.getString("readSessionId");

        if (readSessionId == null) {
            call.reject("Missing readSessionId");
            return;
        }

        File tempDir = readSessions.remove(readSessionId);
        if (tempDir != null && tempDir.exists()) {
            deleteDirectory(tempDir);
        }

        call.resolve();
    }

    @PluginMethod
    public void cancelExportSession(PluginCall call) {
        String sessionId = call.getString("sessionId");

        if (sessionId == null) {
            call.reject("Missing sessionId");
            return;
        }

        File tempDir = exportSessions.remove(sessionId);
        if (tempDir != null && tempDir.exists()) {
            deleteDirectory(tempDir);
        }

        call.resolve();
    }

    @ActivityCallback
    private void handlePickedBackupResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("已取消选择备份");
            return;
        }

        Uri uri = result.getData().getData();
        File tempDir = new File(getContext().getCacheDir(), "read_" + System.currentTimeMillis());
        boolean sessionOpened = false;
        try {
            tempDir.mkdirs();
            try (InputStream inputStream = getContext().getContentResolver().openInputStream(uri)) {
                if (inputStream == null) {
                    deleteDirectory(tempDir);
                    call.reject("无法读取选择的备份文件");
                    return;
                }
                extractZipSecure(inputStream, tempDir);
            }
            readSessions.put(tempDir.getAbsolutePath(), tempDir);
            sessionOpened = true;

            String displayName = null;
            try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIdx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                    if (nameIdx >= 0) {
                        displayName = cursor.getString(nameIdx);
                    }
                }
            } catch (Exception queryEx) {
                // best-effort only
            }
            if (displayName == null || displayName.isEmpty()) {
                String lastSegment = uri.getLastPathSegment();
                if (lastSegment != null) {
                    displayName = lastSegment;
                }
            }
            if (displayName == null) {
                displayName = "衣橱穿搭助手-已选备份.wardrobebackup";
            }

            // Verify extension
            if (!isBackupFileName(displayName)) {
                deleteDirectory(tempDir);
                readSessions.remove(tempDir.getAbsolutePath());
                call.reject("请选择 .wardrobebackup 长期备份文件");
                return;
            }

            JSObject response = new JSObject();
            response.put("readSessionId", tempDir.getAbsolutePath());
            response.put("fileName", displayName);
            call.resolve(response);
        } catch (Exception e) {
            readSessions.remove(tempDir.getAbsolutePath());
            if (!sessionOpened) {
                deleteDirectory(tempDir);
            }
            Logger.error("LongTermBackup handlePickedBackupResult failed: " + e.getClass().getSimpleName(), null);
            call.reject("无法读取选择的备份文件: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void handleSaveAsResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        File tempDir = pendingSaveAsSessions.remove(call.getCallbackId());
        if (tempDir == null) {
            call.reject("Invalid save-as session");
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("已取消保存备份");
            return;
        }

        Uri uri = result.getData().getData();
        try (OutputStream outputStream = getContext().getContentResolver().openOutputStream(uri)) {
            if (outputStream == null) {
                call.reject("无法写入选择的位置");
                return;
            }
            createZipFromDirectory(tempDir, outputStream);
            String sessionId = tempDir.getAbsolutePath();
            exportSessions.remove(sessionId);
            deleteDirectory(tempDir);

            JSObject response = new JSObject();
            response.put("filePath", uri.toString());
            call.resolve(response);
        } catch (Exception e) {
            Logger.error("LongTermBackup handleSaveAsResult failed: " + e.getClass().getSimpleName(), null);
            call.reject("无法保存备份: " + e.getMessage());
        }
    }

    // ===== ZIP helpers =====

    private void createZipFromDirectory(File sourceDir, File destZip) throws Exception {
        try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(destZip))) {
            addDirectoryToZip(sourceDir, sourceDir, zos);
        }
    }

    private void createZipFromDirectory(File sourceDir, OutputStream outputStream) throws Exception {
        try (ZipOutputStream zos = new ZipOutputStream(outputStream)) {
            addDirectoryToZip(sourceDir, sourceDir, zos);
        }
    }

    private void addDirectoryToZip(File baseDir, File dir, ZipOutputStream zos) throws Exception {
        File[] files = dir.listFiles();
        if (files == null) return;

        for (File file : files) {
            if (file.isDirectory()) {
                if (file.getName().startsWith("_")) continue;
                addDirectoryToZip(baseDir, file, zos);
            } else {
                if (file.getName().startsWith("_")) continue;
                String entryName = file.getAbsolutePath().substring(baseDir.getAbsolutePath().length() + 1);
                ZipEntry entry = new ZipEntry(entryName);
                zos.putNextEntry(entry);

                try (FileInputStream fis = new FileInputStream(file)) {
                    byte[] buffer = new byte[8192];
                    int len;
                    while ((len = fis.read(buffer)) > 0) {
                        zos.write(buffer, 0, len);
                    }
                }
                zos.closeEntry();
            }
        }
    }

    // ===== ZIP security extraction =====

    private void extractZipSecure(InputStream inputStream, File destDir) throws Exception {
        String destinationRoot = destDir.getCanonicalPath() + File.separator;
        Set<String> seenEntries = new HashSet<>();
        int entryCount = 0;
        long totalBytesRead = 0;

        try (ZipInputStream zis = new ZipInputStream(inputStream)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryCount++;
                if (entryCount > MAX_ENTRY_COUNT) {
                    throw new SecurityException("备份包条目数超过限制");
                }

                String name = entry.getName();
                if (name == null || name.isEmpty()) {
                    throw new SecurityException("非法备份文件路径：空名称");
                }

                // Validate against whitelist
                if (!ALLOWED_ENTRY_PATTERN.matcher(name).matches()) {
                    throw new SecurityException("非法备份文件路径：" + name);
                }

                // Check duplicates
                if (seenEntries.contains(name)) {
                    throw new SecurityException("备份包包含重复条目：" + name);
                }
                seenEntries.add(name);

                File outputFile = new File(destDir, name);
                String outputPath = outputFile.getCanonicalPath();

                // Zip Slip protection
                if (!outputPath.startsWith(destinationRoot)) {
                    throw new SecurityException("非法备份文件路径");
                }

                if (entry.isDirectory()) {
                    outputFile.mkdirs();
                } else {
                    outputFile.getParentFile().mkdirs();

                    // Determine size limit based on file type
                    long maxBytes;
                    if ("manifest.json".equals(name)) {
                        maxBytes = MAX_MANIFEST_BYTES;
                    } else if ("metadata.json".equals(name)) {
                        maxBytes = MAX_METADATA_BYTES;
                    } else {
                        maxBytes = MAX_IMAGE_ENTRY_BYTES;
                    }

                    long entryBytesRead = 0;
                    try (OutputStream fos = new FileOutputStream(outputFile)) {
                        byte[] buffer = new byte[8192];
                        int len;
                        while ((len = zis.read(buffer)) > 0) {
                            entryBytesRead += len;
                            if (entryBytesRead > maxBytes) {
                                throw new SecurityException("备份包条目过大：" + name);
                            }
                            totalBytesRead += len;
                            if (totalBytesRead > MAX_TOTAL_UNCOMPRESSED_BYTES) {
                                throw new SecurityException("备份包解压后总大小超过限制");
                            }
                            fos.write(buffer, 0, len);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }

    // ===== Utility methods =====

    private void deleteDirectory(File dir) {
        if (dir.isDirectory()) {
            File[] files = dir.listFiles();
            if (files != null) {
                for (File file : files) {
                    deleteDirectory(file);
                }
            }
        }
        dir.delete();
    }
}
