/*
 * The vertical dipole (src/dipole.js): one centre-fed rod, upright, on an arm out from its mast, matched to 50 ohm by a hairpin
 * across the feed and a capacitor in series.
 *     node tests/dipole.js
 *
 * 1. The solver on a lone dipole, and on one beside a long rod (a mast), against nec2++ on thin wire, where nec2++ is right.
 *    And the thick rod's textbook figures: about 73 ohm and 2.15 dBi at resonance, a 78 degree beamwidth up and down.
 * 2. Sizing: matched, SWR 1.2 or better across 902 to 928 MHz, with or without the mast; unmatched, no better than about 1.45,
 *    as a 73 ohm feed on 50 ohm coax must be. A mast a quarter wave away makes it beam away from the mast.
 * 3. The printed arm and clamp: valid, one piece each, the arm as tall as every tail and the owner's tested clamp on it, the
 *    window long enough for the hairpin and room past it, the dipole the design's distance from the mast's middle, the notes.
 * 4. The Tune tab's plan, on a dipole built with its hairpin short: moving the hairpin's short comes first, to about the
 *    design's length, before any filing; and on one whose coax stub (in the capacitor's place) was left long: trim it.
 * 5. The sleeve dipole, on top of a mast or the pod: the general solver's stepped rod (a rod above, a tube below) against
 *    tests/bor_reference.py's full-surface model of it (python bor_reference.py --step 2); its choke's length; its match; its
 *    hub, cap and pod insert; the Tune tab trims only the rod above.
 * nec2++ comes from NEC2PP or YagiCAD's folder; its checks are skipped if it isn't there. Exits non-zero on a failure.
 */
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
for (const f of ["solver", "crooked", "rf", "dipole", "tasks", "guide", "pole-socket", "mast-clamp", "parts", "pod-bee", "pod", "sleeve-parts"]) require(path.join(__dirname, "..", "src", f + ".js"));
const YS = globalThis.YS;
const NEC_EXE = process.env.NEC2PP || path.join(os.homedir(), "Tools", "yagicad_dl", "yc633", "nec2++.exe");
const F0 = 910.525, BAND = [902, 928];

