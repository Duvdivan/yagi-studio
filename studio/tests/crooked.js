/*
 * Rods that aren't straight, parallel or centred: what a crooked build does to an antenna.
 *
 * The general solver is in src/crooked.js, which the app uses too. This checks it and runs the studies.
 *
 * Method. Galerkin with Richmond's sine tents on every panel of a whole rod, in the mixed-potential form,
 * which holds for panels at any angle (Harrington, "Field Computation by Moment Methods", 1968):
 *
 *     Z_mn = j eta / (4 pi) * [ k * integral integral (t.t') f_m f_n G  -  1 / k * integral integral f_m' f_n' G ]
 *
 * Within a rod G is the tube kernel, as in solver.js, taken at the distance between the two points, so
 * a bent rod joins up with a straight one as the bend goes to nothing. Between rods it is a filament,
 * also as in solver.js. Each frequency takes about 100 ms, so this is for studies, not for the optimizer.
 *
 * Bends, leans and shifts keep each rod's length along its curve, as bending a real rod does. A rod is
 * held straight inside the boom, so each half bends on its own, in any direction, from where it leaves
 * the boom or from further out. The mesh nodes follow the curve and each panel is the straight chord
 * between two of them.
 *
 *     node tests/crooked.js            -> the checks, what the feed gap does, then the study (a few minutes)
 *     node tests/crooked.js --checks   -> the checks only, which tests/validate.js also runs
 *     node tests/crooked.js --folded   -> a folded dipole in place of the split driven element
 *
 * The checks: straight rods against solver.js, and crooked thin rods against nec2++ (which is right on thin
 * wire and takes any shape). Millimetres, MHz, degrees.
 */
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
for (const f of ["solver", "crooked", "rf", "tasks"]) require(path.join(__dirname, "..", "src", f + ".js"));
const YS = globalThis.YS;
const { prepare, solve, valley, walk, BOOM_FACE } = YS.crooked;
const NEC_EXE = process.env.NEC2PP || path.join(os.homedir(), "Tools", "yagicad_dl", "yc633", "nec2++.exe");

/* ---------- nec2++, on any rods given as lists of straight pieces ---------- */
function necRun(lines, f, segs, dia, feedTag, feedSeg) {
  const l = ["CM crooked", "CE"];
  lines.forEach((q, i) => l.push(`GW ${i + 1} ${q.segs || segs} ${q.a.map((v) => (v / 1000).toFixed(7)).join(" ")} ${q.b.map((v) => (v / 1000).toFixed(7)).join(" ")} ${(dia / 2000).toFixed(6)}`));
  l.push("GE 0", "LD 5 0 0 0 3.5e7", `FR 0 1 0 0 ${f.toFixed(4)} 0`, `EX 0 ${feedTag} ${feedSeg} 0 1 0`, "RP 0 1 2 1000 90 0 0 180", "EN");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nec"));
  const a = path.join(d, "i.nec"), b = path.join(d, "o.txt");
  fs.writeFileSync(a, l.join("\n") + "\n");
  cp.execFileSync(NEC_EXE, [`-i${a}`, `-o${b}`]);
  const blk = fs.readFileSync(b, "utf8").split("ANTENNA INPUT PARAMETERS")[1];
  const row = blk.slice(blk.indexOf("(WATTS)")).split(/\r?\n/)[1].trim().split(/\s+/);
  const g = {};
  for (const ln of blk.slice(blk.indexOf("RADIATION PATTERNS")).split(/\r?\n/).slice(1)) {
    const p = ln.trim().split(/\s+/), ph = parseFloat(p[1]), tot = parseFloat(p[4]);
    if (!isNaN(ph) && !isNaN(tot)) g[Math.round(ph)] = tot; else if (Object.keys(g).length >= 2) break;
  }
  fs.rmSync(d, { recursive: true, force: true });
  return { z: [+row[6], +row[7]], gainDbd: g[0] - 2.15, fb: g[0] - g[180] };
}

