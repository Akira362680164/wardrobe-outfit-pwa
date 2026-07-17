import { strict as assert } from "node:assert";
import React, { useState } from "react";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  HomeCitySearchSession,
  HomeLocationMutationSession,
  commitHomeLocation,
  loadHomeWeatherDates,
} from "../src/lib/home/home-feed-operations";
import { HomeFeedTabPanels } from "../src/components/home/home-feed-tab-panels";
import { OnlineRequestError } from "../src/lib/online/online-error";

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function mutationFixtures() {
  let sequence = 0;
  const session = new HomeLocationMutationSession(() => `mutation-${++sequence}`);
  const command = { accountId: "account-a", sessionId: "device-a", action: "home" as const, locationId: "shanghai", expectedRevision: 3 };
  const first = session.begin(command);
  assert.equal(session.begin(command).clientMutationId, first.clientMutationId, "相同语义命令的网络重试必须复用幂等键");
  assert.notEqual(session.begin({ ...command, expectedRevision: 4 }).clientMutationId, first.clientMutationId, "revision 改变必须产生新命令");
  session.complete({ ...command, expectedRevision: 4 });
  assert.notEqual(session.begin({ ...command, expectedRevision: 4 }).clientMutationId, "mutation-2", "成功提交并读回后必须生成新幂等键");
  session.reset();
  assert.equal(session.isCurrent(first), false, "账号切换或卸载后旧写响应必须失效");

  const retrySession = new HomeLocationMutationSession(() => `stable-${++sequence}`);
  const attemptedIds: string[] = [];
  let failOnce = true;
  const execute = () => commitHomeLocation({
    session: retrySession, command, signal: new AbortController().signal,
    mutate: async (id) => { attemptedIds.push(id); if (failOnce) { failOnce = false; throw new OnlineRequestError(0, "server", "响应丢失", true); } return { revision: 4 }; },
    readLatest: async () => ({ revision: 4 }),
  });
  await assert.rejects(execute);
  assert.equal((await execute()).status, "committed");
  assert.equal(attemptedIds[0], attemptedIds[1], "响应丢失后的原样重试必须复用同一 clientMutationId");

  let conflictReads = 0;
  const conflict = await commitHomeLocation({
    session: new HomeLocationMutationSession(() => "conflict-id"), command, signal: new AbortController().signal,
    mutate: async () => { throw new OnlineRequestError(409, "conflict", "revision 冲突", true); },
    readLatest: async () => { conflictReads += 1; return { revision: 9 }; },
  });
  assert.deepEqual(conflict, { status: "conflict", snapshot: { revision: 9 } }, "409 必须读取并返回最新服务端地点快照");
  assert.equal(conflictReads, 1);
}

async function citySearchFixtures() {
  const calls: string[] = [];
  const aborted: string[] = [];
  const states: string[] = [];
  const session = new HomeCitySearchSession({
    delayMs: 20,
    request: async (query, signal) => {
      calls.push(query);
      signal.addEventListener("abort", () => aborted.push(query));
      await sleep(query === "上海" ? 8 : 40);
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      return [{ locationId: query, displayName: query, timezone: "Asia/Shanghai" }];
    },
    onState: (state) => states.push(`${state.status}:${state.query}`),
  });

  session.update("account-a", "上");
  session.update("account-a", "上海");
  await sleep(40);
  assert.deepEqual(calls, ["上海"], "连续输入上→上海只允许一次上游请求");
  session.startComposition();
  session.update("account-a", "北", true);
  session.update("account-a", "北京", true);
  await sleep(30);
  assert.equal(calls.includes("北京"), false, "IME composition 过程中不得请求");
  session.endComposition("account-a", "北京");
  await sleep(40);
  assert.equal(calls.includes("北京"), true, "composition end 后才允许防抖请求");
  const callsBeforeCacheHit = calls.length;
  session.update("account-a", " 上海 ");
  await sleep(1);
  assert.equal(calls.length, callsBeforeCacheHit, "同一规范化 query 必须复用会话缓存");

  session.update("account-a", "杭州");
  await sleep(24);
  session.update("account-a", "深圳");
  await sleep(70);
  assert.ok(aborted.includes("杭州"), "查询变化必须取消旧请求并阻止晚到结果");

  session.update("account-b", "上海");
  await sleep(40);
  assert.equal(calls.filter((query) => query === "上海").length, 2, "账号切换必须清空搜索缓存");

  let retryAfter: number | undefined;
  const limited = new HomeCitySearchSession({
    delayMs: 1,
    request: async () => { throw new OnlineRequestError(429, "server", "搜索过于频繁", true, undefined, undefined, 37); },
    onState: (state) => { if (state.status === "rate_limited") retryAfter = state.retryAfterSeconds; },
  });
  limited.update("account-a", "上海");
  await sleep(10);
  assert.equal(retryAfter, 37, "429 必须保留 retryAfter 且不得自动重试");
  assert.equal(states.some((state) => state === "ready:上海"), true);
}

