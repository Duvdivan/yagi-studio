/*
 * The installable web app, in the two browser engines this PC can run. Chrome: that it installs, opens with
 * no network, and takes a new build. WebKit (Safari's engine, standing in for an iPhone and an iPad): that
 * the solver agrees, and that saving, loading and the screen work as they should on Apple's devices.
 *
 * It isn't an iPad: WebKit here doesn't have iOS's share sheet or home screen. Those need the real thing.
 *
 *     python build.py
 *     cd dist/web; python -m http.server 8765 --bind 127.0.0.1
 *     node tests/web_app.js chrome      # edits dist/web to stand in for a new build: run build.py after it
 *     node tests/web_app.js webkit
 *
 * It needs playwright-core and, for webkit, `npx playwright-core install webkit`.
 */
const { chromium, webkit, devices } = require("playwright-core");
const OUT = require("path").join(require("os").tmpdir(), "duvyagi-web") + "/";
require("fs").mkdirSync(OUT, { recursive: true });
const URL_ = "http://localhost:8765/";
const results = [];
const ok = (name, pass, detail) => { results.push(pass); console.log(`${pass ? "pass" : "FAIL"}  ${name}${detail !== undefined ? ": " + detail : ""}`); };
const atTarget = (p) => p.evaluate(() => { const S = YS.app.S, d = S.design; const r = S.rows.reduce((a, b) => (Math.abs(b.f - d.f0) < Math.abs(a.f - d.f0) ? b : a)); return r.swr; });

