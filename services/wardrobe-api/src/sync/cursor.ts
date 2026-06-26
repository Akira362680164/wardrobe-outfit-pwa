// services/wardrobe-api/src/sync/cursor.ts
// v1.1.37 cloud 1B B4: cursor 编解码
// cursor 是 sync_changes 的 changeSeq 编号 + serverTime 元组。
// B4 用简单的 base64(JSON) 格式；后续若需要 compact 表达可换 varint + 序列号。

export interface Cursor {
  seq: number;
  serverTime: string;
}

export function encodeCursor(seq: number, serverTime: string): string {
  const json = JSON.stringify({ seq, serverTime });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): Cursor {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<Cursor>;
    if (typeof parsed.seq !== "number" || typeof parsed.serverTime !== "string") {
      throw new Error("invalid cursor fields");
    }
    return { seq: parsed.seq, serverTime: parsed.serverTime };
  } catch (cause) {
    throw new Error(`Invalid cursor: ${(cause as Error).message}`);
  }
}
