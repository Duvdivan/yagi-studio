/*
 * Checks the solver against things it doesn't get to choose: nec2++ where thin-wire theory holds, a
 * separate full-surface model for a thick rod, energy balance, and closed-form answers.
 *
 *     node tests/validate.js
 *
 * nec2++ comes from NEC2PP or YagiCAD's folder; those checks are skipped if it isn't there. The
 * surface reference runs through Python (numpy, scipy). Exits non-zero if anything fails.
 */
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
for (const f of ["solver", "crooked", "rf", "radio", "guide", "tasks", "engine"]) require(path.join(__dirname, "..", "src", f + ".js"));
const YS = globalThis.YS;

const NEC_EXE = process.env.NEC2PP || path.join(os.homedir(), "Tools", "yagicad_dl", "yc633", "nec2++.exe");
const POS = [0, 39.8, 73.5, 163.8, 272.4, 378.6], LEN = [158.6, 149, 142.3, 140.8, 138.3, 136.1];
let failed = 0;
function check(name, value, want, tol, unit) {
  const ok = Math.abs(value - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}: ${value.toFixed(3)} against ${want.toFixed(3)} (within ${tol}${unit ? " " + unit : ""})`);
}
function truth(name, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ": " + detail : ""}`);
}

function nec(pos, len, dia, feed, f, segs) {
  const l = ["CM y", "CE"];
  pos.forEach((x, i) => l.push(`GW ${i + 1} ${segs} ${(x / 1000).toFixed(6)} 0 ${(-len[i] / 2000).toFixed(6)} ${(x / 1000).toFixed(6)} 0 ${(len[i] / 2000).toFixed(6)} ${(dia / 2000).toFixed(6)}`));
  l.push("GE 0", "LD 5 0 0 0 3.5e7", `FR 0 1 0 0 ${f.toFixed(4)} 0`, `EX 0 ${feed + 1} ${(segs >> 1) + 1} 0 1 0`, "RP 0 1 2 1000 90 0 0 180", "EN");
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
  return { z: [+row[6], +row[7]], gain: g[0] - 2.15, fb: g[0] - g[180] };
}

console.log("\n1. Thin rods, where nec2++'s thin-wire math is right: the whole 6-element array");
if (fs.existsSync(NEC_EXE)) {
  const dia = 0.2, scale = 1 + 0.0378 * Math.log10(3.175 / dia), len = LEN.map((x) => x * scale);
  const d = { f0: 910.525, feed: 1, gap: 0, z0: 50, material: "aluminium", endCap: 0, elements: POS.map((x, i) => ({ x, L: len[i], d: dia })) };
  const r = YS.sweep(d, [910.525], { quality: "reference" })[0], n = nec(POS, len, dia, 1, 910.525, 121);
  check("R, ohm", r.z[0], n.z[0], 0.1);
  check("X, ohm", r.z[1], n.z[1], 0.1);
  check("gain, dBd", r.gainDbd, n.gain, 0.02);
  check("F/B, dB", r.fb, n.fb, 0.1);
  console.log("\n   The same rods at 3.175 mm: this is why nec2++ can't be the reference for thick rods");
  const row = [21, 31, 51, 81].map((s) => nec(POS, LEN, 3.175, 1, 910.525, s));
  console.log("   nec2++ at 21, 31, 51, 81 segments, R: " + row.map((x) => x.z[0].toFixed(1)).join(", ") + " ohm");
  truth("nec2++ drifts by over 10 ohm on thick rods", row[3].z[0] - row[0].z[0] > 10, "the drift this solver was built to remove");
} else console.log("skip  nec2++ not found");