async function chrome() {
  // a persistent profile, because Chrome won't install from an incognito window
  const profile = require("fs").mkdtempSync(require("os").tmpdir() + "/duv-web-");
  const launch = () => chromium.launchPersistentContext(profile, { channel: "chrome", headless: true, viewport: { width: 412, height: 915 }, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  let ctx = await launch();
  let browser = ctx;
  let p = await ctx.newPage();
  const missing = [];
  const watch = (page) => page.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith("/api/ping")) missing.push(`${r.status()} ${r.url()}`); });
  watch(p);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(URL_);
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
  ok("the service worker takes over", await p.evaluate(() => !!navigator.serviceWorker.controller));
  const cached = await p.evaluate(async () => { const n = (await caches.keys())[0]; return (await (await caches.open(n)).keys()).map((r) => r.url.split("/").pop()); });
  ok("every file is stored", cached.length === 15 && cached.includes("index.html") && cached.includes("ibm-plex-sans.woff2"), `${cached.length} files`);
  const cdp = await ctx.newCDPSession(p);
  const inst = await cdp.send("Page.getInstallabilityErrors").catch((e) => ({ installabilityErrors: [{ errorId: e.message }] }));
  ok("Chrome finds it installable", inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
  const man = await cdp.send("Page.getAppManifest");
  ok("the manifest reads without errors", man.errors.length === 0 && man.url.endsWith("manifest.webmanifest"), JSON.stringify(man.errors));

  await ctx.setOffline(true);
  await p.reload();
  await p.waitForTimeout(1500);
  await p.click("#radio-later").catch(() => {});
  await p.waitForFunction(() => YS.app.S.rows && YS.app.S.rows.length && YS.app.S.solvedQuality === YS.app.S.quality, null, { timeout: 30000 });
  const swr = await atTarget(p);
  ok("with no network it opens and solves in its workers", Math.abs(swr - 1.25) < 0.02, `SWR ${swr.toFixed(3)}, ${await p.evaluate(() => YS.app.pool.threads)} threads`);
  ok("and its fonts come from the device", await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check("14px 'IBM Plex Sans'") && [...document.fonts].some((f) => f.status === "loaded"); }));
  await p.goto(URL_ + "#tune");
  await p.waitForTimeout(800);
  ok("a deep link opens offline too", await p.evaluate(() => YS.app.S.view === "tune"));
  ok("nothing is missing", missing.length === 0, missing.join(" "));
  await ctx.close();

  /* a new build: the next opening fetches it, and the one after shows it */
  const fs = require("fs"), WEB = require("path").join(__dirname, "..", "dist", "web") + "/";
  // closed offline, and opened again with a network, once there's a new build
  ctx = await launch();
  browser = ctx;
  p = await ctx.newPage();
  const oldCache = "the build before";
  fs.writeFileSync(WEB + "index.html", fs.readFileSync(WEB + "index.html", "utf8").replace("</body>", "<i id=marker></i></body>"));
  fs.writeFileSync(WEB + "sw.js", fs.readFileSync(WEB + "sw.js", "utf8").replace(/const VERSION = "[^"]+"/, 'const VERSION = "test-update"'));
  await p.goto(URL_);
  // polled from here, so that nothing but the app's own look on opening can make this pass
  const t0 = Date.now();
  let keys = [];
  while (Date.now() - t0 < 30000) {
    keys = await p.evaluate(() => caches.keys());
    if (keys.join() === "yagi-studio-test-update") break;
    await p.waitForTimeout(250);
  }
  console.log(`      found after ${Date.now() - t0} ms`);
  ok("a new build replaces the stored copy", keys.join() === "yagi-studio-test-update", keys.join());
  await p.reload();
  await p.waitForTimeout(800);
  ok("and shows at the next opening", !!(await p.$("#marker")));
  ok("no page errors in Chrome", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
}

async function ios(name, device) {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...device, serviceWorkers: "block" });
  // this WebKit runs on Windows and says so: stand in what an iPad reports about itself
  if (name === "ipad") await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
  });
  await ctx.addInitScript(() => {
    window.__shared = [];
    navigator.canShare = (d) => !!(d && d.files);
    navigator.share = async (d) => { window.__shared.push({ name: d.files[0].name, size: d.files[0].size }); };
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(URL_);
  await p.waitForTimeout(2000);
  ok(`${name}: recognised as Apple's`, await p.evaluate(() => window.ysWeb.ios));
  ok(`${name}: focusing a field won't zoom the page`, (await p.getAttribute('meta[name="viewport"]', "content")).includes("maximum-scale=1"));
  ok(`${name}: says how to install`, /Add to Home Screen/.test(await p.textContent(".install-hint").catch(() => "")));
  await p.click("#radio-later").catch(() => {});
  await p.waitForFunction(() => YS.app.S.rows && YS.app.S.rows.length && YS.app.S.solvedQuality === YS.app.S.quality, null, { timeout: 60000 });
  const swr = await atTarget(p);
  ok(`${name}: the solver gives the same answer in WebKit`, Math.abs(swr - 1.25) < 0.02, `SWR ${swr.toFixed(3)}, ${await p.evaluate(() => YS.app.pool.threads)} threads`);
  const clipped = await p.evaluate(() => {
    const c = document.createElement("canvas").getContext("2d");
    return [...document.querySelectorAll(".rods input.num")].filter((e) => e.offsetParent).map((e) => {
      const st = getComputedStyle(e);
      c.font = `${st.fontSize} ${st.fontFamily}`;
      return { v: e.value, text: Math.ceil(c.measureText(e.value).width), room: e.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight), sw: e.scrollWidth, cw: e.clientWidth };
    }).filter((q) => q.text > q.room);
  });
  ok(`${name}: the rods table's numbers aren't clipped`, clipped.length === 0, JSON.stringify(clipped));
  ok(`${name}: nothing runs off the side`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await p.evaluate(() => `${document.documentElement.scrollWidth} in ${innerWidth}`));
  await p.screenshot({ path: `${OUT}${name}-design.png` });

  await p.click("[data-hint-close]");
  ok(`${name}: the hint stays closed`, await (async () => { await p.reload(); await p.waitForTimeout(1500); return !(await p.$(".install-hint")); })());

  /* a bend, which goes through the general solver */
  await p.click("#bend-more summary");
  const cell = await p.evaluate(() => { const e = YS.app.S.design.elements.find((q) => q.name === "Driven"); return `input[data-rod="${e.id}"][data-k="topF"]`; });
  await p.fill(cell, "-5.6");
  await p.press(cell, "Tab");
  await p.waitForTimeout(600);
  await p.waitForFunction(() => YS.app.S.solvedQuality === YS.app.S.quality, null, { timeout: 120000 });
  ok(`${name}: bent rods solve`, Math.abs((await atTarget(p)) - 1.25) > 0.005, (await atTarget(p)).toFixed(3));
  await p.click("#bend-clear");
  await p.waitForTimeout(800);

  /* saving goes to the share sheet, under its own name */
  await p.evaluate(() => YS.app.go("cut"));
  await p.waitForTimeout(600);
  const dl = await p.$("[data-dl]");
  await dl.click();
  await p.waitForTimeout(300);
  const shared = await p.evaluate(() => window.__shared);
  ok(`${name}: a saved file goes to the share sheet`, shared.length === 1 && shared[0].size > 0, JSON.stringify(shared));
  ok(`${name}: and says it asks`, /asks where to save/.test(await p.textContent("#c-files")));

  /* loading a sweep: any file type can be picked */
  await p.evaluate(() => YS.app.go("tune"));
  await p.waitForTimeout(800);
  ok(`${name}: the NanoVNA button is off, and it says why`, (await p.isDisabled("#vna-connect")) && /can't reach a NanoVNA/.test(await p.textContent("#vna-note")));
  await p.click('#tune-mode button:has-text("File"), #tune-mode button:has-text("Load")');
  await p.waitForTimeout(300);
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), p.click("#load-s1p")]);
  ok(`${name}: the picker has no file filter`, (await chooser.element().getAttribute("accept")) === null);
  const f0 = 850, rows = Array.from({ length: 101 }, (_, i) => `${(f0 + i)}e6 ${(0.3 * Math.cos(i / 9)).toFixed(4)} ${(0.3 * Math.sin(i / 9)).toFixed(4)}`).join("\n");
  await chooser.setFiles({ name: "sweep.s1p", mimeType: "application/octet-stream", buffer: Buffer.from(`# Hz S RI R 50\n${rows}\n`) });
  await p.waitForTimeout(1500);
  ok(`${name}: and the sweep loads`, /sweep\.s1p|101/.test(await p.textContent("#host-tune")));
  ok(`${name}: and leaves no stray input behind`, (await p.$$('input[type="file"]')).length === 0);
  await p.screenshot({ path: `${OUT}${name}-tune.png` });

  await p.evaluate(() => YS.app.go("design"));
  await p.waitForTimeout(600);
  ok(`${name}: no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
}

(async () => {
  const which = process.argv[2] || "chrome";
  if (which === "chrome") await chrome();
  else {
    await ios("iphone", devices["iPhone 13"]);
    await ios("ipad", { ...devices["iPad (gen 7)"], userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15" });
  }
  console.log(results.every(Boolean) ? "\nAll passed" : `\n${results.filter((x) => !x).length} FAILED`);
})().catch((e) => { console.error(e); process.exit(1); });