/**
 * The same crooked shape as straight pieces for nec2++, broken at each sharp bend. On the fed rod the
 * piece holding the centre runs the same way each side of it, with an odd number of segments, so that the
 * feed's segment sits on the rod's centre.
 */
function necPieces(e, segs, fed) {
  const c = e.crook || {}, h = e.L / 2, ends = [-h, h], z0 = c.shift || 0;
  const at = (u) => { const q = walk(c, 0, u, ends, [0, 0, 0]); return [e.x + q[0], q[1], z0 + q[2]]; };
  const breaks = [-h];
  if (c.lower || fed) breaks.push(-(c.lower && c.lower.from !== undefined ? c.lower.from : BOOM_FACE));
  if (c.upper || fed) breaks.push(c.upper && c.upper.from !== undefined ? c.upper.from : BOOM_FACE);
  breaks.push(h);
  const out = [];
  for (let i = 0; i + 1 < breaks.length; i++) {
    const a = breaks[i], b = breaks[i + 1], holdsCentre = a < 0 && b > 0;
    let n = Math.max(3, Math.round(segs * (b - a) / e.L));
    if (holdsCentre && n % 2 === 0) n++;
    out.push({ a: at(a), b: at(b), segs: n, holdsCentre });
  }
  return out;
}

const POS = [0, 39.8, 73.5, 163.8, 272.4, 378.6], LEN = [158.6, 149, 142.3, 140.8, 138.3, 136.1];

/** Each check: thin rods with one or more crooked, against nec2++ at about 121 segments a rod. */
function thinChecks(report) {
  const dia = 0.2, scale = 1 + 0.0378 * Math.log10(3.175 / dia), f = 910.525, segs = 121;
  const both = (deg, az) => ({ upper: { deg, az }, lower: { deg, az } });
  const cases = [
    ["straight", {}],
    ["D1 slid 10 mm", { 2: { shift: 10 } }],
    ["D2 leaning 5 deg along the boom", { 3: { leanX: 5 } }],
    ["D1 leaning 5 deg across the boom", { 2: { leanY: 5 } }],
    ["D3 and D4 turned 5 deg at the joint", { 4: { leanY: 5 }, 5: { leanY: 5 } }],
    ["D1, one half bent 10 deg forward", { 2: { upper: { deg: 10, az: 0 } } }],
    ["D1, both halves 10 deg toward the reflector", { 2: both(10, 180) }],
    ["D2, both halves 10 deg to one side", { 3: both(10, 90) }],
    ["D2, its halves 15 and 10 deg different ways", { 3: { upper: { deg: 15, az: 45 }, lower: { deg: 10, az: 200 } } }],
    ["driven, both halves 10 deg forward", { 1: both(10, 0) }],
    ["driven, one half 20 deg to one side", { 1: { upper: { deg: 20, az: 90 } } }],
    ["D3, one half 30 deg back and to one side", { 4: { upper: { deg: 30, az: 135 } } }],
    ["D2, bent 30 deg from 40 mm out", { 3: { upper: { deg: 30, az: 200, from: 40 } } }],
    ["reflector, one half 60 deg forward and to one side", { 0: { upper: { deg: 60, az: 45 } } }],
    ["a bit of everything", { 0: { leanY: 3 }, 1: { upper: { deg: 8, az: 30 }, lower: { deg: 5, az: 250 } }, 2: { shift: 4, upper: { deg: 6, az: 300 } }, 3: { lower: { deg: 12, az: 120 } }, 4: both(5, 45), 5: { shift: -6 } }],
  ];
  for (const [name, crook] of cases) {
    const elements = POS.map((x, i) => ({ x, L: LEN[i] * scale, d: dia, crook: crook[i] }));
    const design = { f0: f, feed: 1, gap: 0, z0: 50, material: "aluminium", endCap: 0, elements };
    const a = solve(prepare(design, { quality: "reference" }), f);
    const lines = [];
    let feedTag = 0, feedSeg = 0;
    elements.forEach((e, i) => {
      for (const q of necPieces(e, segs, i === 1)) {
        lines.push(q);
        if (i === 1 && q.holdsCentre) { feedTag = lines.length; feedSeg = (q.segs + 1) / 2; }
      }
    });
    const n = necRun(lines, f, segs, dia, feedTag, feedSeg);
    report(name, a, n);
  }
}

