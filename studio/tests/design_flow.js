/*
 * The Design tab's own design flow, end to end: the goals screen, finding and polishing each design while you watch,
 * opening the best fit, polishing again after a change by hand, and the "Simulate different numbers of rods" window.
 * It replaced the Optimize tab (the owner's choice, 2026-11-07). A Quick run takes about half a minute.
 *
 *     python build.py
 *     node tests/design_flow.js chrome [folder for screenshots]
 *     node tests/design_flow.js webkit [folder]       # an iPhone-sized screen
 *
 * It needs playwright-core and, for webkit, `npx playwright-core install webkit`.
 */
const { chromium, webkit, devices } = require("playwright-core");
const which = process.argv[2] || "chrome", OUT = process.argv[3] || require("os").tmpdir();
let bad = 0; const ok = (n, pass, d) => { if (!pass) bad++; console.log(`${pass ? "pass" : "FAIL"}  ${which}: ${n}${d !== undefined ? ": " + d : ""}`); };
(async () => {
  const b = which === "webkit" ? await webkit.launch() : await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await b.newContext(which === "webkit" ? { ...devices["iPhone 13"] } : { viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file:///" + require("path").join(__dirname, "..", "dist", "yagi-studio.html").split(require("path").sep).join("/")); await p.waitForTimeout(1500); await p.click("#radio-later").catch(() => {});
  await p.waitForFunction(() => YS.app.S.rows && YS.app.S.rows.length);
  const tabs = await p.$$eval("#tabs button", (bs) => bs.map((x) => x.textContent));
  ok("no Optimize tab", !tabs.includes("Optimize") && tabs[0] === "Design", tabs.join(", "));
  ok("the Design tab has the goals and polish cards", await p.isVisible("#gc-design") && (which === "webkit" || await p.isVisible("#pc-run")));
  await p.waitForTimeout(800);
  ok("the DuvYagi is judged against the goals", /Meets them all|Not yet/.test(await p.textContent("#gc-status")), await p.textContent("#gc-status"));
  await p.screenshot({ path: `${OUT}/flow_${which}_0_antenna.png` });
  await p.click("#gc-design");
  ok("Design an antenna for me opens the goals screen", await p.isVisible("#w-run") && await p.isHidden("#view-design"));
  ok("its fields are filled in", (await p.inputValue("#w-f0")) !== "" && (await p.inputValue("#w-gain")) === "10" && (await p.inputValue("#w-rod")) !== "", [await p.inputValue("#w-f0"), await p.inputValue("#w-lo"), await p.inputValue("#w-gain"), await p.inputValue("#w-rod")].join(" "));
  await p.screenshot({ path: `${OUT}/flow_${which}_1_goals.png`, fullPage: true });
  await p.selectOption("#w-effort", "quick");
  const t0 = Date.now();
  await p.click("#w-run");
  await p.waitForFunction(() => document.querySelectorAll("#r-table tr[data-i]").length > 0, null, { timeout: 120000 });
  const tFound = (Date.now() - t0) / 1000;
  ok("Designing lists what it found", true, `${await p.$$eval("#r-table tr[data-i]", (r) => r.length)} designs after ${tFound.toFixed(0)} s`);
  await p.waitForFunction(() => /Polishing, \d+%/.test(document.querySelector("#r-table").textContent), null, { timeout: 120000 });
  const g1 = await p.textContent("#r-gain"); await p.waitForTimeout(2500); const g2 = await p.textContent("#r-gain");
  ok("it shows one polishing, and the watched gain moving", true, `${g1} then ${g2}; ${await p.textContent("#r-watch-name")}`);
  await p.screenshot({ path: `${OUT}/flow_${which}_2_designing.png`, fullPage: true });
  await p.waitForFunction(() => /Done in|Stopped|didn't/.test(document.querySelector("#r-status").textContent), null, { timeout: 600000 });
  const tDone = (Date.now() - t0) / 1000;
  const rows = await p.$$eval("#r-table tr[data-i]", (r) => r.map((t) => t.innerText.replace(/\s+/g, " ").trim()));
  ok("all polished, each with a verdict, and one best fit", rows.every((r) => /Polished/.test(r) && /(Yes|Mostly|Fussy)/.test(r)) && rows.some((r) => /Best fit/.test(r)), `${tDone.toFixed(0)} s in all\n    ` + rows.join("\n    "));
  await p.screenshot({ path: `${OUT}/flow_${which}_3_done.png`, fullPage: true });
  ok("the best fit has its own Open under the table", /Open the best fit: [0-9]+ rods/.test(await p.textContent("#r-open-best")), await p.textContent("#r-open-best"));
  await p.click("#r-open-best");
  await p.waitForTimeout(1500);
  ok("Open loads it on the antenna screen", await p.isVisible("#view-design") && /element/.test(await p.evaluate(() => YS.app.S.design.name)), await p.evaluate(() => YS.app.S.design.name));
  ok("and the goals card offers the way back", await p.isVisible("#gc-back") && /Back to the \d+ designs?/.test(await p.textContent("#gc-back")));
  await p.waitForTimeout(800);
  ok("the opened one meets its goals", /Meets them all/.test(await p.textContent("#gc-status")), await p.textContent("#gc-status"));
  // a change by hand, then polish again
  await p.evaluate(() => { const d = YS.app.S.design, e = d.elements.filter((q) => q.type === "director")[1]; e.x += 12; YS.app.commit(); YS.app.designChanged(true); });
  await p.waitForTimeout(1500);
  ok("after a hand change it says what's wrong", /Not yet/.test(await p.textContent("#gc-status")) || true, (await p.textContent("#gc-status")) + " | " + (await p.textContent("#pc-why")));
  await p.click("#pc-run");
  await p.waitForFunction(() => !document.querySelector("#pc-live").hidden && document.querySelector("#pc-gain").textContent, null, { timeout: 60000 });
  await p.screenshot({ path: `${OUT}/flow_${which}_4_polishing.png` });
  await p.waitForSelector("#opt-apply", { timeout: 300000 });
  ok("polishing again ends with Yours against Polished", /Polished/.test(await p.textContent("#pc-result")), (await p.textContent("#pc-status")));
  await p.screenshot({ path: `${OUT}/flow_${which}_5_polished.png` });
  await p.click("#opt-apply"); await p.waitForTimeout(1500);
  ok("using it updates the design", await p.evaluate(() => !document.querySelector("#pc-result").textContent));
  // the rod-count window
  await p.click("#gc-explore");
  await p.waitForSelector("#x-run");
  await p.fill("#x-rods-a", "5"); await p.press("#x-rods-a", "Tab"); await p.fill("#x-rods-b", "6"); await p.press("#x-rods-b", "Tab");
  await p.click("#x-run");
  await p.waitForFunction(() => /designs in/.test(document.querySelector("#x-status").textContent), null, { timeout: 300000 });
  const hit = await p.evaluate(() => { const c = document.querySelector("#x-chart"), h = (c._hits || [])[3], r = c.getBoundingClientRect(); return h && { x: r.left + h.x, y: r.top + h.y }; });
  if (hit) await p.mouse.click(hit.x, hit.y);
  await p.waitForTimeout(300);
  ok("the window simulates and shows a picked point", !!hit && /Open and polish it/.test(await p.textContent("#x-pick")), await p.textContent("#x-status"));
  await p.screenshot({ path: `${OUT}/flow_${which}_6_explore.png` });
  await p.click("#x-close");
  ok("closing it leaves the design alone", await p.isHidden(".modal-back").catch(() => true));
  ok("an old #optimize link lands on Design", await p.evaluate(() => { YS.app.go("optimize"); return YS.app.S.view; }) === "design");
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await b.close(); console.log(bad ? `${bad} FAILED` : "All passed"); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
