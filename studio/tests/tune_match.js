/*
 * The Tune tab offers something added at the feed instead of new rods (the owner, 2026-11-12): a GCARC 915 MHz Yagi built
 * without its 15 nH coil, its readings made by the model, R and X with no cable. The tab should offer a hairpin across the
 * feed first, say how to make it, and put it in the design when asked.
 *     node tests/tune_match.js
 * It needs playwright-core (see CLAUDE.md for where it is on the owner's PC).
 */
const { chromium } = require("playwright-core"), path = require("path");
let failed = 0;
const ok = (name, cond, detail) => { console.log(`${cond ? "pass" : "FAIL"}  ${name}${detail ? ": " + detail : ""}`); if (!cond) failed++; };

(async () => {
  const b = await chromium.launch({ headless: true }), p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file:///" + path.join(__dirname, "..", "dist", "yagi-studio.html").split(path.sep).join("/")); await p.waitForTimeout(1500); await p.click("#radio-later").catch(() => {});
  await p.waitForFunction(() => YS.app.S.rows && YS.app.S.rows.length);
  await p.evaluate(() => {
    const d = YS.PRESETS.gcarc();
    d.coil = 0;
    const fs = [];
    for (let f = 880; f <= 950; f += 1) fs.push(f);
    // R and X straight at the feed, as a sweep file gives them, so the fit can tell which way
    d.tune = { readings: YS.sweep(YS.toSolver(d), fs).map((r) => ({ f: r.f, swr: r.swr, g: YS.gammaOf(r.z, 50) })), measured: {}, range: [880, 950], target: 915, sample: false, free: { directors: true, driven: true, reflector: false } };
    YS.app.loadDesign(d, true);
    YS.app.go("tune");
  });
  await p.waitForFunction(() => /Close fit|Fair fit|Rough fit/.test(document.querySelector("#diag").textContent) && /SWR/.test(document.querySelector("#plan").textContent) && !/Working|Updating|Fitting/.test(document.querySelector("#plan").textContent + document.querySelector("#diag").textContent), null, { timeout: 120000 });
  await p.waitForTimeout(500);
  const plan = (await p.textContent("#plan")).replace(/\s+/g, " ");
  console.log("  PLAN " + plan.slice(0, 900));
  const first = (await p.$$eval("#plan [data-opt]", (n) => n.map((q) => q.dataset.opt)))[0];
  ok("the hairpin is offered first", first === "hairpin", first);
  ok("it says how to make it: the wire, its legs' spacing, its length and a loop that does the same", /Across the feed: a hairpin of 22 AWG \(0\.64 mm\) solid wire, legs 5 mm apart, 1[2-4](\.\d)? mm/.test(plan) && /single loop of the same wire about \d+ mm across/.test(plan));
  ok("and that it needs no new rods", /Add a hairpin across the feed[^·]*·[^·]*·[^·]*·\s*No new rods/.test(plan) || /No new rods/.test(plan));
  await p.click('#plan [data-apply="hairpin"]');
  await p.waitForTimeout(500);
  const d = await p.evaluate(() => ({ hairpin: YS.app.S.design.hairpin, coil: YS.app.S.design.coil }));
  ok("put in the design, it's a hairpin there", d.hairpin && d.hairpin.length >= 12 && d.hairpin.length <= 14 && d.hairpin.spacing === 5 && !d.coil, JSON.stringify(d));
  ok("no page errors", !errs.length, errs.join("; "));
  await b.close();
  console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
  process.exit(failed ? 1 : 0);
})();