console.log("\n2. One thick rod, against a separate model of its whole surface (tests/bor_reference.py)");
const py = cp.execFileSync("python", [path.join(__dirname, "bor_reference.py"), "--json"], { encoding: "utf8", timeout: 300000 });
const bor = JSON.parse(py);
const rod = (L, d, cap) => ({ f0: 910.525, feed: 0, gap: 3, z0: 50, endCap: cap, elements: [{ x: 0, L, d, sigma: Infinity }] });
{
  const t = YS.sweep(rod(149, 3.175, 0), [910.525], { quality: "reference" })[0];
  check("open tube R, ohm", t.z[0], bor.tube[0], 0.1);
  check("open tube X, ohm", t.z[1], bor.tube[1], 0.1);
  const c = YS.sweep(rod(149, 3.175, YS.END_CAP), [910.525], { quality: "reference" })[0];
  check("flat ends R, ohm", c.z[0], bor.caps[0], 0.2);
  check("flat ends X, ohm", c.z[1], bor.caps[1], 0.1);
  check("end correction, radii", YS.END_CAP, bor.correction, 0.005);
}

console.log("\n3. Energy: gain from input power against gain from the integrated pattern");
{
  const d = YS.toSolver(YS.PRESETS.duvyagi());
  const lossless = Object.assign({}, d, { elements: d.elements.map((e) => ({ x: e.x, L: e.L, d: e.d, sigma: Infinity })) });
  let w = YS.buildWires(lossless, { quality: "fine" }), ws = YS.workspace(YS.assignOffsets(w));
  let sol = YS.solveAt(w, d.feed, d.gap, 910.525, ws);
  check("lossless gain minus directivity, dB", YS.gainDbi(w, sol, Math.PI / 2, 0) - YS.directivityDbi(w, sol), 0, 0.03);
  // with metal in the model, that same difference must equal the reported efficiency
  const r = YS.sweep(d, [910.525], { quality: "fine", level: 2 })[0];
  w = YS.buildWires(d, { quality: "fine" }); ws = YS.workspace(YS.assignOffsets(w));
  sol = YS.solveAt(w, d.feed, d.gap, 910.525, ws);
  const fromPattern = YS.gainDbi(w, sol, Math.PI / 2, 0) - YS.directivityDbi(w, sol);
  check("metal loss, from the pattern vs the rods' resistance, dB", fromPattern, 10 * Math.log10(r.efficiency), 0.04);
}

console.log("\n4. Mesh: coarse quality against the finest, on very different antennas");
{
  const designs = {
    "DuvYagi 910 MHz": YS.toSolver(YS.PRESETS.duvyagi()),
    "GCARC 915 MHz": YS.toSolver(YS.PRESETS.gcarc()),
    "6 mm rods, 144 MHz": { f0: 144.5, feed: 1, gap: 10, z0: 50, material: "aluminium", elements: [0, 420, 600, 1050, 1650, 2300].map((x, i) => ({ x, L: [1010, 960, 925, 915, 905, 895][i], d: 6 })) },
    "6 mm rods, 1296 MHz": { f0: 1296, feed: 1, gap: 3, z0: 50, material: "copper", elements: [0, 46, 75, 120, 175, 240].map((x, i) => ({ x, L: [110, 100, 92, 90, 89, 88][i], d: 6 })) },
  };
  for (const [name, d] of Object.entries(designs)) {
    const ref = YS.sweep(d, [d.f0], { quality: 12 })[0];
    for (const q of ["draft", "normal"]) {
      const r = YS.sweep(d, [d.f0], { quality: q })[0];
      const dz = Math.hypot(r.z[0] - ref.z[0], r.z[1] - ref.z[1]), dg = Math.abs(r.gainDbd - ref.gainDbd);
      truth(`${name}, ${q}`, dz < 0.3 && dg < 0.01, `off by ${dz.toFixed(3)} ohm and ${dg.toFixed(4)} dB`);
    }
  }
}

console.log("\n5. Closed-form answers");
{
  const cable = { length: 150, vf: 0.695, lossAt1G: 1.6 };
  const short = YS.gammaThroughCable([-1, 0], Object.assign({}, cable, { lossAt1G: 0 }), 910.525);
  const zs = YS.zOfGamma(short, 50);
  const got = YS.cableFromShort(zs, 910.525, 0.695, 160, 50);
  check("cable length from a shorted feed, mm", got.length, 150, 0.01);
  const g = [0.2, -0.3], there = YS.gammaThroughCable(g, cable, 910), back = YS.gammaRemoveCable(there, cable, 910);
  check("through a cable and back", Math.hypot(back[0] - g[0], back[1] - g[1]), 0, 1e-9);
  const loss = YS.cablePath(cable, 1000).lossDb;
  check("RG178 loss in 150 mm at 1 GHz, dB", loss, 0.24, 1e-9);
  check("1/8 in in millimetres", 25.4 / 8, 3.175, 1e-12);
}

