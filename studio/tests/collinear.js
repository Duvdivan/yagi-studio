/*
 * The collinear's rod in the general solver (crooked.js buildCollinear): one upright rod fed off its middle, rod sections
 * above the feed joined end to end, each joint bridged by a shorted two-wire stub, which the solver takes as a load in
 * series spread across the joint's gap.
 *
 * 1. With no joints it is the same rod as the general solver's own and solver.js's: a thick dipole with a 3 mm gap.
 * 2. Against nec2++ on thin wire, its stubs as TL cards to a far dummy segment shorted there: two and three sections, the
 *    feed's impedance within 3% and the gain toward the horizon within 0.12 dB across the band. NEC's answer at a load moves when the loaded segment is longer or
 *    shorter than its neighbours (by 20 to 30 ohm of X here), so its segments are all the joint's length.
 * 3. A stub of almost no length is a short: the same as a continuous rod.
 * 4. The stub's impedance: Z0 tan(beta l) when lossless, a little loss in copper.
 * 5. The stub as real wire folded down beside the rod (buildCollinearWire, what the app designs): against nec2++ with the same
 *    wires where NEC holds (thin wire, the stub's wire as thick as the rod), and against line theory where it doesn't (a thin
 *    stub on a thick rod: NEC-2 barely notices the stub's wire there, against its own TL card and ours).
 *
 * node studio/tests/collinear.js     (nec2++ from NEC2PP or YagiCAD's folder; part 2 skips without it)
 */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
for (const f of ["solver", "crooked", "rf"]) require(path.join(__dirname, "..", "src", f + ".js"));
const YS = globalThis.YS;
const NEC_EXE = process.env.NEC2PP || path.join(os.homedir(), "Tools", "yagicad_dl", "yc633", "nec2++.exe");
const F0 = 910.525;

let failed = 0;
const truth = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail !== undefined ? ": " + detail : ""}`); };

/* A collinear for the solver: below (mm from the feed's middle down), sections above it, each joint gap jg with a stub. */
function design(o) {
  return { f0: F0, feed: 0, gap: o.gap, z0: 50, material: "aluminium", endCap: 0,
    elements: [{ x: 0, L: 1, d: o.d, sigma: 3.5e7, colin: { below: o.below, lowerA: o.lowerA, sections: o.sections, joints: o.sections.slice(1).map(() => ({ gap: o.jg, stub: o.stub })) } }] };
}

/* The same in nec2++: every segment seg long, the feed a segment at z = 0, each joint one segment with a TL card. */
function nec(o, f) {
  const r = o.d / 2000, seg = o.seg, L = ["CM collinear", "CE"], tops = [];
  let acc = 0, tag = 0, feed = 0;
  o.sections.forEach((s) => { acc += s; tops.push(acc); });
  const pieces = [];
  let start = -o.below;
  tops.forEach((t, i) => { if (i + 1 < tops.length) { pieces.push([start, t - o.jg / 2]); start = t + o.jg / 2; } else pieces.push([start, t]); });
  const wire = (n, a, b) => { tag++; L.push(`GW ${tag} ${n} 0 0 ${(a / 1000).toFixed(6)} 0 0 ${(b / 1000).toFixed(6)} ${r.toFixed(7)}`); return tag; };
  const joints = [];
  pieces.forEach(([a, b], i) => {
    if (i === 0) {
      wire(Math.max(1, Math.round((-seg / 2 - a) / seg)), a, -seg / 2);
      feed = wire(1, -seg / 2, seg / 2);
      wire(Math.max(1, Math.round((b - seg / 2) / seg)), seg / 2, b);
    } else wire(Math.max(1, Math.round((b - a) / seg)), a, b);
    if (i + 1 < pieces.length) joints.push(wire(1, b, pieces[i + 1][0]));
  });
  const dummies = joints.map((_, i) => { tag++; const x = 50 + 2 * i; L.push(`GW ${tag} 1 ${x} 0 0 ${x} 0 0.001 0.0001`); return tag; });
  const z0 = 120 * Math.acosh(o.stub.spacing / o.stub.d);
  L.push("GE 0", "LD 5 0 0 0 3.5e7", `FR 0 1 0 0 ${f.toFixed(4)} 0`, `EX 0 ${feed} 1 0 1 0`);
  joints.forEach((j, i) => L.push(`TL ${j} 1 ${dummies[i]} 1 ${z0.toFixed(3)} ${(o.stub.length / 1000).toFixed(6)} 0 0 1e6 0`));
  L.push("RP 0 1 1 1000 90 0 0 0", "EN");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nec")), a = path.join(d, "i.nec"), b = path.join(d, "o.txt");
  fs.writeFileSync(a, L.join("\n") + "\n");
  cp.execFileSync(NEC_EXE, [`-i${a}`, `-o${b}`]);
  const t = fs.readFileSync(b, "utf8"), blk = t.split("ANTENNA INPUT PARAMETERS")[1];
  const row = blk.slice(blk.indexOf("(WATTS)")).split(/\r?\n/)[1].trim().split(/\s+/);
  const rp = t.split("RADIATION PATTERNS")[1].split(/\r?\n/).map((l) => l.trim().split(/\s+/)).find((p) => p[0] === "90.00");
  fs.rmSync(d, { recursive: true, force: true });
  return { z: [+row[6], +row[7]], g: +rp[4] };
}

console.log("1. With no joints, the same rod as the solver's own");
for (const [L, d] of [[158, 0.2], [158, 3.175]]) {
  const base = { f0: F0, feed: 0, gap: 3, z0: 50, material: "aluminium", endCap: 0 };
  const a = YS.sweep(Object.assign({}, base, { elements: [{ x: 0, L, d }] }), [F0], { quality: "reference" })[0];
  const c = YS.sweep(Object.assign({}, base, { elements: [{ x: 0, L, d, colin: { below: L / 2, sections: [L / 2], joints: [] } }] }), [F0], { quality: "reference" })[0];
  truth(`a ${d} mm dipole, ${L} mm: R and X as solver.js's, within 0.3 ohm`, Math.abs(a.z[0] - c.z[0]) < 0.3 && Math.abs(a.z[1] - c.z[1]) < 0.3,
    `${c.z.map((v) => v.toFixed(2)).join(" ")} against ${a.z.map((v) => v.toFixed(2)).join(" ")}`);
}