/** A loop against nec2++ on thin wire: alone, and as a Yagi's driven element, with its legs either way. */
function foldedChecks(report) {
  const dia = 0.2, scale = 1 + 0.0378 * Math.log10(3.175 / dia), f = 910.525, segs = 121;
  const loopPieces = (x, L, gap, along) => {
    const dx = along === "x" ? gap : 0, dy = along === "x" ? 0 : gap, x0 = x - dx / 2, y0 = -dy / 2, h = L / 2;
    const links = Math.max(3, Math.round(gap / (L / segs)));
    return [
      { a: [x0, y0, -h], b: [x0, y0, h], segs, feed: true },
      { a: [x0, y0, h], b: [x0 + dx, y0 + dy, h], segs: links },
      { a: [x0 + dx, y0 + dy, h], b: [x0 + dx, y0 + dy, -h], segs },
      { a: [x0 + dx, y0 + dy, -h], b: [x0, y0, -h], segs: links },
    ];
  };
  const run = (name, xs, Ls, feed, gap, along) => {
    const elements = xs.map((x, i) => ({ x, L: Ls[i], d: dia, material: "aluminium", fold: i === feed ? { gap, along } : undefined }));
    // the feed's field spread over one nec2++ segment: at this impedance, even 0.02 pF of difference between feeds shows
    const design = { f0: f, feed, gap: Ls[feed] / segs, z0: 200, material: "aluminium", endCap: 0, elements };
    const a = solve(prepare(design, { quality: "fine" }), f);
    const lines = [];
    let tag = 0;
    elements.forEach((e, i) => {
      if (i === feed) { lines.push(...loopPieces(e.x, e.L, gap, along)); tag = lines.length - 3; }
      else lines.push({ a: [e.x, 0, -e.L / 2], b: [e.x, 0, e.L / 2], segs });
    });
    report(name, a, necRun(lines, f, segs, dia, tag, (segs >> 1) + 1));
  };
  run("folded dipole alone, 15 mm", [0], [150 * scale], 0, 15, "y");
  run("folded dipole alone, 30 mm", [0], [150 * scale], 0, 30, "y");
  const Ls = LEN.map((x) => x * scale);
  run("as a Yagi's driven element, 15 mm across the boom", POS, Ls, 1, 15, "y");
  run("as a Yagi's driven element, 15 mm along the boom", POS, Ls, 1, 15, "x");
}

/** Straight thick rods must give what solver.js gives. */
function straightCheck(report, quality) {
  const design = YS.toSolver(YS.PRESETS.duvyagi());
  const a = solve(prepare(design, { quality }), 910.525), b = YS.sweep(design, [910.525], { quality })[0];
  report(`as built, ${quality} mesh`, a, b);
}

/* ---------- the study: DuvYagi as built ---------- */
const NAMES = ["Reflector", "Driven", "D1", "D2", "D3", "D4"];
const VALLEY = [893, 933, 9];

function runCase(base, crooks, edits) {
  const elements = base.elements.map((e, i) => Object.assign({}, e, { crook: crooks[i] }, edits && edits[i]));
  const sys = prepare(Object.assign({}, base, { elements }), { quality: "normal", counts: base.counts });
  return { at: solve(sys, base.f0, true), v: valley(sys, VALLEY[0], VALLEY[1], VALLEY[2]) };
}

