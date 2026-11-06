/*
 * Yagi Studio app, part 5: the toolbar, routing between the views, opening and saving designs, and
 * starting up.
 */
(function (root) {
  "use strict";
  const YS = root.YS, A = YS.app, S = A.S;
  const { $, $$, esc } = A;

  const TABS = [["design", "Design"], ["optimize", "Optimize"], ["check", "Build check"], ["cut", "Cut list"], ["print", "3D print"], ["tune", "Tune my antenna"]];
  const mounted = {};

  function renderTop() {
    $("#tabs").innerHTML = TABS.map(([k, v]) => `<button role="tab" data-v="${k}" aria-selected="${S.view === k}">${v}</button>`).join("");
    $$("#tabs button").forEach((b) => { b.onclick = () => A.go(b.dataset.v); });
  }

  /** Shows a view, building it the first time. */
  A.go = (view) => {
    if (!TABS.some((t) => t[0] === view)) view = "design";
    S.view = view;
    TABS.forEach(([k]) => {
      const host = $("#host-" + k);
      host.hidden = k !== view;
      if (k === view && !mounted[k]) {
        A.views[k].mount(host);
        mounted[k] = true;
      }
    });
    renderTop();
    A.storage.write({ view });
    try { if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view); } catch (e) { /* some frames refuse */ }
    A.views[view].show();
  };

  A.renderChrome = () => {
    const n = $("#design-name");
    if (document.activeElement !== n) n.value = S.design.name;
    document.title = "Yagi Studio";
  };

  const PRESET_INFO = [
    ["duvyagi", "DuvYagi 10 dBd", "6 rods, 910 MHz, as built, with its VNA readings"],
    ["gcarc", "GCARC 915 MHz", "5 rods of 1/16 in brass, the classic window Yagi"],
    ["ism915", "915 MHz starter", "5 rods, not yet optimized"],
    ["eu868", "869 MHz starter", "6 rods, for EU MeshCore and LoRa, not yet optimized"],
    ["two", "2 m starter", "5 rods, 146 MHz, not yet optimized"],
    ["seventy", "70 cm starter", "7 rods, 435 MHz, not yet optimized"],
    ["ghz", "23 cm starter", "10 rods, 1296 MHz, not yet optimized"],
  ];

  /* Saved designs live in this browser and, on the hosted page, in the person's private storage too,
     so a design saved on a PC opens on the phone beside the antenna. It connects on the first Open
     or Save rather than at load, so nothing is asked of anyone just for looking at the page. */
  let cloud = null, cloudTried = false, cloudDocs = {};
  async function connectCloud() {
    if (cloudTried) return cloud;
    cloudTried = true;
    const [db, user] = await Promise.all([A.capability("db"), A.capability("user")]);
    if (!db || !user) return null;
    try {
      const id = await user.id();
      if (id) cloud = db.collection("data/users/" + id);
    } catch (e) { cloud = null; }
    return cloud;
  }
  async function refreshCloud() {
    if (!(await connectCloud())) return;
    try {
      const snap = await cloud.get();
      cloudDocs = {};
      for (const doc of snap.docs) {
        const v = doc.data();
        if (v && v.name && v.json) cloudDocs[v.name] = { docId: doc.id, design: JSON.parse(v.json) };
      }
    } catch (e) { /* storage unavailable: the browser's own copy still works */ }
  }
  const cloudId = (name) => "d" + Array.from(new TextEncoder().encode(name)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 120);

  function saved() {
    const out = Object.assign({}, A.storage.read().library || {});
    for (const [n, v] of Object.entries(cloudDocs)) out[n] = v.design;
    return out;
  }
  async function saveDesign() {
    const lib = A.storage.read().library || {};
    lib[S.design.name] = S.design;
    A.storage.write({ library: lib });
    let where = "in this browser";
    if (await connectCloud()) {
      try {
        const id = cloudId(S.design.name);
        await cloud.doc(id).set({ name: S.design.name, json: JSON.stringify(S.design) });
        cloudDocs[S.design.name] = { docId: id, design: JSON.parse(JSON.stringify(S.design)) };
        where = "to your account, so it opens on your other devices too";
      } catch (e) { where = "in this browser, because your account storage didn't answer"; }
    }
    A.toast(`Saved "${S.design.name}" ${where}.`);
  }
  async function deleteSaved(name) {
    const lib = A.storage.read().library || {};
    delete lib[name];
    A.storage.write({ library: lib });
    if (cloudDocs[name] && cloud) {
      try { await cloud.doc(cloudDocs[name].docId).delete(); } catch (e) { /* it stays until storage answers */ }
      delete cloudDocs[name];
    }
    A.toast(`Removed "${name}".`);
  }

  async function openMenu(btn) {
    await refreshCloud();
    const lib = saved(), names = Object.keys(lib).sort();
    A.menu(btn, `
      <h3>Start from</h3>
      ${PRESET_INFO.map(([k, t, s]) => `<button data-preset="${k}">${esc(t)}<small>${esc(s)}</small></button>`).join("")}
      <button data-new>New design…<small>A starting design for your band, rods and rod sizes</small></button>
      <h3>Your saved designs</h3>
      ${names.length ? names.map((n) => `<div style="display:flex"><button data-saved="${esc(n)}">${esc(n)}</button><button data-del="${esc(n)}" aria-label="Remove ${esc(n)}" style="width:32px;text-align:center;color:var(--muted)">×</button></div>`).join("") : `<button disabled><small>Nothing saved yet. Use Save to keep a design.</small></button>`}
      <h3>From a file</h3>
      <button data-import>Import a file…<small>Yagi Studio .json, NEC deck or YagiCAD .YC6</small></button>
      <button data-paste>Paste a design…<small>Text from any of those files</small></button>`, (m, close) => {
      $$("[data-preset]", m).forEach((b) => {
        b.onclick = () => {
          close();
          const d = YS.PRESETS[b.dataset.preset]();
          A.loadDesign(d, true);
          if (b.dataset.preset === "duvyagi") withExampleReadings();
          A.go(S.view);
        };
      });
      $$("[data-saved]", m).forEach((b) => { b.onclick = () => { close(); A.loadDesign(YS.makeDesign(saved()[b.dataset.saved]), true); A.go(S.view); }; });
      $$("[data-del]", m).forEach((b) => { b.onclick = () => { close(); deleteSaved(b.dataset.del); }; });
      $("[data-new]", m).onclick = () => { close(); newDesignDialog(); };
      $("[data-import]", m).onclick = () => { close(); A.pickFile(".json,.nec,.yc6,.YC6,.txt", importInto); };
      $("[data-paste]", m).onclick = () => {
        close();
        A.modal(`<h2>Paste a design</h2><p>Paste a Yagi Studio JSON file, a repo design JSON, a NEC deck or a YagiCAD file.</p>
          <textarea class="txt" id="paste-box" spellcheck="false" aria-label="Design text"></textarea>
          <p class="note" id="paste-err"></p>
          <div class="row" style="margin-top:8px"><button class="btn primary" id="paste-go">Open it</button><button class="btn" id="paste-no">Cancel</button></div>`, (b, cl) => {
          $("#paste-box", b).focus();
          $("#paste-no", b).onclick = cl;
          $("#paste-go", b).onclick = () => {
            try { A.loadDesign(YS.importText($("#paste-box", b).value, "Pasted"), true); cl(); A.go(S.view); } catch (e) { $("#paste-err", b).textContent = e.message; }
          };
        });
      };
    });
  }

  function importInto(text, name) {
    try { A.loadDesign(YS.importText(text, name), true); A.go(S.view); A.toast("Opened " + name); } catch (e) { A.toast(e.message); }
  }

  function newDesignDialog() {
    const metals = `<option value="aluminium">Aluminum</option><option value="brass">Brass</option><option value="copper">Copper</option><option value="steel">Stainless</option>`;
    A.modal(`<h2>Start a new design</h2>
      <p>This gives you a sensible starting point using a standard spacing recipe. Then use Optimize to tune it. Undo brings back the design you have open.</p>
      <div class="field-grid">
        <div class="field"><label for="n-f">Frequency, MHz</label><input class="num" id="n-f" value="915" inputmode="decimal"></div>
        <div class="field"><label for="n-c">Rods</label><input class="num" id="n-c" value="6" inputmode="numeric"></div>
        <div class="field"><label for="n-d">Other rods' diameter, mm</label><input class="num" id="n-d" value="3" inputmode="decimal"></div>
        <div class="field"><label for="n-m">Other rods' metal</label><select class="sel" id="n-m">${metals}</select></div>
        <div class="field"><label for="n-dd">Driven diameter, mm</label><input class="num" id="n-dd" value="3" inputmode="decimal"></div>
        <div class="field"><label for="n-dm">Driven metal</label><select class="sel" id="n-dm">${metals}</select></div>
      </div>
      <label class="check" style="margin-top:8px"><input type="checkbox" id="n-screws"> I'll hold the rods in the boom with M3 screws. You can change this on the 3D print tab.</label>
      <p class="note" id="n-err" style="margin-top:6px"></p>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="n-go">Create it</button><button class="btn" id="n-no">Cancel</button></div>`, (b, close) => {
      $("#n-no", b).onclick = close;
      // the driven element follows the other rods until it's changed, so that a plain design takes no extra typing
      const follow = (from, to) => { $(from, b).addEventListener("input", () => { if (!$(to, b).dataset.own) $(to, b).value = $(from, b).value; }); $(to, b).addEventListener("input", () => { $(to, b).dataset.own = "1"; }); };
      follow("#n-d", "#n-dd"); follow("#n-m", "#n-dm");
      $("#n-go", b).onclick = () => {
        const f = parseFloat($("#n-f", b).value), c = parseInt($("#n-c", b).value, 10), d = A.parseLen($("#n-d", b).value), dd = A.parseLen($("#n-dd", b).value);
        if (!(f > 1) || !(c >= 2 && c <= 40) || !(d > 0) || !(dd > 0)) { $("#n-err", b).textContent = "Enter a frequency above 1 MHz, 2 to 40 rods, and both rod diameters."; return; }
        close();
        const made = YS.startingDesign(f, c, d, $("#n-m", b).value, { d: dd, material: $("#n-dm", b).value });
        made.screws = $("#n-screws", b).checked;
        A.loadDesign(made, true);
        A.go(S.view);
      };
    });
  }

  function aboutDialog() {
    A.modal(`<h2>How far to trust it</h2>
      <p>The solver treats each rod as a real tube with flat ends, on a mesh graded toward its tips. It was checked three ways.</p>
      <div class="scroll-x"><table class="tbl"><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>
        <tr><td style="white-space:normal">Thin rods (0.2 mm), 6-element array, against nec2++ at 121 segments, where its thin-wire math holds</td><td>within 0.03 Ω</td></tr>
        <tr><td style="white-space:normal">A 3.175 mm rod, against a separate model of its full surface</td><td>within 0.1 Ω</td></tr>
        <tr><td style="white-space:normal">Gain from input power against gain from integrating the pattern</td><td>within 0.02 dB</td></tr>
      </tbody></table></div>
      <p style="margin-top:10px"><b>Thick rods.</b> On a 3 mm rod at 900 MHz, nec2++ doesn't settle: its feed resistance runs from 53 to 71 ohms as segments increase. This solver settles, within about 0.1 ohm of its finest mesh at Normal.</p>
      <p><b>What it leaves out.</b> Bent and off-center rods are modeled, but Optimize and the exported files treat them as straight. It doesn't model folded dipoles or gamma matches, a metal boom, the coax radiating, plastic around the rods, or nearby objects. Real antennas can differ, and the first real one differs: the DuvYagi's valley measured about 9 MHz above this solver's prediction, cause not yet known. Measure yours.</p>
      <p class="note">Yagi Studio is free software: you can use, change and share it under the <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">GNU Affero General Public License</a>, version 3 or later. It comes with no warranty. <a href="https://github.com/Duvdivan/yagi-studio" target="_blank" rel="noopener">Its source code is on GitHub</a>.</p>
      <div class="row" style="margin-top:8px"><button class="btn" data-close>Close</button></div>`, (b, close) => { $("[data-close]", b).onclick = close; });
  }

  function setTheme(t) {
    if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
    A.storage.write({ theme: t || "" });
    const v = A.views[S.view];
    if (v && v.retheme) v.retheme();
  }
  function isDark() {
    const a = document.documentElement.getAttribute("data-theme");
    if (a) return a === "dark";
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function withExampleReadings() {
    const t = S.design.tune || (S.design.tune = A.emptyTune());
    t.range = [850, 950];
    t.target = S.design.f0;
    t.readings = YS.DUV_SWEEP.map((p) => Object.assign({}, p));
    t.sample = true;
    S.snapshot = "";
    A.commit();
  }

  async function detectServer() {
    if (!/^https?:$/.test(location.protocol) || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    try {
      const r = await fetch("/api/ping");
      if (r.ok) {
        S.server = true;
        A.views.design.showNecButton();
      }
    } catch (e) { /* no helper running: nothing to offer */ }
  }

  function start() {
    A.pool = new YS.Pool($("#ys-worker-src").textContent);
    const store = A.storage.read();
    if (store.theme) document.documentElement.setAttribute("data-theme", store.theme);
    let d = store.design && store.design.elements && store.design.elements.length ? store.design : null;
    if (d) {
      A.loadDesign(YS.makeDesign(d));
    } else {
      A.loadDesign(YS.PRESETS.duvyagi());
      withExampleReadings();
    }
    $("#new-design").onclick = newDesignDialog;
    $("#open").onclick = (e) => openMenu(e.currentTarget);
    $("#save").onclick = saveDesign;
    $("#undo").onclick = A.undo;
    $("#redo").onclick = A.redo;
    $("#theme").onclick = () => setTheme(isDark() ? "light" : "dark");
    $("#about").onclick = aboutDialog;
    const n = $("#design-name");
    n.oninput = () => { S.design.name = n.value; };
    n.onchange = () => { A.commit(); A.requestSolve("full"); };
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "textarea") return;
      e.preventDefault();
      if (e.shiftKey) A.redo(); else A.undo();
    });
    window.addEventListener("hashchange", () => A.go(location.hash.slice(1)));
    const media = window.matchMedia && matchMedia("(prefers-color-scheme: dark)");
    if (media && media.addEventListener) media.addEventListener("change", () => { const v = A.views[S.view]; if (v && v.retheme) v.retheme(); });
    const first = location.hash.slice(1) || store.view || "design";
    A.go(first);
    A.autoRange();
    A.requestSolve("full");
    A.updateUndo();
    detectServer();
    // ask once what the antenna is for; the Frequency card can change it later
    if (!store.radioAsked) {
      A.storage.write({ radioAsked: true });
      A.radio.open();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(typeof globalThis !== "undefined" ? globalThis : this);
