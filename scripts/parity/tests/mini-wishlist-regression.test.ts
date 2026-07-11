import { describe, expect, it, vi } from "vitest";
import {
  MiniWishlistConnectionError,
  MiniWishlistNativeMediaBlockedError,
  runMiniWishlistRegression,
  type MiniWishlistRegressionDriver,
  type MiniWishlistRegressionExecution,
  type MiniWishlistRegressionSink,
} from "../adapters/mini-wishlist-regression";

function harness() {
  const driver: MiniWishlistRegressionDriver = {
    connect: vi.fn(async () => undefined),
    openWishlistDetail: vi.fn(async () => undefined),
    openWishlistEdit: vi.fn(async () => undefined),
    selectLocation: vi.fn(async () => undefined),
    confirmConversion: vi.fn(async () => undefined),
    undoPurchase: vi.fn(async () => undefined),
    recropAndUploadMedia: vi.fn(async () => undefined),
    returnFromAction: vi.fn(async () => undefined),
    waitForStable: vi.fn(async () => undefined),
    capture: vi.fn(async () => ({
      screenshot: Buffer.from("png"),
      uiTree: [{ parityId: "parity.mini.test" }],
      route: { path: "pages/wishlist/detail/index" },
      network: [{ method: "GET", url: "http://127.0.0.1:3100/api/workspace/wishlist", status: 200 }],
    })),
  };
  const phases = new Map<string, string[]>();
  const executions: MiniWishlistRegressionExecution[] = [];
  const sink: MiniWishlistRegressionSink = {
    checkpoint: vi.fn(async (actionId, phase) => phases.set(actionId, [...(phases.get(actionId) ?? []), phase])),
    serverReadback: vi.fn(async () => undefined),
    execution: vi.fn(async (result) => { executions.push(result); }),
  };
  const readback = vi.fn(async (kind: "conversion" | "undo" | "media") => ({ passed: true, evidence: { kind, status: 200 } }));
  return { driver, sink, phases, executions, readback };
}

const fixture = { fixtureId: "wishlist.normal", wishlistId: "wishlist-123", locationId: "location-456" };
const four = ["00-before", "01-immediate", "02-settled", "03-return-or-close"];

describe("mini wishlist targeted regression collector", () => {
  it("runs conversion with real location, undo, and media upload with readback", async () => {
    const h = harness();
    const results = await runMiniWishlistRegression({
      driver: h.driver,
      fixture,
      dangerousFixtureAllowlist: new Set([fixture.fixtureId]),
      readback: h.readback,
      sink: h.sink,
    });
    expect(results.map((result) => result.status)).toEqual(["PASS", "PASS", "PASS"]);
    expect(h.driver.selectLocation).toHaveBeenCalledWith("location-456");
    expect(h.driver.confirmConversion).toHaveBeenCalledOnce();
    expect(h.driver.undoPurchase).toHaveBeenCalledOnce();
    expect(h.driver.recropAndUploadMedia).toHaveBeenCalledOnce();
    expect(h.readback.mock.calls.map(([kind]) => kind)).toEqual(["conversion", "undo", "media"]);
    for (const result of results) expect(h.phases.get(result.actionId)).toEqual(four);
  });

  it("blocks every write before connecting when fixture is not allowlisted", async () => {
    const h = harness();
    const results = await runMiniWishlistRegression({ driver: h.driver, fixture, dangerousFixtureAllowlist: new Set(), readback: h.readback, sink: h.sink });
    expect(results.map((result) => result.status)).toEqual(["BLOCKED", "BLOCKED", "BLOCKED"]);
    expect(h.driver.connect).not.toHaveBeenCalled();
    expect(h.driver.capture).not.toHaveBeenCalled();
  });

  it("returns BLOCKED rather than fake PASS when WeChat cannot connect", async () => {
    const h = harness();
    vi.mocked(h.driver.connect).mockRejectedValueOnce(new MiniWishlistConnectionError("wechatide unavailable"));
    const results = await runMiniWishlistRegression({ driver: h.driver, fixture, dangerousFixtureAllowlist: new Set([fixture.fixtureId]), readback: h.readback, sink: h.sink });
    expect(results.every((result) => result.status === "BLOCKED")).toBe(true);
    expect(results.every((result) => result.evidencePhases.length === 0)).toBe(true);
  });

  it("marks media action BLOCKED when native image selection is unavailable", async () => {
    const h = harness();
    vi.mocked(h.driver.recropAndUploadMedia).mockRejectedValueOnce(new MiniWishlistNativeMediaBlockedError("native picker requires phone interaction"));
    const results = await runMiniWishlistRegression({ driver: h.driver, fixture, dangerousFixtureAllowlist: new Set([fixture.fixtureId]), readback: h.readback, sink: h.sink });
    expect(results.map((result) => result.status)).toEqual(["PASS", "PASS", "BLOCKED"]);
    expect(results[2].evidencePhases).toEqual(["00-before", "03-return-or-close"]);
    expect(h.readback).toHaveBeenCalledTimes(2);
  });

  it("records four phases and DEFECT when authoritative readback fails", async () => {
    const h = harness();
    h.readback.mockImplementation(async (kind) => kind === "conversion"
      ? { passed: false, evidence: { status: 404 }, reason: "converted garment missing" }
      : { passed: true, evidence: { kind, status: 200 } });
    const results = await runMiniWishlistRegression({ driver: h.driver, fixture, dangerousFixtureAllowlist: new Set([fixture.fixtureId]), readback: h.readback, sink: h.sink });
    expect(results[0].status).toBe("DEFECT");
    expect(results[0].reason).toBe("converted garment missing");
    expect(results[0].serverReadback).toEqual({ kind: "conversion", passed: false });
    expect(h.phases.get(results[0].actionId)).toEqual(four);
    expect(h.sink.serverReadback).toHaveBeenCalledWith("wishlist.convert.confirm", { status: 404 });
  });
});
