/*
 * Yagi Studio: the design model and the RF arithmetic round the solver. Transmission lines,
 * Touchstone files, exports and imports, and the starting designs. No DOM.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  const CABLES = {               // velocity factor, and loss in dB per metre at 1 GHz (scales with sqrt f)
    rg178: { name: "RG178", vf: 0.695, lossAt1G: 1.6 },
    rg316: { name: "RG316", vf: 0.695, lossAt1G: 1.0 },
    rg174: { name: "RG174", vf: 0.66, lossAt1G: 1.05 },
    rg58: { name: "RG58", vf: 0.66, lossAt1G: 0.54 },
    lmr240: { name: "LMR-240", vf: 0.84, lossAt1G: 0.24 },
    lmr400: { name: "LMR-400", vf: 0.85, lossAt1G: 0.13 },
  };

  // ids outlive a reload, in saved designs, so a plain counter could hand out one already in use
  let nextId = 1;
  const newId = () => "e" + Date.now().toString(36) + "-" + (nextId++);

  /** Names follow position: the reflector and driven element keep theirs, directors count up. */
  function renameElements(elements) {
    let n = 0;
    for (const e of elements) {
      if (e.type === "director") e.name = "D" + (++n);
      else if (e.type === "driven") e.name = "Driven";
      else e.name = "Reflector";
    }
    return elements;
  }

  function makeDesign(o) {
    return Object.assign({
      name: "Untitled", f0: 915, band: [902, 928], z0: 50, gap: 3, material: "aluminium",
      polarization: "vertical", endCap: true, feedWire: 0, boomFace: 10,
      mast: { on: false, d: 42, behind: 100, length: 2000 },
      cable: { on: false, kind: "rg178", length: 150, vf: 0.695, lossAt1G: 1.6 },
      ground: { on: false, height: 6000, kind: "average" },
      asBuilt: null, notes: "", screws: false,   // screws: M3 screws will hold the rods, which the 3D print tab makes holes for
    }, o, { elements: renameElements(o.elements.map((e) => Object.assign({ id: newId() }, e))) });
  }

  /**
   * A rod's bends, as the general solver wants them. bend holds what you can measure, in mm: shift, how far the rod
   * sits to one side, and how far each tip is from straight: topF, botF along the boom, forward positive; topS, botS across it.
   * Each half is straight out to face, where it leaves the boom. A driven element's halves stay at the gap,
   * so its shift makes one half longer and the other shorter.
   */
  function crookOf(bend, L, face, driven) {
    if (!bend) return undefined;
    const run = Math.max(L / 2 - face, 1);
    const half = (f, s) => {
      const t = Math.hypot(f || 0, s || 0);
      return t ? { deg: Math.asin(Math.min(t / run, 0.97)) * 180 / Math.PI, az: Math.atan2(s || 0, f || 0) * 180 / Math.PI, from: face } : undefined;
    };
    const c = {}, upper = half(bend.topF, bend.topS), lower = half(bend.botF, bend.botS);
    if (upper) c.upper = upper;
    if (lower) c.lower = lower;
    if (bend.shift) c[driven ? "top" : "shift"] = bend.shift;
    return Object.keys(c).length ? c : undefined;
  }

  /** The design as the solver sees it, with the rods sorted along the boom. */
  function toSolver(design, offsets) {
    const list = design.elements.slice().sort((a, b) => a.x - b.x);
    const feed = list.findIndex((e) => e.type === "driven");
    const off = offsets || design.asBuilt || null;
    const elements = list.map((e) => {
      let L = e.L;
      if (off) {
        if (e.type === "reflector") L += off.reflector || 0;
        else if (e.type === "driven") L += off.driven || 0;
        else L += off.directors || 0;
      }
      const face = design.boomFace === undefined ? 10 : design.boomFace;
      const out = { x: e.x, L, d: e.d, material: e.material || design.material };
      const crook = crookOf(e.bend, L, face, e.type === "driven");
      if (crook) { out.crook = crook; out.bend = e.bend; }
      return out;
    });
    const s = { f0: design.f0, feed: feed < 0 ? 0 : feed, gap: design.gap, z0: design.z0, material: design.material, elements, feedWire: design.feedWire || 0, boomFace: design.boomFace === undefined ? 10 : design.boomFace };
    if (design.endCap === false) s.endCap = 0;
    if (design.mast && design.mast.on && design.polarization === "vertical") {
      const first = Math.min.apply(null, design.elements.map((e) => e.x));
      s.extra = [{ x: first - design.mast.behind, y: 0, L: design.mast.length, d: design.mast.d, material: "steel" }];
    }
    return s;
  }

  function boomLength(design) {
    const xs = design.elements.map((e) => e.x);
    return Math.max.apply(null, xs) - Math.min.apply(null, xs);
  }

  /* ------------ complex numbers as [re, im] ------------ */
  const cx = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
    abs: (a) => Math.hypot(a[0], a[1]),
    exp: (a) => { const m = Math.exp(a[0]); return [m * Math.cos(a[1]), m * Math.sin(a[1])]; },
  };

  const gammaOf = (z, z0) => cx.div([z[0] - z0, z[1]], [z[0] + z0, z[1]]);
  const zOfGamma = (g, z0) => { const r = cx.div([1 + g[0], g[1]], [1 - g[0], -g[1]]); return [r[0] * z0, r[1] * z0]; };
  const swrOfGamma = (g) => { const m = Math.min(cx.abs(g), 0.999999); return (1 + m) / (1 - m); };

  /** One-way loss in dB and electrical length in radians of a cable at f. */
  function cablePath(cable, f) {
    const lossDb = cable.lossAt1G * Math.sqrt(f / 1000) * cable.length / 1000;
    const beta = 2 * Math.PI * f * 1e6 / (cable.vf * 299792458) * cable.length / 1000;
    return { lossDb, beta };
  }

  /** Reflection at the far (VNA) end of a cable, from the reflection at the antenna. */
  function gammaThroughCable(g, cable, f) {
    const { lossDb, beta } = cablePath(cable, f);
    const a = -2 * lossDb * Math.LN10 / 20;
    return cx.mul(g, cx.exp([a, -2 * beta]));
  }

  /** The reverse: the reflection at the antenna, from what the VNA reads through the cable. */
  function gammaRemoveCable(g, cable, f) {
    const { lossDb, beta } = cablePath(cable, f);
    const a = 2 * lossDb * Math.LN10 / 20;
    return cx.mul(g, cx.exp([a, 2 * beta]));
  }

  /**
   * The cable's length from a reading with the feed shorted. A short reflects -1 at the antenna, so
   * the phase at the VNA gives the round trip, up to whole half-wavelengths; a rough length picks.
   */
  function cableFromShort(zShort, f, vf, roughMm, z0) {
    const g = gammaOf(zShort, z0);
    const phase = Math.atan2(g[1], g[0]);                 // = pi - 2 beta (mod 2 pi)
    const lamCable = vf * 299792458 / (f * 1e6) * 1000;   // mm
    const base = ((Math.PI - phase) / (4 * Math.PI)) * lamCable;
    const n = Math.round((roughMm - base) / (lamCable / 2));
    return { length: base + n * lamCable / 2, magnitude: cx.abs(g), step: lamCable / 2 };
  }

  /* ------------ Touchstone ------------ */
  /** Reads a .s1p: returns [{ f, g: [re, im] }] with f in MHz. Accepts RI, MA and DB. */
  function parseTouchstone(text) {
    let unit = 1e3, fmt = "MA", z0 = 50;      // the format's defaults, with no option line: GHz, magnitude and angle
    const pts = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.split("!")[0].trim();
      if (!line) continue;
      if (line[0] === "#") {
        const t = line.slice(1).trim().toUpperCase().split(/\s+/);
        unit = { HZ: 1e-6, KHZ: 1e-3, MHZ: 1, GHZ: 1e3 }[t[0]] || 1e3;
        fmt = t[2] || "MA";
        const r = t.indexOf("R");
        if (r >= 0) z0 = parseFloat(t[r + 1]) || 50;
        continue;
      }
      const v = line.split(/\s+/).map(Number);
      if (v.length < 3 || v.some(isNaN)) continue;
      let g;
      if (fmt === "RI") g = [v[1], v[2]];
      else {
        const mag = fmt === "DB" ? Math.pow(10, v[1] / 20) : v[1], a = v[2] * Math.PI / 180;
        g = [mag * Math.cos(a), mag * Math.sin(a)];
      }
      pts.push({ f: v[0] * unit, g });
    }
    if (!pts.length) throw new Error("No data rows found. Expected a Touchstone .s1p file with frequency and S11 columns.");
    return { points: pts, z0 };
  }

  function toTouchstone(rows, z0, comment) {
    const out = ["! " + (comment || "Yagi Studio simulation"), `# MHz S RI R ${z0}`];
    for (const r of rows) {
      const g = gammaOf(r.z, z0);
      out.push(`${r.f.toFixed(6)} ${g[0].toFixed(6)} ${g[1].toFixed(6)}`);
    }
    return out.join("\n") + "\n";
  }

  /* ------------ exports ------------ */
  const SIGMA = { aluminium: 3.5e7, brass: 1.5e7, copper: 5.8e7, steel: 1.4e6 };

  /** A NEC-2 deck for nec2++, 4nec2 or EZNEC. Metres, elements along z. */
  function necDeck(design, opts) {
    const o = opts || {};
    const s = toSolver(design);
    const segs = o.segments || 31;
    const lines = ["CM " + design.name, "CM Written by Yagi Studio", "CE"];
    s.elements.forEach((e, i) => {
      const x = (e.x / 1000).toFixed(6), h = (e.L / 2000).toFixed(6), r = (e.d / 2000).toFixed(6);
      lines.push(`GW ${i + 1} ${segs} ${x} 0 -${h} ${x} 0 ${h} ${r}`);
    });
    (s.extra || []).forEach((e, i) => {
      const n = s.elements.length + i + 1, x = (e.x / 1000).toFixed(6), h = (e.L / 2000).toFixed(6);
      lines.push(`GW ${n} 41 ${x} 0 -${h} ${x} 0 ${h} ${(e.d / 2000).toFixed(6)}`);
    });
    lines.push("GE 0");
    if (s.extra && s.extra.length) lines.push("EK");
    s.elements.forEach((e, i) => {
      const sig = SIGMA[e.material || design.material];
      if (sig) lines.push(`LD 5 ${i + 1} 0 0 ${sig.toExponential(4)}`);
    });
    const fs = o.freqs || [design.f0];
    const step = fs.length > 1 ? fs[1] - fs[0] : 0;
    lines.push(`FR 0 ${fs.length} 0 0 ${fs[0].toFixed(4)} ${step.toFixed(4)}`);
    lines.push(`EX 0 ${s.feed + 1} ${(segs >> 1) + 1} 0 1 0`);
    lines.push("RP 0 1 2 1000 90 0 0 180");
    lines.push("EN");
    return lines.join("\n") + "\n";
  }

  /** A YagiCAD 6 file. The format was worked out from YagiCAD's example models. */
  function yc6(design, sim) {
    const s = toSolver(design);
    const a = sim || { gainDbd: 0, fb: 0, z: [0, 0] };
    const pad = (v) => v + "      ";
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0"), mm = String(today.getMonth() + 1).padStart(2, "0");
    const rows = s.elements.map((e, i) => [(e.L / 1000).toFixed(6), (e.x / 1000).toFixed(6), (e.d / 1000).toFixed(6), "0", "0", "31", i === s.feed ? "1" : "0", "0"].map(pad).join("") + "0");
    const lines = ["VK3DIP YAGICAD 6.0 FILE", design.name, `${dd}/${mm}/${today.getFullYear()}`, "Yagi Studio",
      `${rows.length} element Yagi for ${design.f0} MHz`, a.gainDbd.toFixed(2), a.fb.toFixed(1), a.z[0].toFixed(1), a.z[1].toFixed(1), String(rows.length)]
      .concat(rows)
      .concat([String(design.f0), "100", "DIRECT", "0", "0", "0", "0", "0", "0", "0", String(design.z0), (s.elements[0].d / 1000).toFixed(6), "0", "0", "", "*****EOF*****"]);
    return lines.join("\r\n") + "\r\n";
  }

  /* ------------ imports ------------ */
  function typeFor(i, feed) { return i === feed ? "driven" : i < feed ? "reflector" : "director"; }

  /** Metres times 1000 leaves dust like 39.800000000000004: nobody cuts to better than a micron. */
  const micron = (mm) => Math.round(mm * 1000) / 1000;

  /** Accepts this app's JSON, the DuvYagi's own design files, a NEC deck, or a YagiCAD .YC6. */
  function importText(text, filename) {
    const name = (filename || "Imported").replace(/\.[^.]*$/, "");
    const t = text.trim();
    if (t[0] === "{") {
      const j = JSON.parse(t);
      if (j.elements) return makeDesign(j);
      if (j.positions_mm && j.lengths_mm) {
        const feed = Math.max(0, (j.names || []).indexOf("driven"));
        return makeDesign({
          name, f0: j.f0, band: [j.f0 * 0.992, j.f0 * 1.008],
          elements: j.positions_mm.map((x, i) => ({ type: typeFor(i, feed === 0 ? 1 : feed), x, L: j.lengths_mm[i], d: j.diameter_mm })),
        });
      }
      throw new Error("That JSON has no elements. Expected a Yagi Studio design.");
    }
    if (/^VK3DIP YAGICAD/.test(t)) {
      const l = t.split(/\r?\n/);
      const n = parseInt(l[9], 10);
      const rows = l.slice(10, 10 + n).map((r) => r.trim().split(/\s+/).map(Number));
      const feed = Math.max(0, rows.findIndex((r) => r[6] === 1));
      const f0 = parseFloat(l[10 + n]);
      return makeDesign({
        name: l[1] || name, f0, band: [f0 * 0.992, f0 * 1.008],
        elements: rows.map((r, i) => ({ type: typeFor(i, feed), L: micron(r[0] * 1000), x: micron(r[1] * 1000), d: micron(r[2] * 1000) })),
      });
    }
    if (/^\s*(CM|GW)\b/m.test(t)) {
      const rows = [];
      let f0 = 0, feedTag = 0;
      for (const line of t.split(/\r?\n/)) {
        const p = line.trim().split(/[\s,]+/);
        if (p[0] === "GW") {
          const v = p.slice(1).map(Number);
          rows.push({ tag: v[0], x: v[2] * 1000, L: Math.abs(v[7] - v[4]) * 1000, d: v[8] * 2000 });
        } else if (p[0] === "FR") {
          f0 = parseFloat(p[5]);
        } else if (p[0] === "EX") {
          feedTag = parseInt(p[2], 10);
        }
      }
      rows.sort((a, b) => a.x - b.x);
      const feed = Math.max(0, rows.findIndex((r) => r.tag === feedTag));
      if (!rows.length) throw new Error("No GW cards found in that NEC deck.");
      return makeDesign({
        name, f0: f0 || 300, band: [(f0 || 300) * 0.992, (f0 || 300) * 1.008],
        elements: rows.map((r, i) => ({ type: typeFor(i, feed), x: micron(r.x - rows[0].x), L: micron(r.L), d: micron(r.d) })),
      });
    }
    throw new Error("That file wasn't recognised. Try a Yagi Studio .json, a NEC deck (.nec) or a YagiCAD .YC6.");
  }

  /* ------------ starting designs ------------ */
  /** DL6WU-style spacings and lengths, as a starting point for any band and rod count. */
  function startingDesign(f0, count, diameter, material, driven) {
    const lam = 299792.458 / f0;
    const spacing = [0.2, 0.075, 0.18, 0.215, 0.25, 0.28, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375, 0.39, 0.4];
    // thinner rods resonate longer: a log correction around 1% of a wavelength in diameter
    const corr = 1 + 0.03 * Math.log10(0.0096 * lam / diameter);
    const drivenD = (driven && driven.d) || diameter, drivenMetal = (driven && driven.material) || material;   // often not the same rod as the others
    const elements = [{ type: "reflector", x: 0, L: 0.495 * lam * corr, d: diameter }, { type: "driven", x: spacing[0] * lam, L: 0.46 * lam * (1 + 0.03 * Math.log10(0.0096 * lam / drivenD)), d: drivenD }];
    let x = elements[1].x;
    for (let i = 2; i < count; i++) {
      x += (spacing[i - 1] || 0.4) * lam;
      const taper = 0.44 - 0.012 * Math.min(i - 2, 8);
      elements.push({ type: "director", x, L: taper * lam * corr, d: diameter });
    }
    const fine = (v) => Math.round(v * 10) / 10;
    for (const e of elements) { e.x = fine(e.x); e.L = fine(e.L); e.material = e.type === "driven" ? drivenMetal : material; }
    return makeDesign({ name: `${count}-element ${Math.round(f0)} MHz`, f0, band: [f0 * 0.992, f0 * 1.008], material, elements });
  }

  // the first prototype, cad/parts.py's booms: the solver's reference tests use it, against nec2++ and the full-surface model
  const DUV_POS = [0, 39.8, 73.5, 163.8, 272.4, 378.6];
  const DUV_LEN = [158.6, 149.0, 142.3, 140.8, 138.3, 136.1];
  // the second, designed, printed, built and tuned in Yagi Studio (the owner, 2026-11-08): its YagiCAD file, and what the owner
  // measured on its rods (D3 not measured), from the Tune tab
  const DUV2_POS = [0, 46.2, 86.5, 167.9, 282.3, 381.0];
  const DUV2_LEN = [160.2, 151.9, 144.9, 142.0, 138.5, 137.1];
  const DUV2_MEASURED = [160.0, 151.2, 144.7, 142.2, null, 137.4];
  // the third and fourth, two of the same 8 dBd design, printed, built and swept (the owner, 2026-11-11): its file from Yagi
  // Studio's Design tab, at the design's lengths, which both were cut from
  const DUV8_POS = [0, 24.925, 40.9, 118.8, 195.0];
  const DUV8_LEN = [164.8, 156.6, 147.2, 144.6, 140.3];
  const IN = 25.4;

  const PRESETS = {
    duvyagi: () => {
      const d = makeDesign({
        name: "DuvYagi 10 dBd (as built)", f0: 910.525, band: [903.525, 917.525], material: "aluminium", gap: 3,
        radio: { use: "meshcore", title: "USA", f: 910.525, bw: 62.5, sf: 7, cr: 5, rule: "fcc" },
        notes: "Designed, printed, built and tuned in Yagi Studio: 3.00 mm aluminum with a 1/8 in brass driven element, its two-piece boom printed in ASA from the 3D print tab. Each half of the driven element was filed 2.4 mm from its cut length. Its NanoVNA showed SWR 1.35 at 910.525 MHz through 270 mm of RG178, and it was left as it is.",
        elements: DUV2_POS.map((x, i) => ({
          type: typeFor(i, 1), x, L: DUV2_LEN[i], d: i === 1 ? 3.175 : 3.0, material: i === 1 ? "brass" : "aluminium",
        })),
        cable: { on: true, kind: "rg178", length: 270, vf: 0.695, lossAt1G: 1.6 },
      });
      d.tune = { readings: [], measured: {}, range: [856, 965], target: 910.525, sample: false, free: { directors: true, driven: true, reflector: false } };
      d.elements.forEach((e, i) => { if (DUV2_MEASURED[i] !== null) d.tune.measured[e.id] = { L: DUV2_MEASURED[i] }; });
      return d;
    },
    duvyagi8: () => {
      const d = makeDesign({
        name: "DuvYagi 8 dBd", f0: 910.525, band: [908, 912], material: "aluminium", gap: 3,
        radio: { use: "meshcore", title: "USA", f: 910.525, bw: 62.5, sf: 7, cr: 5, rule: "fcc" },
        notes: "Designed in Yagi Studio and built twice: 3.00 mm aluminum with a 1/8 in brass driven element, its boom printed from the 3D print tab. Swept through about 250 mm of RG316, the first showed SWR 1.46 at 910.525 MHz (best 1.05 at 918.1 MHz), with rods of 162.7, 162.3, 146.9, 144.3 and 139.5 mm; the second SWR 1.18 (best 1.13 at 914.9 MHz), with 163.9, 160.8, 146.8, 144.4 and 138.5 mm. Both were left as they are. Both driven elements were cut longer than the design's 156.6 mm, and still acted several mm short, so the halves' gap at the feed is likely wider than the 3 mm modelled.",
        elements: DUV8_POS.map((x, i) => ({
          type: typeFor(i, 1), x, L: DUV8_LEN[i], d: i === 1 ? 3.175 : 3.0, material: i === 1 ? "brass" : "aluminium",
        })),
        cable: { on: true, kind: "rg316", length: 250, vf: 0.695, lossAt1G: 1.0 },
      });
      d.boomText = "DuvYagi 8dBd";
      d.screws = true;
      d.tune = { readings: [], measured: {}, range: [856, 965], target: 910.525, sample: false, free: { directors: true, driven: true, reflector: false } };
      return d;
    },
    duvyagi1: () => makeDesign({
      name: "DuvYagi first prototype", f0: 910.525, band: [903.525, 917.525], material: "aluminium", gap: 3,
      radio: { use: "meshcore", title: "USA", f: 910.525, bw: 62.5, sf: 7, cr: 5, rule: "fcc" },
      notes: "The first printed prototype, with cad/parts.py's booms: 3.00 mm aluminum with a 1/8 in brass driven element, at the design's lengths. Its valley measured about 9 MHz above the model's.",
      elements: DUV_POS.map((x, i) => ({
        type: typeFor(i, 1), x, L: DUV_LEN[i], d: i === 1 ? 3.175 : 3.0, material: i === 1 ? "brass" : "aluminium",
      })),
      cable: { on: false, kind: "rg178", length: 120, vf: 0.695, lossAt1G: 1.6 },
    }),
    gcarc: () => makeDesign({
      name: "GCARC 915 MHz (5 element)", f0: 915, band: [902, 928], material: "brass", gap: 1.5,
      notes: "w2mmdskunkworks' 915 MHz window Yagi: 1/16 in brass. YagiCAD's NEC-2 gives 7.72 dBd, F/B 16.3 dB, 36.5 - j20 ohm.",
      elements: [0, 2.59375, 3.5625, 5.875, 8.656248].map((x, i) => ({
        type: typeFor(i, 1), x: x * IN, L: [6.281252, 6.0625, 5.656252, 5.593748, 5.531252][i] * IN, d: 0.063 * IN,
      })),
    }),
    eu868: () => startingDesign(869.525, 6, 3, "aluminium"),
    ism915: () => startingDesign(915, 5, 3, "aluminium"),
    two: () => startingDesign(146, 5, 6, "aluminium"),
    seventy: () => startingDesign(435, 7, 4, "aluminium"),
    ghz: () => startingDesign(1296, 10, 3, "copper"),
  };

  /* The first prototype's first readings, taken from photos of the NanoVNA screen. */
  const DUV_SWEEP = [
    { f: 860, swr: 2.9 }, { f: 880, swr: 2.15 }, { f: 895, swr: 1.92 }, { f: 905, swr: 1.92 }, { f: 910, swr: 1.86 },
    { f: 915, swr: 1.5 }, { f: 919, swr: 1.3 }, { f: 923, swr: 1.21 }, { f: 927, swr: 1.45 }, { f: 931, swr: 2.0 }, { f: 936, swr: 2.75 },
  ];

  Object.assign(YS, { CABLES, makeDesign, renameElements, newId, toSolver, crookOf, boomLength, cx, gammaOf, zOfGamma, swrOfGamma, cablePath,
    gammaThroughCable, gammaRemoveCable, cableFromShort, parseTouchstone, toTouchstone, necDeck, yc6, importText, startingDesign,
    PRESETS, DUV_SWEEP });
})(typeof globalThis !== "undefined" ? globalThis : this);
