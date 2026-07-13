import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { generateRecommendations } from "../services/wardrobe-api/src/recommendations/index.js";
import { recommendationScenarioFixtures } from "../services/wardrobe-api/tests/fixtures/recommendations/scenarios.js";

const reportPath = resolve("tests/reports/recommendations/SHADOW_ACCEPTANCE.md");
const auditPath = resolve("tests/reports/recommendations/shadow-audit.json");
const reviewScenarioIds = new Set(["rainy_commute", "hot_casual", "winter_low_temperature", "formal_meeting", "travel_outdoor", "dress_template", "saved_successful_outfit", "recent_repeat", "limited_two_candidates", "not_ready_missing_slot"]);

async function main(): Promise<void> {
const results = await Promise.all(recommendationScenarioFixtures.map(async (fixture) => ({ fixture, output: await generateRecommendations(fixture.input) })));
const audit = {
  schemaVersion: 1,
  ruleVersion: results[0]?.output.ruleVersion,
  fixtureCount: results.length,
  fixtureExpectedValuesAreHandReviewed: true,
  generatedFromSyntheticDataOnly: true,
  scenarios: results.map(({ fixture, output }) => ({
    id: fixture.id,
    title: fixture.title,
    targetDate: fixture.input.dateContextInput.date,
    timezone: fixture.input.dateContextInput.timezone,
    context: output.dateContext,
    readiness: output.readiness,
    recommendations: output.recommendations.map((candidate) => ({ objective: candidate.objective, candidateId: candidate.candidateId, garmentIds: candidate.garmentIds, finalScore: candidate.finalScore, ruleScores: candidate.ruleScores, objectiveScores: candidate.objectiveScores, reasonCodes: candidate.reasonCodes, riskCodes: candidate.riskCodes, missingSlotCodes: candidate.missingSlotCodes, fallbackUsed: candidate.pawEvaluation.fallbackUsed })),
    exclusions: output.exclusions,
    metrics: output.metrics,
  })),
};
const markdown = [
  "# Wardora Recommendation 1A Shadow Acceptance",
  "",
  "> Synthetic, local-only fixtures. No production identity, image, wardrobe, database, QWeather, or PAW data is used.",
  "",
  `Rule version: \`${audit.ruleVersion}\``,
  `Fixture count: **${audit.fixtureCount}**`,
  "PAW mode: **disabled; neutral evaluator fallback**",
  "",
  ...results.filter(({ fixture }) => reviewScenarioIds.has(fixture.id)).flatMap(({ fixture, output }) => [
    `## ${fixture.title} (\`${fixture.id}\`)`,
    "",
    `- Context: ${output.dateContext.contextSummary}; target ${fixture.input.dateContextInput.date} in ${fixture.input.dateContextInput.timezone}.`,
    `- Readiness: **${output.readiness.status}**; valid ${output.readiness.validCandidateCount}, displayable ${output.readiness.displayableCandidateCount}; missing slots: ${output.readiness.missingSlotCodes.join(", ") || "none"}.`,
    ...(["safe", "fresh", "comfort"] as const).map((objective) => {
      const candidate = output.recommendations.find((item) => item.objective === objective);
      return candidate ? `- ${objective}: ${candidate.garmentIds.join(" + ")} | ${candidate.finalScore} | reasons ${candidate.reasonCodes.join(", ")} | risks ${candidate.riskCodes.join(", ") || "none"}.` : `- ${objective}: not returned (insufficient qualified diversity).`;
    }),
    `- Exclusions: ${output.exclusions.length === 0 ? "none" : output.exclusions.map((entry) => `${entry.garmentId}:${entry.codes.join("+")}`).join("; ")}.`,
    "",
  ]),
  "## Review notes",
  "",
  "- The report is derived from committed synthetic fixtures; expected fixture declarations are never generated or overwritten by this script.",
  "- UUIDs are synthetic audit identifiers. Product UI copy is intentionally out of scope.",
  "- Detailed score components and all 24 scenario results are in `shadow-audit.json`.",
  "",
].join("\n");
const json = `${JSON.stringify(audit, null, 2)}\n`;
const write = process.argv.includes("--write");
const check = process.argv.includes("--check");
if (write === check) throw new Error("Pass exactly one of --write or --check");
if (write) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, markdown, "utf8");
  writeFileSync(auditPath, json, "utf8");
  console.log(`Wrote ${reportPath}`);
  console.log(`Wrote ${auditPath}`);
} else {
  if (!existsSync(reportPath) || !existsSync(auditPath)) throw new Error("Shadow artifacts are missing; explicit --write and review required");
  if (readFileSync(reportPath, "utf8") !== markdown || readFileSync(auditPath, "utf8") !== json) throw new Error("Shadow artifacts are stale; run explicit --write, review the diff, and commit it");
  console.log(`Shadow artifacts match ${results.length} committed fixtures`);
}
}

void main();