console.log("\n6. Files come back the same");
{
  const d = YS.PRESETS.duvyagi(), s = YS.toSolver(d), rows = YS.sweep(s, [900, 910, 920]);
  const ts = YS.parseTouchstone(YS.toTouchstone(rows, 50)).points[1], z = YS.zOfGamma(ts.g, 50);
  check("Touchstone R, ohm", z[0], rows[1].z[0], 0.01);
  // the exact files NanoVNA firmware and NanoVNA-Saver write, and the format's other forms
  const read = (t) => YS.parseTouchstone(t).points[0];
  const near = (p, f, re, im) => Math.abs(p.f - f) < 1e-6 && Math.hypot(p.g[0] - re, p.g[1] - im) < 1e-4;
  truth("NanoVNA firmware .s1p", near(read("!File created by NanoVNA\r\n# Hz S RI R 50\r\n910000000  0.100000 -0.200000\r\n"), 910, 0.1, -0.2));
  truth("NanoVNA firmware .s2p", near(read("!File created by NanoVNA\r\n# Hz S RI R 50\r\n910000000  0.100000 -0.200000  0.3 0.4 0 0 0 0\r\n"), 910, 0.1, -0.2));
  truth("NanoVNA-Saver .s1p", near(read("# HZ S RI R 50\n910000000 0.1 -0.2\n"), 910, 0.1, -0.2));
  truth("MHz, in dB and angle", near(read("# MHz S DB R 50\n910 -6.0206 0\n"), 910, 0.5, 0));
  truth("no option line means GHz, magnitude and angle", near(read("0.91 0.5 90\n"), 910, 0, 0.5));
  const same = (x) => x.elements.map((e) => e.L + ":" + e.x).join() === d.elements.map((e) => e.L + ":" + e.x).join();
  truth("NEC deck", same(YS.importText(YS.necDeck(d), "x.nec")));
  truth("YagiCAD file", same(YS.importText(YS.yc6(d, rows[1]), "x.YC6")));
  const repo = path.join(__dirname, "..", "..", "designs");
  if (fs.existsSync(repo)) {
    truth("the repo's duvyagi10.json", YS.importText(fs.readFileSync(path.join(repo, "duvyagi10.json"), "utf8"), "d.json").elements[1].L === 149);
    truth("the repo's duvyagi10.YC6", YS.importText(fs.readFileSync(path.join(repo, "duvyagi10.YC6"), "utf8"), "d.YC6").elements[1].L === 149);
  }
}

console.log("\n7. The fit: readings made from a known error must give that error back");
{
  const d = YS.PRESETS.duvyagi(), target = { directors: -1.7, driven: 2.3, reflector: 0 };
  const s = YS.toSolver(d, target);
  const fs2 = [];
  for (let f = 880; f <= 940; f += 4) fs2.push(f);
  const readings = YS.sweep(s, fs2).map((r) => ({ f: r.f, swr: r.swr }));
  const free = { directors: true, driven: true, reflector: false };
  const starts = [{ directors: 0 }, { directors: -2 }, { directors: 2 }, { directors: -3, driven: -3 }, { directors: -2, driven: 3 }, { directors: 2, driven: -3 }];
  const best = (power) => starts.map((st) => YS.dispatch("fitReadings", { design: d, readings, cable: null, free, starts: [st], weightPower: power })).reduce((a, b) => (b.value < a.value ? b : a));
  const fit = best(3);
  check("directors, mm", fit.offsets.directors, target.directors, 0.15);
  check("driven element, mm", fit.offsets.driven, target.driven, 0.3);
  // now act on the plan, in the model, and see whether the antenna lands on target
  const plan = YS.dispatch("tunePlan", { design: d, offsets: fit.offsets, target: 910.525 });
  const top = plan.options[0];
  const after = JSON.parse(JSON.stringify(d));
  for (const st of top.steps) after.elements.find((e) => e.name === st.rod).L = st.to;
  const res = YS.sweep(YS.toSolver(after, target), [910.525])[0];
  truth(`following the top plan ("${top.title}") fixes it`, res.swr < 1.3, `SWR ${res.swr.toFixed(2)} at target, from ${plan.now.swr.toFixed(2)}`);
}