let failed = 0;
const truth = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail !== undefined ? ": " + detail : ""}`); };
const near = (name, v, want, tol, unit) => truth(name, Math.abs(v - want) <= tol, `${v.toFixed(3)} against ${want.toFixed(3)} (within ${tol}${unit ? " " + unit : ""})`);

/* nec2++ on parallel thin wires along z: [{ x, L, segs }], fed at the middle of wire feed; Z, and the gain at 0 and 180 degrees. */
function nec(wires, dia, feed, f) {
  const l = ["CM dipole", "CE"];
  wires.forEach((w, i) => l.push(`GW ${i + 1} ${w.segs} ${(w.x / 1000).toFixed(6)} 0 ${(-w.L / 2000).toFixed(6)} ${(w.x / 1000).toFixed(6)} 0 ${(w.L / 2000).toFixed(6)} ${(dia / 2000).toFixed(6)}`));
  l.push("GE 0", "LD 5 0 0 0 3.5e7", `FR 0 1 0 0 ${f.toFixed(4)} 0`, `EX 0 ${feed + 1} ${(wires[feed].segs >> 1) + 1} 0 1 0`, "RP 0 1 2 1000 90 0 0 180", "EN");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nec")), a = path.join(d, "i.nec"), b = path.join(d, "o.txt");
  fs.writeFileSync(a, l.join("\n") + "\n");
  cp.execFileSync(NEC_EXE, [`-i${a}`, `-o${b}`]);
  const blk = fs.readFileSync(b, "utf8").split("ANTENNA INPUT PARAMETERS")[1];
  const row = blk.slice(blk.indexOf("(WATTS)")).split(/\r?\n/)[1].trim().split(/\s+/), g = {};
  for (const ln of blk.slice(blk.indexOf("RADIATION PATTERNS")).split(/\r?\n/).slice(1)) {
    const p = ln.trim().split(/\s+/), ph = parseFloat(p[1]), tot = parseFloat(p[4]);
    if (!isNaN(ph) && !isNaN(tot)) g[Math.round(ph)] = tot; else if (Object.keys(g).length >= 2) break;
  }
  fs.rmSync(d, { recursive: true, force: true });
  return { z: [+row[6], +row[7]], away: g[0], toward: g[180] };
}

(async () => {
  console.log("1. The solver on a dipole, against nec2++ on thin wire, and the textbook's figures");
  if (fs.existsSync(NEC_EXE)) {
    const dia = 0.2, L = 158.0;
    const lone = YS.sweep({ f0: F0, feed: 0, gap: 0, z0: 50, material: "aluminium", endCap: 0, elements: [{ x: 0, L, d: dia }] }, [F0], { quality: "reference", level: 1 })[0];
    const n1 = nec([{ x: 0, L, segs: 121 }], dia, 0, F0);
    near("a lone dipole: R, ohm", lone.z[0], n1.z[0], 0.2);
    near("a lone dipole: X, ohm", lone.z[1], n1.z[1], 0.2);
    near("a lone dipole: gain, dBi", lone.gainDbi, n1.away, 0.02, "dB");
    // a 2 m rod 250 mm behind it, as a thin stand-in for the mast: the parasitic the dipole's pattern depends on
    const mast = YS.sweep({ f0: F0, feed: 1, gap: 0, z0: 50, material: "aluminium", endCap: 0, elements: [{ x: -250, L: 2000, d: dia }, { x: 0, L, d: dia }] }, [F0], { quality: "reference", level: 1 })[0];
    const n2 = nec([{ x: -250, L: 2000, segs: 1201 }, { x: 0, L, segs: 121 }], dia, 1, F0);
    near("beside a 2 m rod: R, ohm", mast.z[0], n2.z[0], 0.5);
    near("beside a 2 m rod: X, ohm", mast.z[1], n2.z[1], 0.5);
    near("beside a 2 m rod: gain away from it, dBi", mast.cuts.h[0], n2.away, 0.05, "dB");
    near("beside a 2 m rod: gain toward it, dBi", mast.cuts.h[180], n2.toward, 0.1, "dB");
  } else console.log("skip  nec2++ not found");
  {
    // the 3.175 mm brass rod at its resonance: about 73 ohm, 2.15 dBi, 78 degrees (Kraus); the solver's reference for thick rods
    let lo = 140, hi = 160, r = null;
    const at = (L) => YS.sweep({ f0: F0, feed: 0, gap: 3, z0: 50, material: "brass", elements: [{ x: 0, L, d: 3.175 }] }, [F0], { level: 1 })[0];
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; r = at(m); if (r.z[1] > 0) hi = m; else lo = m; }
    near("a 3.175 mm rod at resonance: R, ohm", r.z[0], 73, 3);
    near("its gain, dBi", r.gainDbi, 2.15, 0.05, "dB");
    near("its beamwidth along the rod, degrees", r.bwE, 78, 2);
  }

  console.log("\n2. Sizing the rod and its match");
  const swrs = (d) => YS.sweep(YS.toSolver(d), Array.from({ length: 27 }, (_, i) => BAND[0] + i), { level: 0 }).map((q) => q.swr);
  const free = YS.dipole.make({ f0: F0, band: BAND, d: 3.175, material: "brass", cap: "auto", mast: { on: false } });
  truth("matched, no mast: SWR 1.2 or better across 902 to 928 MHz", Math.max(...swrs(free.design)) <= 1.2, `${Math.max(...swrs(free.design)).toFixed(3)}, ${free.cap} pF, hairpin ${free.design.hairpin.length} mm, rod ${free.design.elements[0].L} mm`);
  const plain = YS.dipole.make({ f0: F0, band: BAND, d: 3.175, material: "brass", cap: 0, mast: { on: false } });
  truth("unmatched: no better than about 1.45 anywhere in the band, as a 73 ohm feed on 50 ohm must be", Math.min(...swrs(plain.design)) >= 1.38 && !plain.design.hairpin && !plain.design.seriesC, `lowest ${Math.min(...swrs(plain.design)).toFixed(3)}`);
  const far = YS.dipole.make({ f0: F0, band: BAND, d: 3.175, material: "brass", cap: 4.7, mast: { on: true, d: 42, behind: 250 } });
  truth("matched with a 42 mm mast 250 mm away, a 4.7 pF capacitor: SWR 1.2 or better across the band", Math.max(...swrs(far.design)) <= 1.2, Math.max(...swrs(far.design)).toFixed(3));
  const close = YS.dipole.make({ f0: F0, band: BAND, d: 3.175, material: "brass", cap: "auto", mast: { on: true, d: 42, behind: 100 } });
  const R = YS.dipole.roundness(YS.sweep(YS.toSolver(close.design), [F0], { level: 1 })[0]);
  truth("100 mm from the mast it beams away from it", R.away - R.toward > 6 && R.max - R.away < 0.5, `away ${R.away.toFixed(1)}, toward ${R.toward.toFixed(1)}, strongest ${R.max.toFixed(1)} dBi at ${R.best} degrees`);
  // an open coax stub in the capacitor's place (the owner's idea): the same reactance at the target, and as good a match
  const st = YS.dipole.stubFor(4.7, "rg178", F0);
  near("a 4.7 pF capacitor's stub of RG178 has its reactance at the target, ohm", YS.stubX(st, F0), -1e6 / (2 * Math.PI * F0 * 4.7), 0.3);
  const stubbed = YS.dipole.make({ f0: F0, band: BAND, d: 3.175, material: "brass", cap: "stub:rg178", mast: { on: true, d: 42, behind: 250 } });
  truth("matched by a hairpin and an RG178 stub: SWR 1.2 or better across the band", Math.max(...swrs(stubbed.design)) <= 1.2 && !!stubbed.design.seriesStub && !stubbed.design.seriesC,
    `${Math.max(...swrs(stubbed.design)).toFixed(3)}, stub ${stubbed.design.seriesStub.length} mm, hairpin ${stubbed.design.hairpin.length} mm, rod ${stubbed.design.elements[0].L} mm`);
  const json = JSON.parse(JSON.stringify(far.design));
  truth("a saved dipole opens as a dipole", YS.dipole.isDipole(YS.makeDesign(json)) && YS.makeDesign(json).mount === "side");

  console.log("\n3. The printed arm and clamp");
  const Module = (await import(path.join(__dirname, "..", "src", "vendor", "manifold.js").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"))).default;
  const wasm = await Module();
  const d = far.design, bed = { x: 256, y: 256, z: 256, corner: false };
  const res = YS.buildParts(wasm, d, { mount: "mast", bed, coupon: false });
  const boom = res.parts.find((p) => p.id === "boom"), clamp = res.parts.find((p) => p.id === "mast_mount");
  truth("the arm and the clamp are made, each fits the bed", boom && clamp && boom.place.fits && clamp.place.fits, res.parts.map((p) => `${p.id} ${p.size.map((v) => v.toFixed(0)).join("x")}`).join(", "));
  truth("the arm is a level bar as tall as every tail, 38.3 mm", Math.abs(res.plan.taper.Ht - 38.3) < 0.06 && res.plan.taper.m === 0 && Math.abs(boom.size[2] - 38.3) < 0.1, `${boom.size[2].toFixed(2)} mm`);
  truth("the clamp is the owner's tested one, its socket cut to this tail", clamp.owners === true);
  const driven = res.plan.rods[0];
  truth("its window runs past the hairpin, with room to move the short", driven.winBack >= d.hairpin.length + 6 - 1e-9, `${driven.winBack.toFixed(1)} mm behind the rod for a ${d.hairpin.length} mm hairpin`);
  const atMast = YS.mastBehind(d.mast.d) + YS.ARM.of(d);
  near("the dipole stands the design's distance from the mast's middle, mm", atMast, d.mast.behind, 0.5);
  const tooClose = YS.makeDesign(Object.assign({}, JSON.parse(JSON.stringify(d)), { mast: { on: true, d: 42, behind: 60, length: 2000 } }));
  truth("asked for closer than the clamp allows, it stands at the closest", Math.abs(YS.mastBehind(42) + YS.ARM.of(tooClose) - YS.ARM.min) < 1, `${(YS.mastBehind(42) + YS.ARM.of(tooClose)).toFixed(1)} mm, the least being ${YS.ARM.min}`);
  const bad = res.parts.filter((p) => !(p.volume > 0) || p.genus < 0);
  truth("every part a solid", !bad.length, bad.map((p) => p.id).join(", "));
  const notes = YS.partsNotes(d, res);
  truth("the notes give the hairpin, the capacitor and the choke", /THE MATCH: A HAIRPIN AND A CAPACITOR/.test(notes) && new RegExp(`${d.seriesC} pF C0G`).test(notes) && new RegExp(`${d.hairpin.length.toFixed(1)} mm long`).test(notes) && /ferrite choke/.test(notes));
  truth("and say it isn't built yet", /NOT YET BUILT: a vertical dipole/.test(notes) && !/TESTED: a boom from this tab/.test(notes));
  const sres = YS.buildParts(wasm, stubbed.design, { mount: "mast", bed, coupon: false }), snotes = YS.partsNotes(stubbed.design, sres);
  truth("with a stub, the window runs past it too", sres.plan.rods[0].winBack >= stubbed.design.seriesStub.length + 4 - 1e-9, `${sres.plan.rods[0].winBack.toFixed(1)} mm for a ${stubbed.design.seriesStub.length} mm stub`);
  truth("and the notes say how to cut, wire and seal it", /THE MATCH: A HAIRPIN AND A COAX STUB/.test(snotes) && /open at its far end/.test(snotes) && /seal it with neutral cure silicone/.test(snotes) && !/pF C0G/.test(snotes));
  const yagi = YS.buildParts(wasm, YS.PRESETS.duvyagi(), { mount: "mast", bed, coupon: false });
  truth("a Yagi's boom is as it was: tapered, its window 12 mm", yagi.plan.taper.m > 0 && yagi.plan.rods.find((r) => r.driven).winBack === 6);

  console.log("\n4. The Tune tab's plan, on a dipole built with its hairpin 4 mm short");
  const built = JSON.parse(JSON.stringify(far.design));
  built.hairpin.length -= 4;
  const plan = YS.dispatch("tunePlan", { design: built, offsets: { reflector: 0, driven: 0, directors: 0 }, target: F0 });
  const first = plan.options[0];
  truth("moving the hairpin's short comes first", first && first.id === "pinmove", plan.options.map((o) => o.id).join(", "));
  truth("to about the design's length, for a good match", first && Math.abs(first.adds[0].length - far.design.hairpin.length) <= 1.0 && first.swr < 1.1, first && `${first.adds[0].length} mm, SWR ${first.swr.toFixed(3)} (design ${far.design.hairpin.length} mm; ${plan.now.swr.toFixed(3)} as built)`);

  console.log("\n   and on one whose coax stub was left 3 mm long");
  const longStub = JSON.parse(JSON.stringify(stubbed.design));
  longStub.seriesStub.length += 3;
  const sp = YS.dispatch("tunePlan", { design: longStub, offsets: { reflector: 0, driven: 0, directors: 0 }, target: F0 });
  const trim = sp.options.find((o) => o.id === "stubtrim");
  truth("it says to trim the stub, to about its design length", !!trim && Math.abs(trim.adds[0].length - stubbed.design.seriesStub.length) <= 1.0 && trim.swr < 1.1,
    trim ? `${trim.adds[0].length} mm, SWR ${trim.swr.toFixed(3)} (design ${stubbed.design.seriesStub.length}; ${sp.now.swr.toFixed(3)} as built); options ${sp.options.map((o) => o.id).join(", ")}` : sp.options.map((o) => o.id).join(", "));

  console.log("\n5. The sleeve dipole");
  {
    // the full-surface model's numbers (bor_reference.py --step 2.0; it moves under 0.15 ohm from --step 1.0): up, its rod's
    // diameter, low, the tube's, a flat cap on the rod, R, X. With equal halves the two models differ by about 0.5 ohm in R
    // (how each feeds the gap); the step itself should add little to that
    const REF = [[76, 3.175, 76, 3.175, false, 71.82, -1.25], [76, 3.175, 76, 6.35, false, 74.35, 1.87], [76, 3.175, 76, 6.35, true, 74.67, 2.49], [79, 3.175, 72, 6.35, true, 73.09, 2.16], [76, 3.175, 70, 9.5, true, 65.67, -10.49]];
    const off = REF.map(([up, du, low, dl, cap, R, X]) => {
      const extra = cap ? 0.10 * du / 2 : 0;
      const z = YS.sweep({ f0: F0, feed: 0, gap: 3, z0: 50, material: "perfect", endCap: 0, elements: [{ x: 0, L: up + low + extra, d: du, material: "perfect", crook: { top: (up - low + extra) / 2, lowerA: dl / 2, stepAt: -1.5 } }] }, [F0], { quality: "reference", level: 0 })[0].z;
      return [z[0] - R, z[1] - X];
    });
    truth("a stepped rod (a rod above, a tube below) against the full-surface model: R within 1 ohm, X within 0.7", off.every(([dr, dx]) => Math.abs(dr) < 1 && Math.abs(dx) < 0.7), off.map(([dr, dx]) => `${dr.toFixed(2)} ${dx.toFixed(2)}`).join("; "));
    truth("and the step adds under 0.3 ohm to the equal halves' difference", off.slice(1).every(([dr]) => Math.abs(dr - off[0][0]) < 0.3));
    const ch = YS.dipole.choke("k14", "rg316", F0);
    truth("the choke in 1/4 in tube round RG316: about 60 ohm, velocity factor about 0.93, so about 76.7 mm", Math.abs(ch.z0 - 60.7) < 1 && Math.abs(ch.vf - 0.931) < 0.005 && Math.abs(ch.length - 76.7) < 0.2, `${ch.z0.toFixed(1)} ohm, ${ch.vf.toFixed(3)}, ${ch.length} mm`);
    const sv = YS.dipole.make({ f0: F0, band: BAND, d: 3.175, material: "brass", cap: "auto", mount: "top", mast: { d: 42 } });
    const h = YS.dipole.halves(sv.design);
    truth("a sleeve dipole, matched: SWR 1.2 or better across the band, its tube held at the choke's length", Math.max(...swrs(sv.design)) <= 1.2 && Math.abs(h.low - 1.5 - ch.length) < 0.06,
      `${Math.max(...swrs(sv.design)).toFixed(3)}; rod ${(h.up - 1.5).toFixed(1)} mm, tube ${(h.low - 1.5).toFixed(1)} mm, ${sv.cap} pF, hairpin ${sv.design.hairpin.length} mm`);
    const m = YS.sweep(YS.toSolver(sv.design), [F0], { level: 1 })[0], Rr = YS.dipole.roundness(m);
    truth("all round, as a dipole: about 2.15 dBi, within 0.1 dB round it", Math.abs(Rr.max - 2.15) < 0.1 && Rr.ripple < 0.1, `${Rr.max.toFixed(2)} dBi, ${Rr.ripple.toFixed(3)} dB`);
    const bed = { x: 256, y: 256, z: 256 };
    const top = YS.buildParts(wasm, sv.design, { mount: "mast", bed });
    truth("on a mast: the hub and the cap, each a solid that fits the bed", top.parts.map((p) => p.id).join() === "sleeve_hub,sleeve_mast_cap" && top.parts.every((p) => p.volume > 0 && p.place.fits), top.parts.map((p) => `${p.id} ${p.size.map((v) => v.toFixed(0)).join("x")}`).join(", "));
    const pv = YS.dipole.make({ f0: F0, band: BAND, d: 3.175, material: "brass", cap: 3.9, mount: "pod" });
    const pod = YS.buildParts(wasm, pv.design, { mount: "pod", bed });
    const ids = pod.parts.map((p) => p.id);
    truth("on the pod: the hub, the insert for its top, and the pod with its top hole, no SMA insert", ["sleeve_hub", "pod_top_tube", "pod_body", "pod_core", "pod_ring"].every((i) => ids.includes(i)) && !ids.includes("pod_top_sma") && !ids.includes("sleeve_mast_cap"), ids.join(", "));
    const sn = YS.partsNotes(sv.design, top);
    truth("the notes: cut the tube to the choke and leave it, trim only the rod", /cut square to 76\.7 mm and left so/.test(sn) && /trimmed on the VNA/.test(sn) && /ferrite choke/.test(sn));
    const longRod = JSON.parse(JSON.stringify(sv.design));
    longRod.elements[0].L += 3;
    const tp = YS.dispatch("tunePlan", { design: longRod, offsets: { reflector: 0, driven: 0, directors: 0 }, target: F0 });
    const dr = tp.options.find((o) => o.id === "driven");
    truth("built with its rod 3 mm long, the Tune tab trims the rod above, about 3 mm", !!dr && /rod above/.test(dr.title) && Math.abs(dr.steps[0].change + 3) < 1, dr ? `${dr.title}: ${dr.steps[0].change.toFixed(1)} mm, SWR ${dr.swr.toFixed(3)}` : tp.options.map((o) => o.id).join());
  }

  console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