console.log("\n2. Against nec2++ on thin wire (0.4 mm), its segments all the joint's length");
if (fs.existsSync(NEC_EXE)) {
  // each phased for the most gain toward the horizon at 910.525 MHz (out of phase, the gain sits near a null, where it
  // magnifies any difference)
  for (const [sections, sl] of [[[100.3, 212.3], 56.4], [[102.2, 260.9, 227.5], 51.1]]) {
    const stub = { length: sl, spacing: 6, d: 1, lossless: true };
    for (const jg of [2, 4]) {
      const o = { d: 0.4, below: 80, sections, jg, gap: jg, seg: jg, stub };
      for (const f of [902, F0, 928]) {
        const s = YS.sweep(design(o), [f], { quality: "reference" })[0], n = nec(o, f), g = s.gainDbd + 2.15;
        truth(`${sections.length} sections, ${jg} mm joints, ${f} MHz: Z within 3% (3 ohm at least), gain within 0.12 dB`,
          Math.hypot(s.z[0] - n.z[0], s.z[1] - n.z[1]) <= Math.max(3, 0.03 * Math.hypot(n.z[0], n.z[1])) && Math.abs(g - n.g) < 0.12,
          `${s.z[0].toFixed(1)} ${s.z[1].toFixed(1)}j ${g.toFixed(2)} dBi against ${n.z[0].toFixed(1)} ${n.z[1].toFixed(1)}j ${n.g.toFixed(2)} dBi`);
      }
    }
  }
} else console.log("skip  nec2++ not found");

console.log("\n3. A stub of almost no length is a short");
{
  const o = { d: 3.175, below: 78, sections: [80, 160], jg: 4, gap: 3, stub: { length: 0.001, spacing: 6, d: 1, lossless: true } };
  const a = YS.sweep(design(o), [F0], { quality: "reference" })[0];
  const plain = design(Object.assign({}, o, { sections: [240] }));
  const c = YS.sweep(plain, [F0], { quality: "reference" })[0];
  truth("R and X as one rod 240 mm above the feed, within 0.5 ohm", Math.abs(a.z[0] - c.z[0]) < 0.5 && Math.abs(a.z[1] - c.z[1]) < 0.5,
    `${a.z.map((v) => v.toFixed(2)).join(" ")} against ${c.z.map((v) => v.toFixed(2)).join(" ")}`);
}

console.log("\n4. The stub's impedance");
{
  const s = { length: 40, spacing: 6, d: 1 }, z0 = 120 * Math.acosh(6), x = z0 * Math.tan(2 * Math.PI * F0 * 40 / (YS.C * 1000));
  const lossless = YS.crooked.wireStubZ(Object.assign({ lossless: true }, s), F0), copper = YS.crooked.wireStubZ(Object.assign({ material: "copper" }, s), F0);
  truth("lossless: Z0 tan(beta l)", Math.abs(lossless[0]) < 1e-9 && Math.abs(lossless[1] - x) < 1e-6, `${lossless[1].toFixed(2)} against ${x.toFixed(2)} ohm`);
  truth("copper: the same reactance within 0.1%, a small resistance (under 1 ohm)", Math.abs(copper[1] - x) / x < 1e-3 && copper[0] > 0 && copper[0] < 1, `${copper[0].toFixed(3)} + j${copper[1].toFixed(2)} ohm`);
}

