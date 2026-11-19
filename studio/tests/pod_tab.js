/*
 * The node pod in the 3D print tab, in a browser: its choices show only with the pod as the mount, each changes the files,
 * and Make the files lists the pod's parts and draws them.
 *     NODE_PATH=... node tests/pod_tab.js [chrome|webkit] [shots-folder]
 */
const { chromium, webkit, devices } = require("playwright-core");
const path = require("path");
const which = process.argv[2] || "chrome", shots = process.argv[3];
let bad = 0; const ok = (n, pass, d) => { if (!pass) bad++; console.log(`${pass ? "pass" : "FAIL"}  ${which}: ${n}${d !== undefined ? ": " + d : ""}`); };
(async () => {
  const b = which === "webkit" ? await webkit.launch() : await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await b.newContext(Object.assign({ acceptDownloads: true }, which === "webkit" ? devices["iPad (gen 7)"] : { viewport: { width: 1400, height: 1000 } })), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file:///" + path.join(__dirname, "..", "dist", "yagi-studio.html").split(path.sep).join("/")); await p.waitForTimeout(1500); await p.click("#radio-later").catch(() => {});
  await p.waitForFunction(() => YS.app.S.rows && YS.app.S.rows.length);
  await p.evaluate(() => YS.app.go("print")); await p.waitForTimeout(600);

  ok("the pod's choices are hidden with another mount", await p.evaluate(() => document.querySelector("#p-pod").hidden));
  await p.selectOption("#p-mount", "pod"); await p.waitForTimeout(300);
  ok("and show with the pod as the mount", await p.evaluate(() => !document.querySelector("#p-pod").hidden));
  ok("the plan says how tall it stands and asks for a protected cell", /The pod stands \d+ mm tall/.test(await p.textContent("#p-plan")) && /protected/.test(await p.textContent("#p-plan")));
  await p.selectOption("#p-pod-top", "sma"); await p.selectOption("#p-pod-mount", "pad"); await p.selectOption("#p-pod-back", "pg9"); await p.fill("#p-pod-label", "DUVYAGI"); await p.press("#p-pod-label", "Tab");
  await p.waitForTimeout(300);
  ok("the plan follows the choices (an SMA insert on top, a pad behind)", /SMA antenna on a screw-in insert/.test(await p.textContent("#p-plan")) && /pad for bolt-on mounts/.test(await p.textContent("#p-plan")));

  const t0 = Date.now();
  await p.click("#p-run");
  await p.waitForFunction(() => /Done in|didn't work/.test(document.querySelector("#p-status").textContent), null, { timeout: 120000 });
  const status = await p.textContent("#p-status"), secs = (Date.now() - t0) / 1000;
  ok("Make the files works", /Done in/.test(status), `${status} (${secs.toFixed(1)} s in all)`);
  const names = await p.$$eval("#p-files [data-show]", (bs) => bs.map((x) => x.textContent));
  const want = ["Pod: body", "Pod: core", "Pod: ring", "Pod: SMA antenna insert", "Pod: tripod and pole block", "Pod: painter pole socket", "Pod: magnet base"];
  ok("the pod's parts are listed", want.every((w) => names.some((n) => n.startsWith(w))), names.filter((n) => /Pod/.test(n)).join(", "));
  // draw the body, and time it
  const bi = names.findIndex((n) => n === "Pod: body");
  const d0 = Date.now(); await p.click(`#p-files [data-show="${bi}"]`); await p.waitForTimeout(100);
  ok("the body draws in the preview", (await p.textContent("#p-title")) === "Pod: body", `${((Date.now() - d0) / 1000).toFixed(1)} s to draw`);
  if (shots) await p.screenshot({ path: path.join(shots, `pod_tab_${which}.png`), fullPage: false });
  if (which === "chrome") {
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#p-notes")]);
    const text = require("fs").readFileSync(await dl.path(), "utf8");
    ok("the build notes have the pod's, its brim and the SMA insert's O-ring among them", /THE NODE POD/.test(text) && /ON A BRIM/.test(text) && /18 x 2.5 mm O-ring/.test(text));
  }
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await b.close();
  console.log(bad ? `${bad} FAILED` : "All passed");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
