/*
 * Yagi Studio app, part 2: the Design view. The rod table, the true-scale drawing, the band sweep,
 * the readouts at the cursor, and the pattern and match views.
 */
(function (root) {
  "use strict";
  const YS = root.YS, A = YS.app, S = A.S;
  const { $, $$, esc, fmt } = A;

  const METALS = { aluminium: "Alum.", brass: "Brass", copper: "Copper", steel: "Steel", perfect: "Ideal" };
  let layout = null, view3d = null, inited = false;

  function template() {
    return `
    <div class="view view-design" id="view-design">
      <div class="col">
        <section class="card" aria-label="Frequency">
          <div class="head"><h2>Frequency</h2></div>
          <div class="body stack">
            <div id="radio-card" class="stack"></div>
            <div class="field-grid three">
            <div class="field"><label for="f0">Target, MHz</label><input class="num" id="f0" inputmode="decimal"></div>
            <div class="field"><label for="band-lo">Band from</label><input class="num" id="band-lo" inputmode="decimal"></div>
            <div class="field"><label for="band-hi">to</label><input class="num" id="band-hi" inputmode="decimal"></div>
            </div>
          </div>
        </section>
        ${A.gainCard("design")}
        <section class="card" aria-label="Rods">
          <div class="head"><h2>Rods, mm</h2><span class="note">Drag in the drawing, or type. 1/8 in works too.</span></div>
          <div class="body">
            <div class="scroll-x"><table class="rods fixed" id="rods"></table></div>
            <div class="row" style="margin-top:8px">
              <button class="btn small" id="add-dir">Add director</button>
              <span class="note" id="boom-note"></span>
            </div>
          </div>
        </section>
        <section class="card" aria-label="Bent or off-center rods">
          <div class="head"><h2>Bent or off-center rods ${A.help("bends")}</h2></div>
          <div class="body stack">
            <details id="bend-more"><summary>Enter how far each tip is from straight, in mm</summary>
              <p class="note" style="margin:6px 0">Forward is away from the reflector. Side is either way, as long as you keep to it. Off center is how far the whole rod sits to one side.</p>
              <div class="scroll-x"><table class="rods fixed" id="bends"></table></div>
              <div class="row" style="margin-top:8px;align-items:flex-end">
                <div class="field"><label for="bend-face">Straight to, mm from center</label><input class="num" id="bend-face" inputmode="decimal" style="max-width:90px"></div>
                <button class="btn small" id="bend-clear">Straighten them all</button>
              </div>
            </details>
            <p class="note" id="bend-note"></p>
          </div>
        </section>
        <section class="card" aria-label="Model settings">
          <div class="head"><h2>Model</h2></div>
          <div class="body stack">
            <div class="field-grid">
              <div class="field"><label for="quality">Accuracy ${A.help("quality")}</label>
                <select class="sel" id="quality"><option value="draft">Draft</option><option value="normal">Normal</option><option value="fine">Fine</option><option value="reference">Reference</option></select></div>
              <div class="field"><label for="pol">Rods run</label>
                <select class="sel" id="pol"><option value="vertical">Vertically</option><option value="horizontal">Horizontally</option></select></div>
              <div class="field"><label for="gap">Feed gap, mm ${A.help("gap")}</label><input class="num" id="gap" inputmode="decimal"></div>
              <div class="field"><label for="z0">Cable impedance</label><input class="num" id="z0" inputmode="decimal"></div>
            </div>
            <label class="check"><input type="checkbox" id="gap-rods" checked> Changing the gap moves the rods, which keep their length ${A.help("gapRods")}</label>
            <label class="check"><input type="checkbox" id="wire-on"> Count the wire across the gap ${A.help("wire")}</label>
            <div class="field-grid" id="wire-fields">
              <div class="field"><label for="wire-d">Wire across it, mm</label><input class="num" id="wire-d" inputmode="decimal"></div>
              <div class="field"><label>Adds at the target</label><div class="note" id="wire-note" style="padding-top:6px"></div></div>
            </div>
            <p class="note">Folded dipoles aren't offered. ${A.help("folded")}</p>
            <label class="check"><input type="checkbox" id="endcap"> Solid rods with flat ends ${A.help("endcap")}</label>
            <label class="check"><input type="checkbox" id="mast-on"> Metal mast behind the antenna ${A.help("mast")}</label>
            <div class="field-grid three" id="mast-fields">
              <div class="field"><label for="mast-d">Diameter</label><input class="num" id="mast-d" inputmode="decimal"></div>
              <div class="field"><label for="mast-b">Behind</label><input class="num" id="mast-b" inputmode="decimal"></div>
              <div class="field"><label for="mast-l">Length</label><input class="num" id="mast-l" inputmode="decimal"></div>
            </div>
            <label class="check"><input type="checkbox" id="ground-on"> Show the pattern over ground ${A.help("ground")}</label>
            <div class="field-grid" id="ground-fields">
              <div class="field"><label for="ground-h">Height, m</label><input class="num" id="ground-h" inputmode="decimal"></div>
              <div class="field"><label for="ground-k">Ground</label><select class="sel" id="ground-k"></select></div>
            </div>
          </div>
        </section>
        <p class="note" id="design-notes" style="padding:0 2px"></p>
      </div>

      <div class="col mid">
        <div class="insight" id="insight" role="status"></div>
        <section class="card grow tall-sm" style="flex:0.75 1 0" aria-label="Antenna drawing">
          <div class="canvas-box"><canvas id="layout" aria-label="Side view of the antenna to scale. Drag rods to move them and tips to change their lengths."></canvas></div>
        </section>
        <section class="card grow tall-md" style="flex:1.25 1 0" aria-label="Band sweep">
          <div class="head">
            <div class="legend" id="sweep-legend"></div>
            <div class="row">
              <span class="note">Sweep</span>
              <input class="num" id="range-lo" style="width:68px" aria-label="Sweep from, MHz" inputmode="decimal">
              <input class="num" id="range-hi" style="width:68px" aria-label="Sweep to, MHz" inputmode="decimal">
              <button class="btn small" id="range-fit" title="Fit the sweep to the band">Fit</button>
              <button class="btn small" id="pin">Pin</button>
              <button class="btn small" id="nec-check" hidden>Check with nec2++</button>
              <button class="btn small" id="table-toggle">Table</button>
            </div>
          </div>
          <div class="canvas-box" id="sweep-box" style="margin:4px 4px 4px 4px"><canvas id="sweep" aria-label="SWR, gain and front-to-back across the sweep. Click or drag to place the cursor."></canvas></div>
          <div class="scroll-x" id="sweep-table" hidden style="max-height:220px;overflow-y:auto"></div>
        </section>
      </div>

      <div class="col">
        <section class="card" aria-label="Readings at the cursor">
          <div class="head">
            <h2>At</h2>
            <div class="row"><input class="num" id="cursor-f" style="width:92px" aria-label="Cursor frequency, MHz" inputmode="decimal"><span class="note">MHz</span>
            <button class="btn small" id="to-target">Target</button><button class="btn small" id="to-valley">Valley</button></div>
          </div>
          <div class="kpis" id="kpis" style="margin-top:8px"></div>
        </section>
        <section class="card" aria-label="Pattern" style="display:flex;flex-direction:column">
          <div class="head"><h2>Pattern</h2>
            <div class="seg" role="group" aria-label="Pattern view" id="pattern-seg">
              <button data-mode="3d">3D</button><button data-mode="polar">Cuts</button><button data-mode="ground" id="ground-tab">Over ground</button>
            </div>
          </div>
          <div class="body">
            <div id="pattern-3d" style="position:relative;height:270px">
              <canvas id="gl" style="position:absolute;inset:0;width:100%;height:100%;touch-action:none" aria-label="3D radiation pattern. Drag to turn, scroll to zoom."></canvas>
              <div class="note" style="position:absolute;left:2px;bottom:0;pointer-events:none" id="gl-note"></div>
            </div>
            <div id="pattern-polar" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;height:210px" hidden>
              <div style="position:relative"><canvas id="polar-h" style="position:absolute;inset:0;width:100%;height:100%"></canvas></div>
              <div style="position:relative"><canvas id="polar-e" style="position:absolute;inset:0;width:100%;height:100%"></canvas></div>
            </div>
            <div id="pattern-ground" hidden>
              <div style="position:relative;height:210px"><canvas id="polar-g" style="position:absolute;inset:0;width:100%;height:100%"></canvas></div>
              <p class="note" id="ground-note"></p>
            </div>
          </div>
        </section>
        <section class="card" aria-label="Smith chart">
          <div class="head"><h2>Match ${A.help("z")}</h2><div class="legend" id="smith-legend"></div></div>
          <div class="body"><div style="position:relative;height:250px"><canvas id="smith" style="position:absolute;inset:0;width:100%;height:100%" aria-label="Smith chart of the feed impedance across the sweep"></canvas></div>
          <p class="note">Numbers on the center line are ohms. The dots mark the band's ends.</p></div>
        </section>
      </div>
    </div>`;
  }

  function colors() {
    const T = YS.tokens();
    return { rodLow: T.pin, rodHigh: T.s2, boom: T.axis, pin: T.pin, patHigh: T.s1, surface: T.panel };
  }

  function bindForm() {
    const d = () => S.design;
    const change = (commit) => { if (commit) A.commit(); A.designChanged(false); };
    A.bindNum($("#f0"), { get: () => d().f0, min: 1, max: 30000, decimals: 3, set: (v, c) => {
      // moving the target carries the band with it, so a new design stays sensible
      const old = d().f0, dl = v - old;
      d().band = [d().band[0] + dl, d().band[1] + dl];
      d().f0 = v;
      if (S.cursor === old) S.cursor = v;
      change(c);
      $("#band-lo")._refresh(); $("#band-hi")._refresh();
    } });
    A.bindNum($("#band-lo"), { get: () => d().band[0], min: 1, decimals: 3, set: (v, c) => { d().band[0] = v; change(c); } });
    A.bindNum($("#band-hi"), { get: () => d().band[1], min: 1, decimals: 3, set: (v, c) => { d().band[1] = v; change(c); } });
    A.bindNum($("#gap"), { get: () => d().gap, min: 0, max: 200, decimals: 2, set: (v, c) => {
      const driven = d().elements.find((e) => e.type === "driven");
      if (driven && $("#gap-rods").checked) driven.L = Math.round((driven.L + v - d().gap) * 1000) / 1000;
      d().gap = v;
      syncRodsValues();
      change(c);
    } });
    $("#wire-on").onchange = (e) => { d().feedWire = e.target.checked ? (S.lastWire || 0.3) : 0; A.commit(); syncWire(); change(false); };
    A.bindNum($("#wire-d"), { get: () => d().feedWire || S.lastWire || 0.3, min: 0.05, max: 10, decimals: 2, set: (v, c) => { S.lastWire = v; if (d().feedWire) d().feedWire = v; syncWire(); change(c); } });
    A.bindNum($("#bend-face"), { get: () => (d().boomFace === undefined ? 10 : d().boomFace), min: 0, max: 500, decimals: 1, set: (v, c) => { d().boomFace = v; change(c); } });
    $("#bend-clear").onclick = () => { d().elements.forEach((e) => { delete e.bend; }); A.commit(); renderBends(); change(false); };
    A.bindNum($("#z0"), { get: () => d().z0, min: 1, max: 1000, decimals: 1, set: (v, c) => { d().z0 = v; change(c); } });
    A.bindNum($("#mast-d"), { get: () => d().mast.d, min: 1, max: 500, set: (v, c) => { d().mast.d = v; change(c); } });
    A.bindNum($("#mast-b"), { get: () => d().mast.behind, min: 5, max: 5000, set: (v, c) => { d().mast.behind = v; change(c); } });
    A.bindNum($("#mast-l"), { get: () => d().mast.length, min: 50, max: 20000, decimals: 0, set: (v, c) => { d().mast.length = v; change(c); } });
    A.bindNum($("#ground-h"), { get: () => d().ground.height / 1000, min: 0.1, max: 500, decimals: 1, set: (v, c) => { d().ground.height = v * 1000; if (c) A.commit(); drawPattern(); } });
    $("#quality").value = S.quality;
    $("#quality").onchange = (e) => { S.quality = e.target.value; A.requestSolve("full"); };
    $("#pol").onchange = (e) => { d().polarization = e.target.value; A.commit(); A.designChanged(true); };
    $("#endcap").onchange = (e) => { d().endCap = e.target.checked; A.commit(); A.designChanged(false); };
    $("#mast-on").onchange = (e) => { d().mast.on = e.target.checked; $("#mast-fields").hidden = !e.target.checked; A.commit(); A.designChanged(false); };
    $("#ground-on").onchange = (e) => {
      d().ground.on = e.target.checked; $("#ground-fields").hidden = !e.target.checked; A.commit();
      if (e.target.checked) setPatternMode("ground"); else if (S.patternMode === "ground") setPatternMode("3d");
      syncPatternTabs();
    };
    $("#ground-k").innerHTML = Object.entries(A.GROUNDS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
    $("#ground-k").onchange = (e) => { d().ground.kind = e.target.value; A.commit(); drawPattern(); };
    $("#add-dir").onclick = () => {
      const els = d().elements.slice().sort((a, b) => a.x - b.x), last = els[els.length - 1], prev = els[els.length - 2];
      const gap = Math.max(last.x - prev.x, 0.1 * 299792.458 / d().f0);
      d().elements.push({ id: YS.newId(), type: "director", x: +(last.x + gap).toFixed(1), L: +(last.L * 0.985).toFixed(1), d: last.d, material: last.material });
      YS.renameElements(d().elements);
      A.commit();
      A.designChanged(true);
    };
    // the sweep's range and cursor
    A.bindNum($("#range-lo"), { get: () => S.range[0], min: 1, decimals: 2, set: (v, c) => { if (v < S.range[1]) { S.range[0] = v; S.rangeAuto = false; if (c) A.requestSolve("full"); } } });
    A.bindNum($("#range-hi"), { get: () => S.range[1], min: 1, decimals: 2, set: (v, c) => { if (v > S.range[0]) { S.range[1] = v; S.rangeAuto = false; if (c) A.requestSolve("full"); } } });
    $("#range-fit").onclick = () => { S.rangeAuto = true; A.autoRange(); $("#range-lo")._refresh(); $("#range-hi")._refresh(); A.requestSolve("full"); };
    A.bindNum($("#cursor-f"), { get: () => S.cursor, min: 1, decimals: 3, set: (v, c) => { S.cursor = v; drawSweep(); if (c) A.requestSolve("cursor"); } });
    $("#to-target").onclick = () => setCursor(d().f0);
    $("#to-valley").onclick = () => { if (S.rows) setCursor(+A.valleyOfRows(S.rows).f.toFixed(3)); };
    $("#pin").onclick = () => {
      if (S.pinned) { S.pinned = null; $("#pin").textContent = "Pin"; } else if (S.rows) { S.pinned = { name: d().name, rows: S.rows }; $("#pin").textContent = "Unpin"; A.toast("Pinned. Change the design to compare against it."); }
      drawSweep();
    };
    $("#table-toggle").onclick = () => { const t = $("#sweep-table"); t.hidden = !t.hidden; $("#table-toggle").textContent = t.hidden ? "Table" : "Chart only"; if (!t.hidden) fillTable(); drawSweep(); };
    $("#nec-check").onclick = runNec;
    $$("#pattern-seg button").forEach((b) => { b.onclick = () => setPatternMode(b.dataset.mode); });
    bindSweepPointer();
  }

  function setCursor(f) {
    S.cursor = f;
    const inp = $("#cursor-f");
    if (inp) inp._refresh();
    drawSweep();
    A.requestSolve("cursor");
  }

  function bindSweepPointer() {
    const c = $("#sweep");
    let dragging = false;
    const at = (e) => {
      const r = c.getBoundingClientRect();
      return c._invX ? c._invX(e.clientX - r.left) : null;
    };
    c.addEventListener("pointerdown", (e) => {
      const f = at(e);
      if (f === null) return;
      dragging = true; c.setPointerCapture(e.pointerId);
      setCursor(+Math.min(S.range[1], Math.max(S.range[0], f)).toFixed(3));
    });
    c.addEventListener("pointermove", (e) => {
      const f = at(e);
      if (f === null || !S.rows) return;
      const fx = Math.min(S.range[1], Math.max(S.range[0], f));
      if (dragging) setCursor(+fx.toFixed(3));
      const row = (k) => A.interp(S.rows, fx, k);
      const zr = S.rows.map((r) => ({ f: r.f, r: r.z[0], x: r.z[1] }));
      let html = `<b class="mono">${fx.toFixed(2)} MHz</b><br><span class="mono">SWR ${row("swr").toFixed(2)} · ${row("gainDbd").toFixed(2)} dBd · F/B ${row("fb").toFixed(1)} dB<br>${A.interp(zr, fx, "r").toFixed(1)} ${A.interp(zr, fx, "x") >= 0 ? "+" : "−"} j${Math.abs(A.interp(zr, fx, "x")).toFixed(1)} ohm</span>`;
      if (S.pinned) html += `<br><span class="mono">${esc(S.pinned.name)}: SWR ${A.interp(S.pinned.rows, fx, "swr").toFixed(2)} · ${A.interp(S.pinned.rows, fx, "gainDbd").toFixed(2)} dBd</span>`;
      A.showTip(html, e.clientX, e.clientY);
    });
    const up = () => { dragging = false; };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", () => A.hideTip());
  }

  /* ---------- the rod table ---------- */
  function renderRods() {
    const d = S.design, t = $("#rods");
    const sorted = d.elements.slice().sort((a, b) => a.x - b.x);
    t.innerHTML = `<colgroup><col style="width:58px"><col style="width:56px"><col style="width:56px"><col style="width:44px"><col style="width:60px"><col style="width:16px"></colgroup><thead><tr><th>Rod</th><th>From R</th><th>Length</th><th>Dia.</th><th>Metal</th><th></th></tr></thead><tbody>` + sorted.map((e, i) => `
      <tr data-id="${e.id}">
        <td class="rod-name">${esc(e.name)}</td>
        <td><input class="num" data-f="x" aria-label="${esc(e.name)} position" inputmode="decimal" ${i === 0 ? "disabled" : ""}></td>
        <td><input class="num" data-f="L" aria-label="${esc(e.name)} length" inputmode="decimal"></td>
        <td><input class="num" data-f="d" aria-label="${esc(e.name)} diameter" inputmode="decimal"></td>
        <td><select class="sel" data-f="m" aria-label="${esc(e.name)} metal" style="min-height:26px;padding:1px 2px;font-size:12px">${Object.entries(METALS).map(([k, v]) => `<option value="${k}"${(e.material || d.material) === k ? " selected" : ""}>${v}</option>`).join("")}</select></td>
        <td>${e.type === "director" ? `<button class="x" aria-label="Remove ${esc(e.name)}" data-rm>×</button>` : ""}</td>
      </tr>`).join("") + "</tbody>";
    $$("tr[data-id]", t).forEach((tr) => {
      const e = d.elements.find((q) => q.id === tr.dataset.id);
      const live = (c) => { if (c) A.commit(); A.designChanged(false); drawLayout(); };
      A.bindNum($('[data-f="x"]', tr), { get: () => e.x, min: 0, decimals: 2, set: (v, c) => { e.x = v; if (c) { d.elements.sort((p, q) => p.x - q.x); YS.renameElements(d.elements); A.commit(); A.designChanged(true); } else live(false); } });
      A.bindNum($('[data-f="L"]', tr), { get: () => e.L, min: 1, decimals: 2, set: (v, c) => { e.L = v; live(c); } });
      A.bindNum($('[data-f="d"]', tr), { get: () => e.d, min: 0.05, max: 200, decimals: 3, set: (v, c) => { e.d = v; live(c); } });
      $('[data-f="m"]', tr).onchange = (ev) => { e.material = ev.target.value; A.commit(); A.designChanged(false); };
      const rm = $("[data-rm]", tr);
      if (rm) rm.onclick = () => { d.elements = d.elements.filter((q) => q !== e); YS.renameElements(d.elements); A.commit(); A.designChanged(true); };
      tr.addEventListener("pointerenter", () => { if (layout) layout.setHot(e.id); tr.classList.add("hot"); });
      tr.addEventListener("pointerleave", () => { if (layout) layout.setHot(null); tr.classList.remove("hot"); });
    });
    boomNote();
  }
  function boomNote() {
    const b = YS.boomLength(S.design), n = $("#boom-note"), lam = 299792.458 / S.design.f0;
    if (n) n.textContent = `Boom ${b.toFixed(1)} mm · ${(b / lam).toFixed(2)} wavelengths`;
  }

  /** What the wire across the gap adds at the target. */
  function syncWire() {
    const d = S.design, on = d.feedWire > 0, driven = d.elements.find((e) => e.type === "driven");
    $("#wire-on").checked = on;
    $("#wire-fields").hidden = !on;
    const x = driven ? YS.feedWireX(d, driven.d / 2) * d.f0 : 0;
    $("#wire-note").textContent = on ? `+${x.toFixed(1)} ohm in series` : "";
  }

  /** A row for each rod: off center, then each tip, along the boom and across it. */
  const BEND_KEYS = [["shift", "Off center"], ["topF", "Top, forward"], ["topS", "Top, side"], ["botF", "Bottom, forward"], ["botS", "Bottom, side"]];
  function renderBends() {
    const d = S.design, t = $("#bends");
    const sorted = d.elements.slice().sort((a, b) => a.x - b.x);
    t.innerHTML = `<thead><tr><th>Rod</th>${BEND_KEYS.map(([, h]) => `<th style="white-space:normal;line-height:1.15;vertical-align:bottom">${h.replace(", ", "<br>").replace("forward", "fwd")}</th>`).join("")}</tr></thead><tbody>${sorted.map((e) => `<tr><td class="rod-name">${esc(e.name)}</td>${BEND_KEYS.map(([k, h]) => `<td><input class="num" data-rod="${e.id}" data-k="${k}" inputmode="text" aria-label="${esc(e.name)}: ${h}"></td>`).join("")}</tr>`).join("")}</tbody>`;
    $$("input", t).forEach((i) => {
      const id = i.dataset.rod, k = i.dataset.k, rod = () => S.design.elements.find((q) => q.id === id);
      A.bindNum(i, { get: () => { const e = rod(); return e && e.bend && e.bend[k] ? e.bend[k] : 0; }, min: -500, max: 500, decimals: 1,
        parse: (s) => (s.trim() === "" ? 0 : Number(s)),
        set: (v, c) => {
          const e = rod();
          if (!e) return;
          const b = Object.assign({}, e.bend);
          if (v) b[k] = v; else delete b[k];
          if (Object.keys(b).length) e.bend = b; else delete e.bend;
          bendNote();
          drawLayout();
          if (c) A.commit();
          A.designChanged(false);
        } });
    });
    bendNote();
  }
  function bendNote() {
    const d = S.design, n = $("#bend-note");
    if (!n) return;
    const any = YS.isCrooked(YS.toSolver(d));
    if (any) $("#bend-more").open = true;
    n.innerHTML = any
      ? `<span class="pill warn">Rods not straight</span> Using the general solver, which takes longer. Optimize treats rods as straight, and the NEC and YagiCAD files do too.`
      : "All straight and centered. Tune my antenna can suggest bends, and Build check can add random ones.";
  }

  function syncForm() {
    const d = S.design;
    ["#f0", "#band-lo", "#band-hi", "#gap", "#z0", "#mast-d", "#mast-b", "#mast-l", "#ground-h", "#range-lo", "#range-hi", "#cursor-f"].forEach((q) => { const i = $(q); if (i && i._refresh && document.activeElement !== i) i._refresh(); });
    $("#pol").value = d.polarization;
    $("#endcap").checked = d.endCap !== false;
    $("#mast-on").checked = d.mast.on;
    $("#mast-fields").hidden = !d.mast.on;
    $("#ground-on").checked = d.ground.on;
    $("#ground-fields").hidden = !d.ground.on;
    $("#ground-k").value = d.ground.kind;
    $("#design-notes").textContent = d.notes || "";
    syncPatternTabs();
    A.radio.renderCard();
    syncWire();
    renderBends();
  }

  function syncRodsValues() {
    $$("#rods input.num").forEach((i) => { if (i._refresh && document.activeElement !== i) i._refresh(); });
    boomNote();
  }

  /* ---------- drawing ---------- */
  function drawLayout() {
    if (layout) layout.set(S.design, S.detail && S.detail.metrics);
  }

  function drawSweep() {
    if (!S.rows || !$("#sweep")) return;
    const T = YS.tokens(), rows = S.rows, d = S.design;
    const series = (key, color, src, name, width) => ({ name, color, width, pts: src.map((r) => [r.f, r[key]]) });
    const pinned = (key) => (S.pinned ? [series(key, T.pin, S.pinned.rows, S.pinned.name)] : []);
    const nec = (key) => (S.nec ? [series(key, T.s3, S.nec, "nec2++")] : []);
    const v = A.valleyOfRows(rows);
    const maxSwr = Math.min(5, Math.max(3, 1.1 * Math.min(5, Math.max.apply(null, rows.map((r) => Math.min(r.swr, 5))))));
    YS.drawSweep($("#sweep"), {
      xr: S.range, band: d.band, target: d.f0, targetLabel: "", cursor: S.cursor,
      rows: [
        { key: "swr", title: "SWR", yr: [1, maxSwr], ticks: maxSwr > 3.5 ? [1, 2, 3, 4, 5] : [1, 1.5, 2, 2.5, 3], note: `valley ${v.f.toFixed(1)} MHz at ${v.swr.toFixed(2)}`, series: [...pinned("swr"), ...nec("swr"), series("swr", T.s1, rows, d.name)] },
        { key: "gain", title: "Gain, dBd", series: [...pinned("gainDbd"), ...nec("gainDbd"), series("gainDbd", T.s1, rows, d.name)], minPad: 0.2 },
        { key: "fb", title: "Front-to-back, dB", floor: 0, series: [...pinned("fb"), ...nec("fb"), series("fb", T.s1, rows, d.name)], minPad: 1 },
      ],
    });
    const items = [`<span><i style="background:${T.s1}"></i>${esc(d.name)}</span>`];
    if (S.pinned) items.push(`<span><i style="background:${T.pin}"></i>Pinned: ${esc(S.pinned.name)}</span>`);
    if (S.nec) items.push(`<span><i style="background:${T.s3}"></i>nec2++, 31 segments</span>`);
    $("#sweep-legend").innerHTML = items.join("");
    if (!$("#sweep-table").hidden) fillTable();
  }

  function fillTable() {
    if (!S.rows) return;
    const every = Math.max(1, Math.round(S.rows.length / 40));
    $("#sweep-table").innerHTML = `<table class="tbl"><thead><tr><th>MHz</th><th>SWR</th><th>Gain, dBd</th><th>F/B, dB</th><th>R, ohm</th><th>X, ohm</th></tr></thead><tbody>` +
      S.rows.filter((_, i) => i % every === 0).map((r) => `<tr><td style="font-family:var(--mono)">${r.f.toFixed(2)}</td><td>${fmt(r.swr, 2)}</td><td>${fmt(r.gainDbd, 2)}</td><td>${fmt(r.fb, 1)}</td><td>${fmt(r.z[0], 1)}</td><td>${fmt(r.z[1], 1)}</td></tr>`).join("") + "</tbody></table>";
  }

  function kpi(key, label, value, unit, sub, help) {
    return `<div class="kpi" data-k="${key}"><div class="k">${label} ${help ? A.help(help) : ""}</div><div class="v">${value}${unit ? `<small>${unit}</small>` : ""}</div><div class="sub">${sub || "&nbsp;"}</div></div>`;
  }

  function drawKpis() {
    if (!S.detail) return;
    const m = S.detail.metrics, [cls, word] = A.swrClass(m.swr);
    const signX = m.z[1] >= 0 ? "+" : "−";
    const rl = -20 * Math.log10(Math.abs((m.swr - 1) / (m.swr + 1)) || 1e-6);
    const lossMis = -10 * Math.log10(1 - Math.pow((m.swr - 1) / (m.swr + 1), 2));
    const lossOhm = -10 * Math.log10(Math.max(m.efficiency, 1e-6));
    $("#kpis").innerHTML =
      kpi("swr", "SWR", fmt(m.swr, 2), "", `<span class="pill ${cls}">${word}</span> · ${fmt(lossMis, 2)} dB lost`, "swr") +
      kpi("gain", "Gain", fmt(m.gainDbd, 2), "dBd", `${fmt(m.gainDbi, 2)} dBi`, "gain") +
      kpi("fb", "Front-to-back", fmt(m.fb, 1), "dB", `Front-to-rear ${fmt(m.fr, 1)} dB ${A.help("fr")}`, "fb") +
      kpi("z", "Feed impedance", `${fmt(m.z[0], 1)} ${signX} j${fmt(Math.abs(m.z[1]), 1)}`, "Ω", `Return loss ${fmt(rl, 1)} dB`, "z") +
      kpi("bw", "Beamwidth", `${fmt(m.bwH, 0)}° × ${fmt(m.bwE, 0)}°`, "", S.design.polarization === "vertical" ? "Across × along the rods" : "Across × along the rods", "bw") +
      kpi("eff", "Efficiency", fmt(m.efficiency * 100, 1), "%", `${fmt(lossOhm, 2)} dB lost in the metal`, "eff");
  }

  function drawInsight() {
    if (!S.rows) return;
    const d = S.design, v = A.valleyOfRows(S.rows), at = A.interp(S.rows, d.f0, "swr"), [cls, word] = A.swrClass(at);
    const off = v.f - d.f0, win = A.swrWindow(S.rows, 1.5);
    const bandRows = S.rows.filter((r) => r.f >= d.band[0] && r.f <= d.band[1]);
    const worstG = bandRows.length ? Math.min.apply(null, bandRows.map((r) => r.gainDbd)) : NaN;
    const onTarget = Math.abs(off) < 0.003 * d.f0;
    let tip;
    if (onTarget) tip = v.swr > 1.25 ? "The valley is on target but shallow. The driven element sets its depth." : "The valley sits on your target.";
    else tip = `${off > 0 ? "Longer" : "Shorter"} directors move the valley ${off > 0 ? "down" : "up"}. The driven element barely moves it. ${A.help("valley")}`;
    $("#insight").innerHTML =
      `<span><b>${fmt(at, 2)}</b> SWR at ${fmt(d.f0, 3)} MHz <span class="pill ${cls}">${word}</span></span>` +
      `<span>Valley at <b>${fmt(v.f, 1)} MHz</b>${onTarget ? "" : `, ${fmt(Math.abs(off), 1)} MHz ${off > 0 ? "above" : "below"} target`}</span>` +
      (win ? `<span>SWR under 1.5 from ${fmt(win[0], 0)} to ${fmt(win[1], 0)} MHz</span>` : `<span>SWR never under 1.5 in this sweep</span>`) +
      (isFinite(worstG) ? `<span>${fmt(worstG, 2)} dBd or better across the band</span>` : "") +
      `<span class="tip">${tip}</span>`;
  }

  function drawSmith() {
    if (!S.rows || !$("#smith")) return;
    const T = YS.tokens(), d = S.design, z0 = d.z0;
    const gam = (r) => YS.gammaOf(r.z, z0);
    const traces = [];
    if (S.pinned) traces.push({ name: S.pinned.name, color: T.pin, pts: S.pinned.rows.map(gam) });
    if (S.nec) traces.push({ name: "nec2++", color: T.s3, pts: S.nec.map(gam) });
    const inBand = S.rows.filter((r) => r.f >= d.band[0] && r.f <= d.band[1]);
    traces.push({ name: d.name, color: T.s1, pts: S.rows.map(gam), marks: inBand.length ? [{ g: gam(inBand[0]) }, { g: gam(inBand[inBand.length - 1]) }] : [] });
    YS.drawSmith($("#smith"), traces, S.detail ? YS.gammaOf(S.detail.metrics.z, z0) : null);
  }

  function syncPatternTabs() {
    const on = S.design.ground.on;
    $("#ground-tab").hidden = !on;
    if (!on && S.patternMode === "ground") S.patternMode = "3d";
    $$("#pattern-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === S.patternMode)));
    $("#pattern-3d").hidden = S.patternMode !== "3d";
    $("#pattern-polar").hidden = S.patternMode !== "polar";
    $("#pattern-ground").hidden = S.patternMode !== "ground";
  }
  function setPatternMode(m) { S.patternMode = m; syncPatternTabs(); drawPattern(); }

  function drawPattern() {
    if (!S.detail) return;
    const T = YS.tokens(), m = S.detail.metrics, d = S.design;
    if (S.patternMode === "3d") {
      if (view3d && view3d.gl) {
        view3d.update(d, m, S.detail.pattern, colors());
        $("#gl-note").textContent = `Peak ${fmt(view3d.peak, 1)} dBi, 30 dB range. Orange rods carry the most current. Drag to turn.`;
      } else {
        $("#gl-note").textContent = "3D needs WebGL, which this browser has turned off. The Cuts view shows the same pattern.";
      }
    } else if (S.patternMode === "polar") {
      const v = d.polarization === "vertical";
      const ref = m.gainDbi;
      YS.drawPolar($("#polar-h"), { title: v ? "Azimuth, from above" : "Elevation, from the side", ref, series: [{ name: "H", color: T.s1, angles: m.cuts.angles, db: m.cuts.h }] });
      YS.drawPolar($("#polar-e"), { title: v ? "Elevation, from the side" : "Azimuth, from above", ref, series: [{ name: "E", color: T.s1, angles: m.cuts.angles, db: m.cuts.e }] });
    } else if (d.ground.on && m.fieldCuts) {
      const g = A.overGround(m, d);
      YS.drawPolar($("#polar-g"), { title: "Elevation over ground, dBi", half: true, ref: Math.ceil(g.peak), series: [{ name: "Over ground", color: T.s1, angles: g.angles, db: g.db }] });
      const el = g.takeoff > 90 ? 180 - g.takeoff : g.takeoff;
      $("#ground-note").textContent = `Peak ${fmt(g.peak, 1)} dBi at ${el}° above the horizon, at ${fmt(d.ground.height / 1000, 1)} m. Forward is to the right.`;
    }
  }

  function refreshAll() {
    A.radio.update();
    drawLayout(); drawSweep(); drawKpis(); drawInsight(); drawSmith(); drawPattern();
  }

  async function runNec() {
    const btn = $("#nec-check");
    btn.disabled = true;
    try {
      const fs = [];
      const n = 41;
      for (let i = 0; i < n; i++) fs.push(S.range[0] + (S.range[1] - S.range[0]) * i / (n - 1));
      const deck = YS.necDeck(S.design, { freqs: fs });
      const res = await fetch("/api/nec2", { method: "POST", body: deck });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      S.nec = j.rows.map((r) => ({ f: r.f, z: r.z, swr: YS.swrOf(r.z[0], r.z[1], S.design.z0), gainDbd: r.gain_dbd, fb: r.fb }));
      drawSweep(); drawSmith();
      A.toast("nec2++ added. On thick rods it is only as good as its segment count.");
    } catch (e) {
      A.toast("nec2++ didn't run: " + e.message);
    }
    btn.disabled = false;
  }

  A.views.design = {
    mount(host) {
      host.innerHTML = template();
      bindForm();
      layout = new YS.Layout2D($("#layout"), {
        onChange: (id, patch, final) => {
          const e = S.design.elements.find((q) => q.id === id);
          Object.assign(e, patch);
          if (final) A.commit();
          syncRodsValues();
          drawLayout();
          A.designChanged(false);
        },
        onHover: (id) => { $$("#rods tr").forEach((t) => t.classList.toggle("hot", t.dataset.id === id)); },
      });
      view3d = new YS.View3D($("#gl"));
      const ro = new ResizeObserver(() => { drawSweep(); drawSmith(); if (S.patternMode !== "3d") drawPattern(); });
      ro.observe($("#sweep-box"));
      ro.observe($("#smith"));
      $("#nec-check").hidden = !S.server;
      A.bindGainCard($("#view-design .gain-card"));
      inited = true;
    },
    show() { renderRods(); syncForm(); refreshAll(); A.renderGainCards(); },
    refreshDesign(full) { if (!inited) return; if (full) renderRods(); else syncRodsValues(); syncForm(); drawLayout(); A.renderGainCards(); },
    refreshResults() { refreshAll(); },
    retheme() { refreshAll(); },
    showNecButton() { const b = $("#nec-check"); if (b) b.hidden = !S.server; },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
