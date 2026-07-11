import { describe, expect, it, vi } from "vitest";
import {
  GenericMiniConnectionError,
  GenericMiniSemanticMappingError,
  runGenericMiniAction,
  type GenericMiniCheckpoint,
  type GenericMiniDriver,
  type GenericMiniEvidenceSink,
  type GenericMiniExecution,
} from "../adapters/generic-mini";

function harness() {
  const checkpoint: GenericMiniCheckpoint = {
    screenshot: Buffer.from("png"),
    uiTree: [{ parityId: "parity.mini.test" }],
    route: { path: "pages/test/index" },
    network: [{ method: "GET", url: "http://127.0.0.1:3100/api/test", status: 200 }],
  };
  const driver: GenericMiniDriver = {
    connect: vi.fn(async () => undefined),
    openRoute: vi.fn(async () => undefined),
    tapParityId: vi.fn(async () => undefined),
    inputParityId: vi.fn(async () => undefined),
    callMethod: vi.fn(async () => undefined),
    back: vi.fn(async () => undefined),
    waitForStable: vi.fn(async () => undefined),
    capture: vi.fn(async () => checkpoint),
  };
  const phases: string[] = [];
  let execution: GenericMiniExecution | undefined;
  const sink: GenericMiniEvidenceSink = {
    checkpoint: vi.fn(async (phase) => { phases.push(phase); }),
    serverAssertion: vi.fn(async () => undefined),
    execution: vi.fn(async (result) => { execution = result; }),
  };
  return { driver, sink, phases, get execution() { return execution; } };
}

const base = {
  screenId: "wishlist.detail",
  stateId: "interested",
  actionId: "wishlist.detail.open",
  fixtureId: "wishlist.normal",
  sideEffect: "BACKEND_READ" as const,
};

describe("generic mini parity executor", () => {
  it("opens routes and records four ordered evidence phases", async () => {
    const h = harness();
    const result = await runGenericMiniAction({
      driver: h.driver,
      sink: h.sink,
      dangerousFixtureAllowlist: new Set(),
      action: { ...base, operation: { kind: "open", route: "/pages/wishlist/detail/index?id=fixture" }, returnOperation: { kind: "back" } },
    });
    expect(result.status).toBe("PASS");
    expect(h.driver.openRoute).toHaveBeenCalledOnce();
    expect(h.driver.back).toHaveBeenCalledOnce();
    expect(h.phases).toEqual(["00-before", "01-immediate", "02-settled", "03-return-or-close"]);
  });

  it("uses parity-id tap/input and supports callMethod fallback", async () => {
    const tap = harness();
    vi.mocked(tap.driver.tapParityId).mockRejectedValueOnce(new GenericMiniSemanticMappingError("selector unavailable"));
    const tapResult = await runGenericMiniAction({
      driver: tap.driver,
      sink: tap.sink,
      dangerousFixtureAllowlist: new Set(),
      action: { ...base, operation: { kind: "tap", parityId: "parity.mini.open", callMethodFallback: "openDetail", fallbackArgs: { id: "fixture" } } },
    });
    expect(tapResult.status).toBe("PASS");
    expect(tap.driver.callMethod).toHaveBeenCalledWith("openDetail", { id: "fixture" });

    const input = harness();
    await runGenericMiniAction({
      driver: input.driver,
      sink: input.sink,
      dangerousFixtureAllowlist: new Set(),
      action: { ...base, operation: { kind: "input", parityId: "parity.mini.name", value: "测试种草" } },
    });
    expect(input.driver.inputParityId).toHaveBeenCalledWith("parity.mini.name", "测试种草");
  });

  it("returns BLOCKED on WeChat connection failure without fake evidence", async () => {
    const h = harness();
    vi.mocked(h.driver.connect).mockRejectedValueOnce(new GenericMiniConnectionError("wechatide unavailable"));
    const result = await runGenericMiniAction({
      driver: h.driver,
      sink: h.sink,
      dangerousFixtureAllowlist: new Set(),
      action: { ...base, operation: { kind: "tap", parityId: "parity.mini.open" } },
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.evidencePhases).toEqual([]);
    expect(h.driver.capture).not.toHaveBeenCalled();
  });

  it("returns NOT_EXECUTED for missing semantic mapping or unsupported operation", async () => {
    const missing = harness();
    vi.mocked(missing.driver.tapParityId).mockRejectedValueOnce(new GenericMiniSemanticMappingError("parity-id unmapped"));
    const missingResult = await runGenericMiniAction({
      driver: missing.driver,
      sink: missing.sink,
      dangerousFixtureAllowlist: new Set(),
      action: { ...base, operation: { kind: "tap", parityId: "parity.missing" } },
    });
    expect(missingResult.status).toBe("NOT_EXECUTED");
    expect(missingResult.evidencePhases).toEqual(["00-before"]);

    const unsupported = harness();
    const unsupportedResult = await runGenericMiniAction({
      driver: unsupported.driver,
      sink: unsupported.sink,
      dangerousFixtureAllowlist: new Set(),
      action: { ...base, operation: { kind: "swipe" } },
    });
    expect(unsupportedResult.status).toBe("NOT_EXECUTED");
    expect(unsupported.driver.connect).not.toHaveBeenCalled();
  });

  it("blocks dangerous writes unless the exact fixture is allowlisted", async () => {
    const blocked = harness();
    const action = { ...base, sideEffect: "BACKEND_WRITE" as const, operation: { kind: "tap" as const, parityId: "parity.mini.delete" } };
    const result = await runGenericMiniAction({ driver: blocked.driver, sink: blocked.sink, dangerousFixtureAllowlist: new Set(), action });
    expect(result.status).toBe("BLOCKED");
    expect(blocked.driver.connect).not.toHaveBeenCalled();

    const allowed = harness();
    const allowedResult = await runGenericMiniAction({ driver: allowed.driver, sink: allowed.sink, dangerousFixtureAllowlist: new Set(["wishlist.normal"]), action });
    expect(allowedResult.status).toBe("PASS");
  });

  it("requires and records a passing server assertion before PASS", async () => {
    const missing = harness();
    const action = { ...base, serverAssertion: "wishlist-readback", operation: { kind: "tap" as const, parityId: "parity.mini.save" } };
    const missingResult = await runGenericMiniAction({ driver: missing.driver, sink: missing.sink, dangerousFixtureAllowlist: new Set(), action });
    expect(missingResult.status).toBe("NOT_EXECUTED");

    const failed = harness();
    const failedResult = await runGenericMiniAction({
      driver: failed.driver,
      sink: failed.sink,
      dangerousFixtureAllowlist: new Set(),
      serverAssertionHook: vi.fn(async () => ({ passed: false, evidence: { status: 404 }, reason: "readback missing" })),
      action,
    });
    expect(failedResult.status).toBe("DEFECT");
    expect(failedResult.serverAssertion).toEqual({ id: "wishlist-readback", passed: false });
    expect(failed.phases).toEqual(["00-before", "01-immediate", "02-settled"]);

    const passed = harness();
    const passedResult = await runGenericMiniAction({
      driver: passed.driver,
      sink: passed.sink,
      dangerousFixtureAllowlist: new Set(),
      serverAssertionHook: vi.fn(async () => ({ passed: true, evidence: { status: 200 } })),
      action,
    });
    expect(passedResult.status).toBe("PASS");
    expect(passedResult.serverAssertion).toEqual({ id: "wishlist-readback", passed: true });
    expect(passed.sink.serverAssertion).toHaveBeenCalledWith("wishlist-readback", { status: 200 });
  });
});
