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

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * LongTermBackupPlugin (v1.1.13-dev)
 *
 * Manages long-term backup files in the public Downloads directory.
 *
 * Key design decisions:
 * - Android 10+ uses MediaStore.Downloads with RELATIVE_PATH
 * - Android 9 uses getExternalStoragePublicDirectory(DIRECTORY_DOWNLOADS)
 * - Temporary ZIP files are created in cache dir during export
 * - Session-based: startExportSession -> writeTextEntry x N -> commit
 * - Read sessions: openDefaultBackup/openPickedBackup -> readTextEntry -> closeReadSession
 */
@CapacitorPlugin(name = "LongTermBackup")
public class LongTermBackupPlugin extends Plugin {

    private static final String BACKUP_DIR_NAME = "衣橱穿搭助手备份";
    private static final String ERROR_READ_REQUIRES_PICKER = "DEFAULT_BACKUP_READ_REQUIRES_PICKER";

    // Export sessions: sessionId -> temp directory for collecting entries
    private final Map<String, File> exportSessions = new HashMap<>();

    // Read sessions: readSessionId -> extracted temp dir
    private final Map<String, File> readSessions = new HashMap<>();

    // Save-as sessions: saved PluginCall callbackId -> temp dir
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
            // Create temp directory to collect files before zipping
            File tempDir = new File(getContext().getCacheDir(), "export_" + System.currentTimeMillis());
            tempDir.mkdirs();
            exportSessions.put(tempDir.getAbsolutePath(), tempDir);

            // Store the filenames for later use
            File infoFile = new File(tempDir, "_info.txt");
            String info = timestampFileName + "\n" + latestFileName;
            FileOutputStream fos = new FileOutputStream(infoFile);
            fos.write(info.getBytes(StandardCharsets.UTF_8));
            fos.close();

