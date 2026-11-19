/*
 * Each kind of antenna has its own path through the tabs (the owner's wish, 2026-11-17): New design asks what you're building,
 * the header says which, and each tab shows only what's about that kind. A vertical dipole never sees directors, boom
 * length, bends, F/B or a YagiCAD file; a Yagi never sees a mast offset, a coax stub or "Match it again".
 *
 *     python build.py
 *     node tests/kinds.js chrome
 *
 * It needs playwright-core (see CLAUDE.md for where it is on the owner's PC).
 */
const { chromium } = require("playwright-core"), path = require("path");
let bad = 0;
const ok = (n, pass, d) => { if (!pass) bad++; console.log(`${pass ? "pass" : "FAIL"}  ${n}${d !== undefined ? ": " + d : ""}`); };

(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file:///" + path.join(__dirname, "..", "dist", "yagi-studio.html").split(path.sep).join("/")); await p.waitForTimeout(1500); await p.click("#radio-later").catch(() => {});
  await p.waitForFunction(() => YS.app.S.rows && YS.app.S.rows.length);
  const seen = (sel) => p.isVisible(sel);
  ok("a Yagi opens on the Yagi path, and the header says so", (await p.getAttribute("#app", "data-kind")) === "yagi" && (await p.textContent("#kind-badge")) === "Yagi");
  ok("its design screen has directors and bends, and no stub", await seen("#add-dir") && await seen('[aria-label="Bent or off-center rods"]') && !(await seen("#stub-on")));

  // New design asks what you're building
  await p.click("#new-design"); await p.waitForSelector("#k-dipole");
  ok("New design asks what you're building first", await seen("#k-yagi") && await seen("#k-dipole"));
  ok("the dipoles sit in the experimental zone, shut until the person says they understand it's untested",
    await p.isDisabled("#k-dipole") && await p.isEnabled("#k-yagi") && /not built or tested/i.test(await p.textContent(".exp-zone")) && !(await seen("#exp-badge")));
  await p.check("#k-ok");
  ok("ticking it opens them", await p.isEnabled("#k-dipole"));
  await p.click("#k-dipole"); await p.waitForTimeout(500);
  ok("the header says Experimental while a dipole is open", await seen("#exp-badge"));
  ok("a vertical dipole opens its own start screen", (await p.getAttribute("#app", "data-kind")) === "dipole" && await seen("#w-dip") && !(await seen("#w-yagi")) && /vertical dipole/.test(await p.textContent("#plan-goals h2:visible")));
  ok("with no Yagi goals on it (gain, F/B, rods, how hard to look)", !(await seen("#w-gain")) && !(await seen("#w-fb")) && !(await seen("#w-effort")));
  await p.click("#w-run");
  await p.waitForFunction(() => YS.app.planStage() === "antenna" && YS.app.S.design.hairpin, null, { timeout: 60000 });
  await p.waitForTimeout(2000);
  ok("the header says Vertical dipole", (await p.textContent("#kind-badge")) === "Vertical dipole");
  ok("its design screen has no directors, bends, rod direction or folded-dipole note", !(await seen("#add-dir")) && !(await seen('[aria-label="Bent or off-center rods"]')) && !(await seen("#pol")) && !(await seen("text=Folded dipoles aren't offered")));
  ok("but has its match: the hairpin, and the stub as a choice", await seen("#hp-len") && await seen("#stub-on") && !(await seen("#coil-kind")));
  ok("its cards are Match it again, not Polish or the rod-count explorer", await seen("text=Match it again") && !(await seen("#gc-explore")) && !(await seen("#pc-how")));
  await p.evaluate(() => YS.app.go("check")); await p.waitForTimeout(2500);
  ok("Build check: no hole positions, bends, gain, F/B or rod ranking", !(await seen("#t-pos")) && !(await seen("#t-bend")) && !(await seen("#h-gain")) && !(await seen("#h-fb")) && !(await seen("#s-chart")) && await seen("#t-pin"));
  await p.evaluate(() => YS.app.go("cut")); await p.waitForTimeout(1500);
  const files = await p.textContent("#c-files");
  ok("Cut list: no boom thickness and no YagiCAD file", !(await seen("#c-boom")) && !/YagiCAD/.test(files) && /NEC deck/.test(files));
  await p.evaluate(() => YS.app.go("print")); await p.waitForTimeout(1500);
  const mounts = await p.$$eval("#p-mount option", (o) => o.filter((q) => !q.hidden).map((q) => q.value));
  ok("3D print: only the mast clamp or no mount, as the arm is sized for the clamp", JSON.stringify(mounts.sort()) === JSON.stringify(["mast", "none"]), mounts.join(", "));
  ok("and its words are the arm's", await seen("text=Rod-cutting gauge on top of the arm") && !(await seen("text=Rod-cutting gauge on top of the boom")));

  // back to a Yagi, and undo back to the dipole
  await p.click("#new-design"); await p.waitForSelector("#k-yagi"); await p.click("#k-yagi"); await p.waitForSelector("#n-go"); await p.click("#n-go"); await p.waitForTimeout(1500);
  const all = await p.$$eval("#p-mount option", (o) => o.filter((q) => !q.hidden).length);
  ok("and the Experimental badge goes", !(await seen("#exp-badge")));
  ok("a new Yagi puts the Yagi path back, its every mount offered again", (await p.getAttribute("#app", "data-kind")) === "yagi" && all > 2 && await seen("text=Rod-cutting gauge on top of the boom"), `${all} mounts`);
  await p.evaluate(() => YS.app.go("design")); await p.waitForTimeout(800);
  ok("its design screen has directors again", await seen("#add-dir"));
  await p.click("#undo"); await p.waitForTimeout(1500);
  ok("Undo brings the dipole back, and its path", (await p.getAttribute("#app", "data-kind")) === "dipole" && !(await seen("#add-dir")));
  ok("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  console.log(bad ? `\n${bad} FAILED` : "\nAll passed");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