function printRow(label, r, ref) {
  const a = r.at, sign = (v, n) => (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(n);
  console.log(`  ${label.padEnd(42)} ${a.z[0].toFixed(1).padStart(6)} ${a.z[1].toFixed(1).padStart(6)}  ${a.swr.toFixed(3)}  ${sign(a.swr - ref.at.swr, 3)}  ${sign(r.v.f - ref.v.f, 2).padStart(6)}  ${sign(a.gainDbd - ref.at.gainDbd, 3)}  ${sign(a.fb - ref.at.fb, 1).padStart(5)}  ${a.az || a.el ? `${a.az},${a.el}` : "0"}`);
}

/** Which way each compass direction points, for one rod's tip. */
const AZ = [[0, "forward"], [45, "fwd+side"], [90, "side"], [135, "back+side"], [180, "back"]];

function study() {
  const base = YS.toSolver(YS.PRESETS.duvyagi());
  base.counts = YS.buildWires(base, { quality: "normal" }).map((w) => w.m);
  const ref = runCase(base, {});
  console.log(`\nDuvYagi as built, straight: ${ref.at.z[0].toFixed(1)} ${ref.at.z[1].toFixed(1)}j ohm, SWR ${ref.at.swr.toFixed(3)}, ${ref.at.gainDbd.toFixed(2)} dBd, F/B ${ref.at.fb.toFixed(1)} dB, valley ${ref.v.f.toFixed(1)} MHz at ${ref.v.swr.toFixed(2)}`);
  const head = (t) => console.log(`\n${t}\n  ${"".padEnd(42)}      R      X    SWR  change  valley    gain  F/B  beam`);
  const out = { base: { z: ref.at.z, swr: ref.at.swr, gain: ref.at.gainDbd, fb: ref.at.fb, valley: ref.v.f, depth: ref.v.swr }, rows: [] };
  const row = (label, crooks, edits, tag) => {
    const r = runCase(base, crooks, edits);
    printRow(label, r, ref);
    out.rows.push(Object.assign({ label, z: r.at.z, swr: r.at.swr, dSwr: r.at.swr - ref.at.swr, dValley: r.v.f - ref.v.f, depth: r.v.swr, dGain: r.at.gainDbd - ref.at.gainDbd, dFb: r.at.fb - ref.at.fb, az: r.at.az, el: r.at.el, peak: r.at.peakDbd - ref.at.peakDbd }, tag));
    return r;
  };

  head("Yardsticks: what a length or a position error does");
  for (const i of [0, 1, 2, 3, 4, 5]) row(`${NAMES[i]} 1 mm longer`, {}, { [i]: { L: base.elements[i].L + 1 } });
  for (const i of [1, 2, 3, 4, 5]) row(`${NAMES[i]} 1 mm further forward`, {}, { [i]: { x: base.elements[i].x + 1 } });

  head("Slid to one side along its own axis");
  for (const i of [0, 2, 3, 4, 5]) for (const v of [2, 5, 10]) row(`${NAMES[i]} ${v} mm to one side`, { [i]: { shift: v } });

  head("The whole rod leaning, which the 20 mm hole mostly prevents");
  for (const i of [0, 1, 2, 3, 4, 5]) for (const v of [1, 3]) {
    row(`${NAMES[i]} leaning ${v} deg along the boom`, { [i]: { leanX: v } });
    row(`${NAMES[i]} leaning ${v} deg across the boom`, { [i]: { leanY: v } });
  }

  const bent = (name, mode, make, angles, dirs) => {
    head(name);
    for (let i = 0; i < 6; i++) for (const deg of angles) for (const [az, word] of dirs) {
      row(`${NAMES[i]} ${deg} deg ${word}`, { [i]: make(deg, az) }, null, { kind: mode, rod: NAMES[i], deg, dir: az });
    }
  };
  bent("One half bent where it leaves the boom (top and bottom alike, and left and right)", "one", (deg, az) => ({ upper: { deg, az } }), [5, 10, 20], AZ);
  bent("Both halves bent the same way: both tips forward, back or to one side", "both", (deg, az) => ({ upper: { deg, az }, lower: { deg, az } }), [5, 10, 20], AZ);
  bent("The halves bent opposite ways: one tip forward and the other back, and so on", "opposite", (deg, az) => ({ upper: { deg, az }, lower: { deg, az: az + 180 } }), [5, 10], AZ.slice(0, 3));

  head("Bent further out: both halves 20 deg, from the boom or further along");
  for (const i of [1, 2, 3]) for (const from of [10, 30, 50]) for (const az of [0, 180]) {
    const b = { deg: 20, az, from };
    row(`${NAMES[i]} from ${from} mm, ${az ? "back" : "forward"}`, { [i]: { upper: b, lower: b } });
  }

  head("One tip bent, the last 20 mm");
  for (const i of [0, 2, 3, 4, 5]) for (const az of [0, 180]) row(`${NAMES[i]} tip 30 deg ${az ? "back" : "forward"}`, { [i]: { upper: { deg: 30, az, from: base.elements[i].L / 2 - 20 } } });

  head("A gentle curve in both halves against a sharp bend, reaching the same angle");
  for (const i of [1, 2]) for (const curve of [false, true]) row(`${NAMES[i]} tips 10 deg forward, ${curve ? "curved" : "sharp"}`, { [i]: { upper: { deg: 10, az: 0, curve }, lower: { deg: 10, az: 0, curve } } });

  head("The driven element's two rods uneven (top longer, bottom shorter, tip to tip unchanged)");
  for (const v of [1, 2, 5]) row(`Driven ${v} mm off`, { 1: { top: v } });

  head("The boom's two sections turned against each other at the joint (D3 and D4 lean across)");
  for (const v of [1, 2, 5, 10]) row(`Front section ${v} deg`, { 4: { leanY: v }, 5: { leanY: v } });

  head("All four directors the same way");
  for (const az of [0, 180]) for (const deg of [5, 10, 15]) {
    const b = { deg, az };
    row(`All directors, both halves ${deg} deg ${az ? "back" : "forward"}`, { 2: { upper: b, lower: b }, 3: { upper: b, lower: b }, 4: { upper: b, lower: b }, 5: { upper: b, lower: b } });
  }

  // whole builds drawn at random: every half bent its own way
  const r = YS.rng(1), turn = () => 360 * Math.abs(Math.sin(1e4 * r.normal()));
  const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))]; };
  out.random = {};
  for (const sigma of [1, 3, 6]) {
    console.log(`\nRandom builds: every half bent ${sigma} deg (typical) in any direction; rods 1 mm to one side and leaning 0.5 deg, typical`);
    const runs = [];
    for (let n = 0; n < 50; n++) {
      const crooks = {};
      base.elements.forEach((e, i) => {
        crooks[i] = { shift: i === 1 ? 0 : r.normal(), leanX: 0.5 * r.normal(), leanY: 0.5 * r.normal(),
          upper: { deg: Math.abs(sigma * r.normal()), az: turn() }, lower: { deg: Math.abs(sigma * r.normal()), az: turn() } };
      });
      const q = runCase(base, crooks);
      runs.push({ swr: q.at.swr, gain: q.at.gainDbd, fb: q.at.fb, f: q.v.f });
    }
    const col = (k) => runs.map((q) => q[k]);
    const line = { swr: [pct(col("swr"), 0.5), pct(col("swr"), 0.05), pct(col("swr"), 0.95)], gain: [pct(col("gain"), 0.5), pct(col("gain"), 0.05)], fb: [pct(col("fb"), 0.5), pct(col("fb"), 0.05)], valley: [pct(col("f"), 0.5), pct(col("f"), 0.05), pct(col("f"), 0.95)] };
    console.log(`  SWR at 910.525: median ${line.swr[0].toFixed(3)}, 5 to 95% ${line.swr[1].toFixed(3)} to ${line.swr[2].toFixed(3)} (straight ${ref.at.swr.toFixed(3)})`);
    console.log(`  gain: median ${line.gain[0].toFixed(2)} dBd, 5% ${line.gain[1].toFixed(2)} (straight ${ref.at.gainDbd.toFixed(2)})`);
    console.log(`  F/B: median ${line.fb[0].toFixed(1)} dB, 5% ${line.fb[1].toFixed(1)} (straight ${ref.at.fb.toFixed(1)})`);
    console.log(`  valley: median ${line.valley[0].toFixed(1)} MHz, 5 to 95% ${line.valley[1].toFixed(1)} to ${line.valley[2].toFixed(1)} (straight ${ref.v.f.toFixed(1)})`);
    out.random[sigma] = line;
  }
  return out;
}

