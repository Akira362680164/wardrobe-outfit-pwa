import { describe, expect, it, vi } from "vitest";
import {
  runGenericAppAction,
  type GenericAppCheckpoint,
  type GenericAppDriver,
  type GenericAppEvidenceSink,
  type GenericAppExecution,
} from "../adapters/generic-app";

function harness() {
  const checkpoint: GenericAppCheckpoint = {
    screenshot: Buffer.from("png"),
    uiTree: [{ parityId: "parity.test" }],
    route: { href: "https://localhost/" },
    network: [],
  };
  const driver: GenericAppDriver = {
    openRoute: vi.fn(async () => undefined),
    clickParityId: vi.fn(async () => undefined),
    typeParityId: vi.fn(async () => undefined),
    back: vi.fn(async () => undefined),
    waitForStable: vi.fn(async () => undefined),
    capture: vi.fn(async () => checkpoint),
  };
  const phases: string[] = [];
  let execution: GenericAppExecution | undefined;
  const sink: GenericAppEvidenceSink = {
    checkpoint: vi.fn(async (phase) => { phases.push(phase); }),
    execution: vi.fn(async (result) => { execution = result; }),
  };
  return { driver, sink, phases, get execution() { return execution; } };
}

const base = {
  screenId: "wardrobe.garment.detail",
  stateId: "info.top",
  actionId: "garment.detail.more",
  fixtureId: "garment.complete",
  sideEffect: "LOCAL_STATE" as const,
};

describe("generic APP parity executor", () => {
  it("clicks a parity-id and writes all four ordered phases", async () => {
    const h = harness();
    const result = await runGenericAppAction({
      driver: h.driver,
      sink: h.sink,
      dangerousFixtureAllowlist: new Set(),
      action: { ...base, operation: { kind: "click", parityId: "parity.app.more" }, returnOperation: { kind: "back" } },
    });

    expect(result.status).toBe("PASS");
    expect(h.driver.clickParityId).toHaveBeenCalledWith("parity.app.more");
    expect(h.driver.back).toHaveBeenCalledOnce();
    expect(h.phases).toEqual(["00-before", "01-immediate", "02-settled", "03-return-or-close"]);
  });

  it("supports open, type, back and checkpoint operations", async () => {
    for (const operation of [
      { kind: "open", route: "garment_detail" },
      { kind: "type", parityId: "parity.app.name", value: "衬衫" },
      { kind: "back" },
      { kind: "checkpoint" },
    ] as const) {
      const h = harness();
      const result = await runGenericAppAction({ driver: h.driver, sink: h.sink, dangerousFixtureAllowlist: new Set(), action: { ...base, operation } });
      expect(result.status).toBe("PASS");
      expect(h.phases).toHaveLength(4);
    }
  });

  it("blocks dangerous writes unless the exact fixture is allowlisted", async () => {
    const blocked = harness();
    const action = { ...base, sideEffect: "BACKEND_WRITE" as const, operation: { kind: "click" as const, parityId: "parity.app.delete" } };
    const blockedResult = await runGenericAppAction({ driver: blocked.driver, sink: blocked.sink, dangerousFixtureAllowlist: new Set(), action });
    expect(blockedResult.status).toBe("BLOCKED");
    expect(blocked.driver.capture).not.toHaveBeenCalled();

    const allowed = harness();
    const allowedResult = await runGenericAppAction({ driver: allowed.driver, sink: allowed.sink, dangerousFixtureAllowlist: new Set(["garment.complete"]), action });
    expect(allowedResult.status).toBe("PASS");
  });

  it("records unknown operations as NOT_EXECUTED without touching the driver", async () => {
    const h = harness();
    const result = await runGenericAppAction({
      driver: h.driver,
      sink: h.sink,
      dangerousFixtureAllowlist: new Set(),
      action: { ...base, operation: { kind: "swipe" } },
    });
    expect(result.status).toBe("NOT_EXECUTED");
    expect(h.driver.capture).not.toHaveBeenCalled();
    expect(h.execution?.status).toBe("NOT_EXECUTED");
  });

  it("records partial evidence and DEFECT when an action fails", async () => {
    const h = harness();
    vi.mocked(h.driver.clickParityId).mockRejectedValueOnce(new Error("locator missing"));
    const result = await runGenericAppAction({
      driver: h.driver,
      sink: h.sink,
      dangerousFixtureAllowlist: new Set(),
      action: { ...base, operation: { kind: "click", parityId: "parity.missing" } },
    });
    expect(result.status).toBe("DEFECT");
    expect(result.evidencePhases).toEqual(["00-before"]);
    expect(result.reason).toBe("locator missing");
  });
});
