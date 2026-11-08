/*
 * The owner's two sweeps of their second antenna (2026-11-08), read off their NanoVNA photos, through the Tune tab. Both jump at
 * 900 MHz, where the NanoVNA changes how it measures. Before a trim: SWR 1.23 at 911 MHz, which the Tune tab told them to trim;
 * after it: 1.61, and lowest at 850 MHz, beyond the jump. The Tune tab must leave the jump's far side out, take the valley near
 * the target, call the first already good, and never put a cut first on a fit it can't trust.
 *
 *     python build.py
 *     node tests/tune_sweeps.js
 *
 * It needs playwright-core.
 */
const { chromium } = require("playwright-core");
let bad = 0; const ok = (n, pass, d) => { if (!pass) bad++; console.log(`${pass ? "pass" : "FAIL"}  ${n}${d !== undefined ? ": " + d : ""}`); };
// piecewise-linear SWR, 101 points 850 to 950 MHz, with the NanoVNA's jump at 900
const sweep = (pts) => { const out = []; for (let i = 0; i <= 100; i++) { const f = 850 + i; let j = 0; while (j < pts.length - 2 && pts[j + 1][0] <= f) j++; const [f0, s0] = pts[j], [f1, s1] = pts[j + 1]; out.push({ f, swr: +(s0 + (s1 - s0) * Math.min(1, Math.max(0, (f - f0) / (f1 - f0)))).toFixed(3) }); } return out; };
// before the trim (the first photo): up to SWR 3+ just under 900, then 1.95 just over, valley 1.2 near 913, 1.23 at 911
const before = sweep([[850, 1.5], [870, 1.62], [885, 1.95], [895, 2.9], [899.5, 3.4], [900, 1.95], [905, 1.6], [911, 1.23], [913, 1.2], [916, 1.4], [920, 2.0], [925, 3.5], [950, 5]]);
// after it (the newest photo): 1.52 at 850, rising to 2.12 just under 900, a drop to 1.97, valley 1.72 near 912, 1.61 at 911?
const after = sweep([[850, 1.52], [860, 1.53], [870, 1.62], [880, 1.75], [890, 1.95], [899, 2.12], [900, 1.97], [903, 1.93], [908, 1.8], [911, 1.74], [912, 1.72], [915, 1.85], [919, 2.3], [923, 3.0], [950, 5]]);
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true }), p = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file:///" + require("path").join(__dirname, "..", "dist", "yagi-studio.html").split(require("path").sep).join("/")); await p.waitForTimeout(1500); await p.click("#radio-later").catch(() => {});
  await p.waitForFunction(() => YS.app.S.rows && YS.app.S.rows.length);
  await p.evaluate(() => YS.app.go("tune"));
  for (const [name, readings] of [["before the trim", before], ["after it", after]]) {
    await p.evaluate((r) => { const t = YS.app.S.design.tune; t.readings = r; t.range = [850, 950]; t.sample = false; YS.app.commit(); YS.app.go("design"); YS.app.go("tune"); }, readings);
    await p.waitForTimeout(800);
    await p.waitForFunction(() => /Close fit|Fair fit|Rough fit/.test(document.querySelector("#diag").textContent) && !/Updating|Fitting/.test(document.querySelector("#diag").textContent) && /SWR/.test(document.querySelector("#plan").textContent) && !/Working out/.test(document.querySelector("#plan").textContent), null, { timeout: 120000 });
    await p.waitForTimeout(500);
    const diag = (await p.textContent("#diag")).replace(/\s+/g, " "), plan = (await p.textContent("#plan")).replace(/\s+/g, " ");
    console.log(`--- ${name}\n  DIAG ${diag.slice(0, 700)}\n  PLAN ${plan.slice(0, 1500)}`);
    ok(`${name}: the jump at 900 MHz is named and left out`, /VNA jump at 900 MHz/.test(diag));
    ok(`${name}: the best match is the valley near the target`, /SWR 1\.\d+ at 91[0-4]\.\d MHz/.test(diag), (diag.match(/best match is [^.]*\.[^.]*\./) || [""])[0]);
    if (name === "before the trim") ok("before: it says it's already good, and calls nothing Best", /Already good/.test(plan) && !/Best:/.test(plan));
    else ok("after: not already good", !/Already good/.test(plan));
    ok(`${name}: a rough or unsure fit carries the warning, and no Best`, !/Rough fit|unsure/.test(diag) || (/Don't cut on this yet/.test(plan) && !/Best:/.test(plan)));
  }
  // R and X settle which way: the DuvYagi with its driven element 3 mm short, seen through 150 mm of RG178, read with R and X
  await p.evaluate(() => {
    const A = YS.app, d = JSON.parse(JSON.stringify(A.S.design)), fs = [];
    d.elements.find((e) => e.type === "driven").L -= 3;
    for (let f = 880; f <= 940; f += 1) fs.push(f);
    const line = Object.assign({}, YS.CABLES.rg178, { kind: "rg178", length: 150 });
    const rows = YS.sweep(YS.toSolver(d), fs, { quality: "normal" });
    const t = A.S.design.tune;
    t.readings = rows.map((r) => ({ f: r.f, g: YS.gammaThroughCable(YS.gammaOf(r.z, 50), line, r.f) }));
    t.range = [880, 940]; t.measured = {};
    A.S.design.cable.on = false;
    A.commit(); A.go("design"); A.go("tune");
  });
  const settled = async () => { await p.waitForTimeout(800); await p.waitForFunction(() => /Close fit|Fair fit|Rough fit/.test(document.querySelector("#diag").textContent) && !/Updating|Fitting/.test(document.querySelector("#diag").textContent) && !/Working out/.test(document.querySelector("#plan").textContent), null, { timeout: 120000 }); };
  await settled();
  ok("with R and X but no cable, it asks the one question", await p.isVisible("#ask-use") && /Your sweep has R and X/.test(await p.textContent("#diag")));
  await p.fill("#ask-len", "150");
  await p.click("#ask-use");
  await settled();
  const diag = (await p.textContent("#diag")).replace(/\s+/g, " ");
  ok("answered, it uses R and X and finds the driven element short", /Using R and X/.test(diag) && /driven element acts about [0-9.]+ mm shorter/.test(diag) && !/Longer or shorter/.test(diag), (diag.match(/driven element acts about [0-9.]+ mm [a-z]+/) || [""])[0]);
  ok("and the cable box shows it", await p.isChecked("#cable-on"));
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await b.close(); console.log(bad ? `${bad} FAILED` : "All passed"); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
