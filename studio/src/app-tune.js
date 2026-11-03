/*
 * Yagi Studio app, part 3: Tune my antenna. A person enters what they measured on their parts and
 * what their VNA says, by drawing the curve, typing numbers, loading a file or reading the NanoVNA.
 * The model is fitted to those readings, and the result is a list of real things to do.
 */
(function (root) {
  "use strict";
  const YS = root.YS, A = YS.app, S = A.S;
  const { $, $$, esc, fmt } = A;

  let fitTimer = null, fitSeq = 0, vna = null;
  const T = {
    mode: "draw", fit: null, plan: null, chosen: null, busy: false, models: null,
  };
  const tune = () => {
    if (!S.design.tune) S.design.tune = A.emptyTune();
    return S.design.tune;
  };
  const DRAW_YMAX = 5;

  function template() {
    return `
    <div class="view view-three" id="view-tune">
      <div class="col">
        <section class="card" aria-label="Step 1, your parts">
          <div class="head"><h2>1 · Your parts</h2></div>
          <div class="body stack">
            <p class="note">Measure your rods with calipers and enter what they really are. The model starts from these, so whatever's left over is the real puzzle.</p>
            <div class="scroll-x"><table class="rods" id="parts"></table></div>
            <div class="row"><button class="btn small" id="parts-reset">Back to the design's numbers</button></div>
            <div class="note" id="parts-note"></div>
          </div>
        </section>
        <section class="card" aria-label="How you measured">
          <div class="head"><h2>How you measured</h2></div>
          <div class="body stack">
            <div class="field"><label for="tune-target">Frequency you want, MHz</label><input class="num" id="tune-target" inputmode="decimal"></div>
            <label class="check"><input type="checkbox" id="cable-on"> A cable stays between the feed and the VNA's calibration point ${A.help("cable")}</label>
            <div id="cable-fields" class="stack">
              <div class="field-grid">
                <div class="field"><label for="cable-kind">Cable</label><select class="sel" id="cable-kind"></select></div>
                <div class="field"><label for="cable-len">Length, mm</label><input class="num" id="cable-len" inputmode="decimal"></div>
              </div>
              <details><summary>Measure its length with a short</summary>
                <div class="stack" style="margin-top:6px">
                  <p class="note">Bridge the feed right at the solder joints, as short as you can, and read R and X at the frequency above.</p>
                  <div class="field-grid">
                    <div class="field"><label for="short-r">R, ohm</label><input class="num" id="short-r" inputmode="decimal"></div>
                    <div class="field"><label for="short-x">X, ohm</label><input class="num" id="short-x"></div>
                  </div>
                  <button class="btn small" id="short-go">Work out the length</button>
                  <p class="note" id="short-out"></p>
                </div>
              </details>
            </div>
            <div class="sep"></div>
            <div class="note">Before you trust a reading:</div>
            <ul class="note" style="margin:0;padding-left:18px">
              <li>Calibrate open, short and load at the end of the cable that plugs into the antenna.</li>
              <li>Hold the antenna at least 1 m from people, walls, furniture and metal.</li>
              <li>Move your hand along the cable. If the curve moves, the cable is part of the antenna.</li>
            </ul>
          </div>
        </section>
      </div>

      <div class="col mid">
        <section class="card grow tall-md" style="flex:1 1 0" aria-label="Step 2, your SWR">
          <div class="head">
            <h2>2 · Your SWR</h2>
            <div class="row">
              <div class="seg" role="group" aria-label="How to enter readings" id="tune-mode">
                <button data-m="draw">Draw</button><button data-m="type">Type</button><button data-m="file">File or VNA</button>
              </div>
              <span class="note">Sweep</span>
              <input class="num" id="draw-lo" style="width:66px" aria-label="Sweep from, MHz" inputmode="decimal">
              <input class="num" id="draw-hi" style="width:66px" aria-label="Sweep to, MHz" inputmode="decimal">
            </div>
          </div>
          <div class="note" id="mode-hint" style="padding:4px 12px 0"></div>
          <div class="canvas-box" style="margin:4px"><canvas id="tune-chart" aria-label="Your SWR readings against frequency. In Draw mode, drag to draw the curve you see on your VNA."></canvas></div>
          <div class="legend" id="tune-legend" style="padding:0 12px 8px"></div>
        </section>
        <section class="card" id="type-card" aria-label="Type your readings" hidden>
          <div class="head"><h2>Readings</h2><span class="note">One per line: MHz then SWR. Or MHz, R, X if you have them.</span></div>
          <div class="body"><textarea class="txt" id="readings-text" rows="6" spellcheck="false" style="font:12.5px var(--mono);height:128px" aria-label="Readings, one per line"></textarea>
          <p class="note" id="readings-err"></p></div>
        </section>
        <section class="card" id="file-card" aria-label="Load readings" hidden>
          <div class="head"><h2>Load readings</h2></div>
          <div class="body stack">
            <div class="row">
              <button class="btn" id="load-s1p">Load a .s1p file</button>
              <button class="btn" id="vna-connect">Connect NanoVNA</button>
              <button class="btn" id="vna-scan" disabled>Read a sweep</button>
            </div>
            <p class="note" id="vna-note"></p>
            <details><summary>How to get a sweep off your NanoVNA</summary>
              <div class="stack" style="margin-top:6px">
                <p class="note"><b>With a PC:</b> the free <a href="https://github.com/NanoVNA-Saver/nanovna-saver" target="_blank" rel="noopener">NanoVNA-Saver</a> reads the sweep over USB and saves it as a Touchstone file. Load or drop that .s1p here.</p>
                <p class="note"><b>On the NanoVNA alone:</b> with a microSD slot and firmware showing an SD CARD menu, choose SD CARD, then SAVE S1P. Its numbered save slots only hold calibrations, not sweeps.</p>
                <p class="note"><b>Directly:</b> ${root.ysNative ? "plug it into this phone through a USB OTG adapter and use Connect NanoVNA." : root.ysWeb && root.ysWeb.ios ? "iPhones and iPads can't reach a NanoVNA over USB. Save a .s1p another way, then load it here through the Files app." : "plug it into this PC and use Connect NanoVNA, in Edge or Chrome."}</p>
                <p class="note"><b>Either way:</b> calibrate first, and sweep well past the valley on both sides. Tick the cable box under How you measured if a pigtail stays between the feed and your calibration point, which it usually does.</p>
              </div>
            </details>
          </div>
        </section>
        <div class="row">
          <button class="btn small" id="readings-clear">Clear readings</button>
          <button class="btn small" id="readings-sample">Load the DuvYagi example</button>
          <span class="note" id="readings-count"></span>
        </div>
      </div>

      <div class="col">
        <section class="card" aria-label="Step 3, what the readings say">
          <div class="head"><h2>3 · What it says</h2>${A.help("fit")}</div>
          <div class="body stack" id="diag"></div>
        </section>
        <section class="card" aria-label="What to do">
          <div class="head"><h2>What to do</h2></div>
          <div class="body stack" id="plan"></div>
        </section>
      </div>
    </div>`;
  }

  /* ---------- the design as actually built, from the measured lengths ---------- */
  function builtDesign() {
    const d = JSON.parse(JSON.stringify(S.design)), m = tune().measured;
    for (const e of d.elements) {
      const p = m[e.id];
      if (!p) continue;
      if (isFinite(p.L)) e.L = p.L;
      if (isFinite(p.x)) e.x = p.x;
      if (isFinite(p.d)) e.d = p.d;
    }
    d.elements.sort((a, b) => a.x - b.x);
    d.asBuilt = null;
    return d;
  }
  const targetF = () => S.design.tune.target || S.design.f0;

  function renderParts() {
    const d = S.design, table = $("#parts");
    const sorted = d.elements.slice().sort((a, b) => a.x - b.x);
    const m = tune().measured;
    table.innerHTML = `<thead><tr><th>Rod</th><th>Design length</th><th>You measured</th><th>Position</th></tr></thead><tbody>` + sorted.map((e, i) => `
      <tr data-id="${e.id}">
        <td class="rod-name">${esc(e.name)}</td>
        <td style="font:12.5px var(--mono);color:var(--muted);text-align:right;padding-right:8px">${fmt(e.L, 1)}</td>
        <td><input class="num" data-f="L" aria-label="${esc(e.name)} measured length" inputmode="decimal" placeholder="${fmt(e.L, 1)}" value="${m[e.id] && isFinite(m[e.id].L) ? m[e.id].L : ""}"></td>
        <td><input class="num" data-f="x" aria-label="${esc(e.name)} measured position" inputmode="decimal" placeholder="${fmt(e.x, 1)}" value="${m[e.id] && isFinite(m[e.id].x) ? m[e.id].x : ""}" ${i === 0 ? "disabled" : ""}></td>
      </tr>`).join("") + "</tbody>";
    $$("#parts input.num").forEach((inp) => {
      inp.addEventListener("input", () => {
        const id = inp.closest("tr").dataset.id, f = inp.dataset.f;
        const v = inp.value.trim() === "" ? NaN : A.parseLen(inp.value);
        const entry = m[id] || (m[id] = {});
        if (isFinite(v)) entry[f] = v; else delete entry[f];
        A.commit();
        partsNote();
        scheduleFit();
      });
    });
    partsNote();
  }
  function partsNote() {
    const m = tune().measured, n = Object.values(m).filter((p) => isFinite(p.L) || isFinite(p.x)).length;
    $("#parts-note").textContent = n
      ? `Using your measurements on ${n} rod${n > 1 ? "s" : ""}. Blank boxes use the design's numbers.`
      : "Nothing entered yet, so the model assumes the rods match the design. For a driven element not yet trimmed, enter its length tip to tip, including the gap.";
  }

  /* ---------- readings: one list, however they came in ---------- */
  function readingsRange() {
    const t = tune();
    if (!t.range) {
      const f = targetF();
      t.range = [Math.round(f * 0.94), Math.round(f * 1.06)];
    }
    return t.range;
  }
  const swrOfReading = (p) => (p.swr !== undefined ? p.swr : YS.swrOfGamma(p.g));

  function readingsToText() {
    return tune().readings.map((p) => {
      if (p.g) { const z = YS.zOfGamma(p.g, S.design.z0); return `${fmt(p.f, 3)}  ${fmt(z[0], 2)}  ${fmt(z[1], 2)}`; }
      return `${fmt(p.f, 2)}  ${fmt(p.swr, 2)}`;
    }).join("\n");
  }
  function textToReadings(txt) {
    const out = [];
    let bad = 0;
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const v = line.split(/[\s,;]+/).map(Number);
      if (v.some(isNaN) || v.length < 2 || v[0] <= 0) { bad++; continue; }
      if (v.length >= 3) out.push({ f: v[0], g: YS.gammaOf([v[1], v[2]], S.design.z0) });
      else if (v[1] >= 1) out.push({ f: v[0], swr: v[1] });
      else bad++;
    }
    out.sort((a, b) => a.f - b.f);
    return { out, bad };
  }
  function setReadings(list, fromTyping) {
    const t = tune();
    t.readings = list;
    t.sample = false;
    if (list.length && !fromTyping) {
      const fa = list[0].f, fb = list[list.length - 1].f, pad = Math.max((fb - fa) * 0.04, 1);
      if (fa < t.range[0] || fb > t.range[1]) t.range = [Math.floor(Math.min(fa - pad, t.range[0])), Math.ceil(Math.max(fb + pad, t.range[1]))];
    }
    A.commit();
    if (!fromTyping) $("#readings-text").value = readingsToText();
    $("#draw-lo")._refresh(); $("#draw-hi")._refresh();
    countNote();
    drawChart();
    scheduleFit();
  }
  function countNote() {
    const t = tune(), n = t.readings.length;
    $("#readings-count").textContent = (t.sample ? "Example: the DuvYagi's first readings, read off photos of the NanoVNA. " : "") + (n ? `${n} reading${n > 1 ? "s" : ""}` : "No readings yet");
  }

  /* ---------- the chart, which is also the drawing surface ---------- */
  function drawChart() {
    const c = $("#tune-chart");
    if (!c || !S.design) return;
    const tk = YS.tokens(), t = tune(), range = readingsRange();
    const series = [];
    const legend = [];
    if (T.models) {
      const mk = (rows, color, name, width) => { series.push({ name, color, width, pts: rows.map((r) => [r.f, r.swr]) }); legend.push(`<span><i style="background:${color}"></i>${esc(name)}</span>`); };
      if (T.chosen && T.plan) {
        const o = T.plan.options.find((q) => q.id === T.chosen);
        if (o) mk(o.curve, tk.s3, "After the fix (predicted)");
      }
      if (T.models.fitted) mk(T.models.fitted, tk.s1, "Model fitted to your readings");
    }
    const pts = t.readings.map((p) => [p.f, Math.min(swrOfReading(p), 50)]);
    series.push({ name: "Your readings", color: tk.s2, pts, dots: t.readings.length <= 40, joined: true, width: t.readings.length > 40 ? 2 : undefined });
    legend.push(`<span><i style="background:${tk.s2}"></i>Your readings</span>`);
    YS.drawSweep(c, {
      xr: range, target: targetF(), targetLabel: "target", cursor: -1,
      rows: [{ key: "swr", title: "SWR", yr: [1, DRAW_YMAX], ticks: [1, 1.5, 2, 3, 4, 5], series }],
    });
    $("#tune-legend").innerHTML = legend.join("");
    if (!t.readings.length && T.mode === "draw") {
      const { ctx, w, h } = (() => { const r = c.getBoundingClientRect(); return { ctx: c.getContext("2d"), w: r.width, h: r.height }; })();
      ctx.fillStyle = tk.muted; ctx.font = `14px ${tk.sans}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Drag here to draw the curve you see on your VNA", w / 2, h / 2);
    }
  }

  function bindDrawing() {
    const c = $("#tune-chart");
    let drawing = false, last = null;
    const STEPS = 60;
    const toData = (e) => {
      const r = c.getBoundingClientRect(), L = c._layout && c._layout.layout[0];
      if (!L) return null;
      const f = c._invX(e.clientX - r.left);
      const y = e.clientY - r.top;
      const v = L.lo + (L.y1 - y) / (L.y1 - L.y0) * (L.hi - L.lo);
      return { f, swr: Math.max(1, Math.min(DRAW_YMAX, v)) };
    };
    const paint = (p) => {
      const t = tune(), range = t.range, step = (range[1] - range[0]) / STEPS;
      const snap = (f) => +(Math.round((f - range[0]) / step) * step + range[0]).toFixed(2);
      const a = last || p;
      const lo = Math.min(a.f, p.f), hi = Math.max(a.f, p.f);
      // keep what's outside the stroke; replace what's under it
      const list = t.readings.filter((q) => q.f < lo - step / 2 || q.f > hi + step / 2).filter((q) => !q.g);
      for (let f = snap(lo); f <= snap(hi) + 1e-6; f = +(f + step).toFixed(4)) {
        const u = hi > lo ? (f - a.f) / (p.f - a.f) : 0;
        list.push({ f: +f.toFixed(2), swr: +(a.swr + Math.max(0, Math.min(1, u)) * (p.swr - a.swr)).toFixed(3) });
      }
      list.sort((q, w) => q.f - w.f);
      t.readings = list;
      last = p;
      drawChart();
    };
    c.addEventListener("pointerdown", (e) => {
      if (T.mode !== "draw") return;
      const p = toData(e);
      if (!p) return;
      drawing = true; last = null;
      tune().sample = false;
      c.setPointerCapture(e.pointerId);
      paint(p);
      e.preventDefault();
    });
    c.addEventListener("pointermove", (e) => {
      if (drawing) { const p = toData(e); if (p) paint(p); }
    });
    const end = () => {
      if (!drawing) return;
      drawing = false; last = null;
      smoothDrawn();
      A.commit();
      $("#readings-text").value = readingsToText();
      countNote();
      drawChart();
      scheduleFit();
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  /** A hand wobbles: a light moving average keeps the curve's shape without the shake. */
  function smoothDrawn() {
    const r = tune().readings;
    if (r.length < 5) return;
    tune().readings = r.map((p, i) => {
      if (i === 0 || i === r.length - 1 || p.swr === undefined || r[i - 1].swr === undefined || r[i + 1].swr === undefined) return p;
      return { f: p.f, swr: +((r[i - 1].swr + 2 * p.swr + r[i + 1].swr) / 4).toFixed(3) };
    });
  }

  /* ---------- diagnosis ---------- */
  function scheduleFit() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(runFit, 350);
  }

  /** Thins a long sweep, keeping the region around its valley densest. */
  function fitSubset(list) {
    const most = 20;
    if (list.length <= most) return list;
    const keep = new Set();
    for (let i = 0; i < most - 4; i++) keep.add(Math.floor(i * list.length / (most - 4)));
    keep.add(list.length - 1);
    list.map((p, i) => [swrOfReading(p), i]).sort((a, b) => a[0] - b[0]).slice(0, 4).forEach((v) => keep.add(v[1]));
    return [...keep].sort((a, b) => a - b).map((i) => list[i]);
  }

  async function runFit() {
    const t = tune();
    if (t.readings.length < 2) {
      T.fit = null; T.plan = null; T.models = null; T.chosen = null;
      renderDiag(); renderPlan(); drawChart();
      return;
    }
    const seq = ++fitSeq;
    T.busy = true;
    T.plan = null;
    renderDiag();
    renderPlan();
    try {
      const design = builtDesign();
      const cable = S.design.cable.on ? S.design.cable : null;
      const useZ = !!cable && t.readings.some((p) => p.g);
      T.useZ = useZ;
      const readings = fitSubset(t.readings).map((p) => (p.g && useZ ? { f: p.f, g: p.g } : { f: p.f, swr: swrOfReading(p) }));
      const rodStarts = [{ directors: 0, driven: 0, reflector: 0 }, { directors: -2 }, { directors: 2 }, { directors: -3, driven: -3 }, { directors: -2, driven: 3 }, { directors: 2, driven: -3 }];
      // the rotation repeats every half wavelength of cable: start from several lengths
      const starts = useZ ? [-50, -25, 0, 25, 50].flatMap((c) => rodStarts.slice(0, 3).map((r) => Object.assign({ cable: c }, r))) : rodStarts;
      const fitWith = (weightPower) => Promise.all(starts.map((st) => A.pool.run("fitReadings", { design, readings, cable, free: t.free, starts: [st], weightPower, fitCable: useZ })));
      const [mainFits, plainFits] = await Promise.all([fitWith(3), fitWith(0)]);
      if (seq !== fitSeq) return;
      const best = (list) => list.reduce((a, b) => (b.value < a.value ? b : a));
      const fit = best(mainFits);
      fit.alternate = best(plainFits).offsets;
      T.fit = fit;
      T.busy = false;
      renderDiag();
      const target = targetF();
      const plan = await A.pool.run("tunePlan", { design, offsets: fit.offsets, target });
      if (seq !== fitSeq) return;
      T.plan = plan;
      // the fitted model across the readings' range
      const range = t.range, fs = [];
      for (let i = 0; i <= 80; i++) fs.push(range[0] + (range[1] - range[0]) * i / 80);
      const solver = YS.toSolver(design, fit.offsets);
      const rows = await A.pool.sweep(solver, fs, "normal");
      if (seq !== fitSeq) return;
      const line = cable && fit.cableLength !== undefined ? Object.assign({}, cable, { length: fit.cableLength }) : cable;
      T.models = {
        fitted: rows.map((r) => {
          if (!line) return { f: r.f, swr: r.swr };
          return { f: r.f, swr: YS.swrOfGamma(YS.gammaThroughCable(YS.gammaOf(r.z, S.design.z0), line, r.f)) };
        }),
      };
      if (plan.options[0] && !plan.options.some((o) => o.id === T.chosen)) T.chosen = plan.options[0].id;
      if (T.lastTop !== plan.options[0].id) { T.chosen = plan.options[0].id; T.lastTop = plan.options[0].id; }
    } catch (err) {
      A.toast("The fit stopped: " + err.message);
    }
    T.busy = false;
    renderDiag(); renderPlan(); drawChart();
  }

  const measuredValley = () => {
    const list = tune().readings;
    let b = null;
    for (const p of list) { const s = swrOfReading(p); if (!b || s < b.swr) b = { f: p.f, swr: s }; }
    return b;
  };

  function offsetSentence(name, verb, v) {
    if (Math.abs(v) < 0.15) return `${name} ${verb} about as long as you entered`;
    return `${name} ${verb} about <b>${fmt(Math.abs(v), 1)} mm ${v < 0 ? "shorter" : "longer"}</b> than you entered`;
  }
  /** Does this answer hold however the readings are weighted? */
  function firmness(fit, key) {
    const a = fit.offsets[key], b = fit.alternate[key], gap = Math.abs(a - b);
    const signed = (v) => (v >= 0 ? "+" : "−") + fmt(Math.abs(v), 1);
    return { firm: gap < 0.6, range: `${signed(Math.min(a, b))} to ${signed(Math.max(a, b))} mm` };
  }

  function renderDiag() {
    const host = $("#diag"), t = tune();
    if (!host) return;
    if (t.readings.length < 2) {
      host.innerHTML = `<p class="note">Add at least two SWR readings. Five or more, spread across the valley and its sides, give a much firmer answer.</p>`;
      return;
    }
    const v = measuredValley(), tgt = targetF(), off = v.f - tgt;
    let html = "";
    const onTarget = Math.abs(off) < 0.003 * tgt;
    html += `<p>Your best match is <b>SWR ${fmt(v.swr, 2)} at ${fmt(v.f, 1)} MHz</b>${onTarget ? ", right on your target." : `, <b>${fmt(Math.abs(off), 1)} MHz ${off > 0 ? "above" : "below"}</b> your ${fmt(tgt, 3)} MHz target.`}</p>`;
    if (T.busy && !T.fit) { host.innerHTML = html + `<p class="note">Fitting the model to your readings…</p>`; return; }
    if (T.busy) { host.innerHTML = html + `<p class="note">Updating for your new readings…</p>`; return; }
    if (T.fit) {
      const o = T.fit.offsets, rms = T.fit.rms;
      const [cls, word, note] = rms < 0.07 ? ["good", "Close fit", "The model follows your readings closely."]
        : rms < 0.16 ? ["warn", "Fair fit", "The model follows the valley and the general shape, but not every detail. A radiating cable or something nearby could explain the rest."]
          : ["bad", "Rough fit", "Something in your setup isn't in the model. Try the checks on the left: a calibration off, a cable that's radiating, or something nearby. Measuring the rods helps most."];
      const fD = firmness(T.fit, "directors"), fE = firmness(T.fit, "driven");
      html += `<p>To match your readings, the ${offsetSentence("directors", "act", o.directors)}, and the ${offsetSentence("driven element", "acts", o.driven)}.${t.free.reflector ? ` The ${offsetSentence("reflector", "acts", o.reflector)}.` : ""}</p>`;
      const firmText = (name, f) => (f.firm ? `<b>${name}: firm.</b> It holds however the readings are weighted (${f.range}).` : `<b>${name}: unsure.</b> It runs from ${f.range} depending on which readings count most.`);
      html += `<p class="note">${firmText("Directors", fD)} ${firmText("Driven element", fE)}${fE.firm ? "" : " Measure it, enter its real length under Your parts, and trim it last, on the VNA."}</p>`;
      html += `<p><span class="pill ${cls}">${word}</span> <span class="note">${note}</span></p>`;
      if (t.readings.length < 5) html += `<p class="note">With only ${t.readings.length} readings this is a rough guide. More readings, especially on both sides of the valley, firm it up.</p>`;
      const hasZ = t.readings.some((p) => p.g);
      if (T.useZ) html += `<p class="note">Using R and X as well as SWR. They fit best with <b>${fmt(T.fit.cableLength, 0)} mm</b> of cable between the feed and the calibration point.</p>`;
      else if (hasZ) html += `<p class="note"><b>Using SWR only for now.</b> Your readings include R and X, but a cable rotates those, so they can't be trusted yet. Tick the cable box on the left and enter its rough length. The fit will then use them and work out the exact length, which should settle the driven element.</p>`;
      else html += `<p class="note">SWR alone can't separate every cause. A sweep file with R and X pins it down better.</p>`;
      html += `<label class="check"><input type="checkbox" id="free-reflector" ${t.free.reflector ? "checked" : ""}> Let the fit change the reflector too</label>`;
    }
    host.innerHTML = html;
    const fr = $("#free-reflector");
    if (fr) fr.onchange = (e) => { t.free.reflector = e.target.checked; A.commit(); scheduleFit(); };
  }

  /* ---------- the plan ---------- */
  function halves(design, L) {
    return (L - design.gap) / 2;
  }
  function stepLine(s, design) {
    const dL = s.change;
    const rod = esc(s.rod);
    if (s.role === "driven") {
      const each = halves(design, s.to);
      if (s.action === "file") return `<b>${rod}:</b> file <b>${fmt(-dL / 2, 1)} mm</b> off each outer tip, to ${fmt(s.to, 1)} mm tip to tip (${fmt(each, 2)} mm each half).`;
      return `<b>${rod}:</b> cut two new halves of <b>${fmt(each + 2, 1)} mm</b>, then trim to ${fmt(s.to, 1)} mm tip to tip on the VNA.`;
    }
    if (s.action === "file") return `<b>${rod}:</b> file <b>${fmt(-dL / 2, 1)} mm</b> off each end, to ${fmt(s.to, 1)} mm.`;
    return `<b>${rod}:</b> cut a new rod at <b>${fmt(s.to, 1)} mm</b> (${fmt(dL, 1)} mm longer).`;
  }

  function renderPlan() {
    const host = $("#plan");
    if (!host) return;
    const t = tune();
    if (!T.plan) {
      host.innerHTML = `<p class="note">${t.readings.length < 2 ? "This fills in once there are readings." : "Working out the options…"}</p>`;
      return;
    }
    const design = builtDesign();
    const opts = T.plan.options;
    const now = T.plan.now;
    const row = (lab, o) => `<tr><td>${lab}</td><td>${fmt(o.swr, 2)}</td><td>${fmt(o.gain, 2)}</td><td>${fmt(o.fb, 1)}</td></tr>`;
    let html = "";
    const mv = measuredValley();
    if (mv && mv.swr < 1.35 && Math.abs(mv.f - targetF()) < 0.004 * targetF()) {
      html += `<p><span class="pill good">Already good</span> Your readings show SWR ${fmt(mv.swr, 2)} at ${fmt(mv.f, 1)} MHz, right where you want it. You could glue the rods and move on. The options below are only if you want a little more.</p>`;
    }
    html += opts.map((o, i) => {
      const lines = (o.bends || []).map((b) => `<li><b>${esc(b.rod)}:</b> bend both tips <b>${fmt(Math.abs(b.add), 0)} mm</b> ${b.add > 0 ? "forward, away from the reflector" : "back, toward the reflector"}, from where they leave the boom.</li>`).join("")
        + o.steps.filter((s) => s.action !== "keep").map((s) => `<li>${stepLine(s, design)}</li>`).join("");
      const [cls, word] = A.swrClass(o.swr);
      const needs = o.newRods ? `${o.newRods} new rod${o.newRods > 1 ? "s" : ""}` : "No new rods";
      const chosen = T.chosen === o.id;
      return `<div class="option" data-opt="${o.id}" style="border:1px solid ${chosen ? "var(--accent)" : "var(--line)"};border-radius:6px;padding:8px 10px">
        <div class="row" style="justify-content:space-between"><b>${i === 0 ? "Best: " : ""}${esc(o.title)}</b><button class="btn small" data-show="${o.id}" aria-pressed="${chosen}">${chosen ? "On the chart" : "Show"}</button></div>
        <p class="note" style="margin:3px 0 6px">${esc(o.why)}</p>
        <ul style="margin:0 0 6px;padding-left:18px">${lines || "<li>No rods need to change.</li>"}</ul>
        <p class="stat-line"><span class="pill ${cls}">${word}</span> SWR ${fmt(o.swr, 2)} at target · ${fmt(o.gain, 2)} dBd · F/B ${fmt(o.fb, 1)} dB · ${needs}</p>
        <div class="row" style="margin-top:6px"><button class="btn small" data-apply="${o.id}">${o.bends ? "Put these bends in the design" : "Make these the design's lengths"}</button></div>
      </div>`;
    }).join("");
    html += `<table class="tbl" style="margin-top:4px"><thead><tr><th>Predicted at target</th><th>SWR</th><th>dBd</th><th>F/B</th></tr></thead><tbody>${row("As it is now", now)}${opts.map((o) => row(esc(o.title.replace("Change ", "").replace(/^./, (c) => c.toUpperCase())), o)).join("")}</tbody></table>`;
    html += `<p class="note">These are predictions from a model fitted to your readings. Make the first change, sweep again, and enter the new curve here: each round should land closer. Keep the old rods until you've checked.</p>`;
    host.innerHTML = html;
    $$("[data-show]", host).forEach((b) => { b.onclick = () => { T.chosen = b.dataset.show; renderPlan(); drawChart(); }; });
    $$("[data-apply]", host).forEach((b) => {
      b.onclick = () => {
        const o = opts.find((q) => q.id === b.dataset.apply);
        const byName = new Map(S.design.elements.map((e) => [e.name, e]));
        for (const s of o.steps) {
          const e = byName.get(s.rod);
          if (e) e.L = Math.round(s.to * 10) / 10;
        }
        for (const b of o.bends || []) {
          const e = byName.get(b.rod);
          if (e) e.bend = Object.assign({}, e.bend, { topF: ((e.bend && e.bend.topF) || 0) + b.add, botF: ((e.bend && e.bend.botF) || 0) + b.add });
        }
        if (!o.bends) tune().measured = {};
        A.commit();
        A.designChanged(true);
        renderParts();
        scheduleFit();
        A.toast(o.bends ? "The design now has these bends. Undo takes them out." : "The design now has these lengths. Undo brings the old ones back.");
      };
    });
  }

  /* ---------- wiring ---------- */
  function setMode(m) {
    T.mode = m;
    $("#tune-chart").style.touchAction = m === "draw" ? "none" : "pan-y";      // drawing takes the whole gesture
    $$("#tune-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
    $("#type-card").hidden = m !== "type";
    $("#file-card").hidden = m !== "file";
    $("#mode-hint").textContent = m === "draw" ? "Drag across the chart to draw what you see on your VNA. Drawing over a part replaces it." : "";
    $("#tune-chart").style.cursor = m === "draw" ? "crosshair" : "default";
    drawChart();
  }

  function bindForm() {
    const c = () => S.design.cable;
    A.bindNum($("#tune-target"), { get: () => targetF(), min: 1, decimals: 3, set: (v, commit) => { tune().target = v; if (commit) A.commit(); drawChart(); scheduleFit(); } });
    A.bindNum($("#draw-lo"), { get: () => readingsRange()[0], min: 1, decimals: 1, set: (v, commit) => { if (v < tune().range[1]) { tune().range[0] = v; if (commit) A.commit(); drawChart(); } } });
    A.bindNum($("#draw-hi"), { get: () => readingsRange()[1], min: 1, decimals: 1, set: (v, commit) => { if (v > tune().range[0]) { tune().range[1] = v; if (commit) A.commit(); drawChart(); } } });
    $("#cable-on").onchange = (e) => { c().on = e.target.checked; $("#cable-fields").hidden = !e.target.checked; A.commit(); scheduleFit(); };
    $("#cable-kind").innerHTML = Object.entries(YS.CABLES).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("");
    $("#cable-kind").onchange = (e) => { const q = YS.CABLES[e.target.value]; Object.assign(c(), { kind: e.target.value, vf: q.vf, lossAt1G: q.lossAt1G }); A.commit(); scheduleFit(); };
    A.bindNum($("#cable-len"), { get: () => c().length, min: 0, max: 100000, decimals: 0, set: (v, commit) => { c().length = v; if (commit) A.commit(); scheduleFit(); } });
    $("#short-go").onclick = () => {
      const r = parseFloat($("#short-r").value), x = parseFloat($("#short-x").value);
      if (!isFinite(r) || !isFinite(x)) { $("#short-out").textContent = "Enter both R and X first."; return; }
      const out = YS.cableFromShort([r, x], targetF(), c().vf, c().length, S.design.z0);
      const lossDb = -10 * Math.log10(Math.max(out.magnitude * out.magnitude, 1e-6)) / 2;
      c().length = Math.round(out.length);
      $("#cable-len")._refresh();
      A.commit();
      scheduleFit();
      $("#short-out").textContent = `About ${out.length.toFixed(0)} mm of cable (each ${out.step.toFixed(0)} mm looks the same, so keep your rough length close), with ${lossDb.toFixed(2)} dB loss each way.`;
    };
    $("#parts-reset").onclick = () => { tune().measured = {}; A.commit(); renderParts(); scheduleFit(); };
    $$("#tune-mode button").forEach((b) => { b.onclick = () => setMode(b.dataset.m); });
    $("#readings-text").addEventListener("input", (e) => {
      const { out, bad } = textToReadings(e.target.value);
      $("#readings-err").textContent = bad ? `${bad} line${bad > 1 ? "s" : ""} couldn't be read. Each needs MHz then SWR (1 or higher), or MHz, R and X.` : "";
      setReadings(out, true);
    });
    $("#readings-clear").onclick = () => { setReadings([]); };
    $("#readings-sample").onclick = () => {
      if (S.design.name.indexOf("DuvYagi") < 0) A.loadDesign(YS.PRESETS.duvyagi());
      const t = tune();
      t.range = [850, 950];
      t.target = 910.525;
      t.readings = YS.DUV_SWEEP.map((p) => Object.assign({}, p));
      t.sample = true;
      A.commit();
      A.views.tune.show();
      scheduleFit();
    };
    const loadSweep = (text, name) => {
      try {
        const { points } = YS.parseTouchstone(text);
        const fa = points[0].f, fb = points[points.length - 1].f, t = tune();
        t.range = [Math.floor(fa), Math.ceil(fb)];
        setReadings(points.map((p) => ({ f: p.f, g: p.g })));
        setMode("file");
        const spanWarn = !(fa < targetF() && fb > targetF()) ? ` This sweep doesn't include your ${fmt(targetF(), 3)} MHz target, so sweep a wider range.` : "";
        $("#vna-note").textContent = `Loaded ${points.length} points from ${name}, ${fmt(fa, 1)} to ${fmt(fb, 1)} MHz.${spanWarn}`;
        drawChart();
      } catch (e) { $("#vna-note").textContent = e.message; setMode("file"); }
    };
    $("#load-s1p").onclick = () => A.pickFile(".s1p,.s2p,.txt", loadSweep);
    const chart = $("#tune-chart");
    chart.addEventListener("dragover", (e) => { e.preventDefault(); });
    chart.addEventListener("drop", (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => loadSweep(String(r.result), f.name);
      r.readAsText(f);
    });
    const canSerial = YS.NanoVNA.supported();
    $("#vna-connect").disabled = !canSerial;
    if (!canSerial) $("#vna-note").textContent = root.ysWeb && root.ysWeb.ios ? "iPhones and iPads can't reach a NanoVNA over USB. You can still save a .s1p from NanoVNA Saver or the NanoVNA's SD card, and load it here." : "Connecting directly needs Edge or Chrome, with this page opened from the file on your PC. You can still save a .s1p from NanoVNA Saver and load it here.";
    $("#vna-connect").onclick = async () => {
      try {
        vna = new YS.NanoVNA();
        await vna.connect();
        $("#vna-scan").disabled = false;
        $("#vna-note").textContent = "Connected. Readings use the NanoVNA's current calibration. This link hasn't been tried on real hardware yet, so check the first sweep against its screen.";
      } catch (e) {
        vna = null;
        $("#vna-note").textContent = "It didn't connect: " + e.message;
      }
    };
    $("#vna-scan").onclick = async () => {
      const b = $("#vna-scan");
      b.disabled = true;
      $("#vna-note").textContent = "Sweeping…";
      try {
        const r = readingsRange();
        const pts = await vna.scan(r[0], r[1], 101);
        if (!pts.length) throw new Error("no data came back");
        setReadings(pts.map((p) => ({ f: p.f, g: p.g })));
        $("#vna-note").textContent = `Read ${pts.length} points. Check they match the NanoVNA's own screen.`;
      } catch (e) {
        $("#vna-note").textContent = "The sweep failed: " + e.message;
      }
      b.disabled = false;
    };
    bindDrawing();
  }

  function syncForm() {
    const c = S.design.cable;
    $("#cable-on").checked = c.on;
    $("#cable-fields").hidden = !c.on;
    $("#cable-kind").value = c.kind;
    ["#tune-target", "#draw-lo", "#draw-hi", "#cable-len"].forEach((q) => { const i = $(q); if (i && i._refresh) i._refresh(); });
  }

  A.views.tune = {
    mount(host) {
      host.innerHTML = template();
      bindForm();
      const ro = new ResizeObserver(() => drawChart());
      ro.observe($("#tune-chart"));
    },
    show() {
      readingsRange();
      syncForm();
      renderParts();
      $("#readings-text").value = readingsToText();
      setMode(T.mode);
      countNote();
      renderDiag();
      renderPlan();
      drawChart();
      scheduleFit();
    },
    refreshDesign(full) { if (full) { renderParts(); syncForm(); } scheduleFit(); },
    refreshResults() {},
    retheme() { drawChart(); },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
