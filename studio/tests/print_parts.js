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
  const plain = YS.buildParts(wasm, duv, { gauge: false, label: false, soft: false, mount: "mast" });
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
  const P = YS.POLE_SOCKET, tall = 7 + P.height, up = YS.PARTS.POLE_TILT * Math.PI / 180, cs = Math.cos(Math.PI / 2 - up), sn = Math.sin(Math.PI / 2 - up);
  // a point given as if the part stood on its plate, x and y from the thread's axis and z up it, to where the tilted file has it
  const lift = (x, y, z) => [x + 18, ps.size[1] - (18 * cs - (y * cs - z * sn)), y * sn + z * cs + 18 * sn];
  const inPole = (x, y, z) => inside(ps.mesh, ...lift(x, y, z));
  truth("its plate's edge is on the bed, and the thread's axis rises as the proven one did", near(ps.size[2], (18 + P.radius) * sn + tall * cs, 0.5) && !inPole(0, 0, tall - 1) && YS.PARTS.POLE_TILT === 30, ps.size.map((v) => v.toFixed(2)).join(" x "));
  truth("the thread doesn't break through the plate", inPole(0, 0, 3));
  truth("its wall is whole", [0, 1, 2, 3, 4, 5].every((i) => inPole(13.5 * Math.cos(i), 13.5 * Math.sin(i), 25)));
  truth("the thread is deep enough", !inPole(0, 0, tall - P.depth + 1), `${P.depth.toFixed(1)} mm`);
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => truth(`bolt hole ${a}, ${b} goes through the plate`, !inPole(14 * a, 14 * b, 4) && inPole(14 * a + 2.2, 14 * b, 4)));
  // the arm lies on its block's far end, x up, so the block's holes run across the file. Standing, its z is the boom's -x
  const az = 2, block = pa.mesh;
  truth("the arm's four bolt holes are at the same spacing", (() => {
    const ys = pa.size[1] / 2, xs = pa.size[0] / 2, h = 18;      // the block's middle along the boom
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, b]) => !inside(block, xs, ys + 14 * b, h + 14 * a) && inside(block, xs, ys + 14 * b + 2.2, h + 14 * a));
  })());
  const seen = new Map(); YS.meshToStl(ps.mesh, "s").split("\n").filter((l) => l.startsWith("  vertex")).forEach((l, i, all) => { if (i % 3 === 0) { const c = all.slice(i, i + 3); [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => { const k = [c[a], c[b]].sort().join("|"); seen.set(k, (seen.get(k) || 0) + 1); }); } });
  truth("its STL is closed, with every edge shared by two faces", [...seen.values()].every((n) => n === 2), `${seen.size} edges`);
  truth("two pieces, and the notes list their bolts", /4 M3 x 40/.test(YS.partsNotes(duv, pr)));

  console.log("\n2d. The bulge that holds the pin's nut: it adds to the socket, takes nothing from its wall, and takes any thickness of nut");
  const side = 4.4 + 1.2 * Math.SQRT2 + 3.6 - 1.2;      // where its 45 degree side would meet the wall
  for (const mount of ["tripod", "mast", "pole", "grip"]) {
    const id = { tripod: "tripod_mount", mast: "mast_mount", pole: "pole_arm", grip: "hand_grip" }[mount];
    const on = by(YS.buildParts(wasm, duv, { mount }), id);
    const face = mount === "grip" ? 15 : 13.2, px = -8, front = 12;
    // the part stands with the boom's x up and its z across the file, with the bulge on the -z side: the file's far x
    const hit = (x, y, z) => inside(on.mesh, (mount === "mast" ? on.size[0] / 2 : face) - z, on.size[1] / 2 + y, x - (front - on.size[2]));
    truth(`${mount}: the recess is open to the outside, all the way out`, !hit(px, 2, -face - 0.5) && !hit(px, 2, -face - 3.5) && !hit(px, 2, -face - 3.7));
    truth(`${mount}: the wall behind the nut is whole, and the bolt goes through it`, hit(px, 2.5, -face + 1.5) && hit(px, -2.5, -face + 2.8) && !hit(px, 0, -face + 1.5));
    truth(`${mount}: the recess has walls round it, and holds a nut from turning`, hit(px, 3.3, -face - 1.5) && hit(px, -3.3, -face - 1.5) && hit(px + 3.7, 0, -face - 1.5) && hit(px - 3.7, 0, -face - 1.5));
    truth(`${mount}: the bulge's underside is no steeper than 45 degrees`, [1, 2, 3].every((h) => hit(px - (side - h - 0.3), 2.8 - 2.8, -face - h) && !hit(px - (side - h + 0.3), 0, -face - h)));
    truth(`${mount}: its outside edges are rounded`, !hit(5, (mount === "grip" ? 15 : 11.2) - 0.3, face - 0.3) && hit(5, (mount === "grip" ? 15 : 11.2) - 1.5, face - 1.5));
  }
  truth("the bolts listed still reach through a nut in the recess", /M3 x 30[^"]*recess/.test(JSON.stringify(YS.PARTS.MOUNTS.tripod.hardware)) && /M3 x 40[^"]*recess/.test(JSON.stringify(YS.PARTS.MOUNTS.grip.hardware)) && 26.4 + 2.4 <= 30 && 30 + 2.4 <= 40);

  console.log("\n2e. Nothing flat hangs in the air as printed, but the tops of round holes and the mast clamp's two slots, which are short bridges");
  const flatArea = (mesh) => mesh.t.reduce((sum, [a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0], len = Math.hypot(nx, ny, nz);
    return len > 0 && nz / len < -0.99 && Math.min(a[2], b[2], c[2]) > 0.05 ? sum + len / 2 : sum;
  }, 0);
  for (const pol of ["vertical", "horizontal"]) {
    for (const [mount, limit] of [["mast", 2400], ["pole", 60], ["grip", 60], ["tripod", 60]]) {
      const m = YS.buildParts(wasm, Object.assign({}, duv, { polarization: pol }), { mount }).parts.find((p) => !p.id.startsWith("boom") && p.id !== "coupon");
      truth(`${pol}, ${mount}`, flatArea(m.mesh) < limit, `${flatArea(m.mesh).toFixed(0)} mm2 flat, under ${limit}`);
    }
  }

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