console.log("\n8. A sweep file through a cable: R and X give the cable's length and the driven element");
{
  const d = YS.PRESETS.duvyagi(), err = { directors: -1.7, driven: 2.3, reflector: 0 };
  const realCable = { length: 133, vf: 0.695, lossAt1G: 1.6 };
  const fq = [];
  for (let f = 850; f <= 950; f += 1) fq.push(f);
  const pts = YS.sweep(YS.toSolver(d, err), fq).map((r) => ({ f: r.f, g: YS.gammaThroughCable(YS.gammaOf(r.z, 50), realCable, r.f) }));
  // written and read back in NanoVNA-Saver's format, then thinned as the app does
  const text = "# HZ S RI R 50\n" + pts.map((p) => `${Math.round(p.f * 1e6)} ${p.g[0]} ${p.g[1]}`).join("\n") + "\n";
  const read = YS.parseTouchstone(text).points.filter((_, i) => i % 5 === 0);
  const free = { directors: true, driven: true, reflector: false };
  const entered = Object.assign({}, realCable, { length: 150 });
  let best = null;
  for (const c of [-50, -25, 0, 25, 50]) for (const r of [{ directors: 0 }, { directors: -2 }, { directors: 2 }]) {
    const fit = YS.dispatch("fitReadings", { design: d, readings: read, cable: entered, free, starts: [Object.assign({ cable: c }, r)], weightPower: 3, fitCable: true });
    if (!best || fit.value < best.value) best = fit;
  }
  check("cable length from the sweep, mm (entered 150)", best.cableLength, 133, 3);
  check("directors, mm", best.offsets.directors, err.directors, 0.15);
  check("driven element, mm (SWR alone was less sure)", best.offsets.driven, err.driven, 0.2);
  // the serial link's parser, on the firmware's own line format
  const scan = "scan 850000000 950000000 3 3\r\n850000000 0.100000 -0.200000 \r\n900000000 -0.300000 0.400000 \r\n950000000 0.500000 0.600000 \r\nch> ";
  const rows = YS.NanoVNA.parseScan(scan);
  truth("NanoVNA scan lines", rows.length === 3 && rows[1].f === 900 && rows[1].g[1] === 0.4);
}

console.log("\n9. Rods that aren't straight, parallel or centred (tests/crooked.js)");
require("./crooked.js").runChecks(check);

console.log("\n10. The gap in the driven element, as two real faces and a lead (tests/gap_reference.py)");
{
  const g = JSON.parse(cp.execFileSync("python", [path.join(__dirname, "gap_reference.py"), "--json"], { encoding: "utf8", cwd: __dirname, timeout: 300000 }));
  const at = (gap, r) => g.rows.find((q) => q.gap === gap && q.r === r);
  check("thin lead, 3 mm gap, X, ohm, on a finer mesh", g.fine, at(3, 0.15).dx, 0.1);
  check("thin lead, 3 mm gap, X, ohm, against ln(a / r) theory", at(3, 0.15).dx, at(3, 0.15).theory, 2);
  check("thin lead, 8 mm gap, X, ohm, against ln(a / r) theory", at(8, 0.15).dx, at(8, 0.15).theory, 3.5);
  check("a lead nearly as wide as the rod changes almost nothing, X, ohm", g.wide, 0, 1);
}

