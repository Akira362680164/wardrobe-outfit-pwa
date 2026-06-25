package com.wardrobe.outfit;

import static org.junit.Assert.assertEquals;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.junit.Test;

public class LongTermBackupTextIOTest {
    @Test
    public void readSingleLineWithoutTrailingNewlineExactly() throws Exception {
        assertReadExactly("abc");
    }

    @Test
    public void readSingleLineWithLfExactly() throws Exception {
        assertReadExactly("abc\n");
    }

    @Test
    public void readSingleLineWithCrLfExactly() throws Exception {
        assertReadExactly("abc\r\n");
    }

    @Test
    public void readMultilineJsonExactly() throws Exception {
        assertReadExactly("{\n  \"name\": \"衣橱\",\n  \"items\": []\n}");
    }

    @Test
    public void readChineseUtf8Exactly() throws Exception {
        assertReadExactly("衣橱穿搭助手备份");
    }

    @Test
    public void readDataUrlWithoutTrailingNewlineDoesNotAppend() throws Exception {
        assertReadExactly("data:image/jpeg;base64,abc123");
    }

    @Test
    public void readEmptyFileAsEmptyString() throws Exception {
        assertReadExactly("");
    }

    private static void assertReadExactly(String expected) throws Exception {
        File file = File.createTempFile("long-term-backup-text-io", ".txt");
        try {
            Files.write(file.toPath(), expected.getBytes(StandardCharsets.UTF_8));
            assertEquals(expected, LongTermBackupTextIO.readUtf8Exactly(file));
        } finally {
            file.delete();
        }
    }
}
