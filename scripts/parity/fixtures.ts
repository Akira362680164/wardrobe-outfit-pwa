import { promises as fs } from "node:fs";
import path from "node:path";
import type { DomainManifest, FixtureDefinition } from "./types";
import type { ValidationResult } from "./validate";
import { writeJson } from "./lib/fs";

const DOMAIN_FILES = ["shared-shell.yaml", "wardrobe.yaml", "intake.yaml", "outfits.yaml", "wishlist.yaml", "recommendations.yaml", "settings.yaml", "statistics.yaml"];

export async function validateFixtures(options: { cwd: string; runRoot: string }): Promise<ValidationResult> {
  const fixtureFile = path.join(options.cwd, "scripts", "parity", "fixtures", "catalog.json");
  const fixtures = JSON.parse(await fs.readFile(fixtureFile, "utf8")) as FixtureDefinition[];
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const fixture of fixtures) {
    if (ids.has(fixture.id)) errors.push(`duplicate fixture id ${fixture.id}`);
    ids.add(fixture.id);
    if (!fixture.description.trim()) errors.push(`${fixture.id}: description is empty`);
  }
  const manifestRoot = path.join(options.cwd, "scripts", "parity", "manifests");
  for (const filename of DOMAIN_FILES) {
    const manifest = JSON.parse(await fs.readFile(path.join(manifestRoot, filename), "utf8")) as DomainManifest;
    for (const screen of manifest.screens) {
      for (const fixtureId of screen.fixtures) {
        if (!ids.has(fixtureId)) errors.push(`${screen.id}: unknown fixture ${fixtureId}`);
      }
      for (const state of screen.states) {
        if (!ids.has(state.fixture)) errors.push(`${screen.id}/${state.id}: unknown fixture ${state.fixture}`);
      }
    }
  }
  const metrics = {
    fixtures: fixtures.length,
    destructive: fixtures.filter((fixture) => fixture.destructive).length,
    nondestructive: fixtures.filter((fixture) => !fixture.destructive).length,
  };
  const result = { valid: errors.length === 0, errors, warnings, metrics };
  await writeJson(path.join(options.runRoot, "manifests", "fixture-validation.json"), result);
  return result;
}
