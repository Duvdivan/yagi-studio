/*
 * A collinear through the tabs (2026-11-18): New design, a vertical, on top of a mast, three sections; sized on the workers;
 * its design card, its cut list (the rod pieces and the stubs), its build check, the Tune tab's plan (the top rod is what's
 * trimmed) and its printed joints on the 3D print tab, and the parts fitted to a PVC pipe over it.
 *
 *     python build.py
 *     node tests/collinear_tab.js chrome
 *
 * It needs playwright-core (see CLAUDE.md for where it is on the owner's PC).
 */
const { chromium } = require("playwright-core"), path = require("path");
let bad = 0;
const ok = (n, pass, d) => { if (!pass) bad++; console.log(`${pass ? "pass" : "FAIL"}  ${n}${d !== undefined ? ": " + d : ""}`); };

(async () => {
  const b = await chromium.launch({ channel: process.argv[2] === "chrome" ? "chrome" : undefined, headless: true });
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file:///" + path.join(__dirname, "..", "dist", "yagi-studio.html").split(path.sep).join("/")); await p.waitForTimeout(1500); await p.click("#radio-later").catch(() => {});
  await p.waitForFunction(() => YS.app.S.rows && YS.app.S.rows.length);
  const seen = (sel) => p.isVisible(sel);

  await p.click("#new-design"); await p.waitForSelector("#k-dipole"); await p.check("#k-ok"); await p.click("#k-dipole"); await p.waitForTimeout(500);
  ok("the sections choice is hidden for the arm out from the mast", !(await seen("#w-sec")));
  await p.selectOption("#w-mount", "top"); await p.waitForTimeout(300);
  ok("and offered on top of a mast", await seen("#w-sec"));
  await p.selectOption("#w-sec", "3"); await p.waitForTimeout(300);
  ok("three sections: the steps say it sizes the collinear", /sizes the collinear/.test(await p.textContent("#w-steps")));
  const t0 = Date.now();
  await p.click("#w-run");
  await p.waitForFunction(() => YS.app.planStage() === "antenna" && YS.dipole.isCollinear(YS.app.S.design) && YS.app.S.design.hairpin, null, { timeout: 180000 });
  const secs = (Date.now() - t0) / 1000;
  await p.waitForTimeout(500);
  await p.waitForFunction(() => YS.app.solveIdle(), null, { timeout: 60000 });      // the sweep of the sized design, not one before it
  const d = await p.evaluate(() => YS.app.S.design);
  ok("sized: three sections, a stub, a hairpin and a capacitor", d.elements[0].colin.sections.length === 3 && d.elements[0].colin.stub.length > 5 && d.hairpin.length > 0 && d.seriesC > 0,
    `${d.elements[0].colin.sections.join(" + ")} mm, stub ${d.elements[0].colin.stub.length} mm, hairpin ${d.hairpin.length} mm, ${d.seriesC} pF, in ${secs.toFixed(0)} s`);
  const f0 = await p.evaluate(() => { const S = YS.app.S, d = S.design; return S.rows.reduce((b, r) => (!b || Math.abs(r.f - d.f0) < Math.abs(b.f - d.f0) ? r : b), null); });
  ok("matched at the target: SWR 1.15 or better there", f0.swr <= 1.15, f0.swr.toFixed(3));
  ok("its card says it's a collinear and offers to size it again", /collinear of 3 sections/.test(await p.textContent("#gc-text")) && await seen("text=Size it again"));

  await p.evaluate(() => YS.app.go("cut")); await p.waitForTimeout(1500);
  const sheet = await p.textContent("#c-sheet");
  ok("Cut list: the sleeve, three rods (the top one trimmed), the stubs", /Sleeve, below the feed/.test(sheet) && /First rod, above the feed/.test(sheet) && /Rod 2/.test(sheet) && /Top rod/.test(sheet) && /Stubs, 2/.test(sheet));
  await p.evaluate(() => YS.app.go("check")); await p.waitForTimeout(2500);
  ok("Build check opens", await seen("#t-pin"));
  await p.evaluate(() => YS.app.go("print")); await p.waitForTimeout(800);
  await p.click("#p-run");
  await p.waitForFunction(() => /joint/i.test(document.querySelector("#p-files").textContent), null, { timeout: 90000 }).catch(() => {});
  const list = await p.textContent("#p-files");
  ok("3D print: the hub, the joint (print 2) and the mast cap", /hub at the feed/.test(list) && /joint \(print 2\)/.test(list) && /cap over the mast/.test(list), list.slice(0, 200));
  ok("and the collinear's not-built note", await seen("#p-tested-colin") && !(await seen("#p-tested-sleeve")));
  ok("the pipe choice is offered for a top mount on a mast", await seen("#p-radome"));
  ok("no pipe, no pipe warning", !(await seen("#p-radome-exp")));
  await p.selectOption("#p-radome", "pvc125"); await p.waitForTimeout(500);
  ok("the pipe is marked experimental once it's chosen", await seen("#p-radome-exp"));
  ok("in a pipe: the plan says how long to cut it and that the collars centre the rod", /Schedule 40 PVC/.test(await p.textContent("#p-plan")) && /Cut the pipe about \d+ mm/.test(await p.textContent("#p-plan")));
  await p.click("#p-run");
  await p.waitForFunction(() => /34 x 34 x/.test(document.querySelector("#p-files").textContent), null, { timeout: 90000 }).catch(() => {});
  ok("its hub and joints come out as wide as the bore allows (34.5 mm, listed as 34), the cap with its socket", /34 x 34 x/.test(await p.textContent("#p-files")), (await p.textContent("#p-files")).match(/[\d.]+ x [\d.]+ x [\d.]+/g));
  ok("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  console.log(bad ? `\n${bad} FAILED` : "\nAll passed");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