console.log("\n11. Radio settings, against the networks' own published numbers");
{
  const mt = (region, modem, slot) => YS.meshtastic(region, modem, slot);
  // frequencies the Meshtastic project and Philly Mesh publish
  check("Meshtastic US LongFast, MHz", mt("US", "LONG_FAST").f, 906.875, 0.0005);
  check("its slot", mt("US", "LONG_FAST").slot, 20, 0);
  check("Meshtastic EU_868 LongFast, MHz", mt("EU_868", "LONG_FAST").f, 869.525, 0.0005);
  check("Meshtastic ANZ LongFast, MHz", mt("ANZ", "LONG_FAST").f, 919.875, 0.0005);
  check("Meshtastic US LongTurbo, MHz (phillymesh.net: 908.75)", mt("US", "LONG_TURBO").f, 908.75, 0.0005);
  check("its slot (phillymesh.net: 14)", mt("US", "LONG_TURBO").slot, 14, 0);
  check("the slot asked for: 14 gives the same", mt("US", "LONG_TURBO", 14).f, 908.75, 0.0005);
  truth("a 500 kHz preset doesn't fit EU_868", mt("EU_868", "LONG_TURBO").tooWide === true);
  // the data rates Meshtastic publishes for its presets, and a known airtime
  check("LongFast, bit/s (published 1.07 kbps)", YS.linkStats(mt("US", "LONG_FAST")).bitrate, 1074, 1);
  check("LongTurbo, bit/s (published 1.34 kbps)", YS.linkStats(mt("US", "LONG_TURBO")).bitrate, 1343, 1);
  check("SX1262's datasheet sensitivity, SF7 125 kHz, dBm", YS.linkStats({ bw: 125, sf: 7, cr: 5 }).sensitivity, -124, 1);
  check("SX1262's datasheet sensitivity, SF12 125 kHz, dBm", YS.linkStats({ bw: 125, sf: 12, cr: 5 }).sensitivity, -137, 1);
  check("airtime, SF7 125 kHz, 10 bytes, 16 symbol preamble, ms (8 symbols less is 41.2)", YS.linkStats({ bw: 125, sf: 7, cr: 5 }, 10).airtimeMs, 41.2 + 8 * 1.024, 0.1);
  // a design takes a radio's frequency, and only scaling moves the rods
  const d = YS.PRESETS.duvyagi(), L = d.elements[3].L;
  const philly = YS.radioFromEntry(YS.RADIO.COMMUNITY[0]);
  YS.applyRadio(d, philly, false);
  check("Philly Mesh's frequency becomes the target, MHz", d.f0, 919.5, 0);
  truth("the band moves with it", d.band[0] < 919.5 && d.band[1] > 919.5);
  check("rods stay unless scaled, mm", d.elements[3].L, L, 0);
  const e = YS.PRESETS.duvyagi();
  YS.applyRadio(e, philly, true);
  check("scaled to the wavelength, mm", e.elements[3].L, L * 910.525 / 919.5, 0.001);
  check("FCC limit with this antenna at 22 dBm, EIRP over by, dB (at 12.35 dBi)", YS.linkBudget(philly, 22, 12.35).over, 22 + 12.35 - 36, 0.001);
  truth("a 62.5 kHz US preset is flagged, and 500 kHz isn't", YS.linkBudget(YS.PRESETS.duvyagi().radio, 22, 12.35).narrow === true && !YS.linkBudget(philly, 22, 12.35).narrow);
}

