import assert from "node:assert/strict";
import fs from "node:fs";

const commandService = fs.readFileSync("services/wardrobe-api/src/workspace/command-service.ts", "utf8");
const routes = fs.readFileSync("services/wardrobe-api/src/workspace/routes.ts", "utf8");
const repository = fs.readFileSync("src/lib/online/online-write-repository.ts", "utf8");
const app = fs.readFileSync("src/components/outfit-list-view.tsx", "utf8");

assert.match(routes, /outfit-plans\/\:id\/set-primary/);
assert.match(commandService, /setOutfitPlanPrimary/);
assert.match(commandService, /workspace-plan-primary:\$\{input\.userId\}:\$\{dateKey\}/);
assert.match(commandService, /isPrimary: shouldBePrimary/);
assert.match(repository, /setOutfitPlanPrimary: \(id: string, command: WorkspaceStateCommand\)/);
assert.doesNotMatch(app, /void repo(?:Upsert|Update)OutfitPlanEntry/);
assert.doesNotMatch(app, /void upsertOutfit\(updated\)/);

console.log("outfit plan primary contract passed");