console.log("\n5. Stubs as real wire, folded down beside the rod below (buildCollinearWire), against nec2++ with the same wires");
/* The rods and the stub as wires in nec2++: each rod end straight out to its leg, the legs side by side down beside the rod. */
function necWire(o, f) {
  const L = ["CM wire stub", "CE"], seg = o.seg, W = [], h = o.stub.spacing / 2, X = o.stub.out, zj = o.sections[0], lo = zj - h, hi = zj + h, zend = lo - o.stub.length;
  const ra = o.d / 2, rw = o.stub.d / 2;
  W.push([0, 0, -o.below, 0, 0, -seg / 2, ra], [0, 0, -seg / 2, 0, 0, seg / 2, ra], [0, 0, seg / 2, 0, 0, lo, ra], [0, 0, hi, 0, 0, zj + o.sections[1], ra]);
  W.push([0, 0, lo, X, -h, lo, rw], [X, -h, lo, X, -h, zend, rw], [X, -h, zend, X, h, zend, rw], [X, h, zend, X, h, hi, rw], [X, h, hi, 0, 0, hi, rw]);
  W.forEach((w, i) => { const n = i === 1 ? 1 : Math.max(1, Math.round(Math.hypot(w[3] - w[0], w[4] - w[1], w[5] - w[2]) / seg)); L.push(`GW ${i + 1} ${n} ${w.slice(0, 6).map((v) => (v / 1000).toFixed(6)).join(" ")} ${(w[6] / 1000).toFixed(6)}`); });
  L.push("GE 0", "LD 5 0 0 0 5.8e7", `FR 0 1 0 0 ${f.toFixed(4)} 0`, "EX 0 2 1 0 1 0", "RP 0 1 1 1000 90 0 0 0", "EN");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nec")), a = path.join(d, "i.nec"), b = path.join(d, "o.txt");
  fs.writeFileSync(a, L.join("\n") + "\n");
  cp.execFileSync(NEC_EXE, [`-i${a}`, `-o${b}`]);
  const t = fs.readFileSync(b, "utf8"), blk = t.split("ANTENNA INPUT PARAMETERS")[1];
  const row = blk.slice(blk.indexOf("(WATTS)")).split(/\r?\n/)[1].trim().split(/\s+/);
  const rp = t.split("RADIATION PATTERNS")[1].split(/\r?\n/).map((l) => l.trim().split(/\s+/)).find((q) => q[0] === "90.00");
  fs.rmSync(d, { recursive: true, force: true });
  return { z: [+row[6], +row[7]], g: +rp[4] };
}
const wireDesign = (o) => ({ f0: F0, feed: 0, gap: o.seg, z0: 50, material: "copper", endCap: 0,
  elements: [{ x: 0, L: 1, d: o.d, material: "copper", colin: { below: o.below, sections: o.sections, joints: [{ gap: o.stub.spacing, stub: Object.assign({ material: "copper" }, o.stub) }] } }] });
if (fs.existsSync(NEC_EXE)) {
  // where nec2++ holds: thin wire, and the stub's wire as thick as the rod (NEC-2 is unreliable where a wire's radius steps
  // at a junction, which is why the real build's case, a 1 mm stub on a 3.175 mm rod, is checked against line theory below)
  for (const [d, sd] of [[0.5, 0.5], [0.8, 0.8], [1.6, 1.6]]) {
    for (const [sections, run] of [[[130, 200], 33], [[158.8, 177.9], 40.6]]) {
      const o = { d, below: 80, sections, seg: 3, stub: { length: run, spacing: 6, d: sd, out: 7 } };
      const s = YS.sweep(wireDesign(o), [F0], { quality: "reference" })[0], n = necWire(o, F0), g = s.gainDbd + 2.15;
      truth(`rod ${d} mm, stub wire ${sd} mm, ${sections.join(" + ")}: Z within 3% (2 ohm at least), gain within 0.1 dB`,
        Math.hypot(s.z[0] - n.z[0], s.z[1] - n.z[1]) <= Math.max(2, 0.03 * Math.hypot(n.z[0], n.z[1])) && Math.abs(g - n.g) < 0.1,
        `${s.z[0].toFixed(1)} ${s.z[1].toFixed(1)}j ${g.toFixed(2)} dBi against ${n.z[0].toFixed(1)} ${n.z[1].toFixed(1)}j ${n.g.toFixed(2)} dBi`);
    }
  }
} else console.log("skip  nec2++ not found");
{
  // line theory: a thinner stub wire raises the stub's Z0, and the feed's reactance moves as the ideal line says it does
  const o = { d: 1.6, below: 80, sections: [130, 200], seg: 3, stub: { length: 33, spacing: 6, out: 7 } };
  const wireX = (sd) => YS.sweep(wireDesign(Object.assign({}, o, { stub: Object.assign({}, o.stub, { d: sd }) })), [F0], { quality: "normal" })[0].z[1];
  const lineX = (sd) => YS.sweep(design({ d: 1.6, below: 80, sections: [130, 200], jg: 6, gap: 3, stub: { length: 40, spacing: 6, d: sd, lossless: true } }), [F0], { quality: "normal" })[0].z[1];
  const dw = wireX(0.5) - wireX(1.6), dl = lineX(0.5) - lineX(1.6);
  truth("a stub of 0.5 mm wire against one of 1.6 mm, on a 1.6 mm rod: the feed's X moves the same way as the ideal line's, by 60 to 140% as much",
    dw * dl > 0 && dw / dl > 0.6 && dw / dl < 1.4, `${dw.toFixed(0)} ohm, the line ${dl.toFixed(0)} ohm`);
}

console.log(failed ? `\n${failed} failed` : "\nAll passed");
process.exit(failed ? 1 : 0);
