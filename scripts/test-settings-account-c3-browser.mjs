import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveSourcePath(path) {
  for (const suffix of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]) {
    const candidate = `${path}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return path;
}

const entry = `
  import React, { useRef, useState } from "react";
  import { createRoot } from "react-dom/client";
  import { OverlayRoot } from "@/components/overlay-root";
  import { MotionSheet } from "@/components/motion-common";
  import { NavigationMotion } from "@/components/navigation-motion";
  import { useAppNavigationController } from "@/components/use-app-navigation-controller";
  import {
    createSettingsPageTransition,
    SettingsSubpageMotion,
  } from "@/components/auth/settings-subpage-motion";

  function SettingsHarness({ openAccount }) {
    const [navigation, setNavigation] = useState(() => ({
      page: "home",
      transition: createSettingsPageTransition(0, "home", "home", "push"),
    }));
    const navigate = (next) => setNavigation((current) => current.page === next ? current : ({
      page: next,
      transition: createSettingsPageTransition(
        current.transition.id + 1,
        current.page,
        next,
        next === "home" ? "pop" : "push",
      ),
    }));
    window.__c3 = {
      ...(window.__c3 || {}),
      pushProfile: () => navigate("profile"),
      pushWardrobes: () => navigate("wardrobes"),
      popSetting: () => navigate("home"),
      openAccount,
    };

    const page = navigation.page === "home" ? (
      <main className="screen settings-home" data-settings-page="home">
        <h1>设置</h1>
        <p>账号、画像、参考照、MiniMax 与衣橱位置</p>
        <button id="open-account" onClick={openAccount}>账号安全</button>
        <button id="open-profile" onClick={() => navigate("profile")}>穿衣画像</button>
        <button id="open-wardrobes" onClick={() => navigate("wardrobes")}>全部衣橱</button>
        <div className="settings-card">参考照片</div>
        <div className="settings-card">MiniMax 设置</div>
        <div className="scroll-marker">设置列表滚动恢复标记</div>
      </main>
    ) : navigation.page === "profile" ? (
      <main className="screen subpage" data-settings-page="profile">
        <button id="settings-back" onClick={() => navigate("home")}>‹ 返回设置</button>
        <h1>穿衣画像</h1>
        <label>其他备注<input id="profile-note" defaultValue="通勤、户外" /></label>
      </main>
    ) : (
      <main className="screen subpage" data-settings-page="wardrobes">
        <button id="settings-back" onClick={() => navigate("home")}>‹ 返回设置</button>
        <h1>全部衣橱</h1>
        <div className="settings-card">默认衣橱 · 12 件</div>
        <div className="settings-card">办公室 · 4 件</div>
      </main>
    );

    return <SettingsSubpageMotion transition={navigation.transition}>{page}</SettingsSubpageMotion>;
  }

  function AccountHome({ navigation }) {
    return <main className="screen account" data-route="account_management">
      <button id="account-back" onClick={() => navigation.goBack()}>‹ 返回设置</button>
      <h1>账号安全</h1>
      <div className="settings-card">邮箱 · 已验证</div>
      <div className="settings-card">手机号 · 已绑定</div>
      <button id="open-password" onClick={() => navigation.openRoute({ name: "change_password" })}>修改密码</button>
      <button id="open-deletion" className="danger" onClick={() => navigation.openRoute({ name: "account_deletion" })}>注销账号</button>
    </main>;
  }

  function PasswordPage({ navigation }) {
    return <main className="screen account" data-route="change_password">
      <button id="password-back" onClick={() => navigation.goBack()}>‹ 返回账号安全</button>
      <h1>修改密码</h1>
      <label>当前密码<input type="password" defaultValue="password" /></label>
      <label>新密码<input type="password" defaultValue="new-password" /></label>
    </main>;
  }

  function DeletionPage({ navigation }) {
    const [open, setOpen] = useState(true);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("ready");
    const [error, setError] = useState("");
    const [confirmation, setConfirmation] = useState("保留这份确认草稿");
    const writeResolveRef = useRef(null);
    const writeRejectRef = useRef(null);
    const readResolveRef = useRef(null);

    const start = () => {
      if (busy) return;
      setBusy(true);
      setError("");
      setStatus("writing");
      new Promise((resolve, reject) => {
        writeResolveRef.current = resolve;
        writeRejectRef.current = reject;
      }).then(() => {
        setStatus("reading");
        return new Promise((resolve) => { readResolveRef.current = resolve; });
      }).then(() => {
        setStatus("success");
        setBusy(false);
        setOpen(false);
      }).catch(() => {
        setError("服务器未确认，本页和输入已保留");
        setStatus("failed");
        setBusy(false);
      });
    };

    window.__c3 = {
      ...(window.__c3 || {}),
      resolveWrite: () => writeResolveRef.current?.(),
      rejectWrite: () => writeRejectRef.current?.(new Error("test failure")),
      resolveRead: () => readResolveRef.current?.(),
      state: () => ({ busy, status, open, confirmation }),
    };

    return <main className="screen account deletion" data-route="account_deletion">
      <button id="deletion-back" disabled={busy} onClick={() => { if (!busy) navigation.goBack(); }}>‹ 返回账号安全</button>
      <h1>注销账号</h1>
      {status === "success" ? <p id="deletion-success">服务器读回完成后显示成功</p> : null}
      <MotionSheet
        open={open}
        onClose={busy ? () => undefined : () => setOpen(false)}
        variant="destructive"
        role="alertdialog"
        ariaLabel="最后确认永久注销"
        dismissible={!busy}
        closeOnBackdrop={!busy}
        closeOnEscape={!busy}
      >
        <h2>最后确认永久注销</h2>
        <input id="deletion-confirmation" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
        <p id="transaction-status">{status === "writing" ? "正在提交" : status === "reading" ? "正在读回服务器状态" : error}</p>
        <button id="start-deletion" disabled={busy} onClick={start}>{busy ? "处理中" : "永久注销账号"}</button>
      </MotionSheet>
    </main>;
  }

  function Harness() {
    const navigation = useAppNavigationController();
    const route = navigation.route;
    window.__c3 = {
      ...(window.__c3 || {}),
      route: () => route.name,
      outerBack: () => navigation.goBack(),
    };

    return <OverlayRoot>
      <button id="settings-tab" onClick={() => navigation.resetToMainTab("settings")}>设置 Tab</button>
      <NavigationMotion transition={navigation.transition}>
        {route.name === "settings_home" ? <SettingsHarness openAccount={() => navigation.openRoute({ name: "account_management" })} /> : null}
        {route.name === "account_management" ? <AccountHome navigation={navigation} /> : null}
        {route.name === "change_password" ? <PasswordPage navigation={navigation} /> : null}
        {route.name === "account_deletion" ? <DeletionPage navigation={navigation} /> : null}
        {route.name === "wardrobe_home" ? <main className="screen" data-route="wardrobe_home"><h1>衣橱</h1></main> : null}
      </NavigationMotion>
    </OverlayRoot>;
  }

  createRoot(document.getElementById("root")).render(<Harness />);
`;

const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: root },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "settings-account-c3-aliases",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@\/lib\/diagnostic-log$/ }, (args) => ({ path: args.path, namespace: "c3-stub" }));
      buildApi.onResolve({ filter: /^@\// }, (args) => ({ path: resolveSourcePath(join(root, "src", args.path.slice(2))) }));
      buildApi.onLoad({ filter: /.*/, namespace: "c3-stub" }, () => ({
        contents: "export function recordDiagnosticEvent() {}",
        loader: "js",
      }));
    },
  }],
});

const js = bundle.outputFiles[0]?.text ?? "";
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; min-height: 100%; background: #f4f1ea; color: #24313b; font: 15px system-ui, sans-serif; }
  button, input { font: inherit; }
  button { min-height: 44px; border: 1px solid rgba(36,49,59,.12); border-radius: 12px; background: white; color: inherit; padding: 0 14px; }
  button:disabled, input:disabled { opacity: .48; }
  input { width: 100%; height: 46px; margin-top: 7px; border: 1px solid rgba(36,49,59,.15); border-radius: 10px; padding: 0 12px; }
  .grid { display: grid; }
  .relative { position: relative; }
  .min-w-0 { min-width: 0; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  #settings-tab { position: fixed; z-index: 20; right: 12px; bottom: 12px; color: white; background: #355c7d; }
  .screen { width: 100%; min-height: 1800px; padding: 28px 16px 100px; background: linear-gradient(180deg,#f8f6f1,#ebe7de); }
  .screen h1 { margin: 18px 0; font-size: 28px; letter-spacing: -.04em; }
  .screen p { color: rgba(36,49,59,.62); }
  .screen > button { display: block; width: 100%; margin-top: 10px; text-align: left; }
  .screen label { display: block; margin-top: 18px; font-weight: 650; }
  .settings-card { margin-top: 12px; min-height: 78px; padding: 20px 16px; border: 1px solid rgba(36,49,59,.08); border-radius: 16px; background: rgba(255,255,255,.88); }
  .scroll-marker { margin-top: 560px; min-height: 170px; padding: 24px; border-radius: 20px; color: white; background: #355c7d; }
  .subpage { background: linear-gradient(180deg,#eef3f6,#dce6ed); }
  .account { background: linear-gradient(180deg,#f2f5f3,#dfe8e1); }
  .danger { color: #b42318; }
  [data-overlay-layer] { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; }
  [data-overlay-layer] > [aria-hidden="true"] { position: absolute; inset: 0; background: rgba(22,29,34,.5); }
  [data-overlay-variant] { position: relative; width: 100%; max-width: 358px; max-height: 90vh; overflow: auto; border-radius: 22px; background: #fffdf8; padding: 20px; box-shadow: 0 24px 70px rgba(20,28,34,.28); }
  [data-overlay-variant] h2 { margin: 0 0 14px; font-size: 20px; }
  [data-overlay-variant] button { width: 100%; margin-top: 14px; color: white; background: #b42318; }
  #transaction-status { min-height: 24px; color: #b42318; }
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const url = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(url);
  await page.locator("#settings-tab").click();
  await page.locator('[data-settings-navigation-presence="current"] [data-settings-page="home"]').waitFor();
  assert.equal(await page.evaluate(() => window.innerWidth), 390);

  await page.evaluate(() => window.scrollTo(0, 480));
  await page.evaluate(() => window.__c3.pushProfile());
  await page.locator('[data-settings-navigation-presence="current"] [data-settings-page="profile"]').waitFor();
  assert.equal(await page.locator("[data-settings-navigation-direction]").getAttribute("data-settings-navigation-direction"), "push");
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.locator("#settings-back").click();
  await page.locator('[data-settings-navigation-presence="current"] [data-settings-page="home"]').waitFor();
  assert.equal(await page.locator("[data-settings-navigation-direction]").getAttribute("data-settings-navigation-direction"), "pop");
  assert.equal(await page.evaluate(() => window.scrollY), 480);

  await page.evaluate(() => {
    window.__c3.pushProfile();
    window.__c3.popSetting();
    window.__c3.pushWardrobes();
  });
  await page.locator('[data-settings-navigation-presence="current"] [data-settings-page="wardrobes"]').waitFor();
  await page.waitForTimeout(450);
  assert.equal(await page.locator('[data-settings-navigation-presence="current"]').count(), 1);
  await page.evaluate(() => window.__c3.popSetting());
  await page.locator('[data-settings-navigation-presence="current"] [data-settings-page="home"]').waitFor();

  await page.evaluate(() => window.scrollTo(0, 620));
  await page.evaluate(() => window.__c3.openAccount());
  await page.locator('[data-navigation-presence="current"] [data-route="account_management"]').waitFor();
  assert.equal(await page.locator("[data-navigation-direction]").getAttribute("data-navigation-direction"), "push");
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.locator("#account-back").click();
  await page.locator('[data-navigation-presence="current"] [data-settings-page="home"]').waitFor();
  assert.equal(await page.evaluate(() => window.scrollY), 620);

  await page.evaluate(() => window.__c3.openAccount());
  await page.locator('[data-navigation-presence="current"] #open-password').click();
  await page.locator('[data-navigation-presence="current"] [data-route="change_password"]').waitFor();
  assert.equal(await page.locator("[data-navigation-direction]").getAttribute("data-navigation-direction"), "push");
  await page.locator('[data-navigation-presence="current"] #password-back').click();
  await page.locator('[data-navigation-presence="current"] [data-route="account_management"]').waitFor();
  assert.equal(await page.locator("[data-navigation-direction]").getAttribute("data-navigation-direction"), "pop");

  await page.locator('[data-navigation-presence="current"] #open-deletion').click();
  await page.locator('[data-overlay-variant="destructive"]').waitFor();
  await page.locator("#deletion-confirmation").fill("失败后仍保留的确认草稿");
  await page.locator("#start-deletion").click();
  assert.equal(await page.locator("#deletion-back").isDisabled(), true);
  await page.locator('[data-overlay-layer] > [aria-hidden="true"]').click({ position: { x: 8, y: 8 } });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[data-overlay-variant="destructive"]').count(), 1);
  await page.evaluate(() => window.__c3.rejectWrite());
  await page.locator("#transaction-status").getByText("服务器未确认，本页和输入已保留").waitFor();
  assert.equal(await page.locator("#deletion-confirmation").inputValue(), "失败后仍保留的确认草稿");
  assert.equal(await page.evaluate(() => window.__c3.route()), "account_deletion");
  await page.screenshot({ path: "/tmp/wardrobe-c3-settings-account-390.png", fullPage: false });

  await page.locator("#start-deletion").click();
  await page.evaluate(() => window.__c3.resolveWrite());
  await page.locator("#transaction-status").getByText("正在读回服务器状态").waitFor();
  assert.equal(await page.locator("#deletion-success").count(), 0);
  assert.equal(await page.locator('[data-overlay-variant="destructive"]').count(), 1);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[data-overlay-variant="destructive"]').count(), 1);
  await page.evaluate(() => window.__c3.resolveRead());
  await page.locator("#deletion-success").waitFor();
  await page.locator('[data-overlay-variant="destructive"]').waitFor({ state: "detached" });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator("#settings-tab").click();
  await page.locator("#open-profile").click();
  const reducedTransform = await page.locator('[data-settings-navigation-presence="current"]').evaluate((node) => getComputedStyle(node).transform);
  assert.ok(reducedTransform === "none" || reducedTransform === "matrix(1, 0, 0, 1, 0, 0)", `reduced-motion transform must be identity, got ${reducedTransform}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(consoleErrors, []);

  console.log("C3 settings/account 390px browser harness passed");
  console.log("screenshot: /tmp/wardrobe-c3-settings-account-390.png");
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
