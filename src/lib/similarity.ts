import { type SimilarWardrobeMatch, type WardrobeItem } from "@/lib/types";
import { getAllColors, getPrimaryColors } from "@/lib/color-fields";

type SimilarityDraft = Pick<WardrobeItem, "category" | "colors" | "seasons" | "styles" | "formality" | "warmth">;

export function findSimilarWardrobeItems(draft: SimilarityDraft, items: WardrobeItem[]): SimilarWardrobeMatch[] {
  return items
    .map((item) => scoreSimilarity(draft, item))
    .filter((match) => match.similarity >= 70)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}

function scoreSimilarity(draft: SimilarityDraft, item: WardrobeItem): SimilarWardrobeMatch {
  const reasons: string[] = [];
  let score = 0;

  if (draft.category === item.category) {
    score += 32;
    reasons.push("类别一致");
  }

  const primaryOverlap = overlapScore(getPrimaryColors(draft.colors), getPrimaryColors(item.colors));
  if (primaryOverlap > 0) {
    score += 28 * primaryOverlap;
    reasons.push("主色接近");
  }

  const colorOverlap = overlapScore(getAllColors(draft.colors), getAllColors(item.colors));
  if (colorOverlap > 0) {
    score += 14 * colorOverlap;
    if (!reasons.includes("主色接近")) reasons.push("颜色接近");
  }

  const seasonOverlap = overlapScore(draft.seasons, item.seasons);
  if (seasonOverlap > 0) {
    score += 10 * seasonOverlap;
    reasons.push("季节接近");
  }

  const styleOverlap = overlapScore(draft.styles, item.styles);
  if (styleOverlap > 0) {
    score += 10 * styleOverlap;
    reasons.push("风格接近");
  }

  const draftWarmth = draft.warmth ?? 3;
  const itemWarmth = item.warmth ?? 3;
  const draftFormality = draft.formality ?? 3;
  const itemFormality = item.formality ?? 3;
  const warmthDiff = Math.abs(draftWarmth - itemWarmth);
  const formalityDiff = Math.abs(draftFormality - itemFormality);
  score += Math.max(0, 3 - warmthDiff) * 1.5;
  score += Math.max(0, 3 - formalityDiff) * 1.5;

  return {
    item,
    similarity: Math.min(99, Math.round(score)),
    reasons: reasons.slice(0, 3),
  };
}

function overlapScore<T>(left: T[], right: T[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let hits = 0;
  leftSet.forEach((value) => {
    if (rightSet.has(value)) hits += 1;
  });
  return hits / Math.max(leftSet.size, rightSet.size);
}
