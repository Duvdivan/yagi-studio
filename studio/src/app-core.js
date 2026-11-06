/*
 * Yagi Studio app, part 1: shared state, undo, the solve loop, and small UI helpers.
 * Plain DOM with no framework, so the whole tool is one HTML file that runs offline.
 */
(function (root) {
  "use strict";
  const YS = root.YS;
  const A = (YS.app = {});

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (v, d) => (v === undefined || v === null || !isFinite(v) ? "–" : Number(v).toFixed(d === undefined ? 1 : d));
  const mmToIn = (mm) => mm / 25.4;
  Object.assign(A, { $, $$, esc, fmt, mmToIn });

  /* ------------ state ------------ */
  const S = (A.S = {
    design: null, view: "design", quality: "normal",
    range: null, rangeAuto: true, cursor: 0, points: 81,
    rows: null, detail: null, solveMs: 0, solvedQuality: "",
    pinned: null, nec: null, server: false,
    history: [], future: [], snapshot: "", patternMode: "3d",
  });

  /* Plain-language meanings, shown from the small ? buttons. */
  const GLOSSARY = {
    swr: ["SWR", "How well the antenna takes power from the cable. 1.0 is perfect. Under 1.5 is good, and under 2 is usable. At SWR 2, about 11% of the power bounces back, a 0.5 dB loss."],
    bedcorner: ["Corner to corner", "A long part can lie across the bed's diagonal, which is longer than either side: about 360 mm on a 256 mm square bed, less what the part's width and brim need. Turn it in your slicer by the angle the file list gives. The corners have to be usable, and on some printers they aren't: purge lines, clips and the wipe tower can take them. A long part on the diagonal is also likelier to lift at its ends, so give it a brim."],
    printfit: ["Rod holes", "How much wider than the rod to model each hole, before the slicer's hole compensation. Print the coupon first: it has holes from 0.10 under to 0.10 over each rod's size. Use the one that grips the rod without bending it, and allow a little more, as a boom's longer holes print tighter than the coupon's."],
    printscrews: ["Screws holding the rods", "A hole in the boom's back at each rod's middle, a little under M3, so that an M3 x 8 screw cuts its own thread in the plastic and presses on the rod. The driven element's two halves get one each, either side of the solder window. Print the coupon first and try the three screw holes on its end, with a rod in place: use the smallest one the screw goes into without splitting the plastic. In the models, a screw at a rod's middle changes nothing, because it sits where the rod's field across it is zero. The two on the driven element move the tuning by about 1 MHz, so fit them before you trim on the VNA, and leave them in."],
    printgauge: ["The rod-cutting gauge", "A V along the top of the boom with a mark for each rod's length. Lay a rod in the V against the wall at its front end, and cut it at its mark. The marks come from the design's lengths when you make the files, so make the boom again if tuning changes a rod. Leave it off to cut with calipers or the Cut list's guide instead."],
    printcheck: ["The check notches", "Two notches on the top of the boom, 100 mm apart between their inner walls. Set your calipers' outside jaws into the notches and close them on the top between them. If it reads 100.00 mm, within about 0.15 mm, the print is true and so are the gauge's marks. They're open to the boom's edge so that hole compensation can't move them."],
    favor: ["Make the best of", "Once a design has the gain you asked for and stays within your limits, this is what the search spends what's left on. Lowest SWR gives the best match. Highest F/B rejects most from behind. Both raises whichever of the two is worse, with SWR counted as return loss. A longer boom or another rod pays for them. SWR stops counting at 1.04 and F/B at 40 dB, as past those a real build can't hold on to them."],
    gain: ["Gain", "How much stronger the signal is straight ahead than from a reference antenna. dBd compares with a plain dipole, dBi with an ideal point source; dBi is always 2.15 higher. Every 3 dB doubles the power."],
    fb: ["Front-to-back", "How much stronger the antenna is straight ahead than straight behind. F/B 20 dB means 1/100 of the power goes directly backward. Higher means it ignores more from directly behind."],
    fr: ["Front-to-rear", "Like front-to-back, but against the strongest lobe anywhere in the rear half, not just straight behind. It's the more honest number."],
    z: ["Feed impedance", "What the cable sees at the feed. R is the resistance and should be near 50 ohms. X is the leftover reactance and should be near 0. Trimming the driven element changes X much more than R."],
    bw: ["Beamwidth", "How wide the main beam is between its half-power points. A narrow beam has more gain but has to be aimed better."],
    eff: ["Efficiency", "The share of the power that's radiated rather than heating the rods. With metal rods this is usually well above 95%."],
    valley: ["The valley", "The lowest point of the SWR curve. On most Yagis the directors decide where it sits, and the driven element decides how deep it is. Trimming the driven element barely moves it."],
    quality: ["Accuracy", "How finely the rods are divided. Draft is about 0.1 ohm from Reference on typical designs and much faster, so it's used while you drag and in the optimizer."],
    gap: ["Feed gap", "The space between the two halves of the driven element at the center. Set it first, then trim: it's hard to change once the coax is soldered."],
    gapRods: ["The gap and the rods", "Real rods keep their length when you move them apart, so a wider gap makes the driven element longer tip to tip. Each mm of gap then counts about twice: once for the length, and once for the wire. Untick it to hold tip to tip fixed and see the gap on its own."],
    wire: ["The wire across the gap", "The model treats the driven element as one solid rod. Really the current crosses the gap on a thin wire, usually the coax's core, which adds about 3 ohm in series per mm of gap. So a real driven element finishes a little shorter than a model without it expects. It's off unless you tick it, and it comes from a model of the rod's real shape, not from a measurement. Any extra bare lead adds more, especially if it sticks out sideways. Gain doesn't change."],
    bends: ["Bent rods", "A rod bent along the boom changes its distance from its neighbors. That matters most for the driven element and the first director, which are closest. Bends sideways, rods a little off center, and uneven driven halves hardly matter. Gain is rarely hurt, but the match can be, so bending the driven element or D1 is also a free way to tune."],
    folded: ["Folded dipoles", "A folded dipole raises the feed resistance about four times, and needs a 4:1 balun to match it. On a LoRa Yagi it gains little: modeled on the 6-rod DuvYagi it had the same gain and the same SWR bandwidth as a split element, since the directors set that bandwidth and a LoRa signal is far narrower than it anyway. It also has no tips to trim. It can make more sense for other uses: a design with a very low feed resistance, near 12 ohm, or a DC path across the feed to drain static. It's not offered here yet, though tests/crooked.js can model one."],
    guide: ["Cutting guide", "A 3D-printed block that sets each rod's length. It's as accurate as your print, so calibrate first, and measure the guide and your first rod before trusting it. Rods need about ±0.3 mm."],
    radio: ["Radio settings", "Bandwidth, spreading factor and coding rate don't change the antenna, which only cares about the frequency. They decide the link: a higher spreading factor or a narrower bandwidth hears weaker signals, but each message stays on the air longer. Every node on a network has to use the same frequency, bandwidth and spreading factor."],
    endcap: ["Flat rod ends", "A solid rod with flat ends acts slightly longer than the open tube the math assumes: about 0.1 radii per end. This was measured with a separate full-surface model. Leave it on for solid rods."],
    mast: ["Metal mast", "A pole parallel to vertical rods couples to them. It's modeled as a centered metal pipe, so it's only used with vertical rods."],
    ground: ["Over ground", "The pattern with its reflection from real ground, which sets how high the beam points. It assumes the antenna is at least a wavelength up, so the ground doesn't change the feed impedance."],
    cable: ["Cable to the VNA", "A cable between the feed and the VNA changes the reading. Loss makes SWR look better than it is, and its length rotates R and X. If you measure through a pigtail soldered to the antenna, enter it here."],
    sigma: ["Typical error", "About 2 in 3 parts fall within this amount and nearly all within twice it. ±0.3 mm is careful work with calipers and a file."],
    trim: ["Trim on the VNA", "Each simulated build gets its driven element cut to cancel the reactance at the target, as you'd do with a VNA."],
    fit: ["How the fit works", "It finds how much longer or shorter each group of rods would have to act for the model to match your readings. A rod can act short because it was cut short, or because of something the model doesn't include, so treat it as a working explanation, not proof."],
  };
  A.help = (key) => `<button type="button" class="help" data-help="${key}" aria-label="What is ${esc(GLOSSARY[key] ? GLOSSARY[key][0] : key)}?">?</button>`;

  let tipEl = null;
  A.showTip = (html, x, y) => {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tipbox"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl); }
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.max(6, Math.min(window.innerWidth - r.width - 6, x + 14)) + "px";
    tipEl.style.top = Math.max(6, Math.min(window.innerHeight - r.height - 6, y + 14)) + "px";
  };
  A.hideTip = () => { if (tipEl) tipEl.hidden = true; };
  const showHelp = (btn) => {
    const g = GLOSSARY[btn.dataset.help];
    if (!g) return;
    const r = btn.getBoundingClientRect();
    A.showTip(`<b>${esc(g[0])}</b><br>${esc(g[1])}`, r.left, r.bottom);
  };
  document.addEventListener("mouseover", (e) => { const b = e.target.closest && e.target.closest("[data-help]"); if (b) showHelp(b); });
  document.addEventListener("mouseout", (e) => { if (e.target.closest && e.target.closest("[data-help]")) A.hideTip(); });
  document.addEventListener("focusin", (e) => { if (e.target.dataset && e.target.dataset.help) showHelp(e.target); });
  document.addEventListener("focusout", (e) => { if (e.target.dataset && e.target.dataset.help) A.hideTip(); });
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-help]"); if (b) { e.preventDefault(); showHelp(b); } });

  let toastTimer = null;
  A.toast = (text) => {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  };

  /** A built-in dialog, because the page's frame may refuse alert, confirm and prompt. */
  A.modal = (html, onOpen) => {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    back.addEventListener("pointerdown", (e) => { if (e.target === back) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(back);
    if (onOpen) onOpen(back, close);
    return close;
  };

  A.menu = (anchor, html, onOpen) => {
    $$(".menu").forEach((m) => m.remove());
    const m = document.createElement("div");
    m.className = "menu";
    m.innerHTML = html;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(window.innerWidth - mr.width - 8, r.left)) + "px";
    m.style.top = Math.min(window.innerHeight - mr.height - 8, r.bottom + 4) + "px";
    const close = () => { m.remove(); document.removeEventListener("pointerdown", away, true); };
    const away = (e) => { if (!m.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener("pointerdown", away, true), 0);
    if (onOpen) onOpen(m, close);
    const first = m.querySelector("button");
    if (first) first.focus();
    return close;
  };

  /** Reads a length: millimetres by default, and inches where hardware is sold in them. */
  A.parseLen = (txt) => {
    const t = String(txt).trim().toLowerCase();
    const frac = t.match(/^(\d+)\s*\/\s*(\d+)\s*(in|inch|inches|")$/);
    if (frac) return (parseFloat(frac[1]) / parseFloat(frac[2])) * 25.4;
    const inch = t.match(/^([\d.]+)\s*(in|inch|inches|")$/);
    if (inch) return parseFloat(inch[1]) * 25.4;
    const v = parseFloat(t.replace(/mm$/, ""));
    return /^-?[\d.]+\s*(mm)?$/.test(t) && isFinite(v) ? v : NaN;
  };

  /**
   * Wires a number box: updates as you type, commits on Enter or leaving the box, and steps with the
   * arrow keys (0.1; Shift 1; Alt 0.01). Returns nothing; get and set work on the live model.
   */
  A.bindNum = (input, o) => {
    const dec = o.decimals === undefined ? 1 : o.decimals;
    const show = () => { const v = o.get(); input.value = isFinite(v) ? Number(v).toFixed(dec).replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m)) : ""; };
    const valid = (v) => isFinite(v) && (o.min === undefined || v >= o.min) && (o.max === undefined || v <= o.max);
    show();
    input.addEventListener("input", () => {
      const v = o.parse ? o.parse(input.value) : A.parseLen(input.value);
      const good = valid(v);
      input.classList.toggle("bad", !good);
      if (good) o.set(v, false);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { input.blur(); return; }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const st = (e.shiftKey ? 1 : e.altKey ? 0.01 : 0.1) * (o.stepScale || 1) * (e.key === "ArrowUp" ? 1 : -1);
      const v = +(o.get() + st).toFixed(4);
      if (valid(v)) { o.set(v, false); show(); }
    });
    input.addEventListener("change", () => {
      input.classList.remove("bad");
      const v = o.parse ? o.parse(input.value) : A.parseLen(input.value);
      if (valid(v)) o.set(v, true);
      show();
    });
    input.addEventListener("blur", () => { input.classList.remove("bad"); show(); if (o.commitOnBlur) o.commitOnBlur(); });
    input._refresh = show;
  };

  /* ------------ undo, autosave ------------ */
  const STORE = "yagi-studio-v1";
  const storage = {
    read: () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { return {}; } },
    write: (o) => { try { localStorage.setItem(STORE, JSON.stringify(Object.assign(storage.read(), o))); } catch (e) { /* private window: carry on */ } },
  };
  A.storage = storage;

  A.commit = () => {
    const now = JSON.stringify(S.design);
    if (now === S.snapshot) return;
    if (S.snapshot) S.history.push(S.snapshot);
    if (S.history.length > 200) S.history.shift();
    S.future.length = 0;
    S.snapshot = now;
    storage.write({ design: S.design });
    A.updateUndo();
  };
  A.updateUndo = () => {
    const u = $("#undo"), r = $("#redo");
    if (u) u.disabled = !S.history.length;
    if (r) r.disabled = !S.future.length;
  };
  A.undo = () => {
    if (!S.history.length) return;
    S.future.push(S.snapshot);
    S.snapshot = S.history.pop();
    S.design = JSON.parse(S.snapshot);
    A.designChanged(true);
    A.updateUndo();
    storage.write({ design: S.design });
  };
  A.redo = () => {
    if (!S.future.length) return;
    S.history.push(S.snapshot);
    S.snapshot = S.future.pop();
    S.design = JSON.parse(S.snapshot);
    A.designChanged(true);
    A.updateUndo();
    storage.write({ design: S.design });
  };

  /** Loads a whole new design. */
  A.loadDesign = (d, keepHistory) => {
    if (keepHistory) A.commit();
    S.design = JSON.parse(JSON.stringify(d));
    if (!S.design.tune) S.design.tune = A.emptyTune();
    if (!keepHistory) { S.history.length = 0; S.future.length = 0; S.snapshot = ""; }
    S.rangeAuto = true;
    S.cursor = S.design.f0;
    S.pinned = null; S.nec = null;
    A.commit();
    A.designChanged(true);
  };

  A.emptyTune = () => ({ readings: [], measured: {}, range: null, sample: false, free: { directors: true, driven: true, reflector: false } });

  /* ------------ the solve loop: latest wins, draft first while dragging ------------ */
  A.autoRange = () => {
    const d = S.design;
    const half = Math.max(0.03 * d.f0, (d.band[1] - d.band[0]) * 0.9);
    const round = d.f0 > 500 ? 1 : d.f0 > 100 ? 0.5 : 0.1;
    S.range = [Math.floor(Math.min(d.f0 - half, d.band[0]) / round) * round, Math.ceil(Math.max(d.f0 + half, d.band[1]) / round) * round];
  };
  A.freqs = () => {
    const [a, b] = S.range, n = S.points, out = [];
    for (let i = 0; i < n; i++) out.push(a + (b - a) * i / (n - 1));
    return out;
  };

  let running = false, wanted = null, settleTimer = null;
  A.requestSolve = (mode) => {
    wanted = wanted === "full" ? "full" : (mode || "full");
    clearTimeout(settleTimer);
    pump();
  };

  async function pump() {
    if (running || !wanted) return;
    const mode = wanted;
    wanted = null;
    running = true;
    const started = performance.now();
    try {
      const solver = YS.toSolver(S.design);
      if (mode === "cursor") {
        const det = await A.pool.run("detail", { solver, f: S.cursor, quality: S.quality }, "ui");
        S.detail = det;
      } else {
        const q = mode === "drag" ? "draft" : S.quality;
        const rows = await A.pool.sweep(solver, A.freqs(), q);
        const det = await A.pool.run("detail", { solver, f: S.cursor, quality: q, grid: mode === "drag" ? [37, 73] : [61, 121] }, "ui");
        S.rows = rows;
        S.detail = det;
        S.solveMs = performance.now() - started;
        S.solvedQuality = q;
      }
      A.onResults();
    } catch (err) {
      A.toast("The solver stopped: " + err.message);
    }
    running = false;
    if (mode === "drag" && !wanted) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => A.requestSolve("full"), 160);
    }
    pump();
  }

  /** Something in the design changed. full: redraw the forms as well. */
  A.designChanged = (full) => {
    if (S.rangeAuto) A.autoRange();
    if (!S.cursor) S.cursor = S.design.f0;
    A.renderChrome();
    if (A.views[S.view] && A.views[S.view].refreshDesign) A.views[S.view].refreshDesign(full);
    A.requestSolve(full ? "full" : "drag");
  };

  A.onResults = () => {
    const st = $("#status");
    if (st) st.textContent = `${S.solveMs.toFixed(0)} ms · ${S.solvedQuality}`;
    const v = A.views[S.view];
    if (v && v.refreshResults) v.refreshResults();
  };

  /* ------------ small analysis helpers ------------ */
  /** The value of a row's field at any frequency, by interpolating the sweep. */
  A.valleyOfRows = (rows) => {
    let b = rows[0], idx = 0;
    rows.forEach((r, i) => { if (r.swr < b.swr) { b = r; idx = i; } });
    let f = b.f;
    if (idx > 0 && idx < rows.length - 1) {
      const y0 = Math.log(rows[idx - 1].swr), y1 = Math.log(rows[idx].swr), y2 = Math.log(rows[idx + 1].swr), den = y0 - 2 * y1 + y2;
      if (den > 0) f += 0.5 * (y0 - y2) / den * (rows[1].f - rows[0].f);
    }
    return { f, swr: b.swr };
  };
  A.interp = (rows, f, key) => {
    if (f <= rows[0].f) return rows[0][key];
    for (let i = 1; i < rows.length; i++) {
      if (f <= rows[i].f) { const t = (f - rows[i - 1].f) / (rows[i].f - rows[i - 1].f); return rows[i - 1][key] + t * (rows[i][key] - rows[i - 1][key]); }
    }
    return rows[rows.length - 1][key];
  };
  A.swrClass = (swr) => (swr <= 1.5 ? ["good", "Good match"] : swr <= 2 ? ["warn", "Usable"] : ["bad", "Poor match"]);
  /** The stretch around the target over which SWR stays under a limit. */
  A.swrWindow = (rows, limit) => {
    const inside = rows.filter((r) => r.swr <= limit);
    return inside.length ? [inside[0].f, inside[inside.length - 1].f] : null;
  };

  /* Ground constants: relative permittivity and conductivity in S/m. */
  const GROUNDS = { poor: [5, 0.001], average: [13, 0.005], good: [20, 0.03], sea: [80, 5], perfect: [1e6, 1e6] };
  A.GROUNDS = { poor: "Poor (dry, rocky)", average: "Average", good: "Good (moist)", sea: "Salt water", perfect: "Perfect" };

  /**
   * The elevation pattern over ground, by the method of images with Fresnel reflection. fieldCuts run
   * round the elevation plane in 1 degree steps; the rods' orientation picks which and which polarization.
   */
  A.overGround = (metrics, design) => {
    const cut = design.polarization === "vertical" ? metrics.fieldCuts.e : metrics.fieldCuts.h;
    const [er, sigma] = GROUNDS[design.ground.kind] || GROUNDS.average;
    const w = 2 * Math.PI * metrics.f * 1e6, eps0 = 8.854e-12;
    const ec = [er, -sigma / (w * eps0)];
    const k = 2 * Math.PI * metrics.f / 299792.458, h = design.ground.height;
    const csqrt = (c) => { const m = Math.hypot(c[0], c[1]), a = Math.sqrt((m + c[0]) / 2), b = Math.sqrt((m - c[0]) / 2); return [a, c[1] < 0 ? -b : b]; };
    const { cx } = YS;
    const out = { angles: [], db: [], peak: -Infinity, takeoff: 0 };
    for (let el = 0; el <= 180; el++) {
      const a = el * Math.PI / 180, sinp = Math.sin(a), cosp = Math.cos(a);
      const root2 = csqrt([ec[0] - cosp * cosp, ec[1]]);
      const G = design.polarization === "vertical"
        ? cx.div(cx.sub([ec[0] * sinp, ec[1] * sinp], root2), cx.add([ec[0] * sinp, ec[1] * sinp], root2))
        : cx.div(cx.sub([sinp, 0], root2), cx.add([sinp, 0], root2));
      const up = cut[180 + el], dn = cut[180 - el];
      const ph = k * h * sinp;
      const total = cx.add(cx.mul(up, [Math.cos(ph), Math.sin(ph)]), cx.mul(G, cx.mul(dn, [Math.cos(ph), -Math.sin(ph)])));
      const db = 20 * Math.log10(Math.max(cx.abs(total), 1e-6));
      out.angles.push(el);
      out.db.push(db);
      if (db > out.peak) { out.peak = db; out.takeoff = el; }
    }
    return out;
  };

  /* ------------ getting files in and out ------------ */
  /** What the hosted page's viewer offers, if it's running in one. Absent when opened as a plain file. */
  A.capability = async (name) => {
    try { return root.claude && root.claude.use ? await root.claude.use(name) : null; } catch (e) { return null; }
  };

  A.download = async (name, text, type) => {
    if (root.ysNative) {
      try {
        if (await root.ysNative.save(name, text, type)) A.toast(`Saved ${name}`);
      } catch (e) {
        A.toast("That wasn't saved: " + e.message + " Copy works instead.");
      }
      return;
    }
    if (root.ysWeb) {
      const saved = await root.ysWeb.save(name, text);
      if (saved !== null) {
        if (saved) A.toast(`Saved ${name}`);
        return;
      }
    }
    const host = await A.capability("downloads");
    if (host) {
      // the hosted viewer saves only some file types: the rest travel as .txt, unchanged inside
      const allowed = /\.(txt|json|md|csv)$/i.test(name), filename = allowed ? name : name + ".txt";
      try {
        await host.save({ filename, data: text });
        if (!allowed) A.toast(`Saved as ${filename}. Remove the .txt to use it.`);
      } catch (e) {
        if (e.code !== "declined") A.toast("That wasn't saved: " + e.message + " Copy works instead.");
      }
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  A.copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      A.toast((label || "Text") + " copied");
    } catch (e) {
      A.modal(`<h2>Copy this</h2><p>The browser wouldn't copy it directly. Select the text and copy it.</p><textarea class="txt" readonly id="copy-box">${esc(text)}</textarea><div class="row" style="margin-top:8px"><button class="btn" data-close>Close</button></div>`,
        (b, close) => { $("#copy-box", b).select(); $("[data-close]", b).onclick = close; });
    }
  };
  A.pickFile = (accept, cb) => {
    const i = document.createElement("input");
    // iOS greys out the file types it doesn't know, which is most of these. It can also drop an input
    // that isn't in the page before it reports the choice.
    i.type = "file"; i.hidden = true;
    if (!(root.ysWeb && root.ysWeb.ios)) i.accept = accept;
    document.body.appendChild(i);
    i.onchange = () => {
      const f = i.files[0];
      i.remove();
      if (!f) return;
      const r = new FileReader();
      r.onload = () => cb(String(r.result), f.name);
      r.readAsText(f);
    };
    i.click();
  };

  A.views = {};
})(typeof globalThis !== "undefined" ? globalThis : this);