console.log("\n12. The printed cutting guide");
{
  const d = YS.PRESETS.duvyagi(), channels = YS.guideChannels(d, 4);
  check("the driven element's rods, cut 4 mm long in all, mm", channels.find((c) => c.label === "DE").length, 75, 0.001);
  truth("the driven element's channel cuts two rods", channels.find((c) => c.label === "DE").count === 2);
  const reflector = channels.find((c) => c.label === "R"), g = YS.buildGuide(channels, 100 / 99.64);
  const zs = (x, y) => g.mesh.t.flat().filter((p) => Math.abs(p[0] - x) < 1e-6);
  // the stop sits at the rod's length, scaled to shrink back to it
  const stops = new Set(g.mesh.t.flat().map((p) => p[0].toFixed(4)));
  truth("a stop at each rod's length, scaled", channels.every((c) => stops.has((c.length * 100 / 99.64).toFixed(4))));
  truth("the longest rod's channel reaches its length", Math.abs(reflector.length - 158.6) < 1e-9);
  // only the mesh's plan is scaled: heights aren't
  check("height isn't scaled, mm", Math.max.apply(null, g.mesh.t.flat().map((p) => p[2])), g.height, 1e-9);
  // every edge of each closed part is used exactly twice, once each way
  const edges = new Map();
  for (const t of g.mesh.t) for (let i = 0; i < 3; i++) {
    const a = t[i].map((v) => v.toFixed(5)).join(), b = t[(i + 1) % 3].map((v) => v.toFixed(5)).join();
    edges.set(a + ">" + b, (edges.get(a + ">" + b) || 0) + 1);
  }
  let open = 0;
  for (const [k, n] of edges) { const [a, b] = k.split(">"); if ((edges.get(b + ">" + a) || 0) !== n) open++; }
  truth("the mesh is closed, with its faces the right way out", open === 0, `${g.mesh.t.length} triangles`);
  check("the calibration: a bar of 99.64 mm scales by, %", YS.guideScale(99.64).percent, 100.361, 0.001);
  truth("an unlikely measurement is questioned", YS.guideScale(90).suspicious && !YS.guideScale(99.64).suspicious);
  truth("a 2 m rod doesn't fit a 256 mm bed", !YS.guideFits(YS.buildGuide([{ label: "R", length: 1000, d: 6, count: 1 }], 1), 256));
  truth("this guide does", YS.guideFits(g, 256));
  const std = YS.startingDesign(910, 6, 3, "aluminium"), mix = YS.startingDesign(910, 6, 3, "aluminium", { d: 6, material: "brass" });
  const dr = (d) => d.elements.find((e) => e.type === "driven");
  truth("a new design's driven element can be its own rod", dr(mix).d === 6 && dr(mix).material === "brass" && mix.elements.filter((e) => e !== dr(mix)).every((e) => e.d === 3 && e.material === "aluminium"));
  truth("a thicker one starts shorter, and nothing else moves", dr(mix).L < dr(std).L && mix.elements.every((e, i) => e.x === std.elements[i].x && (e === dr(mix) || e.L === std.elements[i].L)), `${dr(std).L} to ${dr(mix).L}`);
  truth("left out, it matches the others as it always did", dr(std).d === 3 && dr(std).material === "aluminium");
}

