/*
 * Yagi Studio app, part 4: designing an antenna from goals (the Design tab's first screens), and the Build check, Cut list
 * and 3D print views.
 */
(function (root) {
  "use strict";
  const YS = root.YS, A = YS.app, S = A.S;
  const { $, $$, esc, fmt, mmToIn } = A;

  /* ==================== Designing an antenna: goals, then find and polish ====================
     The Design tab has three screens: "What you want" (the goals), "Designing" (a quick search for each number of rods, then
     each one polished in turn, watched live), and the antenna itself (app-design.js), where a hand change can be polished
     again. This replaced the separate Optimize tab and the "Find the boom" card (the owner's choice, 2026-11-07): one
     search that stopped at rough designs and another that polished them was confusing. */
  const OPT = { running: false, cancel: false, goals: null, result: null, progress: null, explore: null, exploring: false, stage: "antenna", list: null, watch: -1, watchPicked: false, polishing: false };
  const EFFORT = {
    quick: { gens: 150, patience: 40, polish: 200, label: "Quick" },
    normal: { gens: 260, patience: 60, polish: 300, label: "Normal" },
    thorough: { gens: 500, patience: 90, polish: 500, label: "Thorough" },
    deep: { gens: 1500, patience: 200, polish: 900, label: "Deep" },
  };
  const FORGIVING = { builds: 48, rod: 0.3, pos: 0.3 };     // the short build check on each polished design: builds, and errors (1 sigma, mm)
  // a vertical dipole's answers (src/dipole.js): which kind the screen shows, and what's asked for a dipole. for: the design
  // they were read from, so opening another design brings its own
  const DIP = { kind: "yagi", for: null, mount: "side", tube: "k14", coax: "rg316", mast: "metal", mastD: 42, arm: 250, cap: "auto", d: 3.175, metal: "brass", sections: 1 };
  function dipAnswers() {
    const d = S.design;
    if (DIP.for === d.name) return DIP;
    DIP.for = d.name;
    DIP.kind = YS.dipole.isDipole(d) ? "dipole" : "yagi";
    if (DIP.kind === "dipole") {
      const r = d.elements[0];
      const sl = r.sleeve;
      Object.assign(DIP, { mount: d.mount || "side", tube: sl ? sl.tube : DIP.tube, coax: sl ? sl.coax : DIP.coax, mast: d.mast.on || d.mount !== "side" ? "metal" : "none", mastD: d.mast.d, arm: d.mast.behind, cap: d.seriesStub && d.seriesStub.length > 0 ? "stub:" + d.seriesStub.cable : d.seriesC > 0 ? String(d.seriesC) : d.hairpin || d.unsized ? "auto" : "0", d: r.d, metal: r.material || d.material, sections: r.colin ? r.colin.sections.length : 1 });
    }
    return DIP;
  }

  function goals() {
    const d = S.design;
    if (OPT.goals && OPT.goals.forDesign === d.name && OPT.goals.bandWas !== d.f0 + ":" + d.band) {
      // the target or the band moved, so what's searched follows it
      const lam = 299792.458 / d.f0;
      Object.assign(OPT.goals, { band: d.band.slice(), bandWas: d.f0 + ":" + d.band, minGap: Math.round(0.05 * lam), boomFrom: Math.round(0.4 * lam), boomTo: Math.round(2 * lam) });
    }
    if (!OPT.goals || OPT.goals.forDesign !== d.name) {
      OPT.goals = { forDesign: d.name, band: d.band.slice(), bandWas: d.f0 + ":" + d.band, fbMin: 15, swrMax: 1.5, boomMax: Math.round(YS.boomLength(d)), limitBoom: true,
        favor: "gain", changeLengths: true, changeSpacing: true, minGap: Math.round(0.05 * 299792.458 / d.f0), range: "near", effort: "normal", locks: {},
        rodsFrom: 4, rodsTo: 8, boomFrom: Math.round(0.4 * 299792.458 / d.f0), boomTo: Math.round(2 * 299792.458 / d.f0), boomSteps: 6 };
    }
    return OPT.goals;
  }

  const FIND = { target: 10, gainTo: 0, boomTop: 0, rod: null, rodFor: "", metal: null, driven: null, drivenFor: "", drivenMetal: null, running: false, rows: null, best: null, tooHigh: 0, status: "", bar: 0 };
  const firstDirector = () => S.design.elements.find((e) => e.type === "director") || S.design.elements[0];
  const rodSize = () => (FIND.rod && FIND.rodFor === S.design.name ? FIND.rod : firstDirector().d);
  const drivenRod = () => S.design.elements.find((e) => e.type === "driven") || firstDirector();
  const drivenSize = () => (FIND.driven && FIND.drivenFor === S.design.name ? FIND.driven : drivenRod().d);
  const rodMetal = () => (FIND.metal && FIND.rodFor === S.design.name ? FIND.metal : firstDirector().material || S.design.material);
  const drivenMetal = () => (FIND.drivenMetal && FIND.drivenFor === S.design.name ? FIND.drivenMetal : drivenRod().material || S.design.material);
  const metalName = (m) => ({ aluminium: "aluminum", steel: "stainless" }[m] || m);
  const METAL_OPTIONS = [["aluminium", "Aluminum"], ["brass", "Brass"], ["copper", "Copper"], ["steel", "Stainless"]];
  const optionalNum = (get, set) => ({ get: () => get() || NaN, set, min: 0, parse: (s) => (s.trim() === "" ? 0 : A.parseLen(s)) });
  const FAVOR_NAMES = { gain: "the shortest boom", swr: "the lowest SWR", fb: "the highest F/B", both: "the best SWR and F/B together" };

  /** The goals in a line, for the screens that show them. */
  function goalsLine() {
    const g = goals();
    return `${fmt(FIND.target, 2)} dBd or more, ${FAVOR_NAMES[g.favor]}. SWR under ${fmt(g.swrMax, 2)} and F/B over ${fmt(g.fbMin, 1)} dB across ${fmt(g.band[0], 3)} to ${fmt(g.band[1], 3)} MHz.`;
  }

  /** How the design open now does against the goals, across the band. */
  function currentParts() {
    const d = S.design, g = goals();
    const rows = S.rows || [];
    const inBand = rows.filter((r) => r.f >= g.band[0] && r.f <= g.band[1]);
    if (!inBand.length) return null;
    return { worstGain: Math.min.apply(null, inBand.map((r) => r.gainDbd)), worstSwr: Math.max.apply(null, inBand.map((r) => r.swr)), minFb: Math.min.apply(null, inBand.map((r) => r.fb)), boom: YS.boomLength(d) };
  }
  // A polish works at draft accuracy and finishes finer, and a design polished right up to a limit can read a hair past it at
  // the accuracy on show: 1.51 against 1.50. That's within the model's own accuracy, so it still counts as meeting it.
  const SLACK = { gain: 0.02, swr: 0.02, fb: 0.2 };
  function shortfalls(c) {
    const g = goals(), out = [];
    if (!c) return out;
    if (c.worstGain < FIND.target - SLACK.gain) out.push(`its gain dips to ${fmt(c.worstGain, 2)} dBd, under your ${fmt(FIND.target, 2)}`);
    if (c.worstSwr > g.swrMax + SLACK.swr) out.push(`SWR reaches ${fmt(c.worstSwr, 2)}, over your ${fmt(g.swrMax, 2)}`);
    if (c.minFb < g.fbMin - SLACK.fb) out.push(`F/B drops to ${fmt(c.minFb, 1)} dB, under your ${fmt(g.fbMin, 1)}`);
    return out;
  }

  /* ---------- the screens ---------- */
  const plainSelect = (id, options, label) => `<select class="sel" id="${id}" aria-label="${label || ""}">${options.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select>`;

  function planTemplate() {
    return `
    <div class="view-plan" id="plan-goals">
      <div class="plan-wrap">
        <section class="card plan-main" aria-label="What you want">
          <div class="head"><h2 data-for="yagi">What do you want from your Yagi?</h2><h2 data-for="dipole">What do you want from your vertical dipole?</h2></div>
          <div class="body stack">
            <p class="note" data-for="yagi">Say what matters and what limits you. Yagi Studio finds designs that meet it and polishes each one, then you pick one. For an all-round antenna instead, start a vertical dipole with New design.</p>
            <p class="note" data-for="dipole">Say where it works, how it's mounted and how it's matched, and Yagi Studio sizes the rod and the match. For a beam instead, start a Yagi with New design.</p>
            <h3 class="plan-h">1. Where it works</h3>
            <div class="field-grid three">
              <div class="field"><label for="w-f0">Target, MHz</label><input class="num" id="w-f0" inputmode="decimal"></div>
              <div class="field"><label for="w-lo">Band from, MHz</label><input class="num" id="w-lo" inputmode="decimal"></div>
              <div class="field"><label for="w-hi">to, MHz</label><input class="num" id="w-hi" inputmode="decimal"></div>
            </div>
            <div class="row"><button class="btn small" id="w-network">Choose a network…</button><span class="note">Sets the target and band for a mesh network or ham band.</span></div>
            <div class="stack" id="w-yagi" data-for="yagi">
            <h3 class="plan-h">2. What matters most</h3>
            <div class="field-grid three">
              <div class="field"><label for="w-gain">Gain at least, dBd ${A.help("gain")}</label><input class="num" id="w-gain" inputmode="decimal"></div>
              <div class="field"><label for="w-to">up to, if it matters</label><input class="num" id="w-to" inputmode="decimal" placeholder="any"></div>
              <div class="field"><label for="w-favor">Then make the best of ${A.help("favor")}</label>${plainSelect("w-favor", [["gain", "Shortest boom"], ["swr", "Lowest SWR"], ["fb", "Highest F/B"], ["both", "Both SWR and F/B"]])}</div>
            </div>
            <h3 class="plan-h">3. Limits it must keep</h3>
            <div class="field-grid plan-four">
              <div class="field"><label for="w-swr">SWR under, across the band ${A.help("swr")}</label><input class="num" id="w-swr" inputmode="decimal"></div>
              <div class="field"><label for="w-fb">F/B over, dB ${A.help("fb")}</label><input class="num" id="w-fb" inputmode="decimal"></div>
              <div class="field" id="w-top-wrap"><label for="w-top">Longest boom, mm</label><input class="num" id="w-top" inputmode="decimal" placeholder="any"></div>
              <div class="field"><label for="w-gap">Closest rods, mm</label><input class="num" id="w-gap" inputmode="decimal"></div>
            </div>
            <h3 class="plan-h">4. What you'll build it from</h3>
            <div class="field-grid plan-four">
              <div class="field"><label for="w-rod">Rods, mm across</label><input class="num" id="w-rod" inputmode="decimal"></div>
              <div class="field"><label for="w-metal">Rods' metal ${A.help("metal")}</label>${plainSelect("w-metal", METAL_OPTIONS)}</div>
              <div class="field"><label for="w-driven">Driven element, mm across</label><input class="num" id="w-driven" inputmode="decimal"></div>
              <div class="field"><label for="w-dmetal">Its metal</label>${plainSelect("w-dmetal", METAL_OPTIONS)}</div>
            </div>
            <label class="check"><input type="checkbox" id="w-wire"> Fed with coax soldered to the driven element's two halves (counts its leads in the gap) ${A.help("wire")}</label>
            </div>
            <div class="stack" id="w-dip" data-for="dipole">
            <h3 class="plan-h">2. How it's mounted</h3>
            <div class="field-grid three">
              <div class="field"><label for="w-mount">Mount ${A.help("sleeve")}</label>${plainSelect("w-mount", [["side", "On an arm out from the mast"], ["top", "On top of a mast, as a sleeve dipole"], ["pod", "On the node pod's top, as a sleeve dipole"]])}</div>
              <div class="field" id="w-mast-wrap"><label for="w-mast">The mast ${A.help("dipmast")}</label>${plainSelect("w-mast", [["metal", "Metal"], ["none", "Wood, fiberglass or plastic"]])}</div>
              <div class="field" id="w-mastd-wrap"><label for="w-mastd">Its diameter, mm</label><input class="num" id="w-mastd" inputmode="decimal"></div>
              <div class="field" id="w-tube-wrap"><label for="w-tube">The sleeve</label>${plainSelect("w-tube", [["k14", "1/4 in brass tube (K&S)"]])}</div>
              <div class="field" id="w-coax-wrap"><label for="w-coax">The coax up inside it</label>${plainSelect("w-coax", [["rg316", "RG316"], ["rg178", "RG178"]])}</div>
              <div class="field" id="w-sec-wrap"><label for="w-sec">Sections ${A.help("collinear")}</label>${plainSelect("w-sec", [["1", "One: a sleeve dipole, about 2.2 dBi"], ["2", "Two: a collinear, about 0.41 m tall, 4.7 dBi"], ["3", "Three: a collinear, about 0.66 m tall, 5.7 dBi"]])}</div>
            </div>
            <div class="field-grid three">
              <div class="field" id="w-arm-wrap"><label for="w-arm">From the mast's middle to the dipole, mm</label><input class="num" id="w-arm" inputmode="decimal"></div>
            </div>
            <p class="note" id="w-arm-note"></p>
            <h3 class="plan-h">3. The match</h3>
            <div class="field-grid three">
              <div class="field"><label for="w-cap">Capacitor in series ${A.help("dipcap")}</label>${plainSelect("w-cap", [["auto", "Whichever standard value suits best"], ["3.3", "3.3 pF"], ["3.9", "3.9 pF"], ["4.7", "4.7 pF"], ["5.6", "5.6 pF"], ["stub:rg178", "An open stub of RG178 coax"], ["stub:rg316", "An open stub of RG316 coax"], ["stub:rg174", "An open stub of RG174 coax"], ["0", "None: SWR about 1.45"]])}</div>
            </div>
            <p class="note">A dipole is about 73 ohm. A hairpin across its feed and a small capacitor in series with the coax bring it to 50: SWR about 1.15 across the band. The hairpin's short can be moved to tune it once it's built. An open-ended stub of coax can stand in for the capacitor: no part to buy, and it can be trimmed on the VNA.</p>
            <h3 class="plan-h">4. What you'll build it from</h3>
            <div class="field-grid plan-four">
              <div class="field"><label for="w-drod">Rod, mm across</label><input class="num" id="w-drod" inputmode="decimal"></div>
              <div class="field"><label for="w-drmetal">Its metal ${A.help("metal")}</label>${plainSelect("w-drmetal", METAL_OPTIONS)}</div>
            </div>
            </div>
            <div class="row plan-go">
              <div class="field" id="w-effort-wrap" data-for="yagi"><label for="w-effort">How hard to look</label>${plainSelect("w-effort", [["quick", "Quick"], ["normal", "Normal"], ["thorough", "Thorough"]])}</div>
              <button class="btn primary" id="w-run"><span data-for="yagi">Design my antenna</span><span data-for="dipole">Design my dipole</span></button>
              <button class="btn" id="w-back">Back to the design I have open</button>
            </div>
            <p class="note" id="w-status" role="status"></p>
          </div>
        </section>
        <aside class="plan-side">
          <section class="card" aria-label="What happens next">
            <div class="head"><h2>What happens when you press it</h2></div>
            <div class="body"><ol class="plan-steps" id="w-steps"></ol></div>
          </section>
          <section class="card" aria-label="Your goals stay" data-for="yagi">
            <div class="head"><h2>Your answers stay with the design</h2></div>
            <div class="body"><p class="note">They're what it's polished against later, on the Design tab.</p></div>
          </section>
        </aside>
      </div>
    </div>

    <div class="view-plan" id="plan-run" hidden>
      <section class="card" aria-label="Your goals">
        <div class="body row plan-goalbar"><b>Your goals</b><span class="note" id="r-goals"></span>
          <span class="plan-gap"></span><button class="btn small" id="r-change">Change</button><button class="btn small" id="r-explore">Simulate different numbers of rods</button></div>
      </section>
      <section class="card" aria-label="Progress">
        <div class="head"><h2 id="r-title">Designing your antenna</h2><div class="row"><button class="btn small" id="r-stop">Stop</button><button class="btn small" id="r-open-current">Back to the design I have open</button></div></div>
        <div class="body stack">
          <p class="note" id="r-status" role="status"></p>
          <div class="progress"><i id="r-bar"></i></div>
          <p class="note"><b class="st-polished">Polished</b>: final numbers, ready to open. <b class="st-polishing">Polishing</b>: getting better as you watch. <b class="st-found">Found</b>: rough, from the quick search, waiting its turn.</p>
        </div>
      </section>
      <div class="plan-wrap">
        <section class="card plan-main" aria-label="Designs">
          <div class="body"><div class="scroll-x"><table class="tbl plan-table" id="r-table"></table></div><div class="row" style="margin-top:8px"><button class="btn primary" id="r-open-best" hidden></button></div><p class="note" id="r-note" style="margin-top:8px"></p></div>
        </section>
        <section class="card plan-side" aria-label="Watching the polish">
          <div class="head"><h2 id="r-watch-name">Watching</h2><span class="note">live</span></div>
          <div class="body stack">
            <div style="position:relative;height:130px"><canvas id="r-layout" style="position:absolute;inset:0;width:100%;height:100%" aria-label="The design being watched, drawn to scale as it changes"></canvas></div>
            <div class="row plan-gainline"><span class="note">Worst gain in band</span><span class="plan-gain" id="r-gain">–</span><span class="note" id="r-gain-up"></span></div>
            <div style="position:relative;height:110px"><canvas id="r-chart" style="position:absolute;inset:0;width:100%;height:100%" aria-label="Worst gain across the band as the polish goes on"></canvas></div>
            <p class="note">The rods move as it works. Click a row to watch that one.</p>
          </div>
        </section>
      </div>
    </div>`;
  }

  function setStage(stage) {
    OPT.stage = stage;
    const plan = $("#plan-host"), design = $("#view-design");
    if (!plan || !design) return;
    design.hidden = stage !== "antenna";
    plan.hidden = stage === "antenna";
    $("#plan-goals").hidden = stage !== "goals";
    $("#plan-run").hidden = stage !== "run";
    if (stage === "goals") syncGoals();
    if (stage === "run") renderRun();
    if (stage === "antenna") { A.renderPlanCards(); if (A.views.design.refreshResults) A.views.design.refreshResults(); }
  }
  /** Opens the Design tab at one of its screens: "goals", "run" or "antenna". */
  A.showStage = (stage) => { if (S.view !== "design") A.go("design"); setStage(stage); };
  A.planStage = () => OPT.stage;

  let runLayout = null;
  A.mountPlan = (host) => {
    host.innerHTML = planTemplate();
    const g = () => goals();
    A.bindNum($("#w-f0"), { get: () => S.design.f0, min: 1, max: 30000, decimals: 3, set: (v, c) => {
      const d = S.design, dl = v - d.f0;
      d.band = [d.band[0] + dl, d.band[1] + dl]; d.f0 = v; S.cursor = v;
      if (c) A.commit();
      A.designChanged(false);
      $("#w-lo")._refresh(); $("#w-hi")._refresh();
    } });
    A.bindNum($("#w-lo"), { get: () => g().band[0], decimals: 3, min: 1, set: (v) => { g().band[0] = v; } });
    A.bindNum($("#w-hi"), { get: () => g().band[1], decimals: 3, min: 1, set: (v) => { g().band[1] = v; } });
    $("#w-network").onclick = () => A.radio.open();
    A.bindNum($("#w-gain"), { get: () => FIND.target, min: 0.5, max: 30, decimals: 2, set: (v) => { FIND.target = v; } });
    A.bindNum($("#w-to"), Object.assign(optionalNum(() => FIND.gainTo, (v) => { FIND.gainTo = v; }), { decimals: 2 }));
    $("#w-favor").onchange = (e) => { g().favor = e.target.value; syncGoals(); };
    A.bindNum($("#w-swr"), { get: () => g().swrMax, min: 1.01, max: 20, decimals: 2, set: (v) => { g().swrMax = v; } });
    A.bindNum($("#w-fb"), { get: () => g().fbMin, min: 0, max: 60, decimals: 1, set: (v) => { g().fbMin = v; } });
    A.bindNum($("#w-top"), Object.assign(optionalNum(() => FIND.boomTop, (v) => { FIND.boomTop = v; }), { decimals: 0 }));
    A.bindNum($("#w-gap"), { get: () => g().minGap, min: 1, decimals: 0, set: (v) => { g().minGap = v; } });
    A.bindNum($("#w-rod"), { get: rodSize, min: 0.1, max: 100, decimals: 3, set: (v) => { FIND.rod = v; FIND.rodFor = S.design.name; } });
    A.bindNum($("#w-driven"), { get: drivenSize, min: 0.1, max: 100, decimals: 3, set: (v) => { FIND.driven = v; FIND.drivenFor = S.design.name; } });
    $("#w-metal").onchange = (e) => { FIND.metal = e.target.value; FIND.rodFor = S.design.name; };
    $("#w-dmetal").onchange = (e) => { FIND.drivenMetal = e.target.value; FIND.drivenFor = S.design.name; };
    $("#w-wire").onchange = (e) => { S.design.feedWire = e.target.checked ? (S.lastWire || 0.3) : 0; A.commit(); A.designChanged(false); };
    $("#w-effort").onchange = (e) => { g().effort = e.target.value; };
    $("#w-run").onclick = () => (A.kind() === "dipole" ? designDipole() : designIt());
    $("#w-mast").onchange = (e) => { DIP.mast = e.target.value; syncGoals(); };
    $("#w-mount").onchange = (e) => { DIP.mount = e.target.value; syncGoals(); };
    $("#w-tube").onchange = (e) => { DIP.tube = e.target.value; };
    $("#w-coax").onchange = (e) => { DIP.coax = e.target.value; syncGoals(); };
    $("#w-sec").onchange = (e) => { DIP.sections = +e.target.value; syncGoals(); };
    A.bindNum($("#w-mastd"), { get: () => DIP.mastD, min: 5, max: 500, decimals: 1, set: (v) => { DIP.mastD = v; } });
    A.bindNum($("#w-arm"), { get: () => DIP.arm, min: YS.ARM.min, max: 3000, decimals: 0, set: (v) => { DIP.arm = v; } });
    $("#w-cap").onchange = (e) => { DIP.cap = e.target.value; };
    A.bindNum($("#w-drod"), { get: () => DIP.d, min: 0.5, max: 30, decimals: 3, set: (v) => { DIP.d = v; } });
    $("#w-drmetal").onchange = (e) => { DIP.metal = e.target.value; };
    $("#w-back").onclick = () => setStage("antenna");
    $("#r-change").onclick = () => setStage("goals");
    $("#r-explore").onclick = openExplorer;
    $("#r-stop").onclick = () => { OPT.cancel = true; };
    $("#r-open-current").onclick = () => setStage("antenna");
    $("#r-open-best").onclick = () => { const i = bestFit(); if (i >= 0) openEntry(OPT.list[i]); };
    $("#r-table").onclick = (e) => {
      const open = e.target.closest("[data-open]");
      if (open) return openEntry(OPT.list[+open.dataset.open]);
      const tr = e.target.closest("tr[data-i]");
      if (tr) { OPT.watch = +tr.dataset.i; OPT.watchPicked = true; renderRun(); }
    };
    runLayout = new YS.Layout2D($("#r-layout"), { readOnly: true });
    const ro = new ResizeObserver(() => drawWatch());
    ro.observe($("#r-chart"));
  };

  function syncGoals() {
    const g = goals(), D = dipAnswers(), dip = A.kind() === "dipole";
    const side = D.mount === "side";
    $("#w-mount").value = D.mount; $("#w-tube").value = D.tube; $("#w-coax").value = D.coax;
    $("#w-mast-wrap").hidden = !side; $("#w-arm-wrap").hidden = !side; $("#w-tube-wrap").hidden = side; $("#w-coax-wrap").hidden = side;
    $("#w-sec-wrap").hidden = side; $("#w-sec").value = String(D.sections || 1);
    const colin = !side && D.sections > 1;
    $("#w-mast").value = D.mast; $("#w-mastd-wrap").hidden = D.mount === "pod" || (side && D.mast !== "metal"); $("#w-cap").value = String(D.cap); $("#w-drmetal").value = D.metal;
    ["#w-mastd", "#w-arm", "#w-drod"].forEach((q) => { const i = $(q); if (i && document.activeElement !== i) i._refresh(); });
    const ch = !side ? YS.dipole.choke(D.tube, D.coax, S.design.f0) : null;
    $("#w-arm-note").textContent = !side ? `The lower half is the tube, with the coax up its middle to the feed: ${fmt(ch.length, 1)} mm long, a quarter wave of the line inside it (the tube round the coax's braid: ${fmt(ch.z0, 0)} ohm, velocity factor ${fmt(ch.vf, 3)}), so it chokes off current that would run on down the coax. ${D.mount === "pod" ? "It stands on an insert in the pod's top hole, the coax going on down into the pod." : "It stands on a cap over the mast's top, the coax going on down the mast."} The model takes the choke as perfect, and leaves out what's below it.${colin ? ` Above the feed the rod goes on in ${D.sections} sections, joined end to end in printed joints, each joint bridged by a short loop of 1 mm copper wire folded down beside the rod below: it sets each section's current in step with the one below, so they add toward the horizon. The beam is flatter than a dipole's, so it reaches further level, less above and below.` : ""}`
      : D.mast === "metal"
      ? `A metal mast beside it reflects: about 80 to 100 mm out, the dipole beams away from the mast, about 9 dB stronger away than toward it; from 250 mm it's rounder (about 6 dB from strongest to weakest), and rounder still further out. The mast clamp holds it ${YS.ARM.min} mm out at least.`
      : `A wooden or fiberglass pole doesn't change the pattern. The mast clamp holds the dipole ${YS.ARM.min} mm out at least, which keeps the coax at right angles to it for a while, as it should be.`;
    $("#w-steps").innerHTML = dip && colin
      ? `<li><b>It sizes the collinear.</b> Each section's length, the stubs' and the match together, for the most gain toward the horizon, matched tight at your target (SWR 1.1 or better) and looser across the band (1.5). It takes a little longer: half a minute or so.</li><li><b>You open it.</b> See its pattern, its cut list and its printed joints.</li>`
      : dip
      ? `<li><b>It sizes the dipole.</b> The rod's length, and the hairpin and capacitor that match it, for the best SWR across your band, with the mast in the model.</li><li><b>You open it.</b> See its pattern round the mast, change anything by hand, and print its arm on the 3D print tab.</li>`
      : `<li><b>It finds.</b> A quick search for each number of rods: the design that reaches your gain within your limits, as you asked.</li><li><b>It polishes.</b> Each one found is then tuned carefully, so what you open is finished, not rough. You can watch the rods move as it works.</li><li><b>You choose.</b> Open the one you like. You can still change any rod by hand, and polish it again.</li>`;
    ["#w-f0", "#w-lo", "#w-hi", "#w-gain", "#w-to", "#w-swr", "#w-fb", "#w-top", "#w-gap", "#w-rod", "#w-driven"].forEach((q) => { const i = $(q); if (i && document.activeElement !== i) i._refresh(); });
    $("#w-favor").value = g.favor;
    $("#w-top-wrap").hidden = g.favor === "gain";
    $("#w-metal").value = rodMetal();
    $("#w-dmetal").value = drivenMetal();
    $("#w-wire").checked = S.design.feedWire > 0;
    $("#w-effort").value = EFFORT[g.effort] && g.effort !== "deep" ? g.effort : "normal";
    $("#w-run").disabled = OPT.running;
    $("#w-status").textContent = OPT.running ? "It's still working on the last request. Stop it on the Designing screen first." : "";
  }

  /* ---------- finding, then polishing each one ---------- */
  function polishGoals(boom, range) {
    const g = goals(), favoured = g.favor !== "gain";
    return Object.assign({}, g, { range: range || "near", locks: range ? g.locks : {}, changeLengths: range ? g.changeLengths : true, changeSpacing: range ? g.changeSpacing : true,
      boomMax: boom, limitBoom: true, gainMin: FIND.target + 0.02, gainMax: favoured ? FIND.gainTo : 0 });
  }

  /** A short build check: of builds with rods cut and placed a little off, and the driven element trimmed on a VNA, how many keep SWR under the limit at the target. */
  async function forgivingOf(design) {
    const solver = YS.toSolver(design), chunks = Math.max(1, A.pool.batchCount), each = Math.ceil(FORGIVING.builds / chunks), jobs = [];
    for (let i = 0; i < chunks; i++) jobs.push(A.pool.run("monteCarlo", { solver, tol: { rod: FORGIVING.rod, pos: FORGIVING.pos, bend: 0, trim: true, count: each, seed: 500 + i * 31, f0: design.f0 } }));
    const res = (await Promise.all(jobs)).flat(), good = res.filter((r) => r.swr <= goals().swrMax).length, share = good / res.length;
    return { good, n: res.length, word: share >= 0.9 ? "Yes" : share >= 0.6 ? "Mostly" : "Fussy" };
  }

  /** A vertical dipole from the answers: its rod and match sized on the workers, then opened. */
  async function designDipole() {
    if (OPT.running) return;
    const D = dipAnswers(), d = S.design, g = goals(), status = $("#w-status");
    const cap = D.cap === "auto" || String(D.cap).indexOf("stub:") === 0 ? D.cap : +D.cap;
    const colin = D.mount !== "side" && D.sections > 1;
    const base = YS.dipole.blank({ f0: d.f0, band: g.band, d: D.d, material: D.metal, gap: d.gap, radio: d.radio, cap, mount: D.mount, tube: D.tube, coax: D.coax, sections: D.mount === "side" ? 1 : D.sections,
      mast: { on: D.mast === "metal", d: D.mastD, behind: Math.max(YS.ARM.min, D.arm), length: 2000 } });
    OPT.running = true; $("#w-run").disabled = true;
    status.textContent = colin ? "Sizing the collinear's sections, its stubs and its match…" : "Sizing the dipole and its match across your band…";
    try {
      const r = await YS.dipole.sizeOn(A.pool, base, cap);
      A.loadDesign(YS.makeDesign(r.design), true);
      DIP.for = null;
      setStage("antenna");
      if (colin) A.toast(`${fmt(r.gain, 1)} dBi toward the horizon; SWR ${fmt(r.atF0, 2)} at ${fmt(r.design.f0, 3)} MHz, ${fmt(r.worst, 2)} or better across the band` + (r.stub ? `, with a ${fmt(r.stub.length, 1)} mm ${YS.CABLES[r.stub.cable].name} stub` : r.cap ? `, with a ${r.cap} pF capacitor` : ", with no match"));
      else A.toast(`SWR ${fmt(r.worst, 2)} or better across ${fmt(g.band[0], 1)} to ${fmt(g.band[1], 1)} MHz` + (r.stub ? `, with a ${fmt(r.stub.length, 1)} mm ${YS.CABLES[r.stub.cable].name} stub and a ${fmt(r.design.hairpin.length, 1)} mm hairpin` : r.cap ? `, with a ${r.cap} pF capacitor and a ${fmt(r.design.hairpin.length, 1)} mm hairpin` : ", with no match"));
    } catch (e) {
      status.textContent = "That didn't work: " + e.message;
    } finally {
      OPT.running = false; $("#w-run").disabled = false;
    }
  }

  async function designIt() {
    if (OPT.running) return;
    const g = goals(), d = S.design;
    if (!(g.band[1] > g.band[0])) { $("#w-status").textContent = "Check the band: its top should be above its bottom."; return; }
    if (FIND.gainTo && FIND.gainTo <= FIND.target) { $("#w-status").textContent = "Check the gain: the second number should be above the first."; return; }
    OPT.running = true; OPT.cancel = false; OPT.list = []; OPT.watch = -1; OPT.watchPicked = false;
    Object.assign(FIND, { running: true, rows: [], best: null, tooHigh: 0, bar: 0, started: performance.now(), status: "Searching for each number of rods…" });
    setStage("run");
    const effort = EFFORT[g.effort] || EFFORT.normal;
    try {
      // the model's settings come along, so that the design found is the one you'll then see
      const settings = {};
      ["f0", "z0", "polarization", "endCap", "feedWire", "boomFace", "mast", "cable", "ground", "radio"].forEach((k) => { if (d[k] !== undefined) settings[k] = JSON.parse(JSON.stringify(d[k])); });
      const res = await YS.findForGain(A.pool, { f0: d.f0, d: rodSize(), material: rodMetal(), gap: d.gap, driven: { d: drivenSize(), material: drivenMetal() }, settings },
        { band: g.band.slice(), fbMin: g.fbMin, swrMax: g.swrMax, minGap: g.minGap, changeLengths: true, changeSpacing: true, seed: 7, favor: g.favor, gainMax: FIND.gainTo, boomTop: FIND.boomTop }, FIND.target, {
          cancelled: () => OPT.cancel,
          onProgress: (p) => {
            FIND.rows = p.rows.slice();
            OPT.list = FIND.rows.map((r) => ({ rough: r, state: "found" }));
            FIND.bar = Math.min(30, 30 * p.tries / (p.tries + 6));
            FIND.status = `Finding: tried ${p.last.rods} rods on ${fmt(p.last.boom, 0)} mm, ${fmt(p.last.gain, 2)} dBd. ${fmt((performance.now() - FIND.started) / 1000, 0)} s so far.`;
            renderRun();
          },
        });
      Object.assign(FIND, { rows: res.rows, best: res.best, tooHigh: res.tooHigh });
      OPT.list = res.rows.map((r) => ({ rough: r, state: "found" }));
      const found = (performance.now() - FIND.started) / 1000;
      if (!OPT.list.length) FIND.status = noneFound();
      // then each one polished in turn, rods ascending, as the table lists them
      for (let i = 0; i < OPT.list.length && !OPT.cancel; i++) {
        const entry = OPT.list[i];
        entry.state = "polishing"; entry.pct = 0;
        if (!OPT.watchPicked || OPT.list[OPT.watch].state !== "polishing") { OPT.watch = i; OPT.watchPicked = false; }
        FIND.status = `Found ${OPT.list.length} design${OPT.list.length > 1 ? "s" : ""} in ${fmt(found, 0)} s. Polishing them now: ${i} done, 1 under way.`;
        renderRun();
        const out = await YS.optimise(A.pool, entry.rough.design, polishGoals(entry.rough.boom), effort, {
          cancelled: () => OPT.cancel,
          onProgress: (p) => {
            entry.pct = Math.min(1, p.gen / p.gens);
            entry.live = YS.applyToDesign(entry.rough.design, p.solver);
            entry.best = p.best; entry.history = p.history.slice();
            FIND.bar = 30 + 70 * (i + entry.pct) / OPT.list.length;
            renderRun();
          },
        });
        entry.polished = out; entry.live = out.design; entry.state = OPT.cancel ? "stopped" : "polished";
        if (!OPT.cancel) entry.forgiving = await forgivingOf(out.design).catch(() => null);
        renderRun();
      }
      OPT.list.forEach((e) => { if (e.state === "polishing") e.state = "stopped"; });
      if (OPT.list.length) FIND.status = OPT.cancel ? "Stopped. Polished ones are final; the rest are as the quick search found them, and open as they are." : `Done in ${fmt((performance.now() - FIND.started) / 1000, 0)} s. Open the one you like.`;
    } catch (e) {
      FIND.status = e.message;
    }
    FIND.running = false; FIND.bar = 100; OPT.running = false;
    renderRun();
    A.renderPlanCards();
  }

  function noneFound() {
    if (FIND.tooHigh) return `That's more than ${FIND.tooHigh} rods can reach, the most this searches. Try a lower gain.`;
    const b = FIND.best;
    return (OPT.cancel ? "Stopped before reaching it." : "It didn't reach that under these limits.") + (b ? ` The most it found was ${fmt(b.gain, 2)} dBd, on ${b.rods} rods and ${fmt(b.boom, 0)} mm. Try a lower gain, a narrower band or looser limits.` : "");
  }

  /** The polished one that best fits what was asked: of those meeting every limit, the shortest boom or the best of what's favoured. */
  function bestFit() {
    const g = goals(), done = (OPT.list || []).map((e, i) => ({ e, i })).filter(({ e }) => e.state === "polished");
    const meets = done.filter(({ e }) => !shortfalls({ worstGain: e.polished.parts.worstGain, worstSwr: e.polished.parts.worstSwr, minFb: e.polished.parts.minFb }).length);
    const pool = meets.length ? meets : done;
    if (!pool.length) return -1;
    const score = ({ e }) => { const p = e.polished.parts; return g.favor === "swr" ? p.worstSwr : g.favor === "fb" ? -p.minFb : g.favor === "both" ? p.worstSwr - p.minFb / 20 : YS.boomLength(e.polished.design); };
    return pool.reduce((a, b) => (score(b) < score(a) ? b : a)).i;
  }

  function renderRun() {
    if (!$("#r-table")) return;
    const list = OPT.list || [], best = bestFit();
    $("#r-goals").textContent = goalsLine();
    $("#r-title").textContent = OPT.running ? "Designing your antenna" : list.length ? "Designs for your goals" : "Designing your antenna";
    $("#r-status").textContent = FIND.status;
    $("#r-bar").style.width = FIND.bar + "%";
    $("#r-stop").disabled = !OPT.running;
    const num = (v, dec, rough) => `<td${rough ? ' class="rough"' : ""}>${v === undefined ? "–" : fmt(v, dec)}</td>`;
    $("#r-table").innerHTML = list.length ? `<thead><tr><th>Rods</th><th>State</th><th>Boom, mm</th><th>Worst gain, dBd</th><th>Worst SWR</th><th>Worst F/B, dB</th><th>Forgiving? ${A.help("forgiving")}</th><th></th></tr></thead><tbody>` + list.map((e, i) => {
      const p = e.polished ? e.polished.parts : e.best || e.rough && { worstGain: e.rough.gain, worstSwr: e.rough.swr, minFb: e.rough.fb };
      const design = e.polished ? e.polished.design : e.live || e.rough.design, rough = e.state !== "polished";
      const state = { found: ["Found", "st-found"], polishing: [`Polishing, ${Math.round(100 * (e.pct || 0))}%`, "st-polishing"], polished: ["Polished", "st-polished"], stopped: ["Stopped, rough", "st-found"] }[e.state];
      const canOpen = e.state === "polished" || (!OPT.running && e.state !== "polishing");
      const forgiving = e.forgiving ? `<td class="plan-word" title="${e.forgiving.good} of ${e.forgiving.n} simulated builds keep SWR under ${fmt(goals().swrMax, 2)} at the target">${e.forgiving.word}</td>` : `<td class="plan-word rough">${e.state === "polished" ? "checking…" : "after polishing"}</td>`;
      return `<tr data-i="${i}" class="${i === OPT.watch ? "watching" : ""}${i === best ? " best" : ""}"><td class="plan-word">${e.rough.rods}${i === best ? ' <span class="badge">Best fit</span>' : ""}</td><td class="plan-word ${state[1]}">${state[0]}</td>` +
        num(YS.boomLength(design), 0, rough) + num(p && p.worstGain, 2, rough) + num(p && p.worstSwr, 2, rough) + num(p && p.minFb, 1, rough) + forgiving +
        `<td><button class="btn small${i === best ? " primary" : ""}" data-open="${i}" ${canOpen ? "" : "disabled"} aria-label="Open the ${e.rough.rods}-rod design">Open</button></td></tr>`;
    }).join("") + "</tbody>" : "";
    // the table scrolls sideways on a phone, so the best fit's Open is also under it, in reach
    $("#r-open-best").hidden = best < 0;
    if (best >= 0) $("#r-open-best").textContent = `Open the best fit: ${list[best].rough.rods} rods, ${fmt(YS.boomLength(list[best].polished.design), 0)} mm`;
    $("#r-note").textContent = list.length ? "Grey numbers are rough and will change as it polishes. Forgiving: a short Build check of each polished design, with rods cut and placed ±0.3 mm and the driven element trimmed on a VNA." : "";
    drawWatch();
  }

  function drawWatch() {
    const list = OPT.list || [], e = list[OPT.watch];
    if (!$("#r-chart")) return;
    $("#r-watch-name").textContent = e ? `Watching: ${e.rough.rods} rods` : "Watching";
    if (runLayout) runLayout.set(e ? e.live || e.rough.design : S.design, null);
    const start = e ? e.rough.gain : NaN, now = e ? (e.polished ? e.polished.parts.worstGain : e.best ? e.best.worstGain : e.rough.gain) : NaN;
    $("#r-gain").textContent = isFinite(now) ? `${fmt(now, 2)} dBd` : "–";
    $("#r-gain-up").textContent = isFinite(now) && isFinite(start) && Math.abs(now - start) >= 0.005 ? `${now > start ? "+" : "−"}${fmt(Math.abs(now - start), 2)} since found` : "";
    const T = YS.tokens();
    YS.drawLines($("#r-chart"), { yLabel: "dBd", xLabel: "designs tried", empty: "The climb in gain shows here as it polishes",
      series: e && e.history && e.history.length ? [{ name: "Best", color: T.s1, pts: e.history }] : [] });
  }

  function designName(rods) { return `${rods}-element ${Math.round(S.design.f0)} MHz, ${fmt(FIND.target, 2)} dBd`; }

  function openEntry(e) {
    const g = goals(), design = e.polished ? e.polished.design : e.rough.design;
    const name = designName(e.rough.rods);
    const next = Object.assign(JSON.parse(JSON.stringify(design)), { name, band: g.band.slice() });
    delete next.tune;      // any readings were of the antenna this replaces
    const keep = Object.assign({}, g);
    FIND.rodFor = name; FIND.drivenFor = name;
    A.loadDesign(next, true);
    OPT.goals = Object.assign(keep, { forDesign: name, bandWas: next.f0 + ":" + next.band, boomMax: Math.round(YS.boomLength(next)) });
    setStage("antenna");
    A.toast(e.polished ? "Design opened. Undo brings the old one back." : "Opened as the quick search found it, not polished. Polish it on the right. Undo brings the old one back.");
  }

  /* ---------- the cards on the antenna screen: the goals, and polishing a design again ---------- */
  A.planCards = () => `
    <section class="card" aria-label="Your goals">
      <div class="head"><h2>Your goals</h2><button class="btn small" id="gc-change">Change</button></div>
      <div class="body stack">
        <p class="note" id="gc-text"></p>
        <p id="gc-status"></p>
        <div class="row"><button class="btn primary" id="gc-design">Design an antenna for me</button><button class="btn small" id="gc-back" hidden></button></div>
        <div class="row" id="gc-explore-row" data-for="yagi"><button class="btn small" id="gc-explore">Simulate different numbers of rods</button></div>
      </div>
    </section>`;

  A.polishCard = () => `
    <section class="card" aria-label="Polish this design" id="pc-card">
      <div class="head"><h2 id="pc-title">Polish this design</h2></div>
      <div class="body stack">
        <p class="note" id="pc-why"></p>
        <div class="row"><button class="btn primary" id="pc-run">Polish it</button><button class="btn small" id="pc-stop" disabled>Stop</button></div>
        <div class="progress"><i id="pc-bar"></i></div>
        <div class="row plan-gainline" id="pc-live" hidden><span class="note">Worst gain in band</span><span class="plan-gain" id="pc-gain"></span><span class="note" id="pc-up"></span></div>
        <div style="position:relative;height:90px" id="pc-chart-box" hidden><canvas id="pc-chart" style="position:absolute;inset:0;width:100%;height:100%" aria-label="Worst gain across the band as the polish goes on"></canvas></div>
        <p class="note" id="pc-status" role="status"></p>
        <div id="pc-result" class="stack"></div>
        <details id="pc-how" data-for="yagi"><summary>How it may change the design</summary>
          <div class="stack" style="margin-top:8px">
            <div class="field-grid">
              <div class="field"><label for="pc-range">Search</label>${plainSelect("pc-range", [["near", "Close to this design"], ["wide", "Anywhere sensible"]])}</div>
              <div class="field"><label for="pc-effort">How hard to look</label>${plainSelect("pc-effort", [["quick", "Quick"], ["normal", "Normal"], ["thorough", "Thorough"], ["deep", "Deep"]])}</div>
              <div class="field"><label for="pc-boom">Longest boom, mm</label><input class="num" id="pc-boom" inputmode="decimal"></div>
            </div>
            <label class="check"><input type="checkbox" id="pc-len"> It may change rod lengths</label>
            <label class="check"><input type="checkbox" id="pc-spc"> It may change spacing</label>
            <p class="note">Hold particular rods where they are:</p>
            <div class="scroll-x"><table class="rods" id="pc-locks"></table></div>
          </div>
        </details>
      </div>
    </section>`;

  A.bindPlanCards = () => {
    $("#gc-change").onclick = () => setStage("goals");
    $("#gc-design").onclick = () => setStage("goals");
    $("#gc-back").onclick = () => setStage("run");
    $("#gc-explore").onclick = openExplorer;
    $("#pc-run").onclick = () => (YS.dipole.isDipole(S.design) ? matchAgain() : polishAgain());
    $("#pc-stop").onclick = () => { OPT.cancel = true; };
    $("#pc-range").onchange = (e) => { goals().range = e.target.value; };
    $("#pc-effort").onchange = (e) => { goals().effort = e.target.value; };
    $("#pc-len").onchange = (e) => { goals().changeLengths = e.target.checked; };
    $("#pc-spc").onchange = (e) => { goals().changeSpacing = e.target.checked; };
    A.bindNum($("#pc-boom"), { get: () => goals().boomMax, min: 1, decimals: 0, set: (v) => { goals().boomMax = v; } });
  };

  /** The goals card and the polish card, as the design open now stands. */
  A.renderPlanCards = () => {
    if (!$("#gc-text")) return;
    const dip = YS.dipole.isDipole(S.design);
    $("#pc-run").textContent = dip ? "Match it again" : "Polish it";
    if (dip) return dipoleCards();
    const g = goals(), c = currentParts(), short = shortfalls(c);
    $("#gc-text").textContent = goalsLine();
    $("#gc-status").innerHTML = !c ? "" : short.length ? `<span class="pill warn">Not yet</span> <span class="note">${esc(short.join("; "))}.</span>` : `<span class="pill good">Meets them all</span>`;
    const n = (OPT.list || []).length;
    $("#gc-back").hidden = !n;
    $("#gc-back").textContent = `Back to the ${n} design${n > 1 ? "s" : ""} it found`;
    $("#gc-design").disabled = OPT.running && !OPT.polishing;
    if (!OPT.polishing && !OPT.result) {
      $("#pc-title").textContent = short.length ? "Polish this design" : "Polish this design";
      $("#pc-why").textContent = !c ? "" : short.length ? `Against your goals, ${short.join("; ")}. Polishing tunes the rods to bring it back within them, close to how it is now.` : "It meets your goals. Polishing may still improve it, and you choose whether to keep what it finds.";
    }
    $("#pc-run").disabled = OPT.running;
    $("#pc-stop").disabled = !OPT.polishing;
    $("#pc-range").value = g.range; $("#pc-effort").value = g.effort; $("#pc-len").checked = g.changeLengths; $("#pc-spc").checked = g.changeSpacing;
    if (document.activeElement !== $("#pc-boom")) $("#pc-boom")._refresh();
    const sorted = S.design.elements.slice().sort((a, b) => a.x - b.x);
    $("#pc-locks").innerHTML = `<thead><tr><th>Rod</th><th>Hold length</th><th>Hold gap to next</th></tr></thead><tbody>` + sorted.map((e, i) => {
      const l = g.locks[e.id] || {};
      return `<tr data-id="${e.id}"><td class="rod-name">${esc(e.name)}</td><td><input type="checkbox" data-k="L" aria-label="Hold ${esc(e.name)} length" ${l.L ? "checked" : ""}></td><td>${i + 1 < sorted.length ? `<input type="checkbox" data-k="x" aria-label="Hold the gap after ${esc(e.name)}" ${l.x ? "checked" : ""}>` : ""}</td></tr>`;
    }).join("") + "</tbody>";
    $$("#pc-locks input").forEach((cb) => {
      cb.onchange = () => {
        const id = cb.closest("tr").dataset.id, l = g.locks[id] || (g.locks[id] = {});
        l[cb.dataset.k] = cb.checked;
      };
    });
  };

  /** The two cards for a vertical dipole: what it is and how well it matches, and sizing its match again after a change. */
  function dipoleCards() {
    const d = S.design, pin = d.hairpin && d.hairpin.length > 0 ? d.hairpin : null, cap = d.seriesC > 0 ? d.seriesC : 0, st = d.seriesStub && d.seriesStub.length > 0 ? d.seriesStub : null;
    const band = (S.rows || []).filter((r) => r.f >= d.band[0] && r.f <= d.band[1]), worst = band.length ? Math.max.apply(null, band.map((r) => r.swr)) : NaN;
    const sv = YS.dipole.isSleeve(d) ? YS.dipole.halves(d) : null, co = YS.dipole.isCollinear(d) ? d.elements[0].colin : null;
    const match = pin && st ? `matched by a ${fmt(st.length, 1)} mm open stub of ${YS.CABLES[st.cable].name} and a ${fmt(pin.length, 1)} mm hairpin` : pin && cap ? `matched by a ${cap} pF capacitor and a ${fmt(pin.length, 1)} mm hairpin` : "with no match";
    if (co) {
      const f0row = (S.rows || []).reduce((b, r) => (!b || Math.abs(r.f - d.f0) < Math.abs(b.f - d.f0) ? r : b), null);
      $("#gc-text").textContent = `A collinear of ${co.sections.length} sections for ${fmt(d.f0, 3)} MHz, on ${d.mount === "pod" ? "the node pod's top" : "top of a mast"}: its ${fmt(sv.low, 1)} mm sleeve below the feed, then ${co.sections.map((v) => fmt(v, 1)).join(", ")} mm sections above (joint to joint), each joint bridged by a ${fmt(co.stub.length, 1)} mm stub; ${fmt(d.elements[0].L, 0)} mm tip to tip, ${match}.`;
      const [c2, w2] = A.swrClass(f0row ? f0row.swr : NaN);
      $("#gc-status").innerHTML = f0row ? `<span class="pill ${c2}">${w2}</span> <span class="note">SWR ${fmt(f0row.swr, 2)} at ${fmt(d.f0, 3)} MHz, ${fmt(worst, 2)} or better across the band.</span>` : "";
      $("#gc-back").hidden = true;
      $("#gc-design").disabled = OPT.running;
      $("#pc-title").textContent = "Size it again";
      $("#pc-why").textContent = "After a change by hand (the gap, the rod, the capacitor), this sizes the sections, the stubs and the match again: the most gain toward the horizon, SWR 1.1 or better at the target and 1.5 across the band.";
      $("#pc-live").hidden = true; $("#pc-chart-box").hidden = true;
      $("#pc-run").disabled = OPT.running;
      $("#pc-stop").disabled = true;
      return;
    }
    $("#gc-text").textContent = `A ${sv ? "sleeve" : "vertical"} dipole for ${fmt(d.band[0], 3)} to ${fmt(d.band[1], 3)} MHz, ${sv ? `on ${d.mount === "pod" ? "the node pod's top" : "top of a mast"}, its rod ${fmt(sv.up, 1)} mm above the feed and its ${fmt(sv.low, 1)} mm sleeve below` : d.mast.on ? `on an arm ${Math.round(d.mast.behind)} mm from a ${fmt(d.mast.d, 0)} mm metal mast` : "on a pole that isn't metal"}, ${pin && st ? `matched by a ${fmt(st.length, 1)} mm open stub of ${YS.CABLES[st.cable].name} and a ${fmt(pin.length, 1)} mm hairpin` : pin && cap ? `matched by a ${cap} pF capacitor and a ${fmt(pin.length, 1)} mm hairpin` : "with no match"}.`;
    const [cls, word] = A.swrClass(worst);
    $("#gc-status").innerHTML = isFinite(worst) ? `<span class="pill ${cls}">${word}</span> <span class="note">SWR ${fmt(worst, 2)} or better across the band.</span>` : "";
    $("#gc-back").hidden = true;
    $("#gc-design").disabled = OPT.running;
    $("#pc-title").textContent = "Match it again";
    $("#pc-why").textContent = `After a change by hand (the mast's distance, the rod, the gap, the ${st ? "stub's coax" : "capacitor"}), this sizes the rod's length and the hairpin again for the best SWR across the band, ${st ? "and the stub's length" : "keeping the capacitor"}.`;
    $("#pc-live").hidden = true; $("#pc-chart-box").hidden = true;
    $("#pc-run").disabled = OPT.running;
    $("#pc-stop").disabled = true;
  }

  /** A vertical dipole's rod and hairpin, sized again for the design as it stands now. */
  async function matchAgain() {
    if (OPT.running) return;
    const d = S.design, cap = d.seriesStub && d.seriesStub.length > 0 ? "stub:" + d.seriesStub.cable : d.seriesC > 0 ? d.seriesC : d.hairpin ? "auto" : 0;
    OPT.running = true; A.renderPlanCards();
    $("#pc-status").textContent = "Sizing its match across the band…";
    try {
      const r = await YS.dipole.sizeOn(A.pool, d, cap);
      A.commit();
      S.design.elements[0].L = r.design.elements[0].L; S.design.hairpin = r.design.hairpin; S.design.seriesC = r.design.seriesC; S.design.seriesStub = r.design.seriesStub || null;
      if (r.design.elements[0].colin) S.design.elements[0].colin = r.design.elements[0].colin;
      A.commit(); A.designChanged(true);
      $("#pc-status").textContent = r.design.elements[0].colin ? `Done: ${fmt(r.gain, 1)} dBi toward the horizon, SWR ${fmt(r.atF0, 2)} at the target and ${fmt(r.worst, 2)} or better across the band. Undo brings the old one back.` : `Done: SWR ${fmt(r.worst, 2)} or better across the band. Undo brings the old one back.`;
    } catch (e) {
      $("#pc-status").textContent = "That didn't work: " + e.message;
    } finally {
      OPT.running = false; A.renderPlanCards();
    }
  }

  /** Polishes the design open now, from where it is, and shows the rods move in the drawing as it works. Nothing changes until it's accepted. */
  async function polishAgain() {
    if (OPT.running) return;
    const g = goals(), started = performance.now(), from = S.design, startGain = currentParts() ? currentParts().worstGain : NaN;
    OPT.running = true; OPT.polishing = true; OPT.cancel = false; OPT.result = null;
    $("#pc-result").innerHTML = "";
    $("#pc-live").hidden = false; $("#pc-chart-box").hidden = false;
    $("#pc-why").textContent = "Polishing. The drawing shows its best design so far.";
    A.renderPlanCards();
    const T = YS.tokens();
    const show = (gain, history) => {
      $("#pc-gain").textContent = `${fmt(gain, 2)} dBd`;
      $("#pc-up").textContent = isFinite(startGain) && Math.abs(gain - startGain) >= 0.005 ? `${gain > startGain ? "+" : "−"}${fmt(Math.abs(gain - startGain), 2)}` : "";
      YS.drawLines($("#pc-chart"), { yLabel: "dBd", xLabel: "designs tried", empty: "", series: history && history.length ? [{ name: "Best", color: T.s1, pts: history }] : [] });
    };
    try {
      const res = await YS.optimise(A.pool, from, polishGoals(g.boomMax, g.range), EFFORT[g.effort] || EFFORT.normal, {
        cancelled: () => OPT.cancel,
        onProgress: (p) => {
          $("#pc-bar").style.width = Math.min(100, 100 * p.gen / p.gens) + "%";
          $("#pc-status").textContent = p.polishing ? "Finishing at higher accuracy…" : `Worst SWR ${p.best.worstSwr.toFixed(2)} · lowest F/B ${p.best.minFb.toFixed(1)} dB`;
          show(p.best.worstGain, p.history);
          if (A.views.design.preview) A.views.design.preview(YS.applyToDesign(from, p.solver));
        },
      });
      res.seconds = (performance.now() - started) / 1000;
      OPT.result = res;
      show(res.parts.worstGain, res.history);
      $("#pc-bar").style.width = "100%";
      const favoured = g.favor !== "gain", shortGain = favoured && res.parts.worstGain < FIND.target - 0.01 ? ` It couldn't hold ${fmt(FIND.target, 2)} dBd here, so its gain is what it could reach. A longer boom or another rod may help.` : "";
      $("#pc-status").textContent = (OPT.cancel ? "Stopped. This is the best it had found." : `Done in ${fmt(res.seconds, 0)} s.`) + shortGain;
      renderOptResult();
    } catch (e) {
      $("#pc-status").textContent = e.message;
    }
    OPT.running = false; OPT.polishing = false;
    A.renderPlanCards();
  }

  function renderOptResult() {
    const host = $("#pc-result"), R = OPT.result;
    if (!host || !R) return;
    const c = currentParts(), n = R.design, boom = YS.boomLength(n);
    const cmp = (lab, a, b, dec, higherBetter) => {
      const cls = a === undefined || Math.abs(b - a) < Math.pow(10, -dec) ? "" : (b > a) === higherBetter ? "better" : "worse";
      return `<tr><td>${lab}</td><td>${a === undefined ? "–" : fmt(a, dec)}</td><td class="${cls}">${fmt(b, dec)}</td></tr>`;
    };
    $("#pc-why").textContent = "It's shown in the drawing. Use it, or keep yours.";
    host.innerHTML = `
      <div class="scroll-x"><table class="tbl"><thead><tr><th>Across the band</th><th>Yours</th><th>Polished</th></tr></thead><tbody>
        ${cmp("Worst gain, dBd", c && c.worstGain, R.parts.worstGain, 2, true)}
        ${cmp("Worst SWR", c && c.worstSwr, R.parts.worstSwr, 2, false)}
        ${cmp("Lowest F/B, dB", c && c.minFb, R.parts.minFb, 1, true)}
        ${cmp("Boom, mm", c && c.boom, boom, 1, false)}
      </tbody></table></div>
      <div class="row">
        <button class="btn primary" id="opt-apply">Use this design</button>
        <button class="btn" id="opt-apply-pin">Use it and pin mine</button>
        <button class="btn" id="opt-keep">Keep mine</button>
      </div>
      <p class="note">${R.evals.toLocaleString()} designs tried in ${fmt(R.seconds, 1)} s, then finished at higher accuracy. Lengths are rounded to 0.1 mm.</p>`;
    $("#opt-apply").onclick = () => applyResult(false);
    $("#opt-apply-pin").onclick = () => applyResult(true);
    $("#opt-keep").onclick = () => { OPT.result = null; host.innerHTML = ""; hideLive(); if (A.views.design.preview) A.views.design.preview(null); A.renderPlanCards(); };
  }

  function hideLive() { $("#pc-live").hidden = true; $("#pc-chart-box").hidden = true; $("#pc-bar").style.width = "0%"; $("#pc-status").textContent = ""; }

  function applyResult(pin) {
    const d = OPT.result.design;
    if (pin && S.rows) S.pinned = { name: S.design.name + " (before)", rows: S.rows };
    d.tune = S.design.tune;
    S.design = JSON.parse(JSON.stringify(d));
    OPT.result = null;
    $("#pc-result").innerHTML = "";
    hideLive();
    if (A.views.design.preview) A.views.design.preview(null);
    A.commit();
    A.designChanged(true);
    const b = $("#pin");
    if (b) b.textContent = S.pinned ? "Unpin" : "Pin";
    A.toast("Design updated. Undo brings the old one back.");
  }

  /* ---------- simulating different numbers of rods: a window of its own ---------- */
  function openExplorer() {
    const g = goals();
    A.modal(`<h2>Simulate different numbers of rods</h2>
      <p>For each number of rods and each boom length, the best worst-case gain it can hold across your band within your limits. It shows what a longer boom or another rod buys. Nothing here changes your design unless you open one.</p>
      <div class="field-grid plan-four">
        <div class="field"><label for="x-rods-a">Rods from</label><input class="num" id="x-rods-a" inputmode="numeric"></div>
        <div class="field"><label for="x-rods-b">to (up to 5 more)</label><input class="num" id="x-rods-b" inputmode="numeric"></div>
        <div class="field"><label for="x-boom-a">Boom from, mm</label><input class="num" id="x-boom-a" inputmode="numeric"></div>
        <div class="field"><label for="x-boom-b">to, mm</label><input class="num" id="x-boom-b" inputmode="numeric"></div>
      </div>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="x-run">Simulate</button><button class="btn" id="x-stop" disabled>Stop</button><button class="btn" id="x-close">Close</button></div>
      <div class="progress" style="margin-top:8px"><i id="x-bar"></i></div>
      <p class="note" id="x-status" style="margin-top:6px"></p>
      <div class="legend" id="x-legend"></div>
      <div style="position:relative;height:280px"><canvas id="x-chart" style="position:absolute;inset:0;width:100%;height:100%" aria-label="Gain against boom length, one line per rod count. Click a point to see that design."></canvas></div>
      <div id="x-pick" class="stack" style="margin-top:8px"></div>`, (b, close) => {
      b.querySelector(".modal").classList.add("wide");
      const set = (key, q) => A.bindNum($(q, b), { get: () => goals()[key], set: (v) => { goals()[key] = v; }, min: key.startsWith("rods") ? 3 : 1, max: key.startsWith("rods") ? 30 : 1e6, decimals: 0 });
      set("rodsFrom", "#x-rods-a"); set("rodsTo", "#x-rods-b"); set("boomFrom", "#x-boom-a"); set("boomTo", "#x-boom-b");
      const shut = () => { if (OPT.exploring) OPT.cancel = true; close(); };
      $("#x-close", b).onclick = shut;
      $("#x-run", b).onclick = runExplore;
      $("#x-stop", b).onclick = () => { OPT.cancel = true; };
      $("#x-run", b).disabled = OPT.running;
      const xc = $("#x-chart", b);
      const hitAt = (e) => { const r = xc.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; return (xc._hits || []).find((h) => Math.hypot(h.x - px, h.y - py) < 12); };
      xc.addEventListener("pointermove", (e) => {
        const hit = hitAt(e);
        xc.style.cursor = hit ? "pointer" : "default";
        if (hit) { const v = hit.p.r; A.showTip(`<b>${v.rods} rods, ${v.boom.toFixed(0)} mm boom</b><br><span class="mono">${v.gain.toFixed(2)} dBd worst · SWR ${v.swr.toFixed(2)} worst · F/B ${v.fb.toFixed(1)} dB lowest</span><br>Click to see it below.`, e.clientX, e.clientY); } else A.hideTip();
      });
      xc.addEventListener("pointerleave", () => A.hideTip());
      xc.addEventListener("click", (e) => {
        const hit = hitAt(e);
        if (!hit) return;
        const v = hit.p.r;
        $("#x-pick", b).innerHTML = `<div class="row plan-pick"><span><b>${v.rods} rods, ${fmt(v.boom, 0)} mm</b>: ${fmt(v.gain, 2)} dBd worst in band, SWR ${fmt(v.swr, 2)}, F/B ${fmt(v.fb, 1)} dB</span><button class="btn primary" id="x-open">Open and polish it</button></div><p class="note">These are quick-search numbers. Opening it starts a polish on the Design tab, and you choose whether to keep what it finds.</p>`;
        $("#x-open", b).onclick = () => {
          if (OPT.running) return A.toast("Wait for the search to finish, or stop it.");
          shut();
          openEntry({ rough: { rods: v.rods, boom: v.boom, gain: v.gain, swr: v.swr, fb: v.fb, design: v.design }, state: "found" });
          polishAgain();
        };
      });
      const ro = new ResizeObserver(() => drawExplorer());
      ro.observe(xc);
      drawExplorer();
    });
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
    YS.drawLines(c, { yLabel: "dBd", xLabel: "boom, mm", empty: "Press Simulate to see what each boom can do", series });
    const lg = $("#x-legend");
    if (lg) lg.innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("");
  }

  async function runExplore() {
    if (OPT.running) return;
    const g = goals(), d = S.design;
    const rods = [];
    for (let n = Math.round(g.rodsFrom); n <= Math.round(g.rodsTo) && rods.length < 6; n++) rods.push(n);
    const booms = [];
    for (let i = 0; i < g.boomSteps; i++) booms.push(Math.round(g.boomFrom + (g.boomTo - g.boomFrom) * i / (g.boomSteps - 1)));
    const status = (t) => { const s = $("#x-status"); if (s) s.textContent = t; };
    if (!rods.length || g.boomTo <= g.boomFrom) return status("Check the ranges: the second number should be larger than the first.");
    OPT.running = true; OPT.exploring = true; OPT.cancel = false; OPT.explore = [];
    const buttons = (on) => { const r = $("#x-run"), s = $("#x-stop"); if (r) r.disabled = on; if (s) s.disabled = !on; };
    buttons(true);
    A.renderPlanCards();
    const started = performance.now();
    try {
      const res = await YS.exploreBooms(A.pool, { f0: d.f0, d: rodSize(), material: rodMetal(), gap: d.gap, driven: { d: drivenSize(), material: drivenMetal() } },
        { band: g.band, fbMin: g.fbMin, swrMax: g.swrMax, minGap: g.minGap, changeLengths: true, changeSpacing: true, seed: 7 },
        { rods, booms, gens: 90 }, {
          cancelled: () => OPT.cancel,
          onProgress: (p) => {
            OPT.explore = p.results.slice();
            const bar = $("#x-bar");
            if (bar) bar.style.width = 100 * p.done / p.total + "%";
            status(`${p.done} of ${p.total} done, ${fmt((performance.now() - started) / 1000, 0)} s so far`);
            drawExplorer();
          },
        });
      OPT.explore = res;
      status(`${res.length} designs in ${fmt((performance.now() - started) / 1000, 1)} s. Click a point to see it.`);
      drawExplorer();
    } catch (e) {
      status(e.message);
    }
    OPT.running = false; OPT.exploring = false;
    buttons(false);
    A.renderPlanCards();
  }

  A.plan = { setStage, retheme() { drawWatch(); drawExplorer(); if (runLayout) runLayout.draw(); }, refresh() { if (OPT.stage === "goals") syncGoals(); if (OPT.stage === "run") renderRun(); A.renderPlanCards(); } };

  /* ==================== Build check ==================== */
  const CHK = { tol: { rod: 0.3, pos: 0.3, bend: 0, count: 400, trim: true, pin: 0.5, cap: 0.25, stub: 0.3 }, res: null, sens: null, metric: "valley", running: false, trimFor: null };

  function chkTemplate() {
    return `
    <div class="view view-three" id="view-check">
      <div class="col">
        <section class="card" aria-label="Build errors">
          <div class="head"><h2>How forgiving is this design?</h2></div>
          <div class="body stack">
            <p class="note">Simulates many builds with random errors, to show what you can expect from real parts.</p>
            <div class="field-grid">
              <div class="field"><label for="t-rod">Rod cutting ± mm ${A.help("sigma")}</label><input class="num" id="t-rod" inputmode="decimal"></div>
              <div class="field" data-for="yagi"><label for="t-pos">Hole position ± mm</label><input class="num" id="t-pos" inputmode="decimal"></div>
              <div class="field" data-for="yagi"><label for="t-bend">Rod bends ± degrees ${A.help("bends")}</label><input class="num" id="t-bend" inputmode="decimal"></div>
              <div class="field"><label for="t-n">Builds</label><input class="num" id="t-n" inputmode="numeric"></div>
            </div>
            <div class="field-grid" id="t-match" hidden>
              <div class="field"><label for="t-pin">Hairpin ± mm</label><input class="num" id="t-pin" inputmode="decimal"></div>
              <div class="field" id="t-cap-f"><label for="t-cap">Capacitor ± pF</label><input class="num" id="t-cap" inputmode="decimal"></div>
              <div class="field" id="t-stub-f"><label for="t-stub">Coax stub ± mm</label><input class="num" id="t-stub" inputmode="decimal"></div>
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
          <section class="card" aria-label="${t}"${k === "gain" || k === "fb" ? ' data-for="yagi"' : ""}><div class="head"><h2>${t}</h2></div><div class="stat-line" id="h-${k}-s" style="padding:2px 12px 0">&nbsp;</div><div class="canvas-box" style="margin:4px;min-height:130px"><canvas id="h-${k}"></canvas></div></section>`).join("")}
        </div>
      </div>
      <div class="col">
        <section class="card" aria-label="What each rod does" data-for="yagi">
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
      <p><span class="pill ${cls}">${word}</span> 19 of 20 builds get SWR ${fmt(s.worst, 2)} or better at the target${A.kind() === "dipole" ? "." : `, and gain of at least ${fmt(g.worst, 2)} dBd.`}</p>
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
        jobs.push(A.pool.run("monteCarlo", { solver, tol: { rod: CHK.tol.rod, pos: CHK.tol.pos, bend: CHK.tol.bend, trim: CHK.tol.trim, pin: CHK.tol.pin, cap: CHK.tol.cap, stub: CHK.tol.stub, count: each, seed: 1000 + i * 77, f0: S.design.f0 } }));
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
      A.bindNum($("#t-pin"), { get: () => CHK.tol.pin, set: (v) => { CHK.tol.pin = v; }, min: 0, max: 10, decimals: 2 });
      A.bindNum($("#t-cap"), { get: () => CHK.tol.cap, set: (v) => { CHK.tol.cap = v; }, min: 0, max: 5, decimals: 2 });
      A.bindNum($("#t-stub"), { get: () => CHK.tol.stub, set: (v) => { CHK.tol.stub = v; }, min: 0, max: 10, decimals: 2 });
      $("#t-run").onclick = runCheck;
      $("#s-metric").onchange = (e) => { CHK.metric = e.target.value; drawSens(); };
      const ro = new ResizeObserver(() => { drawHists(); drawSens(); });
      $$("#view-check canvas").forEach((c) => ro.observe(c));
    },
    show() { matchTols(); runSens(); if (CHK.res) drawHists(); else runCheck(); },
    refreshDesign() { CHK.res = null; matchTols(); runSens(); },
    refreshResults() {},
    retheme() { drawHists(); drawSens(); },
  };

  /** The match's tolerances show for a design with a hairpin or a capacitor; a vertical dipole starts untrimmed, as its
      hairpin, not a trim, tunes it, and a perfect trim on every build would hide what the parts' errors do. */
  const d0 = () => S.design;
  function matchTols() {
    const st = d0().seriesStub && d0().seriesStub.length > 0, d = S.design, has = (d.hairpin && d.hairpin.length > 0) || d.seriesC > 0 || st;
    $("#t-match").hidden = !has; $("#t-stub-f").hidden = !st; $("#t-cap-f").hidden = st;
    if (YS.dipole.isDipole(d) && CHK.trimFor !== d.name) { CHK.trimFor = d.name; CHK.tol.trim = false; $("#t-trim").checked = false; }
  }

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
              <div class="field" data-for="yagi"><label for="c-boom">Boom thickness, mm</label><input class="num" id="c-boom" inputmode="decimal"></div>
              <div class="field"><label for="c-allow"><span data-for="yagi">Driven: cut long by, mm</span><span data-for="dipole">Dipole: cut long by, mm</span></label><input class="num" id="c-allow" inputmode="decimal"></div>
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
    if (YS.dipole.isDipole(d)) return renderDipoleSheet(d, driven, half, doneHalf, m, inch, metalNames);
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
        <p><b>Driven element.</b> Cut two rods at ${fmt(half, 1)} mm each. Set them ${fmt(d.gap, 1)} mm apart, which makes ${fmt(2 * half + d.gap, 1)} mm tip to tip, deliberately ${fmt(CUT.allowance, 1)} mm too long. Then file both outer tips equally on the VNA. The model expects about ${fmt(driven.L, 1)} mm tip to tip when it's right (about ${fmt(doneHalf, 2)} mm each), and the coax's leads in the gap usually make it finish a mm or more shorter, so go by the VNA. Set the gap before you trim.</p>
        ${A.radio.sheetLine()}
        <p><b>Accuracy.</b> Cut the other rods to ±0.3 mm and file the ends square. Measure each one with calipers, and keep a note of what you got: the Tune tab can use it.</p>
        <p><b>Before you mount it.</b> A roof or mast job needs care. Stay well clear of power lines, ground the mast and fit lightning protection as your local code asks, and check any permit rules first.</p>
      </div>`;
  }

  /** A vertical dipole's cut list: its two halves, the hairpin and the capacitor, and how they go together. */
  function renderDipoleSheet(d, driven, half, doneHalf, m, inch, metalNames) {
    const pin = d.hairpin && d.hairpin.length > 0 ? d.hairpin : null, cap = d.seriesC > 0 ? d.seriesC : 0, st = d.seriesStub && d.seriesStub.length > 0 ? d.seriesStub : null;
    const cable = st ? YS.CABLES[st.cable].name : "";
    const R = m && S.detail.metrics.cuts ? YS.dipole.roundness(S.detail.metrics) : null;
    if (YS.dipole.isCollinear(d)) return renderColinSheet(d, driven, m, R, inch, metalNames, pin, cap, st, cable);
    if (YS.dipole.isSleeve(d)) return renderSleeveSheet(d, driven, m, R, inch, metalNames, pin, cap, st, cable);
    $("#c-sheet").innerHTML = `
      <h1>${esc(d.name)}</h1>
      <p class="note">${fmt(d.f0, 3)} MHz · vertical dipole${m ? ` · ${fmt(R ? R.max : m.gainDbi, 2)} dBi at its strongest · SWR ${fmt(m.swr, 2)} predicted at ${fmt(m.f, 3)} MHz` : ""} · ${d.mast.on ? `${Math.round(d.mast.behind)} mm from a ${fmt(d.mast.d, 0)} mm metal mast` : "on a pole that isn't metal"}</p>
      <p class="note"><b>Experimental: not built or tested yet.</b> This kind of antenna is designed and checked on the computer only. Sweep it before you trust it.</p>
      <div class="scroll-x"><table class="tbl"><thead><tr><th>Part</th><th>Size, mm</th><th>Made of</th></tr></thead><tbody>
        <tr><td>Dipole</td><td>2 × ${fmt(half, 1)}${inch(half)}, ${fmt(d.gap, 1)} apart</td><td style="font-family:var(--sans)">${fmt(driven.d, 2)} mm ${(metalNames[driven.material || d.material] || "").toLowerCase()} rod</td></tr>
        ${pin ? `<tr><td>Hairpin</td><td>${fmt(pin.length, 1)} long, legs ${fmt(pin.spacing, 1)} apart</td><td style="font-family:var(--sans)">${fmt(pin.d, 1)} mm bare copper wire</td></tr>` : ""}
        ${cap ? `<tr><td>Capacitor</td><td>${cap} pF</td><td style="font-family:var(--sans)">C0G (NP0) chip, 0805 or 0603, 50 V or more</td></tr>` : ""}
        ${st ? `<tr><td>Coax stub</td><td>cut ${fmt(st.length + 2, 1)}, trim to ${fmt(st.length, 1)}</td><td style="font-family:var(--sans)">${cable}, open at its far end</td></tr>` : ""}
      </tbody></table></div>
      <div class="stack" style="max-width:68ch">
        <p><b>The dipole.</b> Cut two rods at ${fmt(half, 1)} mm each. Set them ${fmt(d.gap, 1)} mm apart, upright, which makes ${fmt(2 * half + d.gap, 1)} mm tip to tip, deliberately ${fmt(CUT.allowance, 1)} mm too long. The model expects about ${fmt(driven.L, 1)} mm tip to tip when it's right (about ${fmt(doneHalf, 2)} mm each). Trim both outer tips equally, by the VNA.</p>
        ${pin || cap || st ? `<p><b>The match.</b> ${pin ? `A U of wire across the feed, its legs soldered to the two halves ${fmt((pin.spacing - d.gap) / 2, 1)} mm out from their inner ends and running back along the arm, away from the dipole, shorted ${fmt(pin.length, 1)} mm along. ` : ""}${cap ? `The capacitor in series with the coax's centre conductor, to the upper half; the shield to the lower half. ` : ""}${st ? `In place of a capacitor, the open stub of ${cable} in series: the feed's centre conductor to the stub's braid, the stub's centre conductor to the upper half; the feed's shield to the lower half. Its braid isn't grounded, so lay it back beside the hairpin. Seal its open end, and trim it half a millimetre at a time on the VNA: the longer, the bigger a capacitor it is. ` : ""}A dipole is about 73 ohm; these bring it to 50. The hairpin's short can be moved to tune it: the Tune tab says which way.</p>` : `<p><b>No match.</b> A dipole is about 73 ohm, so on 50 ohm coax its SWR bottoms out near 1.45.</p>`}
        <p><b>The coax.</b> It leaves the dipole's middle at right angles, along the arm to the mast: keep it so, with a ferrite choke where it leaves the arm.</p>
        ${R ? `<p><b>Its pattern.</b> ${d.mast.on ? `With the mast ${Math.round(d.mast.behind)} mm away, it's ${fmt(R.max, 1)} dBi at its strongest and ${fmt(R.min, 1)} dBi at its weakest round it: ${fmt(R.ripple, 1)} dB from one to the other.` : `All round, within ${fmt(R.ripple, 1)} dB.`}</p>` : ""}
        ${A.radio.sheetLine()}
        <p><b>Before you mount it.</b> A roof or mast job needs care. Stay well clear of power lines, ground the mast and fit lightning protection as your local code asks, and check any permit rules first.</p>
      </div>`;
  }

  /**
   * A collinear's rod pieces, from the feed up: each its cut length, mm. The first runs from the gap's top edge to the first
   * joint, each joint leaves its gap between two pieces' ends, and the top one runs from the last joint to the tip.
   */
  function colinPieces(d) {
    const co = d.elements[0].colin, n = co.sections.length, j = co.joint;
    return co.sections.map((v, i) => v - (i === 0 ? d.gap / 2 : j / 2) - (i === n - 1 ? 0 : j / 2));
  }

  /**
   * How long to cut the radome's pipe: from the mast cap's socket floor (at its wall) up past the top tip, 20 mm to spare
   * under the end cap. The tube's lower end sits CAP.socket down the post, whose end is level with the socket's rim.
   */
  function radomeLength(d) {
    const e = d.elements[0], h = YS.dipole.halves(d), C = YS.SLEEVE.CAP, R = YS.SLEEVE.RADOME;
    const tubeLow = -(h.low), postTop = tubeLow + C.socket, floor = postTop - Math.max((YS.SLEEVE.PIPES.pvc125.od / 2 + R.play / 2 - (e.sleeve.d / 2 + 3.5)) + 10, R.grip);
    return (e.L - h.low) - floor + 20;
  }

  /** A collinear's cut list: the sleeve below, the rod pieces above, the stubs and the match. */
  function renderColinSheet(d, driven, m, R, inch, metalNames, pin, cap, st, cable) {
    const e = driven, sl = e.sleeve, co = e.colin, h = YS.dipole.halves(d), tube = YS.dipole.TUBES[sl.tube] || YS.dipole.TUBES.k14, coax = YS.dipole.COAX[sl.coax] || YS.dipole.COAX.rg316;
    const ch = YS.dipole.choke(sl.tube, sl.coax, d.f0), where = d.mount === "pod" ? "the node pod's top" : "top of a mast", pcs = colinPieces(d), n = pcs.length, metal = (metalNames[e.material || d.material] || "").toLowerCase();
    const wire = 2 * (co.stub.length + co.stub.out) + 2 * co.stub.spacing + 10;      // both legs and their runs in to the rods, the short, and 5 mm each end to solder
    const name = (i) => (i === 0 ? "First rod, above the feed" : i === n - 1 ? "Top rod" : `Rod ${i + 1}`);
    $("#c-sheet").innerHTML = `
      <h1>${esc(d.name)}</h1>
      <p class="note">${fmt(d.f0, 3)} MHz · collinear of ${n} sections on ${where}${m ? ` · ${fmt(m.gainDbi, 2)} dBi toward the horizon · SWR ${fmt(m.swr, 2)} predicted at ${fmt(m.f, 3)} MHz` : ""} · ${fmt(e.L, 0)} mm tip to tip</p>
      <p class="note"><b>Experimental: not built or tested yet.</b> This kind of antenna is designed and checked on the computer only. Sweep it before you trust it.</p>
      <div class="scroll-x"><table class="tbl"><thead><tr><th>Part</th><th>Size, mm</th><th>Made of</th></tr></thead><tbody>
        <tr><td>Sleeve, below the feed</td><td>${fmt(h.low - d.gap / 2, 1)}${inch(h.low - d.gap / 2)}, as cut</td><td style="font-family:var(--sans)">${esc(tube.name)}</td></tr>
        ${pcs.map((v, i) => `<tr><td>${name(i)}</td><td>${i === n - 1 ? `cut ${fmt(v + CUT.allowance, 1)}, trim to ${fmt(v, 1)}` : fmt(v, 1)}${inch(v)}</td><td style="font-family:var(--sans)">${fmt(e.d, 2)} mm ${metal} rod</td></tr>`).join("")}
        <tr><td>Stubs, ${n - 1}</td><td>${fmt(co.stub.length, 1)} down beside the rod, legs ${fmt(co.stub.spacing, 1)} apart, ${fmt(co.stub.out, 1)} out (each from ${fmt(wire, 0)} of wire)</td><td style="font-family:var(--sans)">${fmt(co.stub.d, 1)} mm bare copper wire</td></tr>
        <tr><td>Coax up the sleeve</td><td>through it, and on down</td><td style="font-family:var(--sans)">${esc(coax.name)}</td></tr>
        ${pin ? `<tr><td>Hairpin</td><td>${fmt(pin.length, 1)} long, legs ${fmt(pin.spacing, 1)} apart</td><td style="font-family:var(--sans)">${fmt(pin.d, 1)} mm bare copper wire</td></tr>` : ""}
        ${cap ? `<tr><td>Capacitor</td><td>${cap} pF</td><td style="font-family:var(--sans)">C0G (NP0) chip, 0805 or 0603, 50 V or more</td></tr>` : ""}
        ${st ? `<tr><td>Coax stub</td><td>cut ${fmt(st.length + 2, 1)}, trim to ${fmt(st.length, 1)}</td><td style="font-family:var(--sans)">${cable}, open at its far end</td></tr>` : ""}
      </tbody></table></div>
      <div class="stack" style="max-width:68ch">
        <p><b>The sleeve.</b> Cut the tube to ${fmt(h.low - d.gap / 2, 1)} mm, square, and leave it at that: it's the choke, a quarter wave of the line it makes round the coax's braid inside (${fmt(ch.z0, 0)} ohm, velocity factor ${fmt(ch.vf, 3)}). Its top is at the gap's lower edge, ${fmt(d.gap, 1)} mm under the first rod.</p>
        <p><b>The rods.</b> ${n} pieces stand end to end above the feed: ${pcs.map((v) => fmt(v, 1)).join(", ")} mm from the bottom up, ${fmt(co.joint, 1)} mm apart at each joint. Cut them square; only the top one is cut long, ${fmt(CUT.allowance, 1)} mm, and trimmed at its tip on the VNA, as the Tune tab says. The sections it was sized as are ${co.sections.map((v) => fmt(v, 1)).join(", ")} mm, the feed's middle to the first joint's middle, joint to joint, and the last joint to the tip.</p>
        <p><b>The stubs.</b> At each joint, a U of ${fmt(co.stub.d, 1)} mm bare copper wire folded down beside the rod below, its two legs side by side, ${fmt(co.stub.spacing, 1)} mm apart and ${fmt(co.stub.out, 1)} mm out from the rod's middle, in the air beside the joint's sleeve. One leg goes straight in to the lower rod's top end, the other to the upper rod's bottom end, in the joint's window; the short, ${fmt(co.stub.length, 1)} mm below the lower rod's end, lies in the groove of the shelf at the joint's foot. Use the wire size given and keep the legs straight and parallel: the stub's wire and spacing set how far the section above lags, nearly as much as its length.</p>
        <p><b>The coax.</b> Feed the ${esc(coax.name)} up through the tube from its open end. At the top, solder its braid all round the tube's top edge, and its centre conductor ${pin || cap || st ? "to the match" : "to the first rod"}. Below the tube it carries on down ${d.mount === "pod" ? "into the pod" : "the mast"}; clip a ferrite choke on it there too.</p>
        ${pin || cap || st ? `<p><b>The match.</b> ${pin ? `A U of wire across the feed, one leg to the first rod's lower end and one to the tube's top, ${fmt(pin.spacing, 1)} mm apart and ${fmt(pin.length, 1)} mm long, out to the side, shorted at its far end. ` : ""}${cap ? "The capacitor in series between the coax's centre conductor and the first rod. " : ""}${st ? `In place of a capacitor, the open stub of ${cable} in series: the feed's centre conductor to the stub's braid, the stub's centre conductor to the first rod. Seal its open end. ` : ""}The hairpin's short can be moved to tune it.</p>` : `<p><b>No match.</b> The feed isn't 50 ohm: expect a high SWR.</p>`}
        ${R ? `<p><b>Its pattern.</b> All round, within ${fmt(R.ripple, 1)} dB. Its beam is ${m && m.bwE ? `${fmt(m.bwE, 0)} degrees` : "flat"} from top to bottom: it reaches further level and less above and below than a dipole. What's under it, the ${d.mount === "pod" ? "pod" : "mast"} and the coax, isn't in the model, nor the stubs' own field.</p>` : ""}
        ${A.radio.sheetLine()}
        <p><b>Before you mount it.</b> At ${fmt(e.L / 1000, 2)} m it's tall and catches the wind: brace the mast. A roof or mast job needs care. Stay well clear of power lines, ground the mast and fit lightning protection as your local code asks, and check any permit rules first.</p>
      </div>`;
  }

  /** A sleeve dipole's cut list: the rod above, the tube below (the choke), the match, and the coax up the tube. */
  function renderSleeveSheet(d, driven, m, R, inch, metalNames, pin, cap, st, cable) {
    const sl = driven.sleeve, h = YS.dipole.halves(d), tube = YS.dipole.TUBES[sl.tube] || YS.dipole.TUBES.k14, coax = YS.dipole.COAX[sl.coax] || YS.dipole.COAX.rg316;
    const ch = YS.dipole.choke(sl.tube, sl.coax, d.f0), where = d.mount === "pod" ? "the node pod's top" : "top of a mast";
    $("#c-sheet").innerHTML = `
      <h1>${esc(d.name)}</h1>
      <p class="note">${fmt(d.f0, 3)} MHz · sleeve dipole on ${where}${m ? ` · ${fmt(R ? R.max : m.gainDbi, 2)} dBi all round · SWR ${fmt(m.swr, 2)} predicted at ${fmt(m.f, 3)} MHz` : ""}</p>
      <p class="note"><b>Experimental: not built or tested yet.</b> This kind of antenna is designed and checked on the computer only. Sweep it before you trust it.</p>
      <div class="scroll-x"><table class="tbl"><thead><tr><th>Part</th><th>Size, mm</th><th>Made of</th></tr></thead><tbody>
        <tr><td>Rod above the feed</td><td>cut ${fmt(h.up - d.gap / 2 + CUT.allowance, 1)}, trim to ${fmt(h.up - d.gap / 2, 1)}${inch(h.up - d.gap / 2)}</td><td style="font-family:var(--sans)">${fmt(driven.d, 2)} mm ${(metalNames[driven.material || d.material] || "").toLowerCase()} rod</td></tr>
        <tr><td>Sleeve, below the feed</td><td>${fmt(h.low - d.gap / 2, 1)}${inch(h.low - d.gap / 2)}, as cut</td><td style="font-family:var(--sans)">${esc(tube.name)}</td></tr>
        <tr><td>Coax up the sleeve</td><td>through it, and on down</td><td style="font-family:var(--sans)">${esc(coax.name)}</td></tr>
        ${pin ? `<tr><td>Hairpin</td><td>${fmt(pin.length, 1)} long, legs ${fmt(pin.spacing, 1)} apart</td><td style="font-family:var(--sans)">${fmt(pin.d, 1)} mm bare copper wire</td></tr>` : ""}
        ${cap ? `<tr><td>Capacitor</td><td>${cap} pF</td><td style="font-family:var(--sans)">C0G (NP0) chip, 0805 or 0603, 50 V or more</td></tr>` : ""}
        ${st ? `<tr><td>Coax stub</td><td>cut ${fmt(st.length + 2, 1)}, trim to ${fmt(st.length, 1)}</td><td style="font-family:var(--sans)">${cable}, open at its far end</td></tr>` : ""}
      </tbody></table></div>
      <div class="stack" style="max-width:68ch">
        <p><b>The sleeve.</b> Cut the tube to ${fmt(h.low - d.gap / 2, 1)} mm, square, and leave it at that: it's the choke, a quarter wave of the line it makes round the coax's braid inside (${fmt(ch.z0, 0)} ohm, velocity factor ${fmt(ch.vf, 3)}), which keeps current from running on down the outside of the coax. Its top is at the gap's lower edge, ${fmt(d.gap, 1)} mm under the rod.</p>
        <p><b>The coax.</b> Feed the ${esc(coax.name)} up through the tube from its open end. At the top, solder its braid all round the tube's top edge, and its centre conductor ${pin || cap || st ? "to the match" : "to the rod above"}. Below the tube it carries on down ${d.mount === "pod" ? "into the pod" : "the mast"}; clip a ferrite choke on it there too.</p>
        <p><b>The rod above.</b> Cut it ${fmt(CUT.allowance, 1)} mm long and trim its tip on the VNA, as the Tune tab says. Only the rod is trimmed, never the tube.</p>
        ${pin || cap || st ? `<p><b>The match.</b> ${pin ? `A U of wire across the feed, one leg to the rod's lower end and one to the tube's top, ${fmt(pin.spacing, 1)} mm apart and ${fmt(pin.length, 1)} mm long, out to the side, shorted at its far end. ` : ""}${cap ? "The capacitor in series between the coax's centre conductor and the rod. " : ""}${st ? `In place of a capacitor, the open stub of ${cable} in series: the feed's centre conductor to the stub's braid, the stub's centre conductor to the rod. Seal its open end. ` : ""}A dipole is about 73 ohm; these bring it to 50. The hairpin's short can be moved to tune it.</p>` : `<p><b>No match.</b> A dipole is about 73 ohm, so on 50 ohm coax its SWR bottoms out near 1.45.</p>`}
        ${R ? `<p><b>Its pattern.</b> All round, within ${fmt(R.ripple, 1)} dB, as nothing stands beside it. What's under it, the ${d.mount === "pod" ? "pod" : "mast"} and the coax, isn't in the model.</p>` : ""}
        ${A.radio.sheetLine()}
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
    const bed = bedNow(), fits = YS.guideFits(guide, bed), lay = YS.placeOn(bed, guide.modelLength + 4, guide.modelWidth + 4, 0);
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
        <p class="note" id="g-why" style="margin-top:6px">${!cal ? "This unlocks once you've entered what the test bar measures." : !fits ? `It would be ${fmt(guide.modelLength, 0)} mm long, too long for a ${bed.x} x ${bed.y} mm bed. For rods this long, use a tape and a stop block instead.` : `It's made ${fmt(guide.modelLength, 1)} mm long so that it prints at ${fmt(guide.length, 1)} mm. ${esc(YS.partPlacing(lay, bed))}`}</p>
        <div style="margin-top:6px">${bedFields("g")}</div>
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
    bindBed("g", () => renderGuide());
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
      ...(A.kind() === "yagi" ? [["YagiCAD file (.YC6)", () => YS.yc6(d, S.detail && S.detail.metrics), base + ".YC6"]] : []),
      ["Sweep (CSV)", () => "MHz,SWR,gain_dBd,gain_dBi,FB_dB,R_ohm,X_ohm\n" + (S.rows || []).map((r) => [r.f.toFixed(3), r.swr.toFixed(3), r.gainDbd.toFixed(3), r.gainDbi.toFixed(3), r.fb.toFixed(2), r.z[0].toFixed(2), r.z[1].toFixed(2)].join(",")).join("\n") + "\n", base + "_sweep.csv", "text/csv"],
      ["Simulated S11 (.s1p), for NanoVNA Saver", () => YS.toTouchstone(S.rows || [], d.z0, d.name + " simulated by Yagi Studio"), base + ".s1p"],
    ];
    $("#c-files").innerHTML = files.map((f, i) => `<div><div style="font-weight:500;margin-bottom:3px">${esc(f[0])}</div><div class="row"><button class="btn small" data-dl="${i}">Download</button><button class="btn small" data-cp="${i}">Copy</button></div></div>`).join("") +
      `<p class="note">${root.ysNative || (root.ysWeb && root.ysWeb.ios) ? "Download asks where to save each file." : "If Download does nothing, this page is running somewhere that blocks downloads. Copy works everywhere."}</p>`;
    // a design's files ask what to call them: a name of your own, the extension kept
    $$("[data-dl]", $("#c-files")).forEach((b) => { b.onclick = async () => { const f = files[+b.dataset.dl], name = await A.askFileName(f[2]); if (name) A.download(name, f[1](), f[3]); }; });
    $$("[data-cp]", $("#c-files")).forEach((b) => { b.onclick = () => { const f = files[+b.dataset.cp]; A.copy(f[1](), f[0]); }; });
  }

  /* ==================== 3D print: the boom, a mount and a coupon, from the design on screen ==================== */
  const PRINT = { mount: "mast", nut: "standard", fit: YS.PARTS.FIT, gauge: true, notches: true, label: true, brand: true, lengths: true, pilot: YS.PARTS.SCREW.pilot, useBar: false, result: null, key: "", shown: 0, busy: false, status: "", yaw: -0.7, pitch: 0.6, pod: Object.assign({}, YS.POD.OPTIONS), radome: "none" };

  /* The printer's size, kept with the guide's settings. One stored number, from before there were three, means that much each way. */
  function bedNow() {
    const st = A.storage.read().guide || {}, x = st.bed || YS.GUIDE.BED_DEFAULT;
    return { x, y: st.bedY || x, z: st.bedZ || x, corner: !!st.bedCorner };
  }
  const bedFields = (at) => `
    <div style="font-weight:500;margin-bottom:4px">Your printer's build size, mm</div>
    <div class="field-grid three">
      <div class="field"><label for="${at}-bed">Width (X)</label><input class="num" id="${at}-bed" inputmode="decimal"></div>
      <div class="field"><label for="${at}-bed-y">Depth (Y)</label><input class="num" id="${at}-bed-y" inputmode="decimal"></div>
      <div class="field"><label for="${at}-bed-z">Height (Z)</label><input class="num" id="${at}-bed-z" inputmode="decimal"></div>
    </div>
    <label class="check" style="margin-top:6px"><input type="checkbox" id="${at}-corner"> Allow printing corner to corner ${A.help("bedcorner")}</label>`;
  /* All three written out at the first change, so that widening X doesn't drag the other two along with it. */
  const bedStored = () => { const b = bedNow(); return { bed: b.x, bedY: b.y, bedZ: b.z, bedCorner: b.corner }; };
  function bindBed(at, changed) {
    const save = (o) => { A.storage.write({ guide: Object.assign({}, A.storage.read().guide, bedStored(), o) }); changed(); };
    A.bindNum($(`#${at}-bed`), { get: () => bedNow().x, min: 50, max: 2000, decimals: 0, set: (v) => save({ bed: v }) });
    A.bindNum($(`#${at}-bed-y`), { get: () => bedNow().y, min: 50, max: 2000, decimals: 0, set: (v) => save({ bedY: v }) });
    A.bindNum($(`#${at}-bed-z`), { get: () => bedNow().z, min: 10, max: 2000, decimals: 0, set: (v) => save({ bedZ: v }) });
    $(`#${at}-corner`).checked = bedNow().corner;
    $(`#${at}-corner`).onchange = (e) => save({ bedCorner: e.target.checked });
  }

  function printOptions() {
    const st = A.storage.read().guide || {}, cal = YS.guideScale(st.measured);
    const scale = PRINT.useBar && cal && !cal.suspicious ? cal.scale : 1;
    return { bed: bedNow(), scale, fit: PRINT.fit, allowance: CUT.allowance, gauge: PRINT.gauge, notches: PRINT.notches, label: PRINT.label, brand: PRINT.brand, lengths: PRINT.lengths, customText: S.design.boomText || "", mount: PRINT.mount, nut: PRINT.nut, screws: !!S.design.screws, pilot: PRINT.pilot, pod: Object.assign({}, PRINT.pod),
      radome: YS.dipole.isSleeve(S.design) && PRINT.mount === "mast" ? PRINT.radome : "none" };
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
            <p class="note" id="p-tested-sleeve" hidden><span class="exp-badge">Experimental</span> <b>A sleeve dipole: not built yet.</b> Its hub, its cap or the pod's insert for it haven't been printed or built. Its model is checked against a full-surface model of its stepped rod, but the choke is taken as perfect and what's under it isn't in the model. Sweep it before you trust it.</p>
            <p class="note" id="p-tested-colin" hidden><span class="exp-badge">Experimental</span> <b>A collinear: not built yet.</b> Its hub, its joints and its cap or insert haven't been printed or built. Its model, the rods and stubs as one wire, is checked against nec2++ where nec2++ holds, but the choke is taken as perfect and what's under it isn't in the model. Sweep it before you trust it.</p>
            <p class="note" id="p-tested-dipole" hidden><span class="exp-badge">Experimental</span> <b>A dipole's arm: not built yet.</b> Its tail, coax tunnel and solder window are the tested boom's, and the mast clamp is the tested one, but the arm itself, its longer window and the hairpin and capacitor match haven't been printed or built. Sweep it before you trust it.</p>
            <p class="note" id="p-tested"><span class="pill good">Boom printed and tested</span> A boom from this tab has been printed in ASA, built into a working antenna and tuned: the tapered boom, the fork-and-tongue joint, the gauge, the check notches and the screw holes. <span class="pill good">Mast clamp printed and tested</span> So is the boom's tail that goes in it, with its nut slots and coax tunnel. <span class="pill warn">Other mounts not yet</span> The painter pole arm, hand grip and tripod mount haven't been printed, nor have the rod lengths on the boom's side. Test-fit those before you rely on them.</p>
            <p class="note">Makes printable files from the design on the Design tab, here on your device.</p>
            <div>${bedFields("p")}</div>
            <p id="p-pieces" role="status" style="font-weight:600"></p>
            <div class="field-grid">
              <div class="field" id="p-radome-f" hidden><label for="p-radome">In a pipe ${A.help("radome")}</label><select class="sel" id="p-radome"><option value="none">No: in the open</option><option value="pvc125">1 1/4 in Schedule 40 PVC</option></select></div>
              <p class="note" id="p-radome-exp" hidden><span class="exp-badge">Experimental</span> <b>The pipe isn't tried yet.</b> Its collars and socket haven't been printed, and what the plastic does to the tuning isn't modelled or measured: sweep the antenna bare and again in the pipe, and trim it in the pipe.</p>
              <div class="field"><label for="p-mount">Mount</label><select class="sel" id="p-mount">${Object.keys(YS.PARTS.MOUNTS).map((k) => `<option value="${k}">${esc(YS.PARTS.MOUNTS[k].name)}</option>`).join("")}</select></div>
              <div class="field" id="p-nut-f"><label for="p-nut">Nuts in the boom's tail</label><select class="sel" id="p-nut">${Object.keys(YS.PARTS.NUTS).map((k) => `<option value="${k}">${esc(YS.PARTS.NUTS[k].name)}</option>`).join("")}</select></div>
              <div class="field" id="p-fit-f"><label for="p-fit">Rod holes over the rod, mm ${A.help("printfit")}</label><input class="num" id="p-fit" inputmode="decimal"></div>
              <div class="field"><label for="p-shrink">Shrinkage</label><select class="sel" id="p-shrink"><option value="slicer">My slicer handles it</option><option value="bar">Scale from a test bar</option></select></div>
              <div class="field" id="p-bar-wrap"><label for="p-bar">Test bar measures, mm</label><input class="num" id="p-bar" inputmode="decimal"></div>
            </div>
            ${podFields()}
            <div class="stack" id="p-boom-opts">
            <label class="check"><input type="checkbox" id="p-gauge"> <span><span data-for="yagi">Rod-cutting gauge on top of the boom</span><span data-for="dipole">Rod-cutting gauge on top of the arm</span> ${A.help("printgauge")}</span></label>
            <label class="check"><input type="checkbox" id="p-notches"> <span>Check notches on top of the <span data-for="yagi">boom</span><span data-for="dipole">arm</span>, 100 mm apart ${A.help("printcheck")}</span></label>
            <label class="check"><input type="checkbox" id="p-label"> <span>Up arrows on both sides of the <span data-for="yagi">boom</span><span data-for="dipole">arm</span>, and TOP on its top</span></label>
            <label class="check"><input type="checkbox" id="p-lengths"> <span><span data-for="yagi">Each rod's length on the boom's side, beside its hole</span><span data-for="dipole">The dipole's length on the arm's side, beside its hole</span></span></label>
            <label class="check"><input type="checkbox" id="p-brand"> <span>Yagi Studio on the <span data-for="yagi">boom's</span><span data-for="dipole">arm's</span> side</span></label>
            <div class="field"><label for="p-text">Your own text on the <span data-for="yagi">boom's</span><span data-for="dipole">arm's</span> side ${A.help("boomtext")}</label><input class="txt-in" id="p-text" maxlength="60" placeholder="Name, call sign, phone number, club…" autocomplete="off"></div>
            <label class="check"><input type="checkbox" id="p-screws"> Holes for M3 screws to hold the rods ${A.help("printscrews")}</label>
            <div class="field-grid" id="p-pilot-wrap"><div class="field"><label for="p-pilot">Screw holes, mm</label><select class="sel" id="p-pilot">${YS.PARTS.SCREW.pilots.map((v) => `<option value="${v}">${v.toFixed(1)}</option>`).join("")}</select></div></div>
            </div>
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

  /* The node pod's own choices, shown when it's the mount (pod.js; node_pod.py is the reference). */
  function podFields() {
    const sel = (key, label) => `<div class="field" id="p-pod-${key}-f"><label for="p-pod-${key}">${label}</label><select class="sel" id="p-pod-${key}">${YS.POD.CHOICES[key].map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select></div>`;
    const box = (key, label) => `<label class="check" id="p-pod-${key}-f"><input type="checkbox" id="p-pod-${key}"> ${label}</label>`;
    return `
            <div class="stack" id="p-pod" hidden>
              <p class="note"><span class="exp-badge">Experimental</span> <b>Not all printed yet.</b> The node pod: a sealed, upright housing for a Heltec V4 node and its battery, with this boom's socket on its front, so the antenna and the node go up the mast as one. An earlier version of its body, ring and finial has been printed and fits together. This version and its other parts haven't been printed. Its body prints on a brim.</p>
              <div class="field-grid">
                ${sel("battery", "Battery")}${sel("top", "Its top")}${sel("mount", "Its back")}${sel("back", "Port away from the antenna")}${sel("front", "Port toward the antenna")}
                <div class="field"><label for="p-pod-label">Label on its nose</label><input class="txt-in" id="p-pod-label" maxlength="10" placeholder="For example DUVYAGI" autocomplete="off"></div>
              </div>
              ${box("socket", "The boom's socket on its front (it also takes the side solar arm)")}
              ${box("sma", "An SMA bulkhead in its base, for the boom's coax")}
              ${box("lace", "A hex lace over its outside, which stiffens it against knocks")}
              ${box("marks", "Yagi Studio's bee, the label and the Yagi signs")}
            </div>`;
  }
  function bindPod(changed) {
    ["battery", "top", "mount", "back", "front"].forEach((k) => { const e = $(`#p-pod-${k}`); e.value = PRINT.pod[k]; e.onchange = () => { PRINT.pod[k] = e.value; changed(); }; });
    ["socket", "sma", "lace", "marks"].forEach((k) => {
      const e = $(`#p-pod-${k}`), on = k === "socket" ? "boom" : "yes", off = k === "socket" ? "none" : "no";
      e.checked = PRINT.pod[k] === on; e.onchange = () => { PRINT.pod[k] = e.checked ? on : off; changed(); };
    });
    const t = $("#p-pod-label"); t.value = PRINT.pod.label; t.onchange = () => { PRINT.pod.label = t.value.trim(); changed(); };
  }
  /* What the pod comes to, in words, for the plan. */
  function podPlan(plan) {
    const o = plan.sleeve ? Object.assign({}, PRINT.pod, { top: "sleeve", socket: "none", sma: "no" }) : PRINT.pod, T = plan.taper, L = YS.POD.layout(o, { Ht: T.Ht, w: plan.sizes.w, m: T.m || 0, zb: T.zb }), out = [];
    out.push(`The pod stands ${fmt(L.Z_TOP, 0)} mm tall and ${fmt(2 * 29.9, 0)} mm across, not counting its socket, back and top piece. Its body prints upright on a brim, about 5 to 6 hours.`);
    if (S.design.polarization === "horizontal" && o.socket === "boom") out.push("Its socket takes the boom with the rods vertical, so with this design's horizontal rods it's made without one.");
    if (o.top === "solar") out.push("Its top takes the finial now, or the solar roof later: a blind hole, so neither needs a seal.");
    if (o.top === "sma") out.push("Its top takes an SMA antenna on a screw-in insert: fit the connector, its lock washer and nut to the insert first, then screw the insert in over an 18 x 2.5 mm O-ring. The insert's head is 2 mm, so the SMA's thread must reach through 2 mm, a lock washer and its nut, and leave enough for the antenna.");
    if (o.top === "n") out.push("Its top takes an N antenna on a screw-in insert, over a 34 x 2.5 mm O-ring. The top stands high enough for the connector and its cable to hang 32 mm inside.");
    if (o.mount === "pad") out.push("Its back is a pad for bolt-on mounts: a block (a camera tripod's screw, or Yagi Studio's painter pole socket under it), a wall plate with keyholes, and a magnet plate for three 43 mm rubber-coated magnets.");
    out.push("The magnet base, a ring on a round skirt standing on three 43 mm rubber-coated magnets, replaces the ring for a flat steel top, such as an HVAC unit's.");
    out.push("Use a protected (1S, with its own protection board) cell: the Heltec V4 has none of its own, and nothing in the pod stops it charging below freezing. Keep the mast and the antenna well clear of power lines, ground the mast, and check your local rules.");
    return out;
  }

  function renderPrintPlan() {
    { // a dipole's mounts: the arm's clamp, or for a sleeve dipole its cap over a mast, or the pod it stands on
      const dip = A.kind() === "dipole", sel = $("#p-mount"), sd = S.design;
      const allowed = !dip ? null : sd.mount === "pod" ? ["pod", "none"] : ["mast", "none"];
      [...sel.options].forEach((o) => {
        o.hidden = o.disabled = !!allowed && !allowed.includes(o.value);
        o.textContent = dip && YS.dipole.isSleeve(sd) && o.value === "mast" ? "A cap over the mast's top" : YS.PARTS.MOUNTS[o.value].name;
      });
      if (allowed && !allowed.includes(PRINT.mount)) { PRINT.mount = allowed[0]; sel.value = allowed[0]; } }
    { const dip = YS.dipole.isDipole(S.design), sv = YS.dipole.isSleeve(S.design); $("#p-tested").hidden = dip; $("#p-tested-dipole").hidden = !dip || sv; $("#p-tested-sleeve").hidden = !sv || YS.dipole.isCollinear(S.design); $("#p-tested-colin").hidden = !YS.dipole.isCollinear(S.design); }
    const d = S.design, host = $("#p-plan"), run = $("#p-run");
    { // a sleeve dipole has no arm: no gauge, marks, text, screws or tail nuts; on the pod its insert is the top, the coax
      // comes in through it, and there's no boom to take a socket
      const sv = YS.dipole.isSleeve(d);
      ["#p-boom-opts", "#p-nut-f", "#p-fit-f", "#p-pod-top-f", "#p-pod-socket-f", "#p-pod-sma-f"].forEach((q) => { const e = $(q); if (e) e.hidden = sv; });
    }
    $("#p-radome-f").hidden = !(YS.dipole.isSleeve(d) && PRINT.mount === "mast");
    $("#p-radome").value = PRINT.radome;
    $("#p-radome-exp").hidden = $("#p-radome-f").hidden || PRINT.radome === "none";
    $("#p-bar-wrap").hidden = !PRINT.useBar;
    $("#p-pod").hidden = PRINT.mount !== "pod";
    $("#p-screws").checked = !!d.screws;
    if (document.activeElement !== $("#p-text")) $("#p-text").value = d.boomText || "";
    $("#p-pilot-wrap").hidden = !d.screws;
    let plan;
    try {
      plan = YS.planParts(d, printOptions());
    } catch (e) {
      host.innerHTML = `<p class="note"><span class="pill warn">Check that</span> ${esc(e.message)}</p>`;
      $("#p-pieces").textContent = "This design won't print on that printer as it stands.";
      run.disabled = true;
      return;
    }
    run.disabled = PRINT.busy;
    if (plan.sleeve) {
      // a sleeve dipole: no boom, a hub and its foot
      const ch = YS.dipole.choke(d.elements[0].sleeve.tube, d.elements[0].sleeve.coax, d.f0), h = YS.dipole.halves(d);
      $("#p-pieces").textContent = `A hub at the feed, and ${PRINT.mount === "pod" ? "the pod with an insert for its top" : PRINT.mount === "mast" ? "a cap over the mast's top" : "no foot"}.`;
      const ls = [`The hub holds the ${fmt(d.elements[0].d, 2)} mm rod above the feed and the ${fmt(d.elements[0].sleeve.d, 2)} mm tube below it, ${fmt(d.gap, 1)} mm apart, with a window for the coax and the match. The tube is ${fmt(h.low - d.gap / 2, 1)} mm long, the choke's quarter wave (velocity factor ${fmt(ch.vf, 3)}).`];
      const co = d.elements[0].colin;
      if (co) ls.push(`Above it, ${co.sections.length - 1} joint${co.sections.length > 2 ? "s" : ""}, one between each two rods: a slim sleeve holding the rods' ends ${fmt(co.joint, 1)} mm apart, with a window where each rod's end goes out to a leg of the stub, and a shelf ${fmt(co.stub.length, 1)} mm below whose groove holds the stub's short, so its legs hang in the air beside the rod below.`);
      if (PRINT.mount === "mast") ls.push(`The cap fits a ${fmt(d.mast.d, 0)} mm mast, squeezed on by a hose clamp round its slit skirt. Set the mast's diameter on the Design tab's first screen.`);
      const pipe = PRINT.mount === "mast" && PRINT.radome !== "none" ? YS.SLEEVE.PIPES[PRINT.radome] : null;
      if (pipe) ls.push(`In ${pipe.name} (${fmt(pipe.od, 1)} mm outside, ${fmt(pipe.id, 1)} mm inside: measure yours): the cap has a socket ${fmt(YS.SLEEVE.RADOME.grip, 0)} mm deep for the pipe's end, with a drain at its low edge, and the hub${co ? " and each joint have" : " has"} a collar that centres the rod in the bore. Cut the pipe about ${fmt(radomeLength(d), 0)} mm long and close its top with a standard PVC end cap. The plastic round the antenna lowers its frequency a little, and the model leaves it out: sweep it in the pipe, and trim the top rod as the Tune tab says.`);
      if (PRINT.mount === "pod") ls.push(...podPlan(plan).map(esc), "Its top has the SMA top's through hole, and the sleeve's insert screws into it in place of the SMA insert. The pod's battery and board sit under the sleeve, which the model doesn't include: sweep it there.");
      ls.push("Print it in plain PETG or ASA. Not carbon fiber filled: its fibers conduct.");
      host.innerHTML = ls.map((l) => `<p class="note">${l}</p>`).join("");
      renderPrintFiles();
      return;
    }
    const b = plan.bed, count = plan.sections.length;
    $("#p-pieces").textContent = `On your ${b.x} x ${b.y} x ${b.z} mm printer, this ${fmt(plan.boom, 0)} mm boom prints in ${count === 1 ? "one piece" : count + " pieces"}.`;
    const lines = [];
    const lay = plan.sections.map((s) => s.place).find((p) => p.how !== "x");
    if (lay) lines.push(esc(YS.partPlacing(lay, b)).replace("Turn it", count > 1 ? "Turn the long pieces" : "Turn it"));
    if (plan.cornerPieces && plan.cornerPieces < count) lines.push(`Corner to corner, it would take ${plan.cornerPieces === 1 ? "one piece" : plan.cornerPieces + " pieces"} instead. You can allow that above.`);
    if (count > 1) lines.push(`In one straight piece it needs a printer about ${fmt(Math.ceil(plan.onePiece), 0)} mm long, with room for a brim.`);
    if (plan.gauge) lines.push(`Gauge marks, from these lengths: ${plan.gauge.marks.map((m) => `${esc(m.rod)} ${fmt(m.length, 1)}`).join(", ")} mm. If tuning changes a rod, make the boom again.`);
    if (PRINT.useBar && printOptions().scale === 1) lines.push("Enter what the test bar measures, or these files won't be scaled. The bar is on the Cut list tab.");
    if (PRINT.mount === "mast" && YS.dipole.isDipole(d)) {
      // a dipole's arm is cut to its distance from the mast, so the clamp and the Design tab agree by construction
      const arm = YS.ARM.of(d), at = YS.mastBehind(d.mast.d) + arm;
      lines.push(`The arm holds the dipole ${fmt(at, 0)} mm from the middle of a ${fmt(d.mast.d, 0)} mm mast in the clamp${Math.abs(at - d.mast.behind) > 1 ? `: the closest the clamp allows, where the Design tab has ${fmt(d.mast.behind, 0)} mm. Set the Design tab to ${fmt(at, 0)} to see what that does` : ", as the Design tab has it"}. ${d.mast.on ? "" : "The design takes the pole to be wood, fiberglass or plastic: a metal one changes the pattern."}`.trim());
    } else if (PRINT.mount === "mast") {
      const m = d.mast && d.mast.on ? d.mast : null;
      if (!m) lines.push(`The clamp holds a 42 mm mast about ${fmt(YS.mastBehind(42), 0)} mm behind the reflector. Turn the mast on in the Design tab to see what that does.`);
      else if (Math.abs(YS.mastBehind(m.d) - m.behind) > 10) lines.push(`The clamp puts your ${fmt(m.d, 0)} mm mast about ${fmt(YS.mastBehind(m.d), 0)} mm behind the reflector, and the Design tab has it at ${fmt(m.behind, 0)} mm. Set them the same to see what it does.`);
    }
    if (PRINT.mount === "pole") lines.push(`The pole's thread is from a socket proven on one real painter pole, in the USA. Check it fits yours. The pole sits ${fmt(YS.PARTS.POLE_BEHIND, 0)} mm behind the reflector, and a metal one can change the tuning, so sweep it on the pole. Look up first: a pole can reach overhead power lines. Don't raise it in wind or near storms.`);
    if (PRINT.mount === "grip") lines.push("A hand near the rods detunes them. Sweep the antenna the way you'll hold it.");
    if (PRINT.mount === "pod") lines.push(...podPlan(plan).map(esc));
    lines.push("Print it in plain PETG or ASA. Not carbon fiber filled: its fibers conduct, and around the rods they would detune the antenna and soak up power. Glass fiber filled should be fine for the antenna, but print a new coupon in it, as it shrinks differently.");
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
        ${R.parts.map((p, i) => `<tr><td style="text-align:left;white-space:normal"><button class="linkish" data-show="${i}" aria-label="Show ${esc(p.name)}">${esc(p.name)}</button><div class="note">${p.size.map((v) => fmt(v, 0)).join(" x ")} mm${p.placing ? `. ${p.place.fits ? "" : '<span class="pill warn">Check that</span> '}${esc(p.placing)}` : ""}</div></td><td style="text-align:right"><button class="btn small" data-get="${i}" aria-label="Download ${esc(p.name)}">Download</button></td></tr>`).join("")}
      </tbody></table>
      <div class="row"><button class="btn" id="p-notes">Download the build notes</button><button class="btn" id="p-all">Download everything</button></div>
      <p class="note">These are print-ready STL files, in the right orientation, and their build notes list the settings and hardware. ${YS.dipole.isCollinear(S.design) ? "None of a collinear's parts has been printed or built yet: test-fit the rods in the hub and the joints, the hub on its foot, and the stub's legs in the joints' windows and grooves, before you solder." : YS.dipole.isSleeve(S.design) ? "None of a sleeve dipole's parts has been printed or built yet: test-fit the rod and the tube in the hub, and the hub on its foot, before you solder." : YS.dipole.isDipole(S.design) ? "The boom's tail, its coax tunnel and the mast clamp have been printed and tested on Yagis; a dipole's arm, its longer window and its match haven't been built yet." : "The boom and the mast clamp have been printed, built and tested; the other mounts have only been checked as models. Measure the check notches on every print, and test-fit a mount before you rely on it."}</p>`;
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
      $("#p-radome").onchange = (e) => { PRINT.radome = e.target.value; changed(); };
      $("#p-nut").value = PRINT.nut;
      $("#p-nut").onchange = (e) => { PRINT.nut = e.target.value; changed(); };
      bindPod(changed);
      bindBed("p", changed);
      A.bindNum($("#p-fit"), { get: () => PRINT.fit, min: -0.3, max: 1, decimals: 2, set: (v) => { PRINT.fit = v; changed(); } });
      A.bindNum($("#p-bar"), { get: () => (A.storage.read().guide || {}).measured || NaN, min: 0, max: 200, decimals: 2, parse: (s) => (s.trim() === "" ? 0 : A.parseLen(s)), set: (v) => { saveGuide({ measured: v > 0 ? v : null }); changed(); } });
      $("#p-shrink").onchange = (e) => { PRINT.useBar = e.target.value === "bar"; changed(); };
      $("#p-gauge").checked = PRINT.gauge; $("#p-notches").checked = PRINT.notches; $("#p-label").checked = PRINT.label; $("#p-brand").checked = PRINT.brand; $("#p-lengths").checked = PRINT.lengths;
      $("#p-gauge").onchange = (e) => { PRINT.gauge = e.target.checked; changed(); };
      $("#p-notches").onchange = (e) => { PRINT.notches = e.target.checked; changed(); };
      $("#p-label").onchange = (e) => { PRINT.label = e.target.checked; changed(); };
      $("#p-brand").onchange = (e) => { PRINT.brand = e.target.checked; changed(); };
      $("#p-lengths").onchange = (e) => { PRINT.lengths = e.target.checked; changed(); };
      // screws belong to the design, as the New design dialog asks about them, so that they're remembered with it
      $("#p-screws").onchange = (e) => { S.design.screws = e.target.checked; A.commit(); changed(); };
      // kept with the design, as the screws are, so each antenna keeps its own
      $("#p-text").onchange = (e) => { S.design.boomText = e.target.value.trim(); A.commit(); changed(); };
      $("#p-pilot").value = String(PRINT.pilot);
      $("#p-pilot").onchange = (e) => { PRINT.pilot = +e.target.value; changed(); };
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
    show() { ["#p-bed", "#p-bed-y", "#p-bed-z"].forEach((q) => $(q)._refresh()); $("#p-corner").checked = bedNow().corner; renderPrintPlan(); drawPart(); },
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