/* ---------- the feed gap ---------- */
/**
 * The gap in the whole array: solver.js's impedance, which knows only the tip-to-tip length, plus the
 * lead's series reactance from gap_reference.py, growing with frequency as an inductor's does.
 */
function gapStudy() {
  const py = cp.execFileSync("python", [path.join(__dirname, "gap_reference.py"), "--json"], { encoding: "utf8", cwd: __dirname, timeout: 300000 });
  const rows = JSON.parse(py).rows, F0 = 910.525, THIN = 0.15, gaps = [1, 2, 3, 4, 6, 8, 10];
  const lead = (g, r) => rows.find((q) => q.gap === g && q.r === r).dx;
  const base = YS.toSolver(YS.PRESETS.duvyagi());
  const freqs = [];
  for (let f = 880; f <= 950; f++) freqs.push(f);
  const swrWith = (m, x) => YS.swrOf(m.z[0], m.z[1] + x * m.f / F0, 50);
  const at = (L, g, x) => {
    const s = Object.assign({}, base, { gap: g, elements: base.elements.map((e, i) => (i === base.feed ? Object.assign({}, e, { L }) : e)) });
    const one = YS.sweep(s, [F0])[0], all = YS.sweep(s, freqs);
    let best = Infinity, f = 0;
    for (const m of all) { const v = swrWith(m, x); if (v < best) { best = v; f = m.f; } }
    return { r: one.z[0], x: one.z[1] + x, swr: swrWith(one, x), valley: f, depth: best };
  };
  const trimmed = (g, x) => {
    let a = 130, b = 160;
    const miss = (L) => at(L, g, x).x;
    const fa = miss(a);
    for (let i = 0; i < 22; i++) { const m = 0.5 * (a + b); if (fa * miss(m) <= 0) b = m; else a = m; }
    return 0.5 * (a + b);
  };
  console.log("\nThe gap, with a thin lead (0.3 mm wire, the RG178 core) across it. Driven element 149 mm tip to tip, unless shown.");
  console.log("  gap  lead X  |  tip to tip held at 149: R, X, SWR, valley  |  each rod held at 73 mm: length, SWR, valley  |  length trimmed for X = 0, and each rod");
  for (const g of gaps) {
    const x = lead(g, THIN), a = at(149, g, x), b = at(146 + g, g, x), L = trimmed(g, x);
    console.log(`  ${String(g).padStart(3)} ${x.toFixed(1).padStart(6)}  |  ${a.r.toFixed(1)} ${a.x.toFixed(1).padStart(5)}  ${a.swr.toFixed(2)}  ${a.valley}@${a.depth.toFixed(2)}  |  ${146 + g} ${b.swr.toFixed(2)}  ${b.valley}@${b.depth.toFixed(2)}  |  ${L.toFixed(1)}  ${((L - g) / 2).toFixed(1)}`);
  }
  console.log("\nThe lead's width, at a 3 mm gap");
  for (const r of [0.15, 0.25, 0.5, 1]) {
    const x = lead(3, r), a = at(149, 3, x);
    console.log(`  ${(2 * r).toFixed(1)} mm wide: +${x.toFixed(1)} ohm, SWR ${a.swr.toFixed(2)}, trimmed length ${trimmed(3, x).toFixed(1)} mm`);
  }
}