console.log("\n13. Bends and the feed wire in the app");
{
  const F = 910.525, d = YS.PRESETS.duvyagi(), plain = YS.sweep(YS.toSolver(d), [F])[0];
  // the wire's formula against the model of the real shape, where gaps are worth modeling
  const gr = JSON.parse(cp.execFileSync("python", [path.join(__dirname, "gap_reference.py"), "--json"], { encoding: "utf8", cwd: __dirname, timeout: 300000 }));
  let worst = 0;
  for (const q of gr.rows) if (q.gap >= 2 && q.r < 1) worst = Math.max(worst, Math.abs(YS.feedWireX({ gap: q.gap, feedWire: 2 * q.r }, 3.175 / 2) * F - q.dx));
  check("the wire's formula against the real shape, 2 to 10 mm, worst, ohm", worst, 0, 1.2);
  const w = YS.makeDesign(Object.assign({}, d, { feedWire: 0.3 })), wired = YS.sweep(YS.toSolver(w), [F])[0];
  check("a 0.3 mm wire across 3 mm adds, ohm", wired.z[1] - plain.z[1], 9.5, 1);
  check("and leaves R alone, ohm", wired.z[0], plain.z[0], 1e-9);
  check("and gain, dB", wired.gainDbd, plain.gainDbd, 1e-9);
  // bends, entered as tips in mm, reach the general solver; a straight design never does
  truth("a straight design stays on the fast solver", !YS.isCrooked(YS.toSolver(d)));
  const face = 10, run = 149 / 2 - face, tip = run * Math.sin(5 * Math.PI / 180);
  const b = YS.PRESETS.duvyagi();
  b.elements.find((e) => e.type === "driven").bend = { topF: tip, botF: tip };
  const bs = YS.toSolver(b);
  truth("a bend reaches the general solver", YS.isCrooked(bs));
  const bent = YS.sweep(bs, [F], { level: 2 })[0];
  check("both driven tips 5 degrees forward, SWR (the study: 1.78)", bent.swr, 1.78, 0.02);
  truth("it gives every figure the app shows", bent.cuts && bent.bwH > 0 && bent.fieldCuts.e.length === 361 && bent.currents.length === 6 && bent.efficiency > 0.9 && bent.efficiency < 1);
  // the general solver's other figures against the fast one, on straight rods, by forcing the handover
  const same = YS.toSolver(YS.PRESETS.duvyagi());
  const forced = YS.crooked.sweep(same, [F], { level: 2 })[0], fast = YS.sweep(same, [F], { level: 2 })[0];
  check("same rods: beamwidth across, degrees", forced.bwH, fast.bwH, 0.2);
  check("beamwidth along, degrees", forced.bwE, fast.bwE, 0.2);
  check("front to rear, dB", forced.fr, fast.fr, 0.1);
  check("efficiency", forced.efficiency, fast.efficiency, 0.002);
  check("current near the feed, relative", forced.currents[1].mag[0], fast.currents[1].mag[0], 0.03);
  const gridA = YS.crooked.pattern3d(same, F, { nth: 13, nph: 25 }), gridB = YS.pattern3d(same, F, { nth: 13, nph: 25 });
  let gw = 0;
  gridA.g.forEach((v, i) => { if (gridB.g[i] > -15) gw = Math.max(gw, Math.abs(v - gridB.g[i])); });
  check("the 3D pattern, down to -15 dBi, worst, dB", gw, 0, 0.1);
  // with a mast, too
  const m = YS.PRESETS.duvyagi();
  m.mast = { on: true, d: 42, behind: 92, length: 2000 };
  const ms = YS.toSolver(m), ma = YS.crooked.sweep(ms, [F])[0], mb = YS.sweep(ms, [F])[0];
  check("with a mast: R, ohm", ma.z[0], mb.z[0], 0.3);
  check("X, ohm", ma.z[1], mb.z[1], 0.3);
  check("gain, dB", ma.gainDbd, mb.gainDbd, 0.03);
  // the fit with bends: readings from a bent antenna with short directors, with the bends entered, should find the directors
  const err = { directors: -1.7, driven: 0 };
  const bf = YS.PRESETS.duvyagi();
  bf.elements.find((e) => e.type === "driven").bend = { topF: -3, botF: -3 };
  const readings = [];
  for (let f = 890; f <= 935; f += 5) readings.push({ f, swr: YS.sweep(YS.toSolver(bf, err), [f], { quality: "draft" })[0].swr });
  const fit = YS.dispatch("fitReadings", { design: bf, readings, cable: null, free: { directors: true, driven: false, reflector: false }, starts: [{ directors: 0 }, { directors: -3 }], weightPower: 3 });
  check("the fit, with the bends entered, finds the short directors, mm", fit.offsets.directors, err.directors, 0.3);
  // the plan offers bends when they help
  const short = YS.PRESETS.duvyagi();
  const plan = YS.dispatch("tunePlan", { design: short, offsets: { directors: -2.1, driven: 1.2, reflector: 0 }, target: F });
  const opt = plan.options.find((o) => o.id === "bend");
  truth("the plan offers bending", !!opt, opt ? opt.bends.map((q) => `${q.rod} ${q.add}`).join(", ") : "");
  if (opt) {
    truth("and it clearly helps", opt.swr < plan.now.swr - 0.2, `SWR ${plan.now.swr.toFixed(2)} to ${opt.swr.toFixed(2)}, ${opt.gain.toFixed(2)} dBd`);
    const by = {};
    opt.bends.forEach((q) => { by[q.rod] = q.add; });
    truth("moving those tips apart", (by.Driven || 0) <= 0 && (by.D1 || 0) >= 0);
  }
  // random bends in the build check
  const mc = YS.dispatch("monteCarlo", { solver: YS.toSolver(YS.PRESETS.duvyagi()), tol: { rod: 0, pos: 0, bend: 3, trim: false, seed: 5, count: 4 }, quality: "draft" });
  truth("the build check can add bends", mc.length === 4 && new Set(mc.map((q) => q.swr.toFixed(4))).size === 4, mc.map((q) => q.swr.toFixed(2)).join(", "));
}

console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
