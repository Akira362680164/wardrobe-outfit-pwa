import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const fixturePort=4204,appPort=4203,host="127.0.0.1",fixtureOrigin=`http://${host}:${fixturePort}`,appOrigin=`http://${host}:${appPort}`;
const evidenceDir=process.env.HOME_FEED_P3_BROWSER_EVIDENCE??"test-results/home-feed-p3-browser/20260718",processes=[];
await mkdir(evidenceDir,{recursive:true});
function start(command,args,env){const child=spawn(command,args,{cwd:process.cwd(),env,stdio:["ignore","pipe","pipe"]});processes.push(child);return child}
async function waitFor(url,timeout=90_000){const end=Date.now()+timeout;while(Date.now()<end){try{if((await fetch(url)).status<500)return}catch{}await new Promise(resolve=>setTimeout(resolve,250))}throw new Error(`timeout ${url}`)}
async function trace(){return (await (await fetch(`${fixtureOrigin}/__fixture/trace`)).json()).entries}
async function openHome(page,account="fixture111@example.test"){await page.goto(appOrigin,{waitUntil:"networkidle"});if(await page.getByLabel("邮箱或手机号").isVisible().catch(()=>false)){await page.getByLabel("邮箱或手机号").fill(account);await page.getByLabel("密码").fill("FixturePassword123!");await page.getByLabel("我已阅读并同意").check();await page.getByRole("button",{name:"登录",exact:true}).click()}await page.getByText("设置",{exact:true}).last().click();await page.getByTestId("open-home-feed-preview").click();await page.getByTestId("wardora-home-feed").waitFor()}
function assert(value,message){if(!value)throw new Error(message)}

start("node",["scripts/home-feed-browser-fixture-server.mjs"],{...process.env,HOME_FEED_FIXTURE_PORT:String(fixturePort),HOME_FEED_APP_ORIGIN:appOrigin,HOME_FEED_FIXTURE_SCENARIO:"p14"});await waitFor(fixtureOrigin);
start("npm",["run","dev","--","--hostname",host,"--port",String(appPort)],{...process.env,NEXT_PUBLIC_WARDROBE_API_BASE_URL:fixtureOrigin,NEXT_PUBLIC_WARDORA_HOME_FEED_P1:"true"});await waitFor(appOrigin);
const browser=await chromium.launch({headless:true});
try{
  const granted=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,geolocation:{longitude:121.47,latitude:31.23},permissions:["geolocation"],recordVideo:{dir:evidenceDir,size:{width:390,height:844}}});
  const page=await granted.newPage();await openHome(page);
  await page.waitForFunction(()=>{const value=window.__wardoraWeatherCanvas;return value&&value.fps>=20&&value.fps<=35&&value.dpr<=2},{timeout:5000});
  const running=await page.evaluate(()=>window.__wardoraWeatherCanvas);assert(running.fps>=20&&running.fps<=35,`fps ${JSON.stringify(running)}`);assert(running.dpr<=2,"DPR exceeded 2");
  await page.evaluate(()=>{const spacer=document.createElement("div");spacer.id="p3-offscreen-spacer";spacer.style.height="1800px";document.body.append(spacer);window.scrollTo(0,document.documentElement.scrollHeight)});await page.waitForFunction(()=>window.__wardoraWeatherCanvas?.status==="offscreen_paused");await page.evaluate(()=>{window.scrollTo(0,0);document.getElementById("p3-offscreen-spacer")?.remove()});
  const before=(await trace()).filter(entry=>entry.path==="/api/weather/locations/resolve-device").length;
  await page.getByTestId("home-location-entry").click();await page.getByTestId("home-use-current-location").click();
  await page.getByRole("dialog",{name:"使用当前位置说明"}).waitFor();
  assert((await trace()).filter(entry=>entry.path==="/api/weather/locations/resolve-device").length===before,"location resolved before explicit purpose confirmation");
  await page.getByRole("button",{name:"继续使用大致位置"}).click();await page.getByTestId("home-device-location-candidates").waitFor();
  assert((await trace()).filter(entry=>entry.path==="/api/weather/locations/resolve-device").length===before+1,"coordinate resolve request missing");
  await page.screenshot({path:`${evidenceDir}/location-confirmed-candidate.png`,fullPage:true});
  for(const width of [360,390,430]){await page.setViewportSize({width,height:844});await page.evaluate(()=>{document.documentElement.style.fontSize="20.8px"});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert(overflow<=1,`${width}px location sheet overflow ${overflow}`)}
  await page.evaluate(()=>{document.documentElement.style.fontSize="16px"});await page.getByRole("button",{name:"临时至明日"}).first().click();await page.getByTestId("home-city-sheet").waitFor({state:"hidden"});const video=page.video();await page.close();await video?.saveAs(`${evidenceDir}/canvas-location-flow.webm`);await granted.close();

  const denied=await browser.newContext({viewport:{width:390,height:844}});const deniedPage=await denied.newPage();await openHome(deniedPage,"fixture222@example.test");await deniedPage.getByTestId("home-location-entry").click();await deniedPage.getByTestId("home-use-current-location").click();await deniedPage.getByRole("button",{name:"继续使用大致位置"}).click();await deniedPage.getByRole("alert").waitFor();await deniedPage.screenshot({path:`${evidenceDir}/location-web-unavailable.png`,fullPage:true});await denied.close();

  const failed=await browser.newContext({viewport:{width:390,height:844}});await failed.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(this.dataset.weatherCanvas)return null;return original.call(this,type,...args)}});const failedPage=await failed.newPage();await openHome(failedPage);await failedPage.waitForFunction(()=>document.querySelectorAll('[data-weather-canvas="today"]').length===0);assert(await failedPage.getByTestId("home-weather-today").isVisible(),"Canvas failure removed the weather card");await failedPage.screenshot({path:`${evidenceDir}/canvas-static-failure.png`,fullPage:true});await failed.close();

  const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});const reducedPage=await reduced.newPage();await openHome(reducedPage);await reducedPage.waitForFunction(()=>window.__wardoraWeatherCanvas?.status==="reduced_static");await reducedPage.waitForTimeout(500);const reducedDiag=await reducedPage.evaluate(()=>window.__wardoraWeatherCanvas);assert(reducedDiag.fps===0&&reducedDiag.clock===0,`reduced motion looped ${JSON.stringify(reducedDiag)}`);await reduced.close();
  console.log(JSON.stringify({evidenceDir,running,reducedDiag,locationResolveRequests:before+1}));
}finally{await browser.close();for(const process of processes)process.kill("SIGTERM")}
