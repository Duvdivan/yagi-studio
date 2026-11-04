/*
 * Yagi Studio app, part 4: the Optimize, Build check and Cut list views.
 */
(function (root) {
  "use strict";
  const YS = root.YS, A = YS.app, S = A.S;
  const { $, $$, esc, fmt, mmToIn } = A;

  /* ==================== Optimize ==================== */
  const OPT = { running: false, cancel: false, goals: null, result: null, progress: null, explore: null, exploring: false, preview: null };
  const EFFORT = {
    quick: { gens: 150, patience: 40, polish: 200, label: "Quick" },
    thorough: { gens: 500, patience: 90, polish: 500, label: "Thorough" },
    deep: { gens: 1500, patience: 200, polish: 900, label: "Deep" },
  };

  function goals() {
    const d = S.design;
    if (OPT.goals && OPT.goals.forDesign === d.name && OPT.goals.bandWas !== d.f0 + ":" + d.band) {
      // the Design view moved the target or the band, so what's searched follows it
      const lam = 299792.458 / d.f0;
      Object.assign(OPT.goals, { band: d.band.slice(), bandWas: d.f0 + ":" + d.band, minGap: Math.round(0.05 * lam), boomFrom: Math.round(0.4 * lam), boomTo: Math.round(2 * lam) });
    }
    if (!OPT.goals || OPT.goals.forDesign !== d.name) {
      OPT.goals = { forDesign: d.name, band: d.band.slice(), bandWas: d.f0 + ":" + d.band, fbMin: 15, swrMax: 1.5, boomMax: Math.round(YS.boomLength(d)), limitBoom: true,
        favor: "gain", changeLengths: true, changeSpacing: true, minGap: Math.round(0.05 * 299792.458 / d.f0), range: "wide", effort: "thorough", locks: {},
        rodsFrom: 4, rodsTo: 8, boomFrom: Math.round(0.4 * 299792.458 / d.f0), boomTo: Math.round(2 * 299792.458 / d.f0), boomSteps: 6 };
    }
    return OPT.goals;
  }

  function optTemplate() {
    return `
    <div class="view view-three" id="view-optimize">
      <div class="col">
        ${A.gainCard("opt")}
        <section class="card" aria-label="Goals">
          <div class="head"><h2>What you want</h2></div>
          <div class="body stack">
            <p class="note" id="g-note"></p>
            <div class="field"><label for="g-favor">Make the best of ${A.help("favor")}</label><select class="sel" id="g-favor"><option value="gain">Highest gain</option><option value="swr">Lowest SWR</option><option value="fb">Highest F/B</option><option value="both">Both SWR and F/B</option></select></div>
            <div class="field-grid">
              <div class="field"><label for="g-lo">Band from, MHz</label><input class="num" id="g-lo" inputmode="decimal"></div>
              <div class="field"><label for="g-hi">to, MHz</label><input class="num" id="g-hi" inputmode="decimal"></div>
              <div class="field"><label for="g-swr">SWR under ${A.help("swr")}</label><input class="num" id="g-swr" inputmode="decimal"></div>
              <div class="field"><label for="g-fb">F/B over, dB ${A.help("fb")}</label><input class="num" id="g-fb" inputmode="decimal"></div>
              <div class="field"><label for="g-boom">Longest boom, mm</label><input class="num" id="g-boom" inputmode="decimal"></div>
              <div class="field"><label for="g-gap">Closest rods, mm</label><input class="num" id="g-gap" inputmode="decimal"></div>
            </div>
            <div class="field-grid">
              <div class="field"><label for="g-range">Search</label><select class="sel" id="g-range"><option value="wide">Anywhere sensible</option><option value="near">Close to this design</option></select></div>
              <div class="field"><label for="g-effort">Effort</label><select class="sel" id="g-effort"><option value="quick">Quick</option><option value="thorough">Thorough</option><option value="deep">Deep</option></select></div>
            </div>
            <label class="check"><input type="checkbox" id="g-len"> It may change rod lengths</label>
            <label class="check"><input type="checkbox" id="g-spc"> It may change spacing</label>
            <details><summary>Hold particular rods</summary><div class="scroll-x" style="margin-top:6px"><table class="rods" id="g-locks"></table></div></details>
            <div class="row">
              <button class="btn primary" id="opt-run">Optimize</button>
              <button class="btn" id="opt-stop" disabled>Stop</button>
            </div>
            <div class="progress"><i id="opt-bar"></i></div>
            <p class="note" id="opt-status"></p>
          </div>
        </section>
        <section class="card" aria-label="Boom explorer">
          <div class="head"><h2>Which boom?</h2></div>
          <div class="body stack">
            <p class="note">Finds the best gain each mix of rods and boom can hold over the band, so you can see what a longer boom buys. Uses the first director's diameter.</p>
            <div class="field-grid">
              <div class="field"><label for="x-rods-a">Rods from</label><input class="num" id="x-rods-a" inputmode="numeric"></div>
              <div class="field"><label for="x-rods-b">to (up to 5 more)</label><input class="num" id="x-rods-b" inputmode="numeric"></div>
              <div class="field"><label for="x-boom-a">Boom from, mm</label><input class="num" id="x-boom-a" inputmode="numeric"></div>
              <div class="field"><label for="x-boom-b">to, mm</label><input class="num" id="x-boom-b" inputmode="numeric"></div>
            </div>
            <div class="row"><button class="btn" id="x-run">Explore</button><button class="btn" id="x-stop" disabled>Stop</button></div>
            <div class="progress"><i id="x-bar"></i></div>
            <p class="note" id="x-status"></p>
          </div>
        </section>
      </div>
      <div class="col mid">
        <section class="card grow tall-sm" style="flex:0.8 1 0" aria-label="Optimizer progress">
          <div class="head"><h2>Progress</h2><span class="note" id="opt-speed"></span></div>
          <div class="canvas-box" style="margin:4px"><canvas id="opt-chart"></canvas></div>
        </section>
        <section class="card grow tall-sm" style="flex:0.8 1 0" aria-label="Best design so far">
          <div class="head"><h2>Best so far</h2></div>
          <div class="canvas-box" style="margin:4px"><canvas id="opt-layout"></canvas></div>
        </section>
        <section class="card grow tall-md" style="flex:1.1 1 0" aria-label="Boom explorer results">
          <div class="head"><h2>Worst gain across the band, by boom</h2><div class="legend" id="x-legend"></div></div>
          <div class="canvas-box" style="margin:4px"><canvas id="x-chart" aria-label="Gain against boom length, one line per rod count. Click a point to load that design."></canvas></div>
        </section>
      </div>
      <div class="col">
        <section class="card" aria-label="Result">
          <div class="head"><h2>Result</h2></div>
          <div class="body stack" id="opt-result"><p class="note">Run the optimizer to compare its best design with yours. Your design only changes when you choose.</p></div>
        </section>
      </div>
    </div>`;
  }

  function currentParts() {
    const d = S.design, g = goals();
    const rows = S.rows || [];
    const inBand = rows.filter((r) => r.f >= g.band[0] && r.f <= g.band[1]);
    if (!inBand.length) return null;
    return { worstGain: Math.min.apply(null, inBand.map((r) => r.gainDbd)), worstSwr: Math.max.apply(null, inBand.map((r) => r.swr)), minFb: Math.min.apply(null, inBand.map((r) => r.fb)), boom: YS.boomLength(d) };
  }

  function renderOptResult() {
    const host = $("#opt-result");
    if (!host) return;
    const R = OPT.result;
    if (!R) return;
    const c = currentParts();
    const n = R.design, boom = YS.boomLength(n);
    const cmp = (lab, a, b, dec, higherBetter) => {
      const cls = a === undefined || Math.abs(b - a) < Math.pow(10, -dec) ? "" : (b > a) === higherBetter ? "better" : "worse";
      return `<tr><td>${lab}</td><td>${a === undefined ? "–" : fmt(a, dec)}</td><td class="${cls}">${fmt(b, dec)}</td></tr>`;
    };
    host.innerHTML = `
      <div class="scroll-x"><table class="tbl"><thead><tr><th>Across the band</th><th>Yours</th><th>New</th></tr></thead><tbody>
        ${cmp("Worst gain, dBd", c && c.worstGain, R.parts.worstGain, 2, true)}
        ${cmp("Worst SWR", c && c.worstSwr, R.parts.worstSwr, 2, false)}
        ${cmp("Lowest F/B, dB", c && c.minFb, R.parts.minFb, 1, true)}
        ${cmp("Boom, mm", c && c.boom, boom, 1, false)}
      </tbody></table></div>
      <div class="scroll-x"><table class="tbl"><thead><tr><th>Rod</th><th>From R</th><th>Length</th></tr></thead><tbody>
        ${n.elements.map((e) => `<tr><td>${esc(e.name)}</td><td>${fmt(e.x, 1)}</td><td>${fmt(e.L, 1)}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="row">
        <button class="btn primary" id="opt-apply">Use this design</button>
        <button class="btn" id="opt-apply-pin">Use it and pin the old one</button>
      </div>
      <p class="note">${R.seconds ? `${R.evals.toLocaleString()} designs tried in ${fmt(R.seconds, 1)} s, then polished at higher accuracy.` : "From the boom explorer, which searches quickly. Use it, then run Optimize to polish it."} Lengths are rounded to 0.1 mm.</p>`;
    $("#opt-apply").onclick = () => applyResult(false);
    $("#opt-apply-pin").onclick = () => applyResult(true);
  }

  function applyResult(pin) {
    const d = OPT.result.design;
    if (pin && S.rows) S.pinned = { name: S.design.name + " (before)", rows: S.rows };
    d.tune = S.design.tune;
    S.design = JSON.parse(JSON.stringify(d));
    A.commit();
    A.go("design");
    A.designChanged(true);
    const b = $("#pin");
    if (b) b.textContent = S.pinned ? "Unpin" : "Pin";
    A.toast("Design updated. Undo brings the old one back.");
  }

  function drawOptChart() {
    const c = $("#opt-chart");
    if (!c) return;
    const T = YS.tokens();
    const h = OPT.progress ? OPT.progress.history : [];
    YS.drawLines(c, { yLabel: "Worst gain across the band, dBd", xLabel: "designs tried", empty: "The climb in gain shows here while it runs",
      series: h.length ? [{ name: "Best", color: T.s1, pts: h }] : [] });
  }

  function drawExplorer() {
    const c = $("#x-chart");
    if (!c) return;
    const T = YS.tokens();
    const res = OPT.explore || [];
    const seriesColors = [T.s1, T.s2, T.s3, T.pin, T.warn, T.bad];
    const rods = [...new Set(res.map((r) => r.rods))].sort((a, b) => a - b);
    const color = (n) => seriesColors[(n - goals().rodsFrom) % seriesColors.length];
    const series = rods.map((n) => ({ name: n + " rods", color: color(n), dots: true,
      pts: res.filter((r) => r.rods === n).sort((a, b) => a.boom - b.boom).map((r) => { const p = [r.boom, r.gain]; p.r = r; return p; }) }));
    YS.drawLines(c, { yLabel: "dBd", xLabel: "boom, mm", empty: "Run Explore to see what each boom can do", series });
    $("#x-legend").innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("");
  }

  function bindOptimize() {
    const g = goals();
    const set = (key, input, opt) => A.bindNum(input, Object.assign({ get: () => goals()[key], set: (v) => { goals()[key] = v; A.renderGainCards(); }, decimals: 1 }, opt));
    A.bindGainCard($("#view-optimize .gain-card"));
    A.bindNum($("#g-lo"), { get: () => goals().band[0], decimals: 3, min: 1, set: (v) => { goals().band[0] = v; A.renderGainCards(); } });
    A.bindNum($("#g-hi"), { get: () => goals().band[1], decimals: 3, min: 1, set: (v) => { goals().band[1] = v; A.renderGainCards(); } });
    set("swrMax", $("#g-swr"), { min: 1.01, max: 20, decimals: 2 });
    set("fbMin", $("#g-fb"), { min: 0, max: 60 });
    set("boomMax", $("#g-boom"), { min: 1, decimals: 0 });
    set("minGap", $("#g-gap"), { min: 1, decimals: 0 });
    set("rodsFrom", $("#x-rods-a"), { min: 3, max: 30, decimals: 0 });
    set("rodsTo", $("#x-rods-b"), { min: 3, max: 30, decimals: 0 });
    set("boomFrom", $("#x-boom-a"), { min: 1, decimals: 0 });
    set("boomTo", $("#x-boom-b"), { min: 1, decimals: 0 });
    $("#g-favor").onchange = (e) => { goals().favor = e.target.value; A.renderGainCards(); };
    $("#g-range").onchange = (e) => { goals().range = e.target.value; };
    $("#g-effort").onchange = (e) => { goals().effort = e.target.value; };
    $("#g-len").onchange = (e) => { goals().changeLengths = e.target.checked; };
    $("#g-spc").onchange = (e) => { goals().changeSpacing = e.target.checked; };
    $("#opt-run").onclick = runOptimize;
    $("#opt-stop").onclick = () => { OPT.cancel = true; };
    $("#x-run").onclick = runExplore;
    $("#x-stop").onclick = () => { OPT.cancel = true; };
    const xc = $("#x-chart");
    xc.addEventListener("pointermove", (e) => {
      const r = xc.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const hit = (xc._hits || []).find((h) => Math.hypot(h.x - px, h.y - py) < 12);
      xc.style.cursor = hit ? "pointer" : "default";
      if (hit) {
        const v = hit.p.r;
        A.showTip(`<b>${v.rods} rods, ${v.boom.toFixed(0)} mm boom</b><br><span class="mono">${v.gain.toFixed(2)} dBd worst · SWR ${v.swr.toFixed(2)} worst · F/B ${v.fb.toFixed(1)} dB lowest</span><br>Click to load it in the result panel.`, e.clientX, e.clientY);
      } else A.hideTip();
    });
    xc.addEventListener("pointerleave", () => A.hideTip());
    xc.addEventListener("click", (e) => {
      const r = xc.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const hit = (xc._hits || []).find((h) => Math.hypot(h.x - px, h.y - py) < 12);
      if (!hit) return;
      const v = hit.p.r;
      OPT.result = { design: v.design, parts: { worstGain: v.gain, worstSwr: v.swr, minFb: v.fb }, evals: v.evals || 0, seconds: 0 };
      renderOptResult();
      previewDesign(v.design);
    });
  }

  function syncOptimize() {
    const g = goals();
    ["#g-lo", "#g-hi", "#g-swr", "#g-fb", "#g-boom", "#g-gap", "#x-rods-a", "#x-rods-b", "#x-boom-a", "#x-boom-b"].forEach((q) => $(q)._refresh());
    $("#g-favor").value = g.favor; $("#g-range").value = g.range; $("#g-effort").value = g.effort; $("#g-len").checked = g.changeLengths; $("#g-spc").checked = g.changeSpacing;
    const sorted = S.design.elements.slice().sort((a, b) => a.x - b.x);
    $("#g-locks").innerHTML = `<thead><tr><th>Rod</th><th>Hold length</th><th>Hold gap to next</th></tr></thead><tbody>` + sorted.map((e, i) => {
      const l = g.locks[e.id] || {};
      return `<tr data-id="${e.id}"><td class="rod-name">${esc(e.name)}</td><td><input type="checkbox" data-k="L" aria-label="Hold ${esc(e.name)} length" ${l.L ? "checked" : ""}></td><td>${i + 1 < sorted.length ? `<input type="checkbox" data-k="x" aria-label="Hold the gap after ${esc(e.name)}" ${l.x ? "checked" : ""}>` : ""}</td></tr>`;
    }).join("") + "</tbody>";
    $$("#g-locks input").forEach((c) => {
      c.onchange = () => {
        const id = c.closest("tr").dataset.id;
        const l = g.locks[id] || (g.locks[id] = {});
        l[c.dataset.k] = c.checked;
      };
    });
  }

  let optLayout = null;
  function previewDesign(d) {
    if (optLayout) optLayout.set(d, null);
  }

  async function runOptimize() {
    if (OPT.running) return;
    const g = goals();
    OPT.running = true; OPT.cancel = false; OPT.result = null;
    $("#opt-run").disabled = true; $("#opt-stop").disabled = false; $("#x-run").disabled = true;
    A.renderGainCards();
    const started = performance.now();
    try {
      const effort = EFFORT[g.effort];
      const favoured = g.favor !== "gain";
      const res = await YS.optimise(A.pool, S.design, Object.assign({}, g, { boomMax: g.boomMax, gainMin: FIND.target + 0.02, gainMax: favoured ? FIND.gainTo : 0 }), effort, {
        cancelled: () => OPT.cancel,
        onProgress: (p) => {
          OPT.progress = p;
          $("#opt-bar").style.width = Math.min(100, 100 * p.gen / p.gens) + "%";
          const secs = (performance.now() - started) / 1000;
          $("#opt-status").textContent = p.polishing ? "Polishing the best design at higher accuracy…" : `Worst gain ${p.best.worstGain.toFixed(2)} dBd · worst SWR ${p.best.worstSwr.toFixed(2)} · lowest F/B ${p.best.minFb.toFixed(1)} dB`;
          $("#opt-speed").textContent = `${Math.round(p.evals / Math.max(secs, 0.01)).toLocaleString()} designs a second on ${A.pool.threads} threads`;
          drawOptChart();
          previewDesign(YS.applyToDesign(S.design, p.solver));
        },
      });
      res.seconds = (performance.now() - started) / 1000;
      OPT.result = res;
      previewDesign(res.design);
      $("#opt-bar").style.width = "100%";
      const short = favoured && res.parts.worstGain < FIND.target - 0.01 ? ` It couldn't hold ${fmt(FIND.target, 2)} dBd here, so its gain is what it could reach. A longer boom or another rod may help.` : "";
      $("#opt-status").textContent = (OPT.cancel ? "Stopped. This is the best it had found." : "Done.") + short;
      renderOptResult();
    } catch (e) {
      $("#opt-status").textContent = e.message;
    }
    OPT.running = false;
    $("#opt-run").disabled = false; $("#opt-stop").disabled = true; $("#x-run").disabled = false;
    A.renderGainCards();
  }

  async function runExplore() {
    if (OPT.running) return;
    const g = goals(), d = S.design;
    const firstDir = d.elements.find((e) => e.type === "director") || d.elements[0];
    const rods = [];
    for (let n = Math.round(g.rodsFrom); n <= Math.round(g.rodsTo) && rods.length < 6; n++) rods.push(n);
    const booms = [];
    const steps = g.boomSteps;
    for (let i = 0; i < steps; i++) booms.push(Math.round(g.boomFrom + (g.boomTo - g.boomFrom) * i / (steps - 1)));
    if (!rods.length || g.boomTo <= g.boomFrom) { $("#x-status").textContent = "Check the ranges: the second number should be larger than the first."; return; }
    OPT.running = true; OPT.cancel = false; OPT.explore = [];
    $("#x-run").disabled = true; $("#x-stop").disabled = false; $("#opt-run").disabled = true;
    A.renderGainCards();
    const started = performance.now();
    try {
      const res = await YS.exploreBooms(A.pool, { f0: d.f0, d: firstDir.d, material: firstDir.material || d.material, gap: d.gap },
        { band: g.band, fbMin: g.fbMin, swrMax: g.swrMax, minGap: g.minGap, changeLengths: true, changeSpacing: true, seed: 7 },
        { rods, booms, gens: 90 }, {
          cancelled: () => OPT.cancel,
          onProgress: (p) => {
            OPT.explore = p.results.slice();
            $("#x-bar").style.width = 100 * p.done / p.total + "%";
            $("#x-status").textContent = `${p.done} of ${p.total} done, ${fmt((performance.now() - started) / 1000, 0)} s so far`;
            drawExplorer();
          },
        });
      OPT.explore = res;
      $("#x-status").textContent = `${res.length} designs in ${fmt((performance.now() - started) / 1000, 1)} s. Click a point to see it.`;
      drawExplorer();
    } catch (e) {
      $("#x-status").textContent = e.message;
    }
    OPT.running = false;
    $("#x-run").disabled = false; $("#x-stop").disabled = true; $("#opt-run").disabled = false;
    A.renderGainCards();
  }

  /* ==================== The gain you want: a card in both the Design and Optimize views ==================== */
  const FIND = { target: 10, gainTo: 0, boomTop: 0, rod: null, rodFor: "", running: false, rows: null, best: null, tooHigh: 0, key: "", status: "", bar: 0 };

  const firstDirector = () => S.design.elements.find((e) => e.type === "director") || S.design.elements[0];
  const rodSize = () => (FIND.rod && FIND.rodFor === S.design.name ? FIND.rod : firstDirector().d);
  const metalName = (m) => ({ aluminium: "aluminum" }[m] || m);
  /* What an answer depends on: when this changes, the answers on show are out of date. */
  const findKey = () => { const g = goals(); return [S.design.f0, g.band, g.swrMax, g.fbMin, g.minGap, FIND.target, FIND.gainTo, g.favor, g.favor === "gain" ? 0 : FIND.boomTop, rodSize(), firstDirector().material].join(); };
  /* An optional number: blank means no limit, and is stored as 0. */
  const optionalNum = (get, set) => ({ get: () => get() || NaN, set, min: 0, parse: (s) => (s.trim() === "" ? 0 : A.parseLen(s)) });

  A.gainCard = (at) => `
    <section class="card gain-card" aria-label="The gain you want">
      <div class="head"><h2>The gain you want ${A.help("gain")}</h2></div>
      <div class="body stack">
        <div class="field-grid">
          <div class="field"><label for="${at}-gf-target">Gain, dBd</label><input class="num" id="${at}-gf-target" data-gf="target" inputmode="decimal"></div>
          <div class="field"><label for="${at}-gf-to">up to, if it matters</label><input class="num" id="${at}-gf-to" data-gf="to" inputmode="decimal" placeholder="any"></div>
          <div class="field"><label for="${at}-gf-rod">Rod diameter, mm</label><input class="num" id="${at}-gf-rod" data-gf="rod" inputmode="decimal"></div>
          <div class="field"><label for="${at}-gf-favor">Make the best of ${A.help("favor")}</label><select class="sel" id="${at}-gf-favor" data-gf="favor"><option value="gain">Shortest boom</option><option value="swr">Lowest SWR</option><option value="fb">Highest F/B</option><option value="both">Both SWR and F/B</option></select></div>
          ${at === "design" ? `<div class="field"><label for="${at}-gf-swr">SWR under ${A.help("swr")}</label><input class="num" id="${at}-gf-swr" data-gf="swr" inputmode="decimal"></div>
          <div class="field"><label for="${at}-gf-fb">F/B over, dB ${A.help("fb")}</label><input class="num" id="${at}-gf-fb" data-gf="fb" inputmode="decimal"></div>` : ""}
          <div class="field" data-gf="topwrap"><label for="${at}-gf-top">Longest boom, mm</label><input class="num" id="${at}-gf-top" data-gf="top" inputmode="decimal" placeholder="any"></div>
        </div>
        <p class="note" data-gf="limits"></p>
        <div class="row"><button class="btn primary" data-gf="run">Find the boom</button><button class="btn" data-gf="stop" disabled>Stop</button></div>
        <div class="progress"><i data-gf="bar"></i></div>
        <p class="note" data-gf="status" role="status"></p>
        <div data-gf="out"></div>
      </div>
    </section>`;

  A.bindGainCard = (card) => {
    const q = (k) => card.querySelector(`[data-gf="${k}"]`);
    A.bindNum(q("target"), { get: () => FIND.target, min: 0.5, max: 30, decimals: 2, set: (v) => { FIND.target = v; A.renderGainCards(card); } });
    A.bindNum(q("rod"), { get: rodSize, min: 0.1, max: 100, decimals: 3, set: (v) => { FIND.rod = v; FIND.rodFor = S.design.name; A.renderGainCards(card); } });
    A.bindNum(q("to"), Object.assign(optionalNum(() => FIND.gainTo, (v) => { FIND.gainTo = v; A.renderGainCards(card); }), { decimals: 2 }));
    A.bindNum(q("top"), Object.assign(optionalNum(() => FIND.boomTop, (v) => { FIND.boomTop = v; A.renderGainCards(card); }), { decimals: 0 }));
    if (q("swr")) {
      A.bindNum(q("swr"), { get: () => goals().swrMax, min: 1.01, max: 20, decimals: 2, set: (v) => { goals().swrMax = v; A.renderGainCards(card); } });
      A.bindNum(q("fb"), { get: () => goals().fbMin, min: 0, max: 60, decimals: 1, set: (v) => { goals().fbMin = v; A.renderGainCards(card); } });
    }
    q("favor").onchange = (e) => { goals().favor = e.target.value; A.renderGainCards(); };
    q("run").onclick = runFind;
    q("stop").onclick = () => { OPT.cancel = true; };
    q("out").onclick = (e) => { const b = e.target.closest("[data-use]"); if (b) useFound(FIND.rows[+b.dataset.use]); };
    A.renderGainCards();
  };

  /* Both cards show the same search. `typing` is the card being typed in, whose fields are left alone. */
  A.renderGainCards = (typing) => {
    const g = goals(), R = FIND.rows && FIND.key === findKey() ? FIND : null;
    const note = $("#g-note");
    if (note) note.textContent = g.favor === "gain" ? "It raises the worst gain across the band, while holding the limits below. Gain may dip at first as it gets within your limits."
      : `It works on ${FAVOR_NAMES[g.favor]} while holding the gain in the card above, ${fmt(FIND.target, 2)} dBd or more, and the limits below.`;
    $$(".gain-card").forEach((card) => {
      const q = (k) => card.querySelector(`[data-gf="${k}"]`), onDesign = !!card.closest("#view-design");
      if (card !== typing) ["target", "to", "rod", "top", "swr", "fb"].forEach((k) => { if (q(k)) q(k)._refresh(); });
      q("favor").value = g.favor;
      q("topwrap").hidden = g.favor === "gain";
      q("limits").textContent = `Worst gain across ${fmt(g.band[0], 3)} to ${fmt(g.band[1], 3)} MHz, in ${metalName(firstDirector().material)} rods.${onDesign ? "" : ` With SWR under ${fmt(g.swrMax, 2)} and F/B over ${fmt(g.fbMin, 1)} dB, set below.`}`;
      q("run").disabled = OPT.running;
      q("stop").disabled = !FIND.running;
      q("bar").style.width = FIND.bar + "%";
      q("status").textContent = FIND.running || R ? FIND.status : "";
      q("out").innerHTML = R && R.rows.length ? `
        <div class="scroll-x"><table class="tbl gf-table"><thead><tr><th>Rods</th><th>Boom, mm</th><th>Worst dBd</th><th>SWR</th><th>F/B</th><th></th></tr></thead><tbody>
          ${R.rows.map((r, i) => `<tr><td>${r.rods}</td><td>${fmt(r.boom, 0)}</td><td>${fmt(r.gain, 2)}</td><td>${fmt(r.swr, 2)}</td><td>${fmt(r.fb, 1)}</td><td><button class="btn small" data-use="${i}" aria-label="Use ${r.rods} rods on ${fmt(r.boom, 0)} mm">Use</button></td></tr>`).join("")}
        </tbody></table></div>` : "";
    });
  };

  const FAVOR_NAMES = { swr: "the lowest SWR", fb: "the highest F/B", both: "the best SWR and F/B together" };

  function foundMessage() {
    const seconds = fmt((performance.now() - FIND.started) / 1000, 0);
    if (FIND.tooHigh) return `That's more than ${FIND.tooHigh} rods can reach, the most this searches. Try a lower gain.`;
    if (OPT.cancel && FIND.rows.length) return "Stopped. These are what it had found, and there may be shorter ones.";
    if (FIND.rows.length && goals().favor !== "gain") return `Done in ${seconds} s. Each row is ${FAVOR_NAMES[goals().favor]} it found for that many rods at this gain. This is a quick search, so Optimize can polish the one you use.`;
    if (FIND.rows.length > 1) return `Done in ${seconds} s. More rods shorten the boom. This is a quick search, so Optimize can polish the one you use.`;
    if (FIND.rows.length) return `Done in ${seconds} s. Another rod wouldn't shorten it. This is a quick search, so Optimize can polish it.`;
    const b = FIND.best;
    return (OPT.cancel ? "Stopped before reaching it." : "It didn't reach that under these limits.") + (b ? ` The most it found was ${fmt(b.gain, 2)} dBd, on ${b.rods} rods and ${fmt(b.boom, 0)} mm. Try a lower gain, a narrower band or looser limits.` : "");
  }

  async function runFind() {
    if (OPT.running) return;
    const g = goals(), d = S.design, rod = firstDirector();
    if (!(g.band[1] > g.band[0])) { FIND.status = "Check the band: its top should be above its bottom."; return A.renderGainCards(); }
    if (FIND.gainTo && FIND.gainTo <= FIND.target) { FIND.status = "Check the gain: the second number should be above the first."; FIND.key = findKey(); FIND.rows = []; return A.renderGainCards(); }
    const lock = (on) => ["#opt-run", "#x-run"].forEach((q) => { const b = $(q); if (b) b.disabled = on; });
    Object.assign(FIND, { running: true, rows: [], best: null, tooHigh: 0, bar: 0, key: findKey(), status: "Starting…", started: performance.now() });
    OPT.running = true; OPT.cancel = false;
    lock(true);
    A.renderGainCards();
    try {
      // the model's settings come along, so that the design found is the one you'll then see
      const settings = {};
      ["f0", "z0", "polarization", "endCap", "feedWire", "boomFace", "mast", "cable", "ground", "radio"].forEach((k) => { if (d[k] !== undefined) settings[k] = JSON.parse(JSON.stringify(d[k])); });
      const res = await YS.findForGain(A.pool, { f0: d.f0, d: rodSize(), material: rod.material || d.material, gap: d.gap, settings },
        { band: g.band.slice(), fbMin: g.fbMin, swrMax: g.swrMax, minGap: g.minGap, changeLengths: true, changeSpacing: true, seed: 7, favor: g.favor, gainMax: FIND.gainTo, boomTop: FIND.boomTop }, FIND.target, {
          cancelled: () => OPT.cancel,
          onProgress: (p) => {
            FIND.rows = p.rows.slice();
            FIND.bar = Math.min(92, 100 * p.tries / (p.tries + 6));
            FIND.status = `Tried ${p.last.rods} rods on ${fmt(p.last.boom, 0)} mm: ${fmt(p.last.gain, 2)} dBd. ${fmt((performance.now() - FIND.started) / 1000, 0)} s so far.`;
            A.renderGainCards();
          },
        });
      Object.assign(FIND, { rows: res.rows, best: res.best, tooHigh: res.tooHigh });
      FIND.status = foundMessage();
    } catch (e) {
      FIND.status = e.message;
    }
    FIND.running = false; FIND.bar = 100; OPT.running = false;
    lock(false);
    A.renderGainCards();
  }

  function useFound(row) {
    const name = `${row.rods}-element ${Math.round(S.design.f0)} MHz, ${fmt(FIND.target, 2)} dBd`;
    const next = Object.assign(JSON.parse(JSON.stringify(row.design)), { name });
    delete next.tune;      // any readings were of the antenna this replaces
    const g = goals();
    Object.assign(g, { forDesign: name, boomMax: Math.round(row.boom) });
    FIND.rodFor = name;
    A.loadDesign(next, true);
    g.bandWas = next.f0 + ":" + next.band;
    FIND.key = findKey();
    A.go("design");
    A.toast("Design loaded. Undo brings the old one back.");
  }

  A.views.optimize = {
    mount(host) {
      host.innerHTML = optTemplate();
      bindOptimize();
      optLayout = new YS.Layout2D($("#opt-layout"), { readOnly: true });
      const ro = new ResizeObserver(() => { drawOptChart(); drawExplorer(); });
      ro.observe($("#opt-chart")); ro.observe($("#x-chart"));
    },
    show() { syncOptimize(); previewDesign(OPT.result ? OPT.result.design : S.design); drawOptChart(); drawExplorer(); renderOptResult(); A.renderGainCards(); if (OPT.running) { $("#opt-run").disabled = true; $("#x-run").disabled = true; } },
    refreshDesign() { if (!OPT.running) { OPT.goals = OPT.goals && OPT.goals.forDesign === S.design.name ? OPT.goals : null; syncOptimize(); previewDesign(S.design); A.renderGainCards(); } },
    refreshResults() { renderOptResult(); },
    retheme() { drawOptChart(); drawExplorer(); if (optLayout) optLayout.draw(); },
  };

  /* ==================== Build check ==================== */
  const CHK = { tol: { rod: 0.3, pos: 0.3, bend: 0, count: 400, trim: true }, res: null, sens: null, metric: "valley", running: false };

  function chkTemplate() {
    return `
    <div class="view view-three" id="view-check">
      <div class="col">
        <section class="card" aria-label="Build errors">
          <div class="head"><h2>How well can you build it?</h2></div>
          <div class="body stack">
            <p class="note">Simulates many builds with random errors, to show what you can expect from real parts.</p>
            <div class="field-grid">
              <div class="field"><label for="t-rod">Rod cutting ± mm ${A.help("sigma")}</label><input class="num" id="t-rod" inputmode="decimal"></div>
              <div class="field"><label for="t-pos">Hole position ± mm</label><input class="num" id="t-pos" inputmode="decimal"></div>
              <div class="field"><label for="t-bend">Rod bends ± degrees ${A.help("bends")}</label><input class="num" id="t-bend" inputmode="decimal"></div>
              <div class="field"><label for="t-n">Builds</label><input class="num" id="t-n" inputmode="numeric"></div>
            </div>
            <label class="check"><input type="checkbox" id="t-trim"> Trim the driven element on a VNA ${A.help("trim")}</label>
            <button class="btn primary" id="t-run">Simulate the builds</button>
            <p class="note" id="t-status"></p>
          </div>
        </section>
        <section class="card" aria-label="Summary of builds">
          <div class="head"><h2>What to expect</h2></div>
          <div class="body" id="t-summary"><p class="note">Results appear here.</p></div>
        </section>
      </div>
      <div class="col">
        <div class="hist-grid" style="flex:1 1 auto">
          ${[["swr", "SWR at target"], ["gain", "Gain at target, dBd"], ["fb", "Front-to-back at target, dB"], ["valley", "Where the valley lands, MHz"]].map(([k, t]) => `
          <section class="card" aria-label="${t}"><div class="head"><h2>${t}</h2></div><div class="stat-line" id="h-${k}-s" style="padding:2px 12px 0">&nbsp;</div><div class="canvas-box" style="margin:4px;min-height:130px"><canvas id="h-${k}"></canvas></div></section>`).join("")}
        </div>
      </div>
      <div class="col">
        <section class="card" aria-label="What each rod does">
          <div class="head"><h2>Which rods matter?</h2>
            <select class="sel" id="s-metric" aria-label="Measure" style="width:auto;min-height:24px;font-size:12px">
              <option value="valley">Valley, MHz per mm</option><option value="swr">SWR per mm</option><option value="gain">Gain, dB per mm</option><option value="fb">F/B, dB per mm</option>
            </select>
          </div>
          <div class="body stack">
            <p class="note" id="s-sentence">Working it out…</p>
            <div style="position:relative;height:300px"><canvas id="s-chart" style="position:absolute;inset:0;width:100%;height:100%" aria-label="Effect of one millimeter on each rod, largest first"></canvas></div>
            <p class="note">What 1 mm more does, at the target. A long bar means that rod needs the most care.</p>
          </div>
        </section>
      </div>
    </div>`;
  }

  function pct(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p / 100 * (sorted.length - 1))))]; }

  function drawHists() {
    const R = CHK.res;
    if (!R) return;
    const T = YS.tokens();
    const stat = (k, dec, low) => {
      const v = R.map((r) => r[k]).filter(isFinite).sort((a, b) => a - b);
      const med = pct(v, 50), worst = low ? pct(v, 5) : pct(v, 95);
      $(`#h-${k}-s`).textContent = k === "valley"
        ? `Median ${fmt(med, 1)}, 9 in 10 between ${fmt(pct(v, 5), 1)} and ${fmt(pct(v, 95), 1)}`
        : `Median ${fmt(med, dec)}, 19 in 20 ${low ? "above" : "below"} ${fmt(worst, dec)}`;
      YS.drawHistogram($(`#h-${k}`), v, { bins: Math.min(30, Math.max(10, Math.round(Math.sqrt(v.length)))), marks: k === "valley" ? [{ v: S.design.f0, color: T.ink2 }] : [] });
      return { med, worst };
    };
    const s = stat("swr", 2, false), g = stat("gain", 2, true), f = stat("fb", 1, true);
    stat("valley", 1, false);
    const fails = R.filter((r) => !r.trimmed).length;
    const [cls, word] = A.swrClass(s.worst);
    const drv = R.map((r) => r.driven).sort((a, b) => a - b);
    const sim = S.design.elements.find((e) => e.type === "driven");
    $("#t-summary").innerHTML = `
      <p><span class="pill ${cls}">${word}</span> 19 of 20 builds get SWR ${fmt(s.worst, 2)} or better at the target, and gain of at least ${fmt(g.worst, 2)} dBd.</p>
      ${CHK.tol.trim ? `<p class="note" style="margin-top:6px">The driven element ends up between ${fmt(pct(drv, 5), 1)} and ${fmt(pct(drv, 95), 1)} mm tip to tip (designed: ${fmt(sim.L, 1)}). So cut it at least ${fmt(Math.max(pct(drv, 95) - sim.L, 0) + 1, 1)} mm long and trim down.${fails ? ` In ${fails} of ${R.length} builds, the driven element alone couldn't cancel the reactance, so the parasitic rods need closer tolerances.` : ""}</p>` : ""}`;
  }

  function drawSens() {
    if (!CHK.sens) return;
    const m = CHK.metric;
    const rows = CHK.sens.rows.map((r) => ({ label: r.label, v: r[m] })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 12);
    const dec = m === "gain" ? 3 : m === "swr" ? 3 : 2;
    YS.drawRanked($("#s-chart"), rows, { decimals: dec });
    const top = rows[0];
    const unit = { valley: "MHz", swr: "of SWR", gain: "dB of gain", fb: "dB of F/B" }[m];
    if (top) $("#s-sentence").textContent = `${top.label} matters most here: 1 mm more changes it by ${top.v >= 0 ? "+" : "−"}${fmt(Math.abs(top.v), dec)} ${unit}.`;
  }

  async function runSens() {
    const solver = YS.toSolver(S.design);
    const names = S.design.elements.slice().sort((a, b) => a.x - b.x).map((e) => e.name);
    try {
      CHK.sens = await A.pool.run("sensitivity", { solver, f0: S.design.f0, names });
      drawSens();
    } catch (e) { $("#s-sentence").textContent = e.message; }
  }

  async function runCheck() {
    if (CHK.running) return;
    CHK.running = true;
    const started = performance.now(), btn = $("#t-run");
    btn.disabled = true;
    $("#t-status").textContent = "Building them…";
    try {
      const solver = YS.toSolver(S.design);
      const chunks = Math.max(1, A.pool.batchCount), each = Math.ceil(CHK.tol.count / chunks), jobs = [];
      for (let i = 0; i < chunks; i++) {
        jobs.push(A.pool.run("monteCarlo", { solver, tol: { rod: CHK.tol.rod, pos: CHK.tol.pos, bend: CHK.tol.bend, trim: CHK.tol.trim, count: each, seed: 1000 + i * 77, f0: S.design.f0 } }));
      }
      CHK.res = (await Promise.all(jobs)).flat();
      $("#t-status").textContent = `${CHK.res.length.toLocaleString()} builds in ${fmt((performance.now() - started) / 1000, 1)} s.`;
      drawHists();
    } catch (e) { $("#t-status").textContent = e.message; }
    CHK.running = false;
    btn.disabled = false;
  }

  A.views.check = {
    mount(host) {
      host.innerHTML = chkTemplate();
      A.bindNum($("#t-rod"), { get: () => CHK.tol.rod, set: (v) => { CHK.tol.rod = v; }, min: 0, max: 20, decimals: 2 });
      A.bindNum($("#t-pos"), { get: () => CHK.tol.pos, set: (v) => { CHK.tol.pos = v; }, min: 0, max: 20, decimals: 2 });
      // bends need the general solver: about 30 times slower, so a build count that suits lengths takes minutes
      A.bindNum($("#t-bend"), { get: () => CHK.tol.bend, set: (v) => { CHK.tol.bend = v; if (v && CHK.tol.count > 60) { CHK.tol.count = 60; $("#t-n")._refresh(); A.toast("Bends take much longer to model, so this is set to 60 builds."); } }, min: 0, max: 30, decimals: 1 });
      A.bindNum($("#t-n"), { get: () => CHK.tol.count, set: (v) => { CHK.tol.count = Math.round(v); }, min: 10, max: 20000, decimals: 0, stepScale: 500 });
      $("#t-trim").checked = CHK.tol.trim;
      $("#t-trim").onchange = (e) => { CHK.tol.trim = e.target.checked; };
      $("#t-run").onclick = runCheck;
      $("#s-metric").onchange = (e) => { CHK.metric = e.target.value; drawSens(); };
      const ro = new ResizeObserver(() => { drawHists(); drawSens(); });
      $$("#view-check canvas").forEach((c) => ro.observe(c));
    },
    show() { runSens(); if (CHK.res) drawHists(); else runCheck(); },
    refreshDesign() { CHK.res = null; runSens(); },
    refreshResults() {},
    retheme() { drawHists(); drawSens(); },
  };

  /* ==================== Cut list ==================== */
  const CUT = { boomThick: 20, allowance: 4, inches: false };

  function cutTemplate() {
    return `
    <div class="view view-two" id="view-cut">
      <div class="col no-print">
        <section class="card" aria-label="Cut list settings">
          <div class="head"><h2>Settings</h2></div>
          <div class="body stack">
            <div class="field-grid">
              <div class="field"><label for="c-boom">Boom thickness, mm</label><input class="num" id="c-boom" inputmode="decimal"></div>
              <div class="field"><label for="c-allow">Driven: cut long by, mm</label><input class="num" id="c-allow" inputmode="decimal"></div>
            </div>
            <label class="check"><input type="checkbox" id="c-in"> Show inches too</label>
            <button class="btn" id="c-print" hidden>Print this sheet</button>
          </div>
        </section>
        <section class="card" aria-label="Files">
          <div class="head"><h2>Files</h2></div>
          <div class="body stack" id="c-files"></div>
        </section>
        <section class="card no-print" aria-label="Cutting guide">
          <div class="head"><h2>Cutting guide ${A.help("guide")}</h2></div>
          <div class="body stack" id="c-guide"></div>
        </section>
      </div>
      <div class="col">
        <section class="card sheet" aria-label="Cut list"><div class="body stack" id="c-sheet"></div></section>
      </div>
    </div>`;
  }

  function renderSheet() {
    const d = S.design, sorted = d.elements.slice().sort((a, b) => a.x - b.x);
    const m = S.detail && S.detail.metrics;
    const inch = (mm) => (CUT.inches ? ` <span style="color:var(--muted)">${mmToIn(mm).toFixed(3)} in</span>` : "");
    const driven = sorted.find((e) => e.type === "driven");
    const half = (driven.L + CUT.allowance - d.gap) / 2, doneHalf = (driven.L - d.gap) / 2;
    const metalNames = { aluminium: "Aluminum", brass: "Brass", copper: "Copper", steel: "Stainless", perfect: "—" };
    $("#c-sheet").innerHTML = `
      <h1>${esc(d.name)}</h1>
      <p class="note">${fmt(d.f0, 3)} MHz · ${sorted.length} rods · boom ${fmt(YS.boomLength(d), 1)} mm between the end rods${m ? ` · ${fmt(m.gainDbd, 2)} dBd · F/B ${fmt(m.fb, 1)} dB · SWR ${fmt(m.swr, 2)} predicted at ${fmt(m.f, 3)} MHz` : ""}</p>
      <div class="scroll-x"><table class="tbl"><thead><tr><th>Rod</th><th>Cut to, mm</th><th>Each side of boom</th><th>From reflector</th><th>Gap to next</th><th>Diameter</th><th>Metal</th></tr></thead><tbody>
      ${sorted.map((e, i) => `<tr><td>${esc(e.name)}</td>
        <td>${e.type === "driven" ? `2 × ${fmt(half, 1)}` : fmt(e.L, 1)}${e.type === "driven" ? "" : inch(e.L)}</td>
        <td>${e.type === "driven" ? "trim" : fmt((e.L - CUT.boomThick) / 2, 2)}</td>
        <td>${fmt(e.x, 1)}${inch(e.x)}</td>
        <td>${i + 1 < sorted.length ? fmt(sorted[i + 1].x - e.x, 1) : "–"}</td>
        <td>${fmt(e.d, 2)}${inch(e.d)}</td>
        <td style="font-family:var(--sans)">${metalNames[e.material || d.material] || ""}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="stack" style="max-width:68ch">
        <p><b>Driven element.</b> Cut two rods at ${fmt(half, 1)} mm each. Set them ${fmt(d.gap, 1)} mm apart, which makes ${fmt(2 * half + d.gap, 1)} mm tip to tip, deliberately ${fmt(CUT.allowance, 1)} mm too long. Then file both outer tips equally on the VNA. The model expects about ${fmt(driven.L, 1)} mm tip to tip when it's right (about ${fmt(doneHalf, 2)} mm each), and the wire across the gap usually makes it finish a mm or more shorter, so go by the VNA. Set the gap before you trim.</p>
        ${A.radio.sheetLine()}
        <p><b>Accuracy.</b> Cut the other rods to ±0.3 mm and file the ends square. Measure each one with calipers, and keep a note of what you got: the Tune tab can use it.</p>
        <p><b>Before you mount it.</b> A roof or mast job needs care. Stay well clear of power lines, ground the mast and fit lightning protection as your local code asks, and check any permit rules first.</p>
      </div>`;
  }

  /* ---------- the printed cutting guide ---------- */
  /** Calibrate first: nothing here offers a guide until the test bar has been printed and measured. */
  function renderGuide() {
    const box = $("#c-guide");
    if (!box) return;
    const st = A.storage.read().guide || {};
    const cal = YS.guideScale(st.measured);
    const channels = YS.guideChannels(S.design, CUT.allowance);
    const guide = YS.buildGuide(channels, cal ? cal.scale : 1);
    const fits = YS.guideFits(guide, st.bed);
    box.innerHTML = `
      <p class="note">A block with a channel for each rod. Lay a rod in its channel against the far stop, then cut it a little long and file it flush with the front.</p>
      <div>
        <div style="font-weight:600;margin-bottom:3px">1. Calibrate your printer first</div>
        <p class="note">A printed guide is only as true as your printer. Plastic shrinks as it cools, and on a 150 mm rod a typical 0.4% is 0.6 mm, twice what these rods can take. So the guide is scaled to what your printer really does.</p>
        <ol class="note" style="margin:6px 0 8px 18px;padding:0">
          <li>Print the test bar flat, in the filament and slicer settings you'll use for the guide.</li>
          <li>Let it cool fully.</li>
          <li>Measure its length with calipers, on the flat sides, away from the bottom edge, which can flare.</li>
          <li>Type that here. If your slicer already corrects for shrinkage, leave that on, and measure anyway.</li>
        </ol>
        <div class="row" style="align-items:flex-end">
          <button class="btn" id="g-bar">Download the test bar</button>
          <div class="field"><label for="g-measured">It measures, mm</label><input class="num" id="g-measured" inputmode="decimal" style="max-width:110px" placeholder="100.00"></div>
        </div>
        <p class="note" id="g-cal" style="margin-top:6px"></p>
      </div>
      <div>
        <div style="font-weight:600;margin-bottom:3px">2. Print the guide</div>
        <p class="note">${guide.channels.length} channels: ${esc(guide.channels.map((c) => `${c.label} ${fmt(c.length, 1)}`).join(", "))} mm. Print it flat, channels up, with no supports, in the same filament and settings as the bar.</p>
        <div class="row" style="margin-top:4px"><button class="btn primary" id="g-guide" ${cal && fits ? "" : "disabled"}>Download the guide</button></div>
        <p class="note" id="g-why" style="margin-top:6px">${!cal ? "This unlocks once you've entered what the test bar measures." : !fits ? `It would be ${fmt(guide.modelLength, 0)} mm long, too long for a ${st.bed || YS.GUIDE.BED_DEFAULT} mm bed. For rods this long, use a tape and a stop block instead.` : `It's made ${fmt(guide.modelLength, 1)} mm long so that it prints at ${fmt(guide.length, 1)} mm.`}</p>
        <div class="field" style="margin-top:4px"><label for="g-bed">Your printer's bed, mm</label><input class="num" id="g-bed" inputmode="decimal" style="max-width:110px"></div>
      </div>
      <div>
        <div style="font-weight:600;margin-bottom:3px">3. Check it before you trust it</div>
        <p class="note">Measure the printed guide's length. It should be <b>${fmt(guide.length, 1)} mm</b>, within about 0.2 mm. If it isn't, enter a new bar measurement, or scale by what you found. Then cut the first rod, measure it, and only then cut the rest.</p>
      </div>`;
    const barStl = () => YS.meshToStl(YS.buildBar().mesh, "test-bar");
    $("#g-bar").onclick = () => A.download("calibration-bar-100mm.stl", barStl(), "model/stl");
    const save = (o) => { A.storage.write({ guide: Object.assign({}, A.storage.read().guide, o) }); };
    const input = $("#g-measured");
    if (st.measured) input.value = st.measured;
    const showCal = (c) => {
      $("#g-cal").innerHTML = !c ? "" : c.suspicious
        ? `<span class="pill warn">Check that</span> That's ${fmt(Math.abs(c.percent - 100), 2)}% off, far more than plastic shrinks. Measure it again, and enter the bar's length in mm. It should be close to 100.`
        : `Your printer makes it ${fmt(100 / c.scale, 2)} mm, so the guide is scaled by ${fmt(c.percent, 2)}%.`;
    };
    showCal(cal);
    input.onchange = () => {
      const v = parseFloat(input.value);
      save({ measured: v > 0 ? v : null });
      renderGuide();
    };
    A.bindNum($("#g-bed"), { get: () => st.bed || YS.GUIDE.BED_DEFAULT, min: 50, max: 2000, decimals: 0, set: (v) => { save({ bed: v }); }, });
    $("#g-bed").addEventListener("change", () => renderGuide());
    $("#g-guide").onclick = () => {
      const name = `${S.design.name.replace(/[^\w-]+/g, "_")}_cutting_guide.stl`;
      A.download(name, YS.meshToStl(guide.mesh, "cutting-guide"), "model/stl");
    };
  }

  function renderFiles() {
    const d = S.design, base = d.name.replace(/[^\w-]+/g, "_");
    const files = [
      ["Design (JSON)", () => JSON.stringify(d, null, 1), base + ".json", "application/json"],
      ["NEC deck, for nec2++ or 4nec2", () => YS.necDeck(d, { freqs: S.rows ? [S.rows[0].f, S.rows[1].f].concat([]).slice(0, 1) : [d.f0] }), base + ".nec"],
      ["YagiCAD file (.YC6)", () => YS.yc6(d, S.detail && S.detail.metrics), base + ".YC6"],
      ["Sweep (CSV)", () => "MHz,SWR,gain_dBd,gain_dBi,FB_dB,R_ohm,X_ohm\n" + (S.rows || []).map((r) => [r.f.toFixed(3), r.swr.toFixed(3), r.gainDbd.toFixed(3), r.gainDbi.toFixed(3), r.fb.toFixed(2), r.z[0].toFixed(2), r.z[1].toFixed(2)].join(",")).join("\n") + "\n", base + "_sweep.csv", "text/csv"],
      ["Simulated S11 (.s1p), for NanoVNA Saver", () => YS.toTouchstone(S.rows || [], d.z0, d.name + " simulated by Yagi Studio"), base + ".s1p"],
    ];
    $("#c-files").innerHTML = files.map((f, i) => `<div><div style="font-weight:500;margin-bottom:3px">${esc(f[0])}</div><div class="row"><button class="btn small" data-dl="${i}">Download</button><button class="btn small" data-cp="${i}">Copy</button></div></div>`).join("") +
      `<p class="note">${root.ysNative || (root.ysWeb && root.ysWeb.ios) ? "Download asks where to save each file." : "If Download does nothing, this page is running somewhere that blocks downloads. Copy works everywhere."}</p>`;
    $$("[data-dl]", $("#c-files")).forEach((b) => { b.onclick = () => { const f = files[+b.dataset.dl]; A.download(f[2], f[1](), f[3]); }; });
    $$("[data-cp]", $("#c-files")).forEach((b) => { b.onclick = () => { const f = files[+b.dataset.cp]; A.copy(f[1](), f[0]); }; });
  }

  /* ==================== 3D print: the boom, a mount and a coupon, from the design on screen ==================== */
  const PRINT = { mount: "mast", fit: YS.PARTS.FIT, gauge: true, label: true, useBar: false, result: null, key: "", shown: 0, busy: false, status: "", yaw: -0.7, pitch: 0.6 };

  function printOptions() {
    const st = A.storage.read().guide || {}, cal = YS.guideScale(st.measured);
    const scale = PRINT.useBar && cal && !cal.suspicious ? cal.scale : 1;
    return { bed: st.bed || YS.GUIDE.BED_DEFAULT, scale, fit: PRINT.fit, allowance: CUT.allowance, gauge: PRINT.gauge, label: PRINT.label, mount: PRINT.mount };
  }
  /* What the files on show were made from: when this changes, they're out of date. */
  const printKey = () => JSON.stringify([S.design.elements, S.design.polarization, S.design.gap, printOptions()]);

  function printTemplate() {
    return `
    <div class="view view-two" id="view-print">
      <div class="col">
        <section class="card" aria-label="What to make">
          <div class="head"><h2>Parts for this design</h2></div>
          <div class="body stack">
            <p class="note"><span class="pill warn">New and untested</span> Nothing from this tab has been printed yet. The boom follows the DuvYagi's printed one, but its cutting marks, check notches and label are new, and so are the hand grip, the tripod mount and the painter pole's arm. Print one and check it before you rely on it.</p>
            <p class="note">Makes printable files from the design on the Design tab, here on your device.</p>
            <div class="field-grid">
              <div class="field"><label for="p-mount">Mount</label><select class="sel" id="p-mount">${Object.keys(YS.PARTS.MOUNTS).map((k) => `<option value="${k}">${esc(YS.PARTS.MOUNTS[k].name)}</option>`).join("")}</select></div>
              <div class="field"><label for="p-bed">Printer's bed, mm</label><input class="num" id="p-bed" inputmode="decimal"></div>
              <div class="field"><label for="p-fit">Rod holes over the rod, mm ${A.help("printfit")}</label><input class="num" id="p-fit" inputmode="decimal"></div>
              <div class="field"><label for="p-shrink">Shrinkage</label><select class="sel" id="p-shrink"><option value="slicer">My slicer handles it</option><option value="bar">Scale from a test bar</option></select></div>
              <div class="field" id="p-bar-wrap"><label for="p-bar">Test bar measures, mm</label><input class="num" id="p-bar" inputmode="decimal"></div>
            </div>
            <label class="check"><input type="checkbox" id="p-gauge"> Rod-cutting gauge and check notches on top of the boom ${A.help("printcheck")}</label>
            <label class="check"><input type="checkbox" id="p-label"> THIS SIDE UP on the boom's side</label>
            <div class="row"><button class="btn primary" id="p-run">Make the files</button></div>
            <p class="note" id="p-status" role="status"></p>
            <div class="stack" id="p-plan"></div>
          </div>
        </section>
        <section class="card" aria-label="Files to download"><div class="head"><h2>Files</h2></div><div class="body stack" id="p-files"><p class="note">Make the files, and they'll be listed here.</p></div></section>
      </div>
      <div class="col">
        <section class="card grow tall-md" aria-label="Preview">
          <div class="head"><h2 id="p-title">Preview</h2><span class="note">Drag to turn</span></div>
          <div class="canvas-box" style="margin:4px"><canvas id="p-view" aria-label="A picture of the part, as it sits on the printer's bed"></canvas></div>
        </section>
      </div>
    </div>`;
  }

  function renderPrintPlan() {
    const d = S.design, host = $("#p-plan"), run = $("#p-run");
    $("#p-bar-wrap").hidden = !PRINT.useBar;
    let plan;
    try {
      plan = YS.planParts(d, printOptions());
    } catch (e) {
      host.innerHTML = `<p class="note"><span class="pill warn">Check that</span> ${esc(e.message)}</p>`;
      run.disabled = true;
      return;
    }
    run.disabled = PRINT.busy;
    const lines = [`A ${fmt(plan.boom, 0)} mm boom in ${plan.sections.length === 1 ? "one piece" : plan.sections.length + " sections"}.`];
    if (plan.gauge) lines.push(`Gauge marks, from these lengths: ${plan.gauge.marks.map((m) => `${esc(m.rod)} ${fmt(m.length, 1)}`).join(", ")} mm. If tuning changes a rod, make the boom again.`);
    if (PRINT.useBar && printOptions().scale === 1) lines.push("Enter what the test bar measures, or these files won't be scaled. The bar is on the Cut list tab.");
    if (PRINT.mount === "mast") {
      const m = d.mast && d.mast.on ? d.mast : null;
      if (!m) lines.push(`The clamp holds a 42 mm mast about ${fmt(YS.mastBehind(42), 0)} mm behind the reflector. Turn the mast on in the Design tab to see what that does.`);
      else if (Math.abs(YS.mastBehind(m.d) - m.behind) > 10) lines.push(`The clamp puts your ${fmt(m.d, 0)} mm mast about ${fmt(YS.mastBehind(m.d), 0)} mm behind the reflector, and the Design tab has it at ${fmt(m.behind, 0)} mm. Set them the same to see what it does.`);
    }
    if (PRINT.mount === "pole") lines.push(`The pole's thread is from a socket proven on one real painter pole, in the USA. Check it fits yours. The pole sits ${fmt(YS.PARTS.POLE_BEHIND, 0)} mm behind the reflector, and a metal one can change the tuning, so sweep it on the pole. Look up first: a pole can reach overhead power lines. Don't raise it in wind or near storms.`);
    if (PRINT.mount === "grip") lines.push("A hand near the rods detunes them. Sweep the antenna the way you'll hold it.");
    host.innerHTML = lines.map((l) => `<p class="note">${l}</p>`).join("") + plan.warnings.map((w) => `<p class="note"><span class="pill warn">Note</span> ${esc(w)}</p>`).join("");
    renderPrintFiles();
  }

  function renderPrintFiles() {
    const host = $("#p-files"), R = PRINT.result;
    if (!R || PRINT.key !== printKey()) {
      host.innerHTML = `<p class="note">${R ? "The design or settings changed. Make the files again." : "Make the files, and they'll be listed here."}</p>`;
      return;
    }
    host.innerHTML = `
      <table class="tbl"><tbody>
        ${R.parts.map((p, i) => `<tr><td style="text-align:left;white-space:normal"><button class="linkish" data-show="${i}" aria-label="Show ${esc(p.name)}">${esc(p.name)}</button><div class="note">${p.size.map((v) => fmt(v, 0)).join(" x ")} mm</div></td><td style="text-align:right"><button class="btn small" data-get="${i}" aria-label="Download ${esc(p.name)}">Download</button></td></tr>`).join("")}
      </tbody></table>
      <div class="row"><button class="btn" id="p-notes">Download the build notes</button><button class="btn" id="p-all">Download everything</button></div>
      <p class="note">These are print-ready STL files, in the right orientation, and their build notes list the settings and hardware. They've only been checked as models, not printed, so measure the check notches and test-fit the parts before you rely on them.</p>`;
    const name = S.design.name.replace(/[^\w-]+/g, "_");
    const notes = () => A.download(`${name}_build_notes.txt`, YS.partsNotes(S.design, R), "text/plain");
    const one = (p) => A.download(p.file, YS.meshToStl(p.mesh, p.id), "model/stl");
    $$("[data-show]", host).forEach((b) => { b.onclick = () => { PRINT.shown = +b.dataset.show; renderPrintFiles(); drawPart(); }; });
    $$("[data-get]", host).forEach((b) => { b.onclick = () => one(R.parts[+b.dataset.get]); });
    $("#p-notes").onclick = notes;
    $("#p-all").onclick = async () => { for (const p of R.parts) await one(p); await notes(); };
  }

  /* The part, drawn back to front with flat shading: enough to see what it is, and with no library. */
  function drawPart() {
    const c = $("#p-view");
    if (!c) return;
    const box = c.parentElement.getBoundingClientRect(), dpr = root.devicePixelRatio || 1;
    const W = Math.max(40, box.width), H = Math.max(40, box.height);
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const R = PRINT.result, p = R && PRINT.key === printKey() ? R.parts[PRINT.shown] : null;
    $("#p-title").textContent = p ? p.name : "Preview";
    if (!p) return;
    const cy = Math.cos(PRINT.yaw), sy = Math.sin(PRINT.yaw), cp = Math.cos(PRINT.pitch), sp = Math.sin(PRINT.pitch);
    const ctr = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    const view = (v) => {
      const x = v[0] - ctr[0], y = v[1] - ctr[1], z = v[2] - ctr[2];
      const a = x * cy - y * sy, b = x * sy + y * cy;
      return [a, b * sp + z * cp, -b * cp + z * sp];
    };
    const reach = Math.hypot(p.size[0], p.size[1], p.size[2]) / 2 || 1, k = 0.94 * Math.min(W, H) / (2 * reach);
    const tris = p.mesh.t.map((t) => {
      const q = t.map(view), u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], w = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
      return { q, depth: (q[0][2] + q[1][2] + q[2][2]) / 3, front: n[2] / l, light: (n[0] * -0.35 + n[1] * 0.55 + n[2] * 0.76) / l };
    }).filter((t) => t.front > 0).sort((a, b) => a.depth - b.depth);
    tris.forEach((t) => {
      const v = Math.round(90 + 130 * Math.max(0, t.light)), col = `rgb(${v},${Math.round(v * 0.86)},${Math.round(v * 0.55)})`;
      g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.5;
      g.beginPath();
      t.q.forEach((a, i) => { const x = W / 2 + a[0] * k, y = H / 2 - a[1] * k; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath(); g.fill(); g.stroke();
    });
  }

  async function runPrint() {
    if (PRINT.busy) return;
    PRINT.busy = true; PRINT.status = "Making the parts…";
    $("#p-run").disabled = true; $("#p-status").textContent = PRINT.status;
    try {
      const wasm = await YS.loadManifold(), started = performance.now();
      PRINT.result = YS.buildParts(wasm, S.design, printOptions());
      PRINT.key = printKey();
      PRINT.shown = 0;
      $("#p-status").textContent = `Done in ${fmt((performance.now() - started) / 1000, 1)} s.`;
    } catch (e) {
      PRINT.result = null;
      $("#p-status").textContent = "That didn't work: " + ((e && e.message) || e);
    }
    PRINT.busy = false;
    $("#p-run").disabled = false;
    renderPrintPlan();
    drawPart();
  }

  A.views.print = {
    mount(host) {
      host.innerHTML = printTemplate();
      const saveGuide = (o) => { A.storage.write({ guide: Object.assign({}, A.storage.read().guide, o) }); };
      const changed = () => { renderPrintPlan(); drawPart(); };
      $("#p-mount").value = PRINT.mount;
      $("#p-mount").onchange = (e) => { PRINT.mount = e.target.value; changed(); };
      A.bindNum($("#p-bed"), { get: () => (A.storage.read().guide || {}).bed || YS.GUIDE.BED_DEFAULT, min: 50, max: 2000, decimals: 0, set: (v) => { saveGuide({ bed: v }); changed(); } });
      A.bindNum($("#p-fit"), { get: () => PRINT.fit, min: -0.3, max: 1, decimals: 2, set: (v) => { PRINT.fit = v; changed(); } });
      A.bindNum($("#p-bar"), { get: () => (A.storage.read().guide || {}).measured || NaN, min: 0, max: 200, decimals: 2, parse: (s) => (s.trim() === "" ? 0 : A.parseLen(s)), set: (v) => { saveGuide({ measured: v > 0 ? v : null }); changed(); } });
      $("#p-shrink").onchange = (e) => { PRINT.useBar = e.target.value === "bar"; changed(); };
      $("#p-gauge").checked = PRINT.gauge; $("#p-label").checked = PRINT.label;
      $("#p-gauge").onchange = (e) => { PRINT.gauge = e.target.checked; changed(); };
      $("#p-label").onchange = (e) => { PRINT.label = e.target.checked; changed(); };
      $("#p-run").onclick = runPrint;
      const c = $("#p-view");
      let from = null;
      c.addEventListener("pointerdown", (e) => { from = [e.clientX, e.clientY]; if (c.setPointerCapture) c.setPointerCapture(e.pointerId); });
      c.addEventListener("pointermove", (e) => {
        if (!from) return;
        PRINT.yaw += (e.clientX - from[0]) * 0.01; PRINT.pitch = Math.max(-1.5, Math.min(1.5, PRINT.pitch + (e.clientY - from[1]) * 0.01));
        from = [e.clientX, e.clientY];
        drawPart();
      });
      c.addEventListener("pointerup", () => { from = null; });
      c.style.touchAction = "none";
      c.style.width = "100%"; c.style.height = "100%";
      if (root.ResizeObserver) new ResizeObserver(() => { if (S.view === "print") drawPart(); }).observe(c.parentElement);
    },
    show() { $("#p-bed")._refresh(); renderPrintPlan(); drawPart(); },
    refreshDesign() { renderPrintPlan(); drawPart(); },
    refreshResults() {},
    retheme() { drawPart(); },
  };

  A.views.cut = {
    mount(host) {
      host.innerHTML = cutTemplate();
      A.bindNum($("#c-boom"), { get: () => CUT.boomThick, set: (v) => { CUT.boomThick = v; renderSheet(); }, min: 0, max: 500 });
      A.bindNum($("#c-allow"), { get: () => CUT.allowance, set: (v) => { CUT.allowance = v; renderSheet(); renderGuide(); }, min: 0, max: 50 });
      $("#c-in").onchange = (e) => { CUT.inches = e.target.checked; renderSheet(); };
      // the frame refuses printing when this page is embedded, so only offer it where it works
      let top = false;
      try { top = window.top === window.self; } catch (e) { top = false; }
      $("#c-print").hidden = !top;
      $("#c-print").onclick = () => window.print();
    },
    show() { renderSheet(); renderFiles(); renderGuide(); },
    refreshDesign() { renderSheet(); renderFiles(); renderGuide(); },
    refreshResults() { renderSheet(); },
    retheme() {},
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
