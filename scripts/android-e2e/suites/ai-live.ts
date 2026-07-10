import { readFileSync } from "node:fs";

import type { AndroidE2ECase, AndroidE2EContext } from "./types";
import { assert, ensureAccount, fixtureImagePath } from "./helpers";

export function aiLiveCases(): AndroidE2ECase[] {
  return [
    { id: "ai-live:minimax-real-image", title: "真实图片 + live MiniMax 手动识别", run: aiLiveMiniMaxRealImage },
  ];
}

async function aiLiveMiniMaxRealImage(ctx: AndroidE2EContext): Promise<void> {
  if (process.env.ANDROID_E2E_AI_LIVE !== "1") {
    throw new Error("AI live suite requires ANDROID_E2E_AI_LIVE=1");
  }
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("AI live suite requires MINIMAX_API_KEY");

  const account = await ensureAccount(ctx);
  const session = await ctx.api.login(account);
  const imagePath = fixtureImagePath();
  const imageDataUrl = `data:image/jpeg;base64,${readFileSync(imagePath).toString("base64")}`;
  const response = await ctx.api.request<{
    tag?: { candidateNames?: string[]; category?: string; confidence?: number };
  }>(session, "/api/workspace/ai/intake/garment-recognition", {
    method: "POST",
    body: {
      miniMax: {
        apiKey,
        apiHost: process.env.MINIMAX_API_HOST ?? "https://api.minimaxi.com",
        model: process.env.MINIMAX_MODEL ?? "MiniMax-M3",
        timeoutMs: Number(process.env.MINIMAX_TIMEOUT_MS ?? 60_000),
      },
      imageDataUrl,
      fallbackName: "red-shirt.jpg",
    },
  });

  assert(Array.isArray(response.tag?.candidateNames) && response.tag.candidateNames.length > 0, "MiniMax response did not include candidate names");
  assert(typeof response.tag?.category === "string" && response.tag.category.length > 0, "MiniMax response did not include category");
  await ctx.artifacts.writeJson("ai-live-minimax-response.json", {
    candidateNames: response.tag.candidateNames,
    category: response.tag.category,
    confidence: response.tag.confidence ?? null,
  });
}