async function weatherFixtures() {
  const cache = new Map<string, string>();
  const first = await loadHomeWeatherDates(["today", "tomorrow"], async (date) => {
    if (date === "tomorrow") throw new OnlineRequestError(503, "server", "明日失败", true);
    return date;
  });
  first.values.forEach((value, date) => cache.set(date, value));
  assert.equal(cache.get("today"), "today", "today 200 + tomorrow 503 时今日结果必须进入缓存");
  assert.equal(first.errors.has("tomorrow"), true);

  const reverse = await loadHomeWeatherDates(["tomorrow", "today"], async (date) => {
    if (date === "today") throw new OnlineRequestError(503, "server", "今日失败", true);
    return date;
  });
  assert.equal(reverse.values.get("tomorrow"), "tomorrow", "预取成功不得被选中日期失败连坐丢弃");
  assert.equal(reverse.errors.has("today"), true);

  const settlementOrder: string[] = [];
  let releaseTomorrow!: () => void;
  const tomorrowGate = new Promise<void>((resolve) => { releaseTomorrow = resolve; });
  const pending = loadHomeWeatherDates(["today", "tomorrow"], async (date) => {
    if (date === "tomorrow") await tomorrowGate;
    return date;
  }, (settledDate) => settlementOrder.push(settledDate));
  await sleep(1);
  assert.deepEqual(settlementOrder, ["today"], "选中日期成功必须先展示，不能等待预取日期结束");
  releaseTomorrow();
  await pending;
}

async function lazyWardrobeFixture() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  let renders = 0;
  function Harness() {
    const [tab, setTab] = useState<"recommendation" | "wardrobe">("recommendation");
    return <><button id="recommend" onClick={() => setTab("recommendation")}>推荐</button><button id="wardrobe" onClick={() => setTab("wardrobe")}>衣橱</button><HomeFeedTabPanels activeTab={tab} recommendation={<div id="feed">推荐树</div>} renderWardrobe={() => { renders += 1; return <input id="wardrobe-state" defaultValue="保留我" />; }} /></>;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  await act(async () => root.render(<Harness />));
  assert.equal(dom.window.document.getElementById("wardrobe-state"), null, "推荐首屏不得创建衣橱能力树");
  await act(async () => dom.window.document.getElementById("wardrobe")!.click());
  const input = dom.window.document.getElementById("wardrobe-state") as HTMLInputElement;
  assert.ok(input, "首次切换后必须挂载衣橱能力树");
  input.value = "用户状态";
  await act(async () => dom.window.document.getElementById("recommend")!.click());
  assert.equal((dom.window.document.getElementById("wardrobe-state") as HTMLInputElement).value, "用户状态", "返回推荐后衣橱树必须保持 mounted 和内部状态");
  assert.equal(renders >= 1, true);
  await act(async () => root.unmount());
  dom.window.close();
}

async function main() {
  await mutationFixtures();
  await citySearchFixtures();
  await weatherFixtures();
  await lazyWardrobeFixture();
  console.log("home feed P1.1 behavior fixtures passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
