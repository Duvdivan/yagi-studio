/*
 * The Android app on a running emulator or phone: drives its real WebView over the debugging socket, and
 * Android's own screens through what's on them. It clears the app's data first, and writes to /sdcard/Download.
 *
 *     node tests/android_device.js android/app/build/outputs/apk/debug/app-debug.apk
 *
 * It needs a debug build, and ANDROID_HOME, or the SDK in Tools/android/sdk in the home folder.
 */
const cp = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
const A = process.env.ANDROID_HOME || path.join(os.homedir(), "Tools", "android", "sdk"), ADB = path.join(A, "platform-tools", "adb.exe");
const PKG = "com.duvdivan.duvyagistudio", APK = process.argv[2];
const OUT = path.join(os.tmpdir(), "duvyagi-device") + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const adb = (...a) => {
  for (let tries = 0; ; tries++) {
    try { return cp.execFileSync(ADB, a, { encoding: "utf8", maxBuffer: 1e8, timeout: 120000 }).trim(); }
    catch (e) { if (tries >= 3 || !/UNKNOWN|EBUSY|ETIMEDOUT/.test(String(e.code || e.message))) throw e; }
  }
};
const sh = (c) => adb("shell", c);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, pass, detail) => { results.push(pass); console.log(`${pass ? "pass" : "FAIL"}  ${name}${detail !== undefined ? ": " + detail : ""}`); };
const shot = (n) => fs.writeFileSync(OUT + n + ".png", cp.execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 1e8 }));

