/*
 * The printable parts, against the parts cad/parts.py made for the DuvYagi, and on designs nobody has tried:
 *     node tests/print_parts.js
 *
 * With the gauge and label off, the DuvYagi's boom should be the same solid OpenCascade made: its volume, its size
 * and its number of holes. Other designs check what must always hold: a valid solid that fits the bed, a rod hole for
 * every rod at the right place, joints clear of the rods, and marks at the right lengths. Exits non-zero on a failure.
 */
const fs = require("fs"), path = require("path");
for (const f of ["guide", "pole-socket", "parts"]) require(path.join(__dirname, "..", "src", f + ".js"));
const YS = globalThis.YS;

let failed = 0;
const truth = (name, pass, detail) => {
  if (!pass) failed++;
  console.log(`${pass ? "pass" : "FAIL"}  ${name}${detail !== undefined ? ": " + detail : ""}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const rod = (name, type, x, L, d, material) => ({ id: name, name, type, x, L, d, material });
const duv = {
  name: "DuvYagi", f0: 910.525, gap: 3, polarization: "vertical", material: "aluminium",
  elements: [rod("Reflector", "reflector", 0, 158.6, 3, "aluminium"), rod("Driven", "driven", 39.8, 149, 3.175, "brass"), rod("D1", "director", 73.5, 142.3, 3, "aluminium"),
    rod("D2", "director", 163.8, 140.8, 3, "aluminium"), rod("D3", "director", 272.4, 138.3, 3, "aluminium"), rod("D4", "director", 378.6, 136.1, 3, "aluminium")],
};

/** Whether a point is inside a mesh: a ray straight up, counting crossings. */
function inside(mesh, x, y, z) {
  let n = 0;
  x += 0.00137; y += 0.00071;    // off any triangle's edge, where a ray would count twice or not at all
  for (const [a, b, c] of mesh.t) {
    const d = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((x - a[0]) * (c[1] - a[1]) - (y - a[1]) * (c[0] - a[0])) / d, v = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    if (a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]) > z) n++;
  }
  return n % 2 === 1;
}

(async () => {
  const Module = (await import(path.join(__dirname, "..", "src", "vendor", "manifold.js").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"))).default;
  const wasm = await Module();

  console.log("1. The same solids as OpenCascade made, with the new marks off");
  const t0 = Date.now();
  const plain = YS.buildParts(wasm, duv, { gauge: false, label: false, mount: "mast" });
  console.log(`  ${Date.now() - t0} ms`);
  const by = (r, id) => r.parts.find((p) => p.id === id);
  const OCC = { boom_rear: [69466, [239.8, 16, 20]], boom_front: [56582, [193.4, 16, 20]], mast_mount: [158156, [60, 80, 102]], coupon: [18838, [64, 26, 12]] };
  Object.keys(OCC).forEach((id) => {
    const p = by(plain, id);
    if (!p) return truth(id, false, "missing");
    truth(`${id}: volume`, near(p.volume, OCC[id][0], 0.002 * OCC[id][0]), `${p.volume.toFixed(0)} here, ${OCC[id][0]} there`);
    truth(`${id}: size`, p.size.every((v, i) => near(v, OCC[id][1][i], 0.05)), p.size.map((v) => v.toFixed(2)).join(" x "));
  });

  console.log("\n2. The DuvYagi's boom with its gauge, notches and label");
  const full = YS.buildParts(wasm, duv, { mount: "mast" }), rear = by(full, "boom_rear"), g = full.plan.gauge, n = full.plan.notches;
  const offX = 15, offY = 8, topZ = 20;   // from the boom's frame to the file's
  truth("the plan has no warnings", full.plan.warnings.length === 0, full.plan.warnings.join(" | "));
  truth("a valid solid", rear.volume > 66000 && rear.volume < 69466, rear.volume.toFixed(0));
  truth("still fits a 256 mm bed with a brim", rear.size[0] <= 240);
  const want = { R: 158.6, DE: 73, D1: 142.3, D2: 140.8, D3: 138.3, D4: 136.1 };
  Object.keys(want).forEach((name) => {
    const m = g.marks.find((q) => q.rod === name);
    if (!m) return truth(`mark ${name}`, false, "missing");
    truth(`mark ${name} is its length from the stop`, near(m.x - g.stop, want[name], 1e-6), m.x - g.stop);
    // cut into the lip beside the channel, in the file itself, and not just beside it
    truth(`  and it's in the solid at ${want[name]} mm`, !inside(rear.mesh, m.x + offX, 0.5, topZ - 0.3) && inside(rear.mesh, m.x + offX + 0.55, 0.5, topZ - 0.3));
    truth(`  with its label`, m.labelled);
  });
  truth("the wall stops a rod", inside(rear.mesh, g.stop + offX - 0.5, g.marks[0] && offY - 4.5, topZ - 1.8) && !inside(rear.mesh, g.stop + offX + 0.5, offY - 4.5, topZ - 1.0));
  truth("the channel is open at its far end, for hole compensation", !inside(rear.mesh, g.end + offX - 0.2, offY - 4.5, topZ - 0.2));
  truth("the notches are 100 mm apart between far walls", n && near(n.to - n.from, 100, 1e-9), n && `${n.from + offX} to ${n.to + offX}`);
  if (n) {
    const y = 15.5, z = topZ - 1;
    truth("  each wall is where it says, in the solid", inside(rear.mesh, n.from + offX - 0.1, y, z) && !inside(rear.mesh, n.from + offX + 0.1, y, z) && !inside(rear.mesh, n.to + offX - 0.1, y, z) && inside(rear.mesh, n.to + offX + 0.1, y, z));
  }
  const noLabel = by(YS.buildParts(wasm, duv, { mount: "none", label: false }), "boom_rear");
  truth("the label is cut in", noLabel.volume - rear.volume > 40 && noLabel.volume - rear.volume < 150, `${(noLabel.volume - rear.volume).toFixed(0)} mm3`);
  duv.elements.slice(0, 4).forEach((e) => truth(`the hole for ${e.name} is open and walled`, !inside(rear.mesh, e.x + offX, offY, 10) && inside(rear.mesh, e.x + offX + e.d / 2 + 0.5, offY, 10) || e.type === "driven"));
  // to look at in a slicer, outside the repository
  const out = path.join(require("os").tmpdir(), "duvyagi-parts");
  fs.mkdirSync(out, { recursive: true });
  full.parts.forEach((p) => fs.writeFileSync(path.join(out, p.file), YS.meshToStl(p.mesh, p.id)));
  fs.writeFileSync(path.join(out, "notes.txt"), YS.partsNotes(duv, full));

  console.log("\n2b. Every socket prints standing, opening up, as the handle adapter snapped when flat");
  for (const pol of ["vertical", "horizontal"]) {
    for (const mount of ["mast", "pole", "grip", "tripod"]) {
      const r = YS.buildParts(wasm, Object.assign({}, duv, { polarization: pol }), { mount }), m = r.parts.find((p) => !p.id.startsWith("boom") && p.id !== "coupon");
      // straight down the socket's middle from the top of the file: empty for the socket's depth, so nothing is roofed over it
      const cx = m.mesh.t.reduce((a, t) => { for (const v of t) if (v[2] > m.size[2] - 0.001) { a.x0 = Math.min(a.x0, v[0]); a.x1 = Math.max(a.x1, v[0]); a.y0 = Math.min(a.y0, v[1]); a.y1 = Math.max(a.y1, v[1]); } return a; }, { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
      const mx = (cx.x0 + cx.x1) / 2, my = (cx.y0 + cx.y1) / 2, top = m.size[2];
      truth(`${pol}, ${mount}: its socket opens upward`, !inside(m.mesh, mx + 3, my + 3, top - 1) && !inside(m.mesh, mx + 3, my + 3, top - 20));
    }
  }

  console.log("\n2c. The painter pole's socket, the owner's thread on a plate that bolts to the arm");
  const pr = YS.buildParts(wasm, duv, { mount: "pole" }), ps = by(pr, "pole_socket"), pa = by(pr, "pole_arm");
  const cx = 18, cy = 18, P = YS.POLE_SOCKET;
  truth("lies flat on its plate, with the thread opening upward", near(ps.size[2], 7 + P.height, 0.01) && !inside(ps.mesh, cx, cy, ps.size[2] - 1), ps.size.map((v) => v.toFixed(2)).join(" x "));
  truth("the thread doesn't break through the plate", inside(ps.mesh, cx, cy, 3));
  truth("its wall is whole", [0, 1, 2, 3, 4, 5].every((i) => inside(ps.mesh, cx + 13.5 * Math.cos(i), cy + 13.5 * Math.sin(i), 25)));
  truth("the thread is deep enough", !inside(ps.mesh, cx, cy, ps.size[2] - P.depth + 1), `${P.depth.toFixed(1)} mm`);
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => truth(`bolt hole ${a}, ${b} goes through the plate`, !inside(ps.mesh, cx + 14 * a, cy + 14 * b, 4) && inside(ps.mesh, cx + 14 * a + 2.2, cy + 14 * b, 4)));
  // the arm lies on its block's far end, x up, so the block's holes run across the file. Standing, its z is the boom's -x
  const az = 2, block = pa.mesh;
  truth("the arm's four bolt holes are at the same spacing", (() => {
    const ys = pa.size[1] / 2, xs = pa.size[0] / 2, h = 18;      // the block's middle along the boom
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, b]) => !inside(block, xs, ys + 14 * b, h + 14 * a) && inside(block, xs, ys + 14 * b + 2.2, h + 14 * a));
  })());
  truth("two pieces, and the notes list their bolts", /4 M3 x 40/.test(YS.partsNotes(duv, pr)));

  console.log("\n3. Scale: a filament that shrinks 0.36%");
  const scaled = YS.buildParts(wasm, duv, { mount: "none", scale: 1 / 0.9964 }), sr = by(scaled, "boom_rear");
  truth("wider, and no taller", near(sr.size[1], 16 / 0.9964, 0.01) && near(sr.size[2], 20, 0.001), sr.size.map((v) => v.toFixed(3)).join(" x "));
  const s0 = scaled.plan.sections[0];
  truth("longer by the same share, with its joint moved to stay on the bed", near(sr.size[0], (s0.x1 - s0.x0) / 0.9964, 0.01) && sr.size[0] <= 240.001, `${(s0.x1 - s0.x0).toFixed(1)} modelled, ${sr.size[0].toFixed(2)} in the file`);
  const nn = scaled.plan.notches, k = 1 / 0.9964, yy = 15.5 * k, zz = 19;
  truth("the notches are 100 mm apart in the model, and in the file for the shrinkage", inside(sr.mesh, (nn.from + offX) * k - 0.1, yy, zz) && !inside(sr.mesh, (nn.from + offX) * k + 0.1, yy, zz) && !inside(sr.mesh, (nn.to + offX) * k - 0.1, yy, zz) && inside(sr.mesh, (nn.to + offX) * k + 0.1, yy, zz));

  console.log("\n4. Other designs");
  const yagi = (name, n, gap, L, d, extra) => ({ name, f0: 910, gap: 3, polarization: "vertical", material: "aluminium", elements: Array.from({ length: n }, (_, i) => rod(i === 0 ? "Reflector" : i === 1 ? "Driven" : `D${i - 1}`, i === 0 ? "reflector" : i === 1 ? "driven" : "director", i * gap, L - i, d, "aluminium")), ...extra });
  const cases = [
    ["3 rods, short", yagi("short", 3, 40, 160, 3), { bed: 256 }],
    ["8 rods, 450 mm", yagi("eight", 8, 64, 150, 3), { bed: 256 }],
    ["10 rods, 3 sections", yagi("ten", 10, 90, 150, 3), { bed: 256 }],
    ["14 rods, a small bed", yagi("long", 14, 100, 150, 3), { bed: 180 }],
    ["Thick rods", yagi("thick", 6, 100, 140, 6), { bed: 256 }],
    ["Horizontal rods", yagi("flat", 6, 70, 150, 3, { polarization: "horizontal" }), { bed: 256 }],
  ];
  for (const [name, d, o] of cases) {
    for (const mount of ["mast", "pole", "grip", "tripod"]) {
      const r = YS.buildParts(wasm, d, Object.assign({ mount }, o));
      const fits = r.parts.filter((p) => p.id.startsWith("boom")).every((p) => p.size[0] <= o.bed - 15.9);
      const clear = r.plan.sections.slice(1).every((s) => !r.plan.rods.some((q) => q.x > s.prev - 8 + 1e-6 && q.x < s.prev + 38 - 1e-6));
      const covered = r.plan.rods.every((q) => r.plan.sections.some((s) => q.x >= s.x0 && q.x <= s.x1));
      const solid = r.parts.every((p) => p.volume > 100 && p.mesh.t.length > 10);
      const m = r.parts.find((p) => !p.id.startsWith("boom") && p.id !== "coupon");
      if (r.plan.gauge) {
        const g2 = r.plan.gauge, ok = g2.marks.every((a, i) => g2.marks.every((b, j) => j <= i || !a.labelled || !b.labelled || Math.abs(a.lx - b.lx) >= (a.width + b.width) / 2 + 1));
        if (!ok) truth(`${name}: labels overlap`, false);
      }
      truth(`${name}, ${mount}`, fits && clear && covered && solid && !!m, `${r.plan.sections.length} section(s), ${m && m.size.map((v) => v.toFixed(0)).join("x")}; ${r.plan.warnings.join(" ") || "no warnings"}`);
    }
  }
  try {
    YS.planParts(yagi("no room", 12, 30, 150, 3), { bed: 180 });
    truth("rods with no room for a joint are refused", false);
  } catch (e) { truth("rods with no room for a joint are refused", /nowhere to join/.test(e.message), e.message); }
  try {
    YS.planParts(yagi("close", 4, 5, 150, 3), {});
    truth("rods too close are refused", false);
  } catch (e) { truth("rods too close are refused", /too close/.test(e.message), e.message); }

  console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
