import { describe, expect, it, vi } from "vitest";
import {
  captureMiniIntakeRegression,
  type MiniIntakeCheckpoint,
  type MiniIntakeDriver,
  type MiniIntakeEvidenceSink,
  type MiniIntakeExecution,
} from "./mini-intake-regression";

function harness(paths: string[] = ["wxfile://tmp_fixture/cropped.jpg"]) {
  const checkpoint: MiniIntakeCheckpoint = { screenshot: Buffer.from("png"), uiTree: {}, route: {}, network: [] };
  const driver: MiniIntakeDriver = {
    injectTemporaryImage: vi.fn(async () => undefined),
    clearInjectedState: vi.fn(async () => undefined),
    callMethod: vi.fn(async () => undefined),
    setFailureState: vi.fn(async () => undefined),
    waitForStable: vi.fn(async () => undefined),
    capture: vi.fn(async () => checkpoint),
    referencedImagePaths: vi.fn(async () => paths),
  };
  const phases = new Map<string, string[]>();
  const executions: MiniIntakeExecution[] = [];
  const sink: MiniIntakeEvidenceSink = {
    checkpoint: vi.fn(async (actionId, phase) => { phases.set(actionId, [...(phases.get(actionId) ?? []), phase]); }),
    execution: vi.fn(async (execution) => { executions.push(execution); }),
  };
  return { driver, sink, phases, executions };
}

describe("mini intake crop regression collector", () => {
  it("marks a native picker run BLOCKED when no fixture path is injected", async () => {
    const h = harness();
    const results = await captureMiniIntakeRegression({ driver: h.driver, sink: h.sink, fixtureId: "garment.complete", fixtureAllowlist: new Set(["garment.complete"]) });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("BLOCKED");
    expect(h.driver.capture).not.toHaveBeenCalled();
  });

  it("rejects USER_DATA_PATH and non-allowlisted fixture injection", async () => {
    for (const options of [
      { fixtureId: "garment.complete", temporaryImagePath: "wxfile://usr/intake/copy.jpg", fixtureAllowlist: new Set(["garment.complete"]) },
      { fixtureId: "garment.unknown", temporaryImagePath: "wxfile://tmp_fixture/a.jpg", fixtureAllowlist: new Set(["garment.complete"]) },
    ]) {
      const h = harness();
      const results = await captureMiniIntakeRegression({ driver: h.driver, sink: h.sink, ...options });
      expect(results[0].status).toBe("BLOCKED");
      expect(h.driver.injectTemporaryImage).not.toHaveBeenCalled();
    }
  });

  it("captures all crop, failure and retry cases in four ordered phases", async () => {
    const h = harness();
    const results = await captureMiniIntakeRegression({
      driver: h.driver,
      sink: h.sink,
      fixtureId: "garment.complete",
      temporaryImagePath: "wxfile://tmp_fixture/source.jpg",
      fixtureAllowlist: new Set(["garment.complete"]),
    });
    expect(results.map((item) => item.actionId)).toEqual([
      "intake.crop.open", "intake.crop.rotate-left", "intake.crop.rotate-right", "intake.crop.reset",
      "intake.crop.confirm", "intake.crop.skip", "intake.crop.failure", "intake.crop.retry",
    ]);
    expect(results.every((item) => item.status === "PASS")).toBe(true);
    for (const result of results) {
      expect(h.phases.get(result.actionId)).toEqual(["00-before", "01-immediate", "02-settled", "03-return-or-close"]);
    }
    expect(h.driver.setFailureState).toHaveBeenCalledWith("fixture upload failed");
    expect(h.driver.callMethod).toHaveBeenCalledWith("retryFailedUpload");
  });

  it("fails evidence when page/store references a persistent USER_DATA_PATH copy", async () => {
    const h = harness(["wxfile://usr/intake/persisted.jpg"]);
    const results = await captureMiniIntakeRegression({
      driver: h.driver,
      sink: h.sink,
      fixtureId: "garment.complete",
      temporaryImagePath: "/tmp/source.jpg",
      fixtureAllowlist: new Set(["garment.complete"]),
    });
    expect(results.every((item) => item.status === "DEFECT")).toBe(true);
    expect(results[0].persistentCopies).toEqual(["wxfile://usr/intake/persisted.jpg"]);
  });

  it("retains partial phase evidence when a method fails", async () => {
    const h = harness();
    vi.mocked(h.driver.callMethod).mockImplementation(async (method) => {
      if (method === "rotateCropLeft") throw new Error("method missing");
    });
    const results = await captureMiniIntakeRegression({
      driver: h.driver,
      sink: h.sink,
      fixtureId: "garment.complete",
      temporaryImagePath: "wxfile://tmp_fixture/source.jpg",
      fixtureAllowlist: new Set(["garment.complete"]),
    });
    const failed = results.find((item) => item.actionId === "intake.crop.rotate-left");
    expect(failed?.status).toBe("DEFECT");
    expect(failed?.evidencePhases).toEqual(["00-before"]);
  });
});