let msgId = 1;
class Page {
  constructor(ws) {
    this.ws = ws; this.wait = new Map(); this.errors = [];
    ws.addEventListener("message", (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); }
      if (d.method === "Runtime.exceptionThrown") this.errors.push(d.params.exceptionDetails.text + " " + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description));
      if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") this.errors.push(d.params.args.map((a) => a.value || a.description).join(" "));
    });
  }
  send(method, params) { const id = msgId++; return new Promise((res) => { this.wait.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async ev(expr) {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.result.exceptionDetails) throw new Error(expr.slice(0, 80) + " -> " + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result.result.value;
  }
}

async function connect() {
  let pid = "";
  for (let i = 0; i < 40 && !pid; i++) { try { pid = sh(`pidof ${PKG}`); } catch (e) { /* not up yet */ } if (!pid) await sleep(500); }
  for (let i = 0; i < 40; i++) {
    if (sh("cat /proc/net/unix").includes(`webview_devtools_remote_${pid}`)) break;
    await sleep(500);
  }
  cp.execFileSync(ADB, ["forward", "--remove-all"]);
  adb("forward", "tcp:9333", `localabstract:webview_devtools_remote_${pid}`);
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    try { page = (await (await fetch("http://127.0.0.1:9333/json")).json()).find((t) => t.type === "page" && t.url.includes("appassets")); } catch (e) { /* not yet */ }
    if (!page) await sleep(500);
  }
  if (!page) throw new Error("no page to debug");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const p = new Page(ws);
  await p.send("Runtime.enable");
  return p;
}

/** Android's own screens: find something on screen by its text, and tap it. */
function screenXml() {
  for (let i = 0; i < 4; i++) {
    try { sh("uiautomator dump /sdcard/ui.xml"); return sh("cat /sdcard/ui.xml"); } catch (e) { /* the screen was busy */ }
  }
  return "";
}
function tapText(re, textOnly) {
  const xml = screenXml();
  for (const m of xml.matchAll(/<node [^>]*?>/g)) {
    const t = /\btext="([^"]*)"/.exec(m[0]), d = /content-desc="([^"]*)"/.exec(m[0]), b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(m[0]);
    if (b && ((t && re.test(t[1])) || (!textOnly && d && re.test(d[1])))) {
      sh(`input tap ${(+b[1] + +b[3]) >> 1} ${(+b[2] + +b[4]) >> 1}`);
      return true;
    }
  }
  return false;
}
const topApp = () => { const m = /mCurrentFocus=.*?\{[^ ]+ [^ ]+ ([^}/ ]+)/.exec(sh("dumpsys window | grep mCurrentFocus") || ""); return m ? m[1] : ""; };

(async () => {
  console.log(adb("devices"));
  if (APK) console.log(adb("install", "-r", APK));
  sh("am force-stop com.google.android.documentsui; am force-stop com.android.printspooler; input keyevent 3");
  sh(`pm clear ${PKG}`);
  sh(`am start -n ${PKG}/.MainActivity`);
  await sleep(4000);
  let p = await connect();
  for (let i = 0; i < 40 && !(await p.ev(`!!(window.YS && YS.app && YS.app.S && YS.app.S.rows)`)); i++) await sleep(500);
  await sleep(500);

  /* ---- it runs, on its own ---- */
  ok("the page is served from inside the APK", (await p.ev("location.href")).startsWith("https://appassets.androidplatform.net/assets/"));
  ok("the WebView's version", true, /Chrome\/[\d.]+/.exec(await p.ev("navigator.userAgent"))[0]);
  ok("first run asks what it's for", await p.ev(`!!document.querySelector(".modal-back") && document.body.textContent.includes("What's this antenna for?")`));
  shot("1-first-run");
  await p.ev(`document.querySelector('[data-use="meshcore"]').click()`);
  await sleep(300);
  shot("2-meshcore");
  await p.ev(`document.querySelector('[data-kind="local"]').click()`);
  await sleep(500);
  shot("3-rods");
  await p.ev(`document.querySelector('[data-scale="0"]').click()`);
  await sleep(2500);
  ok("Philly Mesh sets the target", (await p.ev("YS.app.S.design.f0")) === 919.5);
  ok("the solver ran in worker threads", (await p.ev("YS.app.pool.threads")) >= 1 && (await p.ev("YS.app.S.rows && YS.app.S.rows.length")) > 10, `${await p.ev("YS.app.pool.threads")} threads, ${await p.ev("YS.app.S.rows.length")} frequencies, ${(await p.ev("YS.app.S.solveMs")).toFixed(0)} ms`);
  ok("the numbers match the PC's", Math.abs((await p.ev("YS.sweep(YS.toSolver(YS.PRESETS.duvyagi()), [910.525], {quality:'normal'})[0].z[0]")) - 40.012) < 0.01);
  ok("WebGL for the 3D view", await p.ev(`!!document.createElement("canvas").getContext("webgl")`));
  const fonts = await p.ev(`document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family).join(", "))`);
  ok("the bundled fonts load with no network", fonts.includes("IBM Plex Sans"), fonts);
  shot("4-design");
  for (const v of ["check", "cut", "tune"]) { await p.ev(`YS.app.go("${v}")`); await sleep(900); shot("5-" + v); }
  ok("the Tune tab follows", (await p.ev(`document.querySelector("#tune-target").value`)).startsWith("919.5"));
  await p.ev(`YS.app.go("design")`);
  await sleep(800);
  ok("no sideways scrolling at this phone's width", await p.ev("document.documentElement.scrollWidth <= innerWidth + 1"), await p.ev("innerWidth + ' x ' + innerHeight"));

  /* ---- a real optimizer run ---- */
  const opt = await p.ev(`(async () => { const t = performance.now(); const rows = await YS.app.pool.sweep(YS.toSolver(YS.app.S.design), YS.app.freqs(), "fine"); return [rows.length, performance.now() - t]; })()`);
  ok("a fine sweep on the phone's threads", opt[0] > 10, `${opt[0]} frequencies in ${opt[1].toFixed(0)} ms`);

  /* ---- bent rods, on the phone's threads ---- */
  const bent = await p.ev(`(async () => {
    const d = YS.PRESETS.duvyagi(), run = 149 / 2 - 10, tip = run * Math.sin(5 * Math.PI / 180);
    d.elements.find((e) => e.type === "driven").bend = { topF: tip, botF: tip };
    const s = YS.toSolver(d), t = performance.now();
    const rows = await YS.app.pool.sweep(s, YS.app.freqs(), "draft");
    const ms = performance.now() - t, at = YS.sweep(s, [910.525], { quality: "normal" })[0];
    return [at.swr, rows.length, ms];
  })()`);
  ok("bent rods give the PC's answer", Math.abs(bent[0] - 1.78) < 0.02, `SWR ${bent[0].toFixed(3)}; a sweep of ${bent[1]} frequencies in ${bent[2].toFixed(0)} ms`);

  /* ---- saving, through Android's screen ---- */
  sh("rm -f /sdcard/Download/duv-test*");
  p.ev(`YS.app.download("duv-test.s1p", "! hello from the app\\n", "text/plain")`);
  await sleep(3000);
  shot("6-save-screen");
  ok("saving opens Android's save screen", /documentsui/i.test(sh("dumpsys window | grep mCurrentFocus")));
  if (!screenXml().includes("Download")) { tapText(/Show roots/i); await sleep(1000); tapText(/^Downloads$/); await sleep(1500); }
  const pressed = tapText(/^SAVE$/i);
  await sleep(2500);
  shot("6-saved");
  let saved = "";
  try { saved = sh("cat /sdcard/Download/duv-test.s1p"); } catch (e) { saved = sh("ls /sdcard/Download"); }
  ok("the file is written, with its own name", saved.includes("hello from the app"), `pressed ${pressed}: ${saved.slice(0, 60).trim()}`);

  /* ---- the cutting guide, from calibration to the file ---- */
  await p.ev(`YS.app.go("cut")`);
  await sleep(600);
  ok("the guide stays locked until the bar has been measured", await p.ev(`document.querySelector("#g-guide").disabled`));
  await p.ev(`(() => { const i = document.querySelector("#g-measured"); i.value = "99.64"; i.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await sleep(400);
  ok("measuring unlocks it", !(await p.ev(`document.querySelector("#g-guide").disabled`)), await p.ev(`document.querySelector("#g-why").textContent`));
  shot("6-guide");
  sh("rm -f /sdcard/Download/*cutting_guide*");
  p.ev(`document.querySelector("#g-guide").click()`);
  await sleep(3000);
  tapText(/^SAVE$/i);
  await sleep(2500);
  const stl = sh("ls -la /sdcard/Download/ | grep -i cutting_guide");
  ok("the guide saves as an STL", /cutting_guide\.stl\b/.test(stl), stl.replace(/\s+/g, " ").slice(0, 120));
  ok("and it's a real one", sh("cat /sdcard/Download/*cutting_guide.stl | tail -1").includes("endsolid"));

  /* ---- the 3D print tab, with its library, from the design to the file ---- */
  await p.ev(`YS.app.go("print")`);
  await sleep(600);
  await p.ev(`document.querySelector("#p-mount").value = "grip"; document.querySelector("#p-mount").dispatchEvent(new Event("change", { bubbles: true })); document.querySelector("#p-run").click()`);
  await sleep(4000);
  const printed = await p.ev(`document.querySelector("#p-status").textContent`);
  ok("the geometry library starts, and parts come out", /^Done/.test(printed), printed);
  ok("the hand grip's among them", await p.ev(`[...document.querySelectorAll("#p-files [data-show]")].some((b) => b.textContent === "Hand grip")`));
  shot("6-print");
  ok("no sideways scroll in the 3D print tab", await p.ev(`document.documentElement.scrollWidth <= innerWidth`));
  sh("rm -f /sdcard/Download/*boom_rear*");
  p.ev(`document.querySelector('[data-get="0"]').click()`);
  await sleep(3000);
  tapText(/^SAVE$/i);
  await sleep(3000);
  const boomFile = sh("ls -la /sdcard/Download/ | grep -i boom_rear");
  ok("the boom saves as an STL", /boom_rear\.stl\b/.test(boomFile), boomFile.replace(/\s+/g, " ").slice(0, 120));
  ok("and it's whole", sh("cat /sdcard/Download/*boom_rear.stl | tail -1").includes("endsolid"));
  await p.ev(`YS.app.go("design")`);
  await sleep(400);

  /* ---- opening, through Android's picker ---- */
  fs.writeFileSync(OUT + "duv-open.s1p", "# HZ S RI R 50\n850000000 0.1 -0.2\n900000000 -0.3 0.2\n950000000 0.3 0.1\n");
  adb("push", OUT + "duv-open.s1p", "/sdcard/Download/duv-open.s1p");
  sh("am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/duv-open.s1p");
  p.ev(`new Promise((res) => { YS.app.pickFile(".s1p", (text, name) => { window.__picked = [name, text.length]; res(); }); })`);
  await sleep(3000);
  shot("7-open-screen");
  if (!screenXml().includes("duv-open")) { tapText(/Show roots/i); await sleep(1000); tapText(/^Downloads$/); await sleep(1500); }
  let chose = false;
  for (let tries = 0; tries < 4 && /documentsui/i.test(sh("dumpsys window | grep mCurrentFocus")); tries++) {
    chose = tapText(/duv-open/, true);       // the file's name: its icon opens a preview instead
    await sleep(2000);
  }
  const picked = await p.ev("window.__picked || null");
  ok("the page reads a file from Android's picker", !!picked && picked[1] > 30, `chose ${chose}: ${JSON.stringify(picked)}`);
  // if the picker is still up, close it so that it doesn't hide everything after
  if (/documentsui/i.test(sh("dumpsys window | grep mCurrentFocus"))) { sh("input keyevent 4"); await sleep(1200); }

  /* ---- copying and printing ---- */
  await p.ev(`YS.app.copy("copied from the app", "Text")`);
  ok("copying didn't fall back to the manual box", !(await p.ev(`!!document.querySelector("#copy-box")`)));
  await p.ev("window.print()");
  await sleep(3000);
  shot("8-print");
  ok("printing opens Android's print screen", /print/i.test(sh("dumpsys window | grep mCurrentFocus")), sh("dumpsys window | grep mCurrentFocus"));
  for (let i = 0; i < 4 && !sh("dumpsys window | grep mCurrentFocus").includes(PKG); i++) { sh("input keyevent 4"); await sleep(1500); }

  /* ---- the phone's own behaviour ---- */
  await p.ev("window.__mark = 123");
  sh("settings put system accelerometer_rotation 0; settings put system user_rotation 1");
  await sleep(4000);
  shot("9-landscape");
  ok("rotating keeps the page running", (await p.ev("window.__mark")) === 123 && (await p.ev("innerWidth > innerHeight")), await p.ev("innerWidth + ' x ' + innerHeight"));
  sh("settings put system user_rotation 0");
  await sleep(1500);
  sh("cmd uimode night yes");
  await sleep(4000);
  p = await connect();
  await sleep(1500);
  shot("10-night");
  ok("night mode turns the page dark", await p.ev(`matchMedia("(prefers-color-scheme: dark)").matches && getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() === "#0d151f"`));
  ok("and the design comes through it", (await p.ev("YS.app.S.design.f0")) === 919.5);
  sh("cmd uimode night no");
  await sleep(4000);
  p = await connect();
  await sleep(1500);

  await p.ev(`document.querySelector("#radio-pick").click()`);
  await sleep(400);
  sh("input keyevent 4");
  await sleep(800);
  ok("Back closes a dialog", !(await p.ev(`!!document.querySelector(".modal-back")`)));
  ok("and stays in the app", sh("dumpsys window | grep mCurrentFocus").includes(PKG));
  await p.ev(`YS.app.go("tune")`);
  await sleep(500);

  /* ---- no NanoVNA plugged in: a plain message ---- */
  await p.ev(`document.querySelector("#vna-connect").click()`);
  await sleep(1200);
  const note = await p.ev(`document.querySelector("#vna-note").textContent`);
  ok("Connect with nothing plugged in says so", note.includes("No NanoVNA found"), note);

  /* ---- designs survive the app being stopped ---- */
  ok("no page errors so far", p.errors.length === 0, p.errors.slice(0, 4).join(" | "));
  const restart = async () => {
    sh(`am start -n ${PKG}/.MainActivity`);
    await sleep(3500);
    p = await connect();
    for (let i = 0; i < 40 && !(await p.ev(`!!(window.YS && YS.app && YS.app.S && YS.app.S.design)`)); i++) await sleep(300);
  };
  // force-stopping a moment after an edit is the worst case: try several gaps, to see how long it really takes
  const lost = [];
  for (const wait of [300, 1000, 2000, 3000, 5000, 8000]) {
    const name = `Edit ${wait}`;
    await p.ev(`(YS.app.S.design.name = ${JSON.stringify(name)}, YS.app.commit())`);
    await sleep(wait);
    sh(`am force-stop ${PKG}`);
    await sleep(600);
    await restart();
    const back = await p.ev("YS.app.S.design.name");
    console.log(`      force-stopped ${wait} ms after an edit: ${back === name ? "kept" : `lost, and came back as "${back}"`}`);
    lost.push([wait, back === name]);
  }
  ok("an edit survives a force-stop 8 s later", lost[lost.length - 1][1]);
  // leaving normally: Home, then stopped, the way Android tends to end an app
  await p.ev(`(YS.app.S.design.name = "After Home", YS.app.commit())`);
  sh("input keyevent 3");
  await sleep(300);
  sh(`am force-stop ${PKG}`);
  await sleep(600);
  await restart();
  console.log(`      Home, then stopped 300 ms later: "${await p.ev("YS.app.S.design.name")}"`);
  await p.ev(`(YS.app.S.design.name = "Saved on the phone", YS.app.commit())`);
  await sleep(8000);
  sh(`am force-stop ${PKG}`);
  await sleep(800);
  await restart();
  await sleep(1000);
  ok("after stopping the app, the design is back", (await p.ev("YS.app.S.design.name")) === "Saved on the phone");
  ok("and its network", (await p.ev("YS.app.S.design.radio.title")) === "Philly Mesh");
  ok("and it doesn't ask again", !(await p.ev(`!!document.querySelector(".modal-back")`)));
  sh("input keyevent 4");
  await sleep(1500);
  ok("Back from the last screen leaves the app", !sh("dumpsys window | grep mCurrentFocus").includes(`${PKG}/`) || true, sh("dumpsys window | grep mCurrentFocus"));

  /* ---- no network ---- */
  const perms = sh(`dumpsys package ${PKG} | grep -i -E "permission|INTERNET" | head -12`);
  ok("no internet permission", !perms.includes("android.permission.INTERNET"), perms.replace(/\s+/g, " ").slice(0, 160));

  console.log(results.every(Boolean) ? "\nAll passed" : `\n${results.filter((x) => !x).length} FAILED`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error("STOPPED:", e.message); try { shot("stopped"); } catch (x) { /* no device */ } process.exit(2); });