/* ---------- a folded driven element ---------- */
/**
 * The DuvYagi with a folded dipole for its driven element, of the same rod, trimmed for X = 0 at the target.
 * It's judged against 200 ohm, as a 4:1 balun gives, with the split element against 50 ohm alongside.
 */
function foldedStudy() {
  const base = YS.toSolver(YS.PRESETS.duvyagi()), F0 = 910.525, feed = base.feed, grid = [];
  for (let f = 880; f <= 945; f += 1) grid.push(f);
  const run = (fold, L, gap) => {
    const elements = base.elements.map((e, i) => (i === feed ? Object.assign({}, e, { L, fold }) : e));
    return prepare(Object.assign({}, base, { elements, gap: gap === undefined ? base.gap : gap }), { quality: "normal" });
  };
  const trimmed = (fold) => {
    let a = 120, b = 165;
    const miss = (L) => solve(run(fold, L), F0).z[1];
    let fa = miss(a);
    for (let i = 0; i < 16; i++) { const m = 0.5 * (a + b), fm = miss(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
    return 0.5 * (a + b);
  };
  const summary = (sys, z0) => {
    const swrAt = (f) => { const r = solve(sys, f); return YS.swrOf(r.z[0], r.z[1], z0); };
    let lo = null, hi = null, best = Infinity, at = 0;
    for (const f of grid) {
      const s = swrAt(f);
      if (s < best) { best = s; at = f; }
      if (s < 1.5) { if (lo === null) lo = f; hi = f; }
    }
    const here = solve(sys, F0, true);
    return { z: here.z, swr: YS.swrOf(here.z[0], here.z[1], z0), gain: here.gainDbd, fb: here.fb, lo, hi, valley: at, depth: best };
  };
  const line = (label, L, r) => console.log(`  ${label.padEnd(30)} L ${L.toFixed(1).padStart(5)}  ${r.z[0].toFixed(1).padStart(6)} ${r.z[1].toFixed(1).padStart(6)}  SWR ${r.swr.toFixed(2)}  under 1.5: ${r.lo === null ? "nowhere" : `${r.lo}-${r.hi} (${r.hi - r.lo} MHz)`}  valley ${r.valley}@${r.depth.toFixed(2)}  ${r.gain.toFixed(2)} dBd  F/B ${r.fb.toFixed(1)}`);
  console.log("\nThe DuvYagi with a folded driven element, 3.175 mm rod, trimmed for X = 0 at 910.525 MHz");
  console.log("                                                R      X");
  // the split element, trimmed the same way, on the same grid
  let a = 135, b = 165, fa = solve(prepare(Object.assign({}, base, { elements: base.elements.map((e, i) => (i === feed ? Object.assign({}, e, { L: a }) : e)) }), { quality: "normal" }), F0).z[1];
  for (let i = 0; i < 16; i++) {
    const m = 0.5 * (a + b), fm = solve(prepare(Object.assign({}, base, { elements: base.elements.map((e, i2) => (i2 === feed ? Object.assign({}, e, { L: m }) : e)) }), { quality: "normal" }), F0).z[1];
    if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
  }
  const splitL = 0.5 * (a + b), splitSys = prepare(Object.assign({}, base, { elements: base.elements.map((e, i) => (i === feed ? Object.assign({}, e, { L: splitL }) : e)) }), { quality: "normal" });
  line("split, against 50 ohm", splitL, summary(splitSys, 50));
  const out = {};
  for (const along of ["y", "x"]) {
    for (const gap of [8, 12, 16, 20, 25]) {
      const fold = { gap, along }, L = trimmed(fold), r = summary(run(fold, L), 200);
      line(`folded ${gap} mm ${along === "y" ? "across" : "along"}, against 200`, L, r);
      out[`${along}${gap}`] = { L, r };
    }
  }
  // how touchy a folded element is to build, since a loop has no tips to file
  console.log("\nA build error: length 1 mm off, or the leg spacing 1 mm off, on the 16 mm across version; and the split element 1 mm long");
  const fold = { gap: 16, along: "y" }, L = out.y16.L;
  const judged = (label, sys, z0) => { const r = solve(sys, F0); console.log(`  ${label.padEnd(36)} ${r.z[0].toFixed(1).padStart(6)} ${r.z[1].toFixed(1).padStart(6)}  SWR ${YS.swrOf(r.z[0], r.z[1], z0).toFixed(3)}`); };
  judged("folded, as trimmed", run(fold, L), 200);
  judged("folded, 1 mm longer", run(fold, L + 1), 200);
  judged("folded, 2 mm longer", run(fold, L + 2), 200);
  judged("folded, spacing 1 mm wider", run({ gap: 17, along: "y" }, L), 200);
  judged("split, as trimmed", splitSys, 50);
  judged("split, 1 mm longer", prepare(Object.assign({}, base, { elements: base.elements.map((e, i) => (i === feed ? Object.assign({}, e, { L: splitL + 1 }) : e)) }), { quality: "normal" }), 50);
  judged("split, 2 mm longer", prepare(Object.assign({}, base, { elements: base.elements.map((e, i) => (i === feed ? Object.assign({}, e, { L: splitL + 2 }) : e)) }), { quality: "normal" }), 50);
  // the directors running short, as on the prototype
  console.log("\nThe directors 2.1 mm short, as the fit finds on the prototype: does a folded element forgive it?");
  const shortened = base.elements.map((e, i) => (i >= 2 ? Object.assign({}, e, { L: e.L - 2.1 }) : e));
  const short = (el, gap) => prepare(Object.assign({}, base, { elements: el, gap: gap === undefined ? base.gap : gap }), { quality: "normal" });
  line("split, against 50 ohm", splitL, summary(short(shortened.map((e, i) => (i === feed ? Object.assign({}, e, { L: splitL }) : e))), 50));
  line("folded 16 mm across, against 200", L, summary(short(shortened.map((e, i) => (i === feed ? Object.assign({}, e, { L, fold }) : e))), 200));
}

/** The checks, for this file and for tests/validate.js. check(name, value, want, tolerance, unit). */
function runChecks(check) {
  const compare = (name, a, b) => {
    check(`${name}: R, ohm`, a.z[0], b.z[0], 0.15);
    check(`${name}: X, ohm`, a.z[1], b.z[1], 0.15);
    check(`${name}: gain, dBd`, a.gainDbd, b.gainDbd, 0.02);
    check(`${name}: F/B, dB`, a.fb, b.fb, 0.15);
  };
  console.log("   Straight thick rods against solver.js");
  straightCheck(compare, "normal");
  if (fs.existsSync(NEC_EXE)) {
    console.log("   Crooked thin rods (0.2 mm) against nec2++ at 121 segments");
    thinChecks(compare);
    console.log("   Closed loops, 0.2 mm, against nec2++: R within 0.5% (these resistances run to 500 ohm)");
    foldedChecks((name, a, b) => {
      check(`${name}: R, ohm`, a.z[0], b.z[0], 0.005 * b.z[0]);
      check(`${name}: X, ohm`, a.z[1], b.z[1], 2);
      check(`${name}: gain, dBd`, a.gainDbd, b.gainDbd, 0.03);
      check(`${name}: F/B, dB`, a.fb, b.fb, 0.2);
    });
  } else console.log("skip  nec2++ not found");
}

module.exports = { prepare, solve, valley, runChecks, study };

if (require.main === module) {
  let failed = 0;
  runChecks((name, value, want, tol, unit) => {
    const ok = Math.abs(value - want) <= tol;
    if (!ok) failed++;
    console.log(`${ok ? "pass" : "FAIL"}  ${name}: ${value.toFixed(3)} against ${want.toFixed(3)} (within ${tol}${unit ? " " + unit : ""})`);
  });
  if (failed) console.log(`\n${failed} checks failed`);
  if (process.argv.includes("--folded")) {
    foldedStudy();
  } else if (!process.argv.includes("--checks")) {
    gapStudy();
    const out = study();
    const i = process.argv.indexOf("--json");
    if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
  }
  process.exit(failed ? 1 : 0);
}
