/*
 * Choosing names (the owner, 2026-11-08): Save asks what to call the design, and warns before replacing one saved under that
 * name; the Cut list's design files ask what to call the file, keeping its extension; Cancel saves nothing. Both dialogs fit a
 * phone's screen.
 *
 *     python build.py
 *     node tests/save_names.js chrome|webkit
 *
 * It needs playwright-core and, for webkit, `npx playwright-core install webkit`.
 */
const { chromium, webkit, devices } = require("playwright-core");
const path = require("path");
const which = process.argv[2] || "chrome";
let bad = 0; const ok = (n, pass, d) => { if (!pass) bad++; console.log(`${pass ? "pass" : "FAIL"}  ${which}: ${n}${d !== undefined ? ": " + d : ""}`); };
(async () => {
  const b = which === "webkit" ? await webkit.launch() : await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await b.newContext(Object.assign({ acceptDownloads: true }, which === "webkit" ? devices["iPhone 13"] : devices["Pixel 7"])), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file:///" + path.join(__dirname, "..", "dist", "yagi-studio.html").split(path.sep).join("/")); await p.waitForTimeout(1500); await p.click("#radio-later").catch(() => {});
  await p.waitForFunction(() => YS.app.S.rows && YS.app.S.rows.length);
  const fits = () => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && [...document.querySelectorAll(".modal *")].every((e) => e.getBoundingClientRect().right <= document.querySelector(".modal").getBoundingClientRect().right + 1.5));

  // Save, under a name of your own
  await p.click("#save"); await p.waitForSelector("#save-name");
  ok("Save asks for a name, filled in with the design's", (await p.inputValue("#save-name")) === (await p.evaluate(() => YS.app.S.design.name)));
  ok("and its dialog fits the screen", await fits());
  await p.fill("#save-name", "My first Yagi"); await p.click("#save-go"); await p.waitForTimeout(600);
  ok("it saves under that name, and the design takes it", await p.evaluate(() => YS.app.S.design.name === "My first Yagi" && !!(YS.app.storage.read().library || {})["My first Yagi"] && document.querySelector("#design-name").value === "My first Yagi"));
  // a second design, saved under the first's name, is warned about
  await p.evaluate(() => { YS.app.S.design.name = "Another"; YS.app.renderChrome(); });
  await p.click("#save"); await p.waitForSelector("#save-name");
  await p.fill("#save-name", "My first Yagi"); await p.waitForTimeout(100);
  ok("saving over another design's name says it replaces it", /already a design saved as "My first Yagi"/.test(await p.textContent("#save-note")) && (await p.textContent("#save-go")) === "Replace it");
  await p.click("#save-no"); await p.waitForTimeout(200);
  ok("Cancel saves nothing", await p.evaluate(() => YS.app.S.design.name === "Another"));

  // the Cut list's files ask what to call them
  await p.evaluate(() => YS.app.go("cut")); await p.waitForTimeout(600);
  await p.click('[data-dl="0"]'); await p.waitForSelector("#fn-stem");
  ok("a design file asks for its name, with the extension kept", (await p.inputValue("#fn-stem")) === "Another" && /\.json/.test(await p.textContent(".modal")));
  ok("and its dialog fits the screen", await fits());
  await p.fill("#fn-stem", "dan's 911 yagi: v2");
  if (which === "chrome") {
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#fn-go")]);
    ok("the file is saved under the name given, with characters files can't hold replaced", dl.suggestedFilename() === "dan's 911 yagi_ v2.json", dl.suggestedFilename());
  } else {
    await p.click("#fn-go"); await p.waitForTimeout(500);
    ok("the dialog closes on Save", !(await p.$("#fn-stem")));
  }
  await p.click('[data-dl="0"]'); await p.waitForSelector("#fn-stem");
  let downloaded = false; p.on("download", () => { downloaded = true; });
  await p.click("#fn-no"); await p.waitForTimeout(600);
  ok("Cancel saves no file", !downloaded && !(await p.$("#fn-stem")));
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await b.close();
  console.log(bad ? `${bad} FAILED` : "All passed");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
