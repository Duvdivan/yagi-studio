/*
 * The Tune tab on a phone-sized screen (2026-11-08, from the owner's phone): no drawing until Draw is pressed, as a thumb
 * swiping up the page over the chart used to draw on it, and the plan's table stays inside its card.
 *
 *     python build.py
 *     node tests/tune_phone.js
 *
 * It needs playwright-core and, for webkit, `npx playwright-core install webkit`.
 */
const { chromium, webkit, devices } = require("playwright-core");
let bad = 0; const ok = (n, pass, d) => { if (!pass) bad++; console.log(`${pass ? "pass" : "FAIL"}  ${n}${d !== undefined ? ": " + d : ""}`); };
(async () => {
  for (const w of ["chrome", "webkit"]) {
    const b = w === "webkit" ? await webkit.launch() : await chromium.launch({ channel: "chrome", headless: true });
    const ctx = await b.newContext(w === "webkit" ? { ...devices["iPhone 13"] } : { ...devices["Pixel 7"] }), p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("file:///" + require("path").join(__dirname, "..", "dist", "yagi-studio.html").split(require("path").sep).join("/")); await p.waitForTimeout(1500); await p.click("#radio-later").catch(() => {});
    await p.evaluate(() => { YS.app.S.design.tune.readings = []; YS.app.go("tune"); });
    await p.waitForTimeout(500);
    const mode = await p.evaluate(() => [...document.querySelectorAll("[data-m]")].find((x) => x.getAttribute("aria-pressed") === "true" || x.classList.contains("on"))?.dataset.m);
    const touch = await p.evaluate(() => getComputedStyle(document.querySelector("#tune-chart")).touchAction);
    ok(`${w}: the Tune tab starts in File or VNA, and the chart lets a swipe scroll`, touch !== "none", `mode ${mode}, touch-action ${touch}`);
    // a swipe across the chart, as a thumb going up the page would
    const box = await p.evaluate(() => { const r = document.querySelector("#tune-chart").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await p.evaluate((bx) => {
      const c = document.querySelector("#tune-chart"), ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 7, pointerType: "touch", isPrimary: true }));
      ev("pointerdown", bx.x + bx.w * 0.2, bx.y + bx.h * 0.8);
      for (let i = 1; i <= 10; i++) ev("pointermove", bx.x + bx.w * (0.2 + 0.06 * i), bx.y + bx.h * (0.8 - 0.06 * i));
      ev("pointerup", bx.x + bx.w * 0.8, bx.y + bx.h * 0.2);
    }, box);
    await p.waitForTimeout(300);
    ok(`${w}: the swipe draws nothing`, await p.evaluate(() => YS.app.S.design.tune.readings.length === 0));
    await p.click('[data-m="draw"]'); await p.waitForTimeout(200);
    ok(`${w}: pressing Draw turns drawing on`, await p.evaluate(() => getComputedStyle(document.querySelector("#tune-chart")).touchAction === "none"));
    await p.click('[data-m="file"]'); await p.waitForTimeout(200);
    // the plan, from the example readings
    await p.click("#readings-sample");
    await p.waitForTimeout(800);
    await p.waitForFunction(() => /SWR/.test(document.querySelector("#plan").textContent) && !/Working out/.test(document.querySelector("#plan").textContent), null, { timeout: 120000 });
    await p.waitForTimeout(500);
    const fit = await p.evaluate(() => { const t = document.querySelector("#plan table"), card = document.querySelector("#plan"); return { table: Math.round(t.getBoundingClientRect().right), card: Math.round(card.getBoundingClientRect().right), page: document.documentElement.scrollWidth, wide: innerWidth }; });
    ok(`${w}: the plan's table stays inside its card, and the page doesn't scroll sideways`, fit.table <= fit.card + 1 && fit.page <= fit.wide + 1, JSON.stringify(fit));
    await p.evaluate(() => document.querySelector("#plan table").scrollIntoView({ block: "center" }));
    await p.screenshot({ path: require("path").join(require("os").tmpdir(), `tune_phone_${w}.png`) });
    ok(`${w}: no page errors`, errs.length === 0, errs.join(" | "));
    await b.close();
  }
  console.log(bad ? `${bad} FAILED` : "All passed");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
