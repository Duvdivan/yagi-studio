/*
 * The vertical dipole: one centre-fed rod standing upright, for all-round coverage, on an arm out from its mast.
 *
 * It's a design with only a driven element, so the solver, the pattern, the mast beside it and the ground all work as they do
 * for a Yagi. What this adds is how to size one, and the match.
 *
 * The match. A half-wave dipole is about 73 ohm, so on 50 ohm coax its SWR bottoms out near 1.45. A hairpin across the feed
 * alone can't fix that, as it does a Yagi's driven element: a shunt element only reaches 50 ohm from a feed whose conductance
 * is at least 1/50 S, which needs a resistance under 50 ohm, and shortening a lone dipole far enough to get there makes its
 * reactance grow faster than its resistance falls (checked: its conductance stays under 0.71/50 S at every length). So it takes
 * two parts, an L network with the shunt part next to the load, as a feed over 50 ohm needs: a hairpin across the feed, then a
 * capacitor in series with the coax's centre conductor (solver.js's feedMatch, which already models both, in that order). The
 * capacitor is a standard value, and the rod's length and the hairpin's are sized together around it; the hairpin stays
 * adjustable after the build, by moving its short.
 *
 * The mast. A metal mast beside a vertical dipole is a parasitic element: about a quarter wave away it reflects, so the dipole
 * beams away from it; further out the pattern rounds out but keeps a ripple. It changes the feed's impedance too, so the
 * match is sized with the mast in the model (rf.js's toSolver adds it as a rod parallel to the dipole).
 *
 * Or an open-ended stub of the coax in the capacitor's place (the owner's idea, 2026-11-17): it acts as a capacitor whose value
 * its length sets, so it can be trimmed on the VNA, and needs no part to buy (solver.js's stubX).
 *
 * Millimetres, MHz, pF. No DOM: this runs in a page and in Node.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  const CAPS = [3.3, 3.9, 4.7, 5.6];        // pF: standard (E12) values that suit a 50 ohm match at these frequencies, from the search
  const PIN = { spacing: 6, d: 1.0 };       // mm: the hairpin's two legs, apart and thick (1 mm copper wire)
  const PIN_RANGE = [6, 30];                // mm: the hairpin's length, short enough to lie in the boom's window, long enough to solder
  const SPAN = [0.40, 0.53];                // the rod's length, in wavelengths
  const BAND_POINTS = 9;                    // frequencies across the band that the match is judged on

  const lambda = (f0) => 299792.458 / f0;

  /*
   * The sleeve dipole, on top of a mast or the node pod (the owner's choice, 2026-11-17: both): the lower half is a tube with
   * the coax up its middle to the feed, its braid soldered to the tube's top. Inside, the tube and the braid are a line
   * shorted at the top, and a quarter wave of it puts a high impedance at the tube's open end, so current doesn't carry on
   * down the coax: the choke. So the tube's length is the inside line's quarter wave, set by its bore and the coax (part air,
   * part the coax's jacket), and the rod above and the match are sized round it. The model takes the choke as perfect:
   * nothing below the tube's end, neither the coax running on nor the mast or pod under it.
   */
  const TUBES = { k14: { name: "1/4 in brass tube (K&S)", od: 6.35, id: 5.63, material: "brass" } };       // 0.014 in wall
  const COAX = {       // over the braid, over the jacket, the jacket's permittivity (FEP)
    rg316: { name: "RG316", braid: 1.9, od: 2.5, er: 2.1 },
    rg178: { name: "RG178", braid: 1.35, od: 1.8, er: 2.1 },
  };
  /** The choke inside the tube: its line's impedance and velocity factor, and the quarter wave at f0. */
  function choke(tube, coax, f0) {
    const T = TUBES[tube] || TUBES.k14, Cx = COAX[coax] || COAX.rg316;
    const rt = T.id / 2, rj = Cx.od / 2, rs = Cx.braid / 2;
    const er = Math.log(rt / rs) / (Math.log(rj / rs) / Cx.er + Math.log(rt / rj));      // two layers: jacket, then air
    const vf = 1 / Math.sqrt(er), z0 = 60 / Math.sqrt(er) * Math.log(rt / rs);
    return { vf, z0, length: Math.round(lambda(f0) / 4 * vf * 10) / 10 };
  }
  const freqsOf = (band) => Array.from({ length: BAND_POINTS }, (_, i) => band[0] + (band[1] - band[0]) * i / (BAND_POINTS - 1));

  /** Is this design a vertical dipole? */
  const isDipole = (design) => !!design && design.kind === "dipole";

  /** The worst SWR across the band, and at the target, for the design as it stands. */
  function judge(design) {
    const fs = freqsOf(design.band), s = YS.toSolver(design);
    const rows = YS.sweep(s, fs.concat([design.f0]), { level: 0, quality: "draft" });
    const swr = rows.map((r) => r.swr);
    return { worst: Math.max.apply(null, swr.slice(0, fs.length)), atF0: swr[fs.length] };
  }

  /** A small Nelder-Mead over (rod length, hairpin length), inside their limits. */
  function search(cost, x0, step, lo, hi, maxEval) {
    const clamp = (x) => x.map((v, i) => Math.min(hi[i], Math.max(lo[i], v)));
    let pts = [clamp(x0), clamp([x0[0] + step[0], x0[1]]), clamp([x0[0], x0[1] + step[1]])].map((x) => ({ x, c: cost(x) }));
    let n = 3;
    while (n < maxEval) {
      pts.sort((a, b) => a.c - b.c);
      const [b, g, w] = pts, m = [(b.x[0] + g.x[0]) / 2, (b.x[1] + g.x[1]) / 2];
      const at = (t) => { const x = clamp([m[0] + t * (w.x[0] - m[0]), m[1] + t * (w.x[1] - m[1])]); n++; return { x, c: cost(x) }; };
      const r = at(-1);
      if (r.c < b.c) { const e = at(-2); pts[2] = e.c < r.c ? e : r; }
      else if (r.c < g.c) pts[2] = r;
      else {
        const k = at(r.c < w.c ? -0.5 : 0.5);
        if (k.c < Math.min(r.c, w.c)) pts[2] = k;
        else { pts = [b].concat([g, w].map((p) => { const x = clamp([(p.x[0] + b.x[0]) / 2, (p.x[1] + b.x[1]) / 2]); n++; return { x, c: cost(x) }; })); }
      }
      const spread = Math.max(Math.abs(pts[0].x[0] - pts[2].x[0]), Math.abs(pts[0].x[1] - pts[2].x[1]));
      if (spread < 0.02) break;
    }
    pts.sort((a, b) => a.c - b.c);
    return pts[0];
  }

  /**
   * An open-ended stub of the given coax with the reactance of a pF capacitor at f0: { length, cable, vf, z0 }. Its length is
   * where z0 cot(beta l) equals the capacitor's 1/(omega C); under an eighth of a wave in the coax for these values.
   */
  function stubFor(pF, cable, f0) {
    const c = (YS.CABLES || {})[cable] || { vf: 0.695 }, z0 = 50, x = 1e6 / (2 * Math.PI * f0 * pF);
    const len = Math.atan(z0 / x) / (2 * Math.PI) * lambda(f0) * c.vf;
    return { length: Math.round(len * 10) / 10, cable, vf: c.vf, z0 };
  }

  /** What size() tries for a choice: "auto" each standard capacitor, "stub:rg178" (and so on) a stub in place of each. */
  const triesFor = (cap) => (cap === "auto" ? CAPS : typeof cap === "string" && cap.indexOf("stub:") === 0 ? CAPS.map((pF) => ({ stub: cap.slice(5), pF })) : [cap]);

  /**
   * Sizes the rod and its match for the design's band, mast and gap, in place: the rod's length, and, with a capacitor, the
   * hairpin's length. cap: a value in pF; "auto" to try each standard value and keep the best; "stub:rg178" (or another of
   * rf.js's CABLES) for an open coax stub in the capacitor's place, sized like each standard value in turn, the best kept; an
   * object { stub, pF } for one such stub; or 0 for no match: the rod alone, cut for the lowest worst SWR.
   * Returns { worst, atF0, cap, stub }.
   */
  function size(design, cap) {
    if (isCollinear(design)) return sizeColin(design, cap && typeof cap === "object" && "start" in cap ? cap : { cap });
    const lam = lambda(design.f0), rod = design.elements[0], sl = rod.sleeve;
    // a sleeve dipole's tube is held at its choke's length: only the rod above changes, near a quarter wave (0.21 to 0.28
    // wavelengths), so the halves stay about even: much shorter matches too, but as a shortened dipole, its gain down and its
    // beam tilted
    const lo = [sl ? sl.length + 0.21 * lam : SPAN[0] * lam, PIN_RANGE[0]], hi = [sl ? sl.length + 0.28 * lam : SPAN[1] * lam, PIN_RANGE[1]];
    const tries = triesFor(cap);
    let best = null;
    for (const c of tries) {
      if (!(c > 0) && !(c && c.stub)) {
        // no match: the rod's length alone, on a fine scan then a refinement (one variable)
        design.hairpin = null; design.seriesC = 0; design.coil = 0; design.seriesStub = null;
        const cost = (L) => { rod.L = L; return judge(design).worst; };
        let bl = lo[0], bc = Infinity;
        for (let L = lo[0]; L <= hi[0]; L += lam * 0.004) { const v = cost(L); if (v < bc) { bc = v; bl = L; } }
        let a = bl - lam * 0.004, b = bl + lam * 0.004;
        for (let i = 0; i < 30; i++) { const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618; if (cost(m1) < cost(m2)) b = m2; else a = m1; }
        rod.L = Math.round((a + b) / 2 * 10) / 10;
        const j = judge(design);
        if (!best || j.worst < best.worst) best = { worst: j.worst, atF0: j.atF0, cap: 0, stub: null, L: rod.L, pin: null };
        continue;
      }
      const stub = c.stub ? stubFor(c.pF, c.stub, design.f0) : null;
      design.seriesC = stub ? 0 : c; design.seriesStub = stub; design.coil = 0;
      const pin = Object.assign({}, PIN, design.hairpin && { spacing: design.hairpin.spacing, d: design.hairpin.d });
      const cost = (x) => { rod.L = x[0]; design.hairpin = Object.assign({}, pin, { length: x[1] }); const j = judge(design); return j.worst + 0.1 * j.atF0; };
      // a coarse look first, as the best length moves a lot with the capacitor and the mast, then the polish
      let start = null;
      for (let L = lo[0]; L <= hi[0]; L += lam * 0.01) for (let h = lo[1]; h <= hi[1]; h += 3) { const v = cost([L, h]); if (!start || v < start.c) start = { x: [L, h], c: v }; }
      const r = search(cost, start.x, [lam * 0.005, 2], lo, hi, 160);
      rod.L = Math.round(r.x[0] * 10) / 10;
      design.hairpin = Object.assign({}, pin, { length: Math.round(r.x[1] * 10) / 10 });
      const j = judge(design);
      if (!best || j.worst + 0.1 * j.atF0 < best.worst + 0.1 * best.atF0) best = { worst: j.worst, atF0: j.atF0, cap: stub ? 0 : c, stub, L: rod.L, pin: design.hairpin };
    }
    rod.L = best.L; design.hairpin = best.pin; design.seriesC = best.cap; design.seriesStub = best.stub;
    delete design.unsized;
    return { worst: best.worst, atF0: best.atF0, cap: best.cap, stub: best.stub };
  }

  /*
   * The collinear (the owner's choice, 2026-11-18): the sleeve dipole with more sections stacked above it, each joint a
   * shorted stub of wire folded down beside the rod below (the owner's choice, over one straight out sideways), its legs
   * side by side, modelled as real wire: the rods and the stubs are one wire along their path (crooked.js
   * buildCollinearWire), so its coupling to the rod is in. An ideal line in its place came out about 7 mm wrong even
   * straight out sideways, in nec2++ with real wires. A quarter-wave stub nearly stops the current at its joint and leaves the section above in antiphase; the
   * best are about 40 mm, an inductance, with sections longer than a half wave (about 0.6 to 0.7 wavelengths), as commercial
   * collinears' coils and 5/8 wave sections are. So the sections above the first are all one length (the top one its own),
   * the stubs all one length, and those four lengths are sized with the match for the most gain toward the horizon, worst
   * across the band, matched tight at the design's frequency and looser across the band (the owner's choice: a node stays
   * on one channel).
   */
  const COLIN = {
    joint: 6,                                       // mm: the gap between two rods' ends at a joint: the legs' spacing, each end straight out to its leg
    stub: { spacing: 6, d: 1.0, out: 9, material: "copper" },   // mm: the stub's legs, side by side and apart, thick (1 mm copper), and out from the rod's axis
    first: [0.21, 0.40],                            // the feed's middle to the first joint, in wavelengths
    rest: [0.45, 0.70],                             // each section above, joint to joint (the top: joint to tip), in wavelengths
    stubLen: [5, 100],                              // mm: the stub's length, down beside the rod below from the joint's lower rod end to its short
    starts: [15, 25, 35, 45, 55, 65],               // mm: the stub lengths the search starts from, one per worker
    tight: [1.1, 1.5],                              // SWR: at the design's frequency, and worst across the band
    searchPoints: 5,                                // frequencies across the band while searching (the answer is judged on BAND_POINTS)
  };
  const COLIN_CAPS = [2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];     // pF: E12 values; a collinear's feed asks a wider range than a dipole's

  /** Is this design a collinear (a sleeve dipole with sections stacked above)? */
  const isCollinear = (design) => isDipole(design) && !!design.elements[0].colin;

  /** Puts four lengths on a collinear: [first, middle, top, stub], mm; the element's L follows. */
  function setColin(design, x) {
    const e = design.elements[0], n = e.colin.sections.length, secs = [x[0]];
    for (let i = 1; i < n; i++) secs.push(i === n - 1 ? x[2] : x[1]);
    e.colin.sections = secs.map((v) => Math.round(v * 10) / 10);
    e.colin.stub = Object.assign({}, e.colin.stub, { length: Math.round(x[3] * 10) / 10 });
    e.L = Math.round((e.sleeve.length + e.colin.sections.reduce((a, b) => a + b, 0)) * 10) / 10;
  }

  /** The matches size() tries on a collinear for a choice of cap: as triesFor, over COLIN_CAPS. */
  const colinTries = (cap) => (cap === "auto" ? COLIN_CAPS : typeof cap === "string" && cap.indexOf("stub:") === 0 ? COLIN_CAPS.map((pF) => ({ stub: cap.slice(5), pF })) : [cap]);

  /**
   * The best hairpin and capacitor (or stub) for a feed's impedances zs at fs (the band's points, then f0): least excess over
   * COLIN.tight. Applied after the solve, so it costs nothing to try each.
   */
  function colinMatch(zs, fs, f0, cap) {
    let best = null;
    for (const c of colinTries(cap)) {
      if (!(c > 0) && !(c && c.stub)) {
        const sw = zs.map((z) => YS.swrOf(z[0], z[1], 50)), w = Math.max.apply(null, sw.slice(0, -1)), a = sw[sw.length - 1];
        const r = { cost: 0, worst: w, atF0: a, cap: 0, stub: null, pin: null };
        if (!best || r.cost < best.cost) best = r;
        continue;
      }
      const stub = c.stub ? stubFor(c.pF, c.stub, f0) : null;
      for (let h = PIN_RANGE[0]; h <= PIN_RANGE[1] + 1e-9; h += 0.25) {
        const pin = Object.assign({}, PIN, { length: h }), m = { hairpin: pin };
        if (stub) m.stub = stub; else m.cap = c;
        const sw = zs.map((z, i) => { const q = YS.feedMatch(z, m, fs[i]); return YS.swrOf(q[0], q[1], 50); });
        const w = Math.max.apply(null, sw.slice(0, -1)), a = sw[sw.length - 1];
        const cost = 8 * Math.max(0, a - COLIN.tight[0]) + 2 * Math.max(0, w - COLIN.tight[1]);
        if (!best || cost < best.cost - 1e-12) best = { cost, worst: w, atF0: a, cap: stub ? 0 : c, stub, pin };
      }
    }
    return best;
  }

  /** A collinear's lengths x = [first, middle, top, stub]: the gain toward the horizon, worst across the band, and its match. */
  function colinEval(design, x, cap, points) {
    const lam = lambda(design.f0), n = design.elements[0].colin.sections.length;
    const lim = (v, r) => v >= r[0] * lam && v <= r[1] * lam;
    if (!lim(x[0], COLIN.first) || (n > 2 && !lim(x[1], COLIN.rest)) || !lim(x[2], COLIN.rest) || x[3] < COLIN.stubLen[0] || x[3] > COLIN.stubLen[1]) return { cost: 99 };
    const d = JSON.parse(JSON.stringify(design));
    setColin(d, x);
    d.hairpin = null; d.seriesC = 0; d.seriesStub = null; d.coil = 0;
    const b = d.band, k = points || BAND_POINTS, fs = Array.from({ length: k }, (_, i) => b[0] + (b[1] - b[0]) * i / (k - 1)).concat([d.f0]);
    const rows = YS.sweep(YS.toSolver(d), fs, { level: 0, quality: "draft" });
    const gain = Math.min.apply(null, rows.slice(0, -1).map((r) => r.gainDbd + 2.15)), m = colinMatch(rows.map((r) => r.z), fs, d.f0, cap);
    return { cost: -gain + m.cost, gain, match: m };
  }

  /** Nelder-Mead in any number of dimensions. */
  function simplex(cost, x0, step, iters) {
    let P = [x0.slice()];
    for (let i = 0; i < x0.length; i++) { const x = x0.slice(); x[i] += step[i]; P.push(x); }
    let V = P.map(cost);
    const n = x0.length;
    for (let it = 0; it < iters; it++) {
      const idx = V.map((v, i) => i).sort((a, b) => V[a] - V[b]);
      P = idx.map((i) => P[i]); V = idx.map((i) => V[i]);
      const c = x0.map((_, j) => P.slice(0, n).reduce((s2, p) => s2 + p[j], 0) / n), go = (t) => c.map((v, j) => v + t * (P[n][j] - v));
      const r = go(-1), vr = cost(r);
      if (vr < V[0]) { const e = go(-2), ve = cost(e); if (ve < vr) { P[n] = e; V[n] = ve; } else { P[n] = r; V[n] = vr; } }
      else if (vr < V[n - 1]) { P[n] = r; V[n] = vr; }
      else {
        const k = go(0.5), vk = cost(k);
        if (vk < V[n]) { P[n] = k; V[n] = vk; }
        else for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => (v + P[0][j]) / 2); V[i] = cost(P[i]); }
      }
      if (Math.max.apply(null, P.map((p) => Math.max.apply(null, p.map((v, j) => Math.abs(v - P[0][j]))))) < 0.05) break;
    }
    return { x: P[0], c: V[0] };
  }

  /**
   * Sizes a collinear in place: its four lengths and its match. tr: { cap, start } (start: the stub length a worker's search
   * begins from; all of COLIN.starts when there's none). A coarse grid over the sections, then a simplex over all four.
   * Returns { cost, gain, worst, atF0, cap, stub }.
   */
  function sizeColin(design, tr) {
    const lam = lambda(design.f0), n = design.elements[0].colin.sections.length, cap = tr.cap === undefined ? "auto" : tr.cap;
    const starts = tr.start === undefined ? COLIN.starts : [tr.start];
    const cost = (x) => colinEval(design, x, cap, COLIN.searchPoints).cost;     // a smooth curve: fewer points while searching
    const span = (r, k) => Array.from({ length: k }, (_, i) => (r[0] + (r[1] - r[0]) * (i + 0.5) / k) * lam);
    let best = null;
    for (const sl of starts) {
      for (const a of span(COLIN.first, 4)) for (const b of n > 2 ? span(COLIN.rest, 4) : [0.55 * lam]) for (const t of span(COLIN.rest, 4)) {
        const c = cost([a, b, t, sl]);
        if (!best || c < best.c) best = { x: [a, b, t, sl], c };
      }
    }
    const r = simplex(cost, best.x, [0.02 * lam, 0.03 * lam, 0.03 * lam, 4], 90);
    const res = colinEval(design, r.x, cap);
    setColin(design, r.x);
    const m = res.match;
    design.hairpin = m.pin; design.seriesC = m.cap; design.seriesStub = m.stub; design.coil = 0;
    delete design.unsized;
    return { cost: res.cost, gain: res.gain, worst: m.worst, atF0: m.atF0, cap: m.cap, stub: m.stub };
  }

  /**
   * A new vertical dipole design. o: { f0, band, d, material, cap ("auto", pF, or 0), mast: { on, d, behind }, gap, name, radio }.
   * mast.behind is from the mast's axis to the dipole's.
   */
  function make(o) {
    const d = blank(o);
    const r = size(d, o.cap === undefined ? "auto" : o.cap);
    return { design: d, worst: r.worst, atF0: r.atF0, cap: r.cap, stub: r.stub };
  }

  /** The same design before size() has cut its rod and match: a rod of 0.47 wavelengths, no match yet. */
  function blank(o) {
    const lam = lambda(o.f0), top = o.mount === "top" || o.mount === "pod";
    const d = YS.makeDesign({
      name: o.name || `${top ? "Sleeve" : "Vertical"} dipole, ${Math.round(o.f0)} MHz`, kind: "dipole", mount: top ? o.mount : "side", f0: o.f0, band: o.band.slice(),
      polarization: "vertical", gap: o.gap || 3, material: o.material || "brass", radio: o.radio,
      mast: Object.assign({ on: !top, d: 42, behind: 250, length: 2000 }, o.mast || {}, top ? { on: false } : {}),
      elements: [{ type: "driven", x: 0, L: Math.round(0.47 * lam * 10) / 10, d: o.d || 3.175, material: o.material || "brass" }],
    });
    if (top) {
      const tube = o.tube || "k14", coax = o.coax || "rg316", ch = choke(tube, coax, o.f0);
      // its length here is from the gap's middle: the tube itself, the choke, starts at the gap's lower edge
      d.elements[0].sleeve = { tube, d: (TUBES[tube] || TUBES.k14).od, length: Math.round((ch.length + (o.gap || 3) / 2) * 10) / 10, coax };
      d.elements[0].L = Math.round((ch.length + 0.23 * lam) * 10) / 10;
      const n = Math.round(o.sections || 1);
      if (n > 1) {
        // a collinear: a start that size() replaces
        d.elements[0].colin = { sections: Array(n).fill(0), joint: COLIN.joint, stub: Object.assign({ length: 40 }, COLIN.stub) };
        setColin(d, [0.33 * lam, 0.62 * lam, 0.62 * lam, 40]);
        if (!o.name) d.name = `Collinear, ${n} sections, ${Math.round(o.f0)} MHz`;
      }
    }
    if (!d.radio) delete d.radio;
    d.unsized = true;      // its start screen offers a match until size() has cut it
    return d;
  }

  /**
   * The pattern round it (the azimuth, with its rod upright), from a solver row with cuts: the strongest and weakest
   * directions, the ripple between them, and the gain away from and toward the mast (the mast sits behind, at 180 degrees).
   */
  function roundness(row) {
    if (!row || !row.cuts) return null;
    const h = row.cuts.h, mx = Math.max.apply(null, h), mn = Math.min.apply(null, h);
    return { max: mx, min: mn, ripple: mx - mn, away: h[0], toward: h[180], best: h.indexOf(mx), worst: h.indexOf(mn) };
  }

  /**
   * size() on the page's worker pool: each standard capacitor on its own worker when cap is "auto". Resolves to
   * { design, worst, atF0, cap }, the design a sized copy.
   */
  async function sizeOn(pool, design, cap) {
    if (isCollinear(design)) {
      // a collinear: one search per starting stub length, each over every capacitor; the least cost kept
      const all = await Promise.all(COLIN.starts.map((start) => pool.run("dipoleSize", { design, cap: { cap, start } })));
      return all.reduce((b, r) => (!b || r.cost < b.cost ? r : b), null);
    }
    const res = await Promise.all(triesFor(cap).map((c) => pool.run("dipoleSize", { design, cap: c })));
    return res.reduce((b, r) => (!b || r.worst + 0.1 * r.atF0 < b.worst + 0.1 * b.atF0 ? r : b), null);
  }

  /** A sleeve dipole's two halves: the rod above the feed and the tube below, mm from the gap's middle. */
  const halves = (design) => { const e = design.elements[0]; return e.sleeve ? { up: e.L - e.sleeve.length, low: e.sleeve.length } : { up: e.L / 2, low: e.L / 2 }; };
  const isSleeve = (design) => isDipole(design) && !!design.elements[0].sleeve;

  YS.dipole = { make, blank, size, sizeOn, stubFor, choke, halves, isSleeve, isCollinear, setColin, TUBES, COAX, judge, roundness, isDipole, CAPS, COLIN_CAPS, COLIN, PIN, PIN_RANGE };
})(typeof globalThis !== "undefined" ? globalThis : this);