            JSObject result = new JSObject();
            result.put("sessionId", tempDir.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            // Log only the status label + exception type. Do NOT log e.getMessage()
            // or stack trace: they may include user data (e.g. file path) that we
            // do not want surfaced to adb logcat in production builds.
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
            // Write file to temp directory
            File outFile = new File(tempDir, path);
            outFile.getParentFile().mkdirs();
            FileOutputStream fos = new FileOutputStream(outFile);
            fos.write(text.getBytes(StandardCharsets.UTF_8));
            fos.close();
            call.resolve();
        } catch (Exception e) {
            // Status only: do not log the entry content (no JSON / base64 / images).
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
            // Read info file for filenames
            File infoFile = new File(tempDir, "_info.txt");
            String[] infoLines = readFileContent(infoFile).split("\n");
            String timestampFileName = infoLines[0].trim();
            String latestFileName = infoLines[1].trim();

            // Get backup directory
            File backupDir = getBackupDirectory();
            if (backupDir == null) {
                call.reject("Cannot access backup directory");
                return;
            }

            // Create ZIP files
            File latestZip = new File(backupDir, latestFileName);
            File timestampZip = new File(backupDir, timestampFileName);

            // Create ZIP from temp directory contents
            createZipFromDirectory(tempDir, latestZip);
            createZipFromDirectory(tempDir, timestampZip);

            // Clean up session
            exportSessions.remove(sessionId);
            deleteDirectory(tempDir);

            JSObject result = new JSObject();
            result.put("latestPath", latestZip.getAbsolutePath());
            result.put("timestampPath", timestampZip.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            // Status only. We do not log the resulting zip paths or sizes to logcat.
            Logger.error("LongTermBackup commitDefaultExport failed: " + e.getClass().getSimpleName(), null);
            call.reject("Failed to commit export: " + e.getMessage());
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
            intent.setType("application/zip");
            intent.putExtra(Intent.EXTRA_TITLE, fileName);
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                "application/zip",
                "application/octet-stream",
                "application/x-zip-compressed",
                "*/*"
            });
            startActivityForResult(call, intent, "handleSaveAsResult");
        } catch (Exception e) {
            // Status only.
            Logger.error("LongTermBackup commitSaveAsExport failed: " + e.getClass().getSimpleName(), null);
            call.reject("Failed to save backup: " + e.getMessage());
        }
    }

    @PluginMethod
    public void listDefaultBackups(PluginCall call) {
        try {
            File backupDir = getBackupDirectory();

            JSObject result = new JSObject();
            JSArray filesArray = new JSArray();

            if (backupDir == null || !backupDir.exists()) {
                result.put("files", filesArray);
                call.resolve(result);
                return;
            }

            File[] files = backupDir.listFiles((dir, name) -> name.endsWith(".wardrobebackup"));
            if (files == null || files.length == 0) {
                result.put("files", filesArray);
                call.resolve(result);
                return;
            }

            String latestName = "衣橱穿搭助手-latest.wardrobebackup";

            for (File file : files) {
                JSObject fileInfo = new JSObject();
                fileInfo.put("name", file.getName());
                fileInfo.put("displayName", file.getName());
                fileInfo.put("path", file.getAbsolutePath());
                fileInfo.put("size", file.length());
                fileInfo.put("modifiedAt", file.lastModified());
                fileInfo.put("mtime", file.lastModified());
                fileInfo.put("isLatest", file.getName().equals(latestName));
                filesArray.put(fileInfo);
            }

            result.put("files", filesArray);
            call.resolve(result);
        } catch (Exception e) {
            // Status only. We log the exception class name but not the message,
            // which could include user-specific path info on some devices.
            Logger.error("LongTermBackup listDefaultBackups failed: " + e.getClass().getSimpleName(), null);
            call.reject("无法读取默认长期备份目录: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openDefaultBackup(PluginCall call) {
        String fileName = call.getString("fileName");

        if (fileName == null) {
            call.reject("Missing fileName");
            return;
        }

        try {
            File backupDir = getBackupDirectory();
            if (backupDir == null || !backupDir.exists()) {
                JSObject errorResult = new JSObject();
                errorResult.put("code", ERROR_READ_REQUIRES_PICKER);
                errorResult.put("message", "默认备份目录不存在");
                call.resolve(errorResult);
                return;
            }

            File targetFile = new File(backupDir, fileName);
            if (!targetFile.exists()) {
                JSObject errorResult = new JSObject();
                errorResult.put("code", ERROR_READ_REQUIRES_PICKER);
                errorResult.put("message", "文件不存在: " + fileName);
                call.resolve(errorResult);
                return;
            }

            // Extract to temp directory
            File tempDir = new File(getContext().getCacheDir(), "read_" + System.currentTimeMillis());
            tempDir.mkdirs();

            extractZip(targetFile, tempDir);
            readSessions.put(tempDir.getAbsolutePath(), tempDir);

            JSObject result = new JSObject();
            result.put("readSessionId", tempDir.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            // Status only.
            Logger.error("LongTermBackup openDefaultBackup failed: " + e.getClass().getSimpleName(), null);
            JSObject errorResult = new JSObject();
            errorResult.put("code", ERROR_READ_REQUIRES_PICKER);
            errorResult.put("message", "无法读取备份文件: " + e.getMessage());
            call.resolve(errorResult);
        }
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
            // Status only.
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

            String content = readFileContent(targetFile);

            JSObject result = new JSObject();
            result.put("text", content);
            call.resolve(result);
        } catch (Exception e) {
            // Status only. We deliberately do not log the path or the content size.
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
        try {
            File tempDir = new File(getContext().getCacheDir(), "read_" + System.currentTimeMillis());
            tempDir.mkdirs();
            try (InputStream inputStream = getContext().getContentResolver().openInputStream(uri)) {
                if (inputStream == null) {
                    call.reject("无法读取选择的备份文件");
                    return;
                }
                extractZip(inputStream, tempDir);
            }
            readSessions.put(tempDir.getAbsolutePath(), tempDir);
            // Resolve a user-friendly display name. We try the ContentResolver DISPLAY_NAME
            // first, falling back to the URI's last path segment. We deliberately do NOT
            // log the full URI or its query parameters (per §4.4.5).
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
            JSObject response = new JSObject();
            response.put("readSessionId", tempDir.getAbsolutePath());
            response.put("fileName", displayName);
            call.resolve(response);
        } catch (Exception e) {
            // Status only. The display name is user-visible but should not appear in logcat.
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
            // Status only. We do not log the user-selected URI (it could be sensitive).
            Logger.error("LongTermBackup handleSaveAsResult failed: " + e.getClass().getSimpleName(), null);
            call.reject("无法保存备份: " + e.getMessage());
        }
    }

    // ===== Helper methods =====

    private File getBackupDirectory() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10+: use Downloads via MediaStore
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File backupDir = new File(downloadsDir, BACKUP_DIR_NAME);
            if (!backupDir.exists()) {
                backupDir.mkdirs();
            }
            return backupDir;
        } else {
            // Android 9 and below
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File backupDir = new File(downloadsDir, BACKUP_DIR_NAME);
            if (!backupDir.exists()) {
                backupDir.mkdirs();
            }
            return backupDir;
        }
    }

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
                // Skip info file (internal use)
                if (file.getName().startsWith("_")) continue;
                addDirectoryToZip(baseDir, file, zos);
            } else {
                // Skip info file (internal use)
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

    private void extractZip(File zipFile, File destDir) throws Exception {
        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFile))) {
            extractZipEntries(zis, destDir);
        }
    }

    private void extractZip(InputStream inputStream, File destDir) throws Exception {
        try (ZipInputStream zis = new ZipInputStream(inputStream)) {
            extractZipEntries(zis, destDir);
        }
    }

    private void extractZipEntries(ZipInputStream zis, File destDir) throws Exception {
        ZipEntry entry;
        while ((entry = zis.getNextEntry()) != null) {
            File newFile = new File(destDir, entry.getName());
            if (entry.isDirectory()) {
                newFile.mkdirs();
            } else {
                newFile.getParentFile().mkdirs();
                try (OutputStream fos = new FileOutputStream(newFile)) {
                    byte[] buffer = new byte[8192];
                    int len;
                    while ((len = zis.read(buffer)) > 0) {
                        fos.write(buffer, 0, len);
                    }
                }
            }
            zis.closeEntry();
        }
    }

    private String readFileContent(File file) throws Exception {
        StringBuilder content = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                content.append(line).append("\n");
            }
        }
        return content.toString();
    }

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
