package com.wardrobe.outfit;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

final class LongTermBackupTextIO {
    private LongTermBackupTextIO() {}

    static String readUtf8Exactly(File file) throws IOException {
        try (
            FileInputStream input = new FileInputStream(file);
            InputStreamReader reader = new InputStreamReader(input, StandardCharsets.UTF_8)
        ) {
            StringBuilder result = new StringBuilder();
            char[] buffer = new char[8192];
            int length;

            while ((length = reader.read(buffer)) != -1) {
                result.append(buffer, 0, length);
            }

            return result.toString();
        }
    }
}
