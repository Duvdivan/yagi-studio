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

/* The printer the DuvYagi's tests use: the owner's 256 mm bed, corner to corner, which the boom's longer tail needs for two pieces. */
const BED = { x: 256, y: 256, z: 256, corner: true };

(async () => {
  const Module = (await import(path.join(__dirname, "..", "src", "vendor", "manifold.js").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"))).default;
  const wasm = await Module();

  console.log("1. The same solid as OpenCascade made, with the new marks off. cad/parts.py's booms still have the half lap and its mount the old socket, so only the coupon compares");
  const t0 = Date.now();
  const plain = YS.buildParts(wasm, duv, { gauge: false, label: false, soft: false, mount: "mast", bed: BED });
  console.log(`  ${Date.now() - t0} ms`);
  const by = (r, id) => r.parts.find((p) => p.id === id);
  const OCC = { coupon: [18838, [64, 26, 12]] };
  Object.keys(OCC).forEach((id) => {
    const p = by(plain, id);
    if (!p) return truth(id, false, "missing");
    truth(`${id}: volume`, near(p.volume, OCC[id][0], 0.002 * OCC[id][0]), `${p.volume.toFixed(0)} here, ${OCC[id][0]} there`);
    truth(`${id}: size`, p.size.every((v, i) => near(v, OCC[id][1][i], 0.05)), p.size.map((v) => v.toFixed(2)).join(" x "));
  });

  console.log("\n2. The DuvYagi's boom: the taper, the window, the tail, the gauge along the slope, the label and the screws");
  const PARTS = YS.PARTS, MOUTH = PARTS.MOUTH, REAR = PARTS.REAR;
  const full = YS.buildParts(wasm, duv, { mount: "mast", bed: BED, screws: true }), rear = by(full, "boom_rear"), g = full.plan.gauge, n = full.plan.notches;
  // the same parts left where they sit on the antenna: x along the boom from the reflector, y across, z along the rods
  const here = YS.buildParts(wasm, duv, { mount: "mast", bed: BED, screws: true, inPlace: true });
  const R0 = by(here, "boom_rear").mesh, T = full.plan.taper, S = full.plan.sizes, inR = (x, y, z) => inside(R0, x, y, z);
  truth("the plan has no warnings, and two pieces", full.plan.warnings.length === 0 && full.plan.sections.length === 2, full.plan.warnings.join(" | "));
  truth("it's 35 mm across at the driven element, the window and a plain rod's 10 mm grip each side", near(2 * T.hzD, 35, 1e-6) && T.win === 15 && near(T.grip, 10, 1e-6));
  truth("and narrows to the plain 20 mm at the tongue's tip, no steeper than 5 degrees", near(2 * T.hz(T.end), 20, 1e-9) && T.ang > 0 && T.ang < 5, `${T.ang.toFixed(2)} degrees`);
  truth("the file lies on its sloped face, along its whole length", (() => {
    const low = rear.mesh.t.flat().filter((q) => q[2] < 0.01).map((q) => q[0]);
    return Math.min(...low) < 1 && Math.max(...low) > rear.size[0] - 2;
  })(), rear.size.map((v) => v.toFixed(1)).join(" x "));
  truth("and fits the bed corner to corner, with its lean counted", full.plan.sections[0].place.fits && full.plan.sections[0].place.how === "corner" && rear.place.fits);
  const xd = duv.elements[1].x;
  truth("the window is open at the driven element, 15 mm along the rods", !inR(xd + 4, 4, 0) && !inR(xd + 4, 4, 7.2) && !inR(xd + 4, 4, -7.2) && inR(xd + 4, 4, 7.8) && inR(xd + 4, 4, -7.8));
  truth("the boom's faces are where the taper says, at the driven element and at D2", [xd + 4, 166].every((x) => inR(x, 4, T.hz(x) - 0.2) && !inR(x, 4, T.hz(x) + 0.2) && inR(x, 4, -T.hz(x) + 0.2) && !inR(x, 4, -T.hz(x) - 0.2)));
  truth("the driven element's holes run its full height", !inR(xd, 0, T.hzD - 1) && !inR(xd, 0, -T.hzD + 1));
  const xt = -20;
  truth("the tail's faces are parallel, carrying on the bottom face", inR(xt, 0.5, T.zb(xt) + 0.2) && !inR(xt, 0.5, T.zb(xt) - 0.2) && inR(xt, 0.5, T.zb(xt) + T.Ht - 0.2) && !inR(xt, 0.5, T.zb(xt) + T.Ht + 0.2) && inR(REAR + 1, 0.5, T.zb(REAR + 1) + T.Ht - 0.3));
  // the gauge: laid out along the slope, so each mark is its rod's length along the V from the wall
  const cos = Math.cos(Math.atan(T.m)), onBoom = (xf) => g.end - (g.end - xf) * cos;
  const want = { R: 158.6, DE: 73, D1: 142.3, D2: 140.8, D3: 138.3, D4: 136.1 };
  Object.keys(want).forEach((name) => {
    const m = g.marks.find((q) => q.rod === name);
    if (!m) return truth(`mark ${name}`, false, "missing");
    truth(`mark ${name} is its length from the wall, along the V`, near(g.end - m.x, want[name], 1e-6), g.end - m.x);
    const xb = onBoom(m.x), top = (x) => T.hz(x) - 0.3;
    truth(`  and it's in the solid there`, !inR(xb, 0.5 - S.w / 2 + 0.4, top(xb)) && inR(xb + 0.55, 0.5 - S.w / 2 + 0.4, top(xb + 0.55)));
    truth(`  with its label`, m.labelled);
  });
  [20, 100, g.end - 5].forEach((x) => {
    const floor = T.hz(x) - S.chHalf / cos;
    truth(`the V's floor follows the slope, at x ${x.toFixed(0)}`, !inR(x + 0.3, S.chY, floor + 0.25) && inR(x + 0.3, S.chY, floor - 0.25));
  });
  truth("the V ends in a wall square to it", inR(g.end + 1, S.chY, T.hz(g.end) - 1) && !inR(g.end - 1, S.chY, T.hz(g.end) - 1));
  // the V carries on along the tail's top to the rear end, so that its only end is the wall (the owner's catch, 2026-11-07)
  [MOUTH - 3, MOUTH - 14, REAR + 1.5].forEach((x) => {
    const tt = T.zb(x) + T.Ht, floor = tt - S.chHalf / cos;
    truth(`the V runs on along the tail, at x ${x.toFixed(1)}`, !inR(x, S.chY, floor + 0.25) && inR(x, S.chY, floor - 0.25) && inR(x, S.chY + S.chHalf + 1.5, tt - 0.3));
  });
  truth("the gauge has a 0 just past its wall, on the V's line", (() => {
    const z0 = g.zero, xm = z0.x + 1.5 * z0.k, ym = z0.y + 2.5 * z0.k, xb = g.end + (z0.x - g.end) * cos, zt = (x) => T.hz(g.end) + (g.end - x) * Math.tan(T.ang * Math.PI / 180);
    return !inR(xb, ym, zt(xb) - 0.3) && inR(xm, ym, zt(xm) - 0.3) && !inR(xm, z0.y, zt(xm) - 0.3);
  })());
  // the coax's groove has a flat floor and a 45 degree roof, so it prints without supports (the owner's catch, 2026-11-07)
  truth("the coax's groove has a flat floor and a 45 degree roof", [[S.w / 2 - 0.2, 2.4, 2.8], [S.w / 2 - 1.2, 1.4, 1.8], [S.w / 2 - 2.3, 0.3, 0.7]].every(([y, open, solid]) => !inR(20, y, open) && inR(20, y, solid) && !inR(20, y, -1.3) && inR(20, y, -1.7)) && inR(20, S.w / 2 - 2.7, 0));
  truth("the notches are 100 mm apart between inner walls, along the slope", n && near(n.to - n.from, 100, 1e-9), n && `${n.from.toFixed(1)} to ${n.to.toFixed(1)}`);
  if (n) {
    const y = S.w / 2 - 0.5, z = (x) => T.hz(x) - 1;
    const a = onBoom(n.from), b = onBoom(n.to);
    truth("  each inner wall is where it says, in the solid, with the notches outside them", !inR(a - 0.1, y, z(a)) && inR(a + 0.1, y, z(a)) && inR(b - 0.1, y, z(b)) && !inR(b + 0.1, y, z(b)));
    const drivenAt = duv.elements.find((e) => e.type === "driven").x;
    truth("  and both notches stay 10 mm clear of the driven element's window", [n.from - 4, n.from, n.to, n.to + 4].every((x) => Math.abs(onBoom(x) - drivenAt) >= YS.PARTS.WINDOW[0] / 2 + 10 - 0.5), `${n.from.toFixed(1)}, ${n.to.toFixed(1)}`);
  }
  {
    // the gauge and the notches are separate choices
    const only = (o) => YS.buildParts(wasm, duv, Object.assign({ mount: "none", bed: BED, screws: true, inPlace: true }, o));
    const nG = only({ gauge: false }), nN = only({ notches: false }), RG = by(nG, "boom_rear"), RN = by(nN, "boom_rear"), y = S.w / 2 - 0.5;
    const notchAt = (R, x) => !inside(R.mesh, onBoom(x), y, T.hz(onBoom(x)) - 1), m = nN.plan.gauge && nN.plan.gauge.marks[0];
    truth("gauge off, notches on: no V and no marks, the notches where they were, and the notes say to check the print's size",
      !nG.plan.gauge && nG.plan.notches && nG.plan.notches.from === n.from && inR(g.end - 1, S.chY, T.hz(g.end) - 1) !== inside(RG.mesh, g.end - 1, S.chY, T.hz(g.end) - 1) &&
      notchAt(RG, n.from - 2) && notchAt(RG, n.to + 2) && /CHECK THE PRINT'S SIZE/.test(YS.partsNotes(duv, nG)) && !/GAUGE/.test(YS.partsNotes(duv, nG)));
    truth("gauge on, notches off: the V and marks, and no notches or notch notes",
      nN.plan.gauge && !nN.plan.notches && !inside(RN.mesh, g.end - 1, S.chY, T.hz(g.end) - 1) && !notchAt(RN, n.from - 2) && !notchAt(RN, n.to + 2) && !/CHECK THE PRINT/.test(YS.partsNotes(duv, nN)) && !!m);
    const none = only({ gauge: false, notches: false });
    truth("both off: a plain top", !none.plan.gauge && !none.plan.notches && inside(by(none, "boom_rear").mesh, g.end - 1, S.chY, T.hz(g.end) - 1));
  }
  duv.elements.slice(0, 4).forEach((e) => truth(`the hole for ${e.name} is open and walled`, !inR(e.x, 0, 0.5 + (e.type === "driven" ? 9 : 0)) && inR(e.x, e.d / 2 + 0.5, 9.5)));
  // screws: from the back (-y), at each rod's middle, and the driven element's either side of its window
  [0, 73.5, 163.8].forEach((x) => truth(`a screw hole at x ${x}'s middle, from the back to the rod, with plastic round it`, !inR(x, -S.w / 2 + 0.3, 0) && !inR(x, -3, 0) && inR(x, -5, 2.6) && inR(x, -5, -2.6) && inR(x, 5, 0)));
  truth(`the driven element's two, at z +-${T.zs}`, [-1, 1].every((k) => !inR(xd, -S.w / 2 + 0.3, k * T.zs) && !inR(xd, -3, k * T.zs) && inR(xd, -3, k * (T.zs + 2.6)) && inR(xd, -3, k * (T.zs - 2.6))));
  truth("the holes are under M3, with a wider lead-in", inR(73.5, -4, -1.45) && !inR(73.5, -S.w / 2 + 0.2, -1.45));     // below the middle: above it, the hole comes to a point
  const F0 = by(here, "boom_front").mesh;
  [272.4, 378.6].forEach((x) => truth(`the front piece's rod at ${x} has one too`, !inside(F0, x, -4, 0) && inside(F0, x, -4, 2.6)));
  const noScrews = by(YS.buildParts(wasm, duv, { mount: "none", bed: BED, inPlace: true, coupon: false }), "boom_rear").mesh;
  truth("and none without the option", inside(noScrews, 73.5, -5, 0) && inside(noScrews, xd, -5, T.zs));
  // the rod's hole is 0.15 mm wider each side where a screw's hole meets it, as the slicer leaves out hole compensation there
  truth("each rod's hole is wider where its screw's hole meets it, and only there", [0, 73.5, 163.8].every((x) => !inR(x, 1.525 + 0.09, 0) && inR(x, 1.525 + 0.09, 6) && inR(x, 1.525 + 0.25, 0)) &&
    [-1, 1].every((k) => !inR(xd, 1.5875 + 0.09, k * T.zs) && inR(xd, 1.5875 + 0.09, k * (T.zs + 4.5))));
  // the gauge's names are on the -y side, below the V, each with a mark running over the edge and a leader to it
  {
    const turned = (xf, zf) => { const a = T.ang * Math.PI / 180, dx = xf - g.end, dz = zf - g.top; return [g.end + dx * Math.cos(a) + dz * Math.sin(a), g.top - dx * Math.sin(a) + dz * Math.cos(a)]; };
    const yS = -S.w / 2 + 0.3, open = (xf, zf) => { const [x, z] = turned(xf, zf); return !inR(x, yS, z); };
    truth("every mark runs down the side", g.marks.every((m) => open(m.x, g.top - 1) && !open(m.x + 0.6, g.top - 1)));      // only 0.6 past, as D1's and D2's are 1.5 mm apart
    truth("and every name is written below it, on the side", g.marks.every((m) => {
      let n = 0;
      for (let x = m.lx - m.width / 2; x <= m.lx + m.width / 2; x += 0.25) for (let z = g.rowTop - g.H; z <= g.rowTop; z += 0.25) if (open(x, z)) n++;
      return m.labelled && n > 20;
    }), g.marks.map((m) => `${m.rod} ${m.lx.toFixed(1)}`).join(", "));
    truth("the top keeps no names: between the V and the edge it's whole", g.marks.every((m) => [2, 4, 6].every((y) => { const [x, z] = turned(m.lx, g.top - 0.3); return inR(x, y, z); })));
  }
  // nothing written covers a screw's head, on either piece
  truth("nothing written covers a screw's head", [[R0, [0, 73.5, 163.8]], [by(here, "boom_front").mesh, [272.4, 378.6]]].every(([M, xs]) => xs.every((x) => [-3.4, 0, 3.4].every((dx) => [-3, 0, 3].every((z) => Math.abs(dx) < 1 && Math.abs(z) < 1.4 || inside(M, x + dx, -S.w / 2 + 0.3, z))))) &&
    [-1, 1].every((k) => [-3.4, 3.4].every((dx) => [-3, 0, 3].every((dz) => inR(xd + dx, -S.w / 2 + 0.3, k * T.zs + dz)))));
  // up arrows on both sides and TOP on the top, in place of THIS SIDE UP, and the name, on the front piece (the owner, 2026-11-07)
  {
    const Fc = here.plan.faces, FM = by(here, "boom_front").mesh, yS = S.w / 2 - 0.3, h2 = S.h / 2;
    truth("the arrows, TOP and the name are planned on the front piece", Fc && Fc.section === 1 && Fc.arrows.length === 2 && Fc.top && Fc.brand && !here.plan.warnings.length, JSON.stringify(Fc && { arrows: Fc.arrows.map((a) => [a.side, a.x.toFixed(1)]), top: Fc.top && Fc.top.x.toFixed(1), brand: Fc.brand && [Fc.brand.side, Fc.brand.x.toFixed(1)] }));
    truth("an arrow's shaft is cut in each side, pointing up to the top", Fc.arrows.every((a) => !inside(FM, a.x, a.side * yS, 0) && !inside(FM, a.x, a.side * yS, a.half - 0.5) && inside(FM, a.x + 2, a.side * yS, 0) && inside(FM, a.x, a.side * yS, -a.half - 1) && !inside(FM, a.x + 3.5 * 0.86 / 2, a.side * yS, a.half - 3.5 / 2)));
    const someOpen = (x0, x1, f) => { for (let x = x0; x <= x1; x += 0.2) if (f(x)) return true; return false; };
    truth("TOP is cut in the top", someOpen(Fc.top.x - Fc.top.W / 2, Fc.top.x + Fc.top.W / 2, (x) => !inside(FM, x, Fc.top.y0 + 0.4, h2 - 0.3)));
    truth("and Yagi Studio on a side", someOpen(Fc.brand.x - Fc.brand.W / 2, Fc.brand.x + Fc.brand.W / 2, (x) => !inside(FM, x, Fc.brand.side * yS, 0)));
    const off = (o) => YS.planParts(duv, Object.assign({ bed: BED, screws: true }, o)).faces;
    truth("each can be left off", (() => { const a = off({ label: false }), b = off({ brand: false }); return a.arrows.length === 0 && !a.top && a.brand && b.arrows.length === 2 && b.top && !b.brand && off({ label: false, brand: false }) === null; })());
  }
  // the tail in the socket: it seats with nothing overlapping and slides out along its faces
  {
    const { Manifold } = wasm;
    const solidOf = (p) => {
      const seen = new Map(), verts = [], tris = [];
      for (const t of p.mesh.t) for (const c of t) { const key = c.join(","); if (!seen.has(key)) { seen.set(key, seen.size); verts.push(...c); } tris.push(seen.get(key)); }
      return new Manifold(new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) }));
    };
    for (const mount of ["mast", "grip", "tripod", "pole"]) {
      const r = YS.buildParts(wasm, duv, { bed: BED, mount, screws: true, inPlace: true, coupon: false });
      const boom = solidOf(r.parts[0]), m = solidOf(r.parts.find((p) => !p.id.startsWith("boom") && p.id !== "pole_socket"));
      const a = Math.atan(r.plan.taper.m), out = [2, 10, 30].map((d) => Manifold.intersection(boom.translate([d * Math.cos(a), 0, d * Math.sin(a)]), m).volume());
      truth(`${mount}: the tail seats in the socket, and slides out along its faces`, Manifold.intersection(boom, m).volume() < 0.01 && out.every((v) => v < 0.01), out.map((v) => v.toFixed(3)).join(" "));
      truth(`${mount}: the socket stops behind the reflector, which stays in the boom`, !inside(r.parts.find((p) => p.id === m.id || (!p.id.startsWith("boom") && p.id !== "pole_socket")).mesh, 0, 0, 0) && (() => { const q = r.parts.find((p) => !p.id.startsWith("boom") && p.id !== "pole_socket"); return q.mesh.t.flat().every((v) => v[0] <= MOUTH + 1e-3); })());
    }
  }
  const notes = YS.partsNotes(duv, full);
  truth("the notes warn off carbon fiber, and give the soldering order and the screws", /Not carbon fiber/.test(notes) && /heat sink/.test(notes) && /neutral cure silicone/.test(notes) && /M3 x 8 screws/.test(notes) && /stays in the boom/.test(notes));
  // to look at in a slicer, outside the repository
  const out = path.join(require("os").tmpdir(), "duvyagi-parts");
  fs.mkdirSync(out, { recursive: true });
  full.parts.forEach((p) => fs.writeFileSync(path.join(out, p.file), YS.meshToStl(p.mesh, p.id)));
  fs.writeFileSync(path.join(out, "notes.txt"), notes);

  console.log("\n2a. The coupon's screw holes");
  {
    const c = by(YS.buildParts(wasm, duv, { mount: "none", bed: BED, screws: true }), "coupon");
    truth("three holes on an end piece, each from a face into a rod's hole", c.size[0] > 90 && [0, 1, 2].every((i) => {
      const x = 5 + 10 * i, d = PARTS.SCREW.pilots[i];
      return !inside(c.mesh, x, 0.2, 6) && !inside(c.mesh, x, 5, 6) && inside(c.mesh, x, 5, 6 - d / 2 - 0.3) && !inside(c.mesh, x, 5, 6 - d / 2 + 0.3) && !inside(c.mesh, x, 8, 11) && inside(c.mesh, x + 3, 12, 6);
    }), c.size.map((v) => v.toFixed(1)).join(" x "));
  }

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
    const r = YS.buildParts(wasm, duv, { mount, bed: BED, inPlace: true, coupon: false }), on = by(r, id), sh = r.plan.sizes.sockH / 2;
    // in place: the bulge is under the socket, on its -z side, below the pin
    const face = mount === "grip" ? Math.max(15, sh + 0.2 + 3) : sh + 0.2 + 3, px = REAR + 7, w2 = 16 / 2 + 0.2 + 3;
    const hit = (x, y, z) => inside(on.mesh, x, y, z);
    truth(`${mount}: the recess is open to the outside, all the way out`, !hit(px, 2, -face - 0.5) && !hit(px, 2, -face - 3.5) && !hit(px, 2, -face - 3.7));
    truth(`${mount}: the wall behind the nut is whole, and the bolt goes through it`, hit(px, 2.5, -face + 1.5) && hit(px, -2.5, -face + 2.8) && !hit(px, 0, -face + 1.5));
    truth(`${mount}: the recess has walls round it, and holds a nut from turning`, hit(px, 3.3, -face - 1.5) && hit(px, -3.3, -face - 1.5) && hit(px + 3.7, 0, -face - 1.5) && hit(px - 3.7, 0, -face - 1.5));
    truth(`${mount}: the bulge's underside is no steeper than 45 degrees`, [1, 2, 3].every((h) => hit(px - (side - h - 0.3), 0, -face - h) && !hit(px - (side - h + 0.3), 0, -face - h)));
    const yw = mount === "grip" ? face : w2;
    truth(`${mount}: its outside edges are rounded`, !hit(MOUTH - 8, yw - 0.3, face - 0.3) && hit(MOUTH - 8, yw - 1.5, face - 1.5));
  }
  truth("the bolts listed still reach through a nut in the recess", /M3 x 30[^"]*recess/.test(JSON.stringify(YS.PARTS.MOUNTS.tripod.hardware)) && /M3 x 40[^"]*recess/.test(JSON.stringify(YS.PARTS.MOUNTS.grip.hardware)) && 26.4 + 2.4 <= 30 && 30 + 2.4 <= 40);

  console.log("\n2e. Nothing flat hangs in the air as printed, but the tops of round holes and the mast clamp's two slots, which are short bridges");
  const flatArea = (mesh) => mesh.t.reduce((sum, [a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0], len = Math.hypot(nx, ny, nz);
    return len > 0 && nz / len < -0.99 && Math.min(a[2], b[2], c[2]) > 0.05 ? sum + len / 2 : sum;
  }, 0);
  // the pole arm's four bolt holes run across its block, and their round tops grew with the taller socket the tapered boom needs
  for (const pol of ["vertical", "horizontal"]) {
    for (const [mount, limit] of [["mast", 2400], ["pole", 90], ["grip", 60], ["tripod", 60]]) {
      const m = YS.buildParts(wasm, Object.assign({}, duv, { polarization: pol }), { mount }).parts.find((p) => !p.id.startsWith("boom") && p.id !== "coupon");
      truth(`${pol}, ${mount}`, flatArea(m.mesh) < limit, `${flatArea(m.mesh).toFixed(0)} mm2 flat, under ${limit}`);
    }
  }

  console.log("\n3. Scale: a filament that shrinks 0.36%");
  const k = 1 / 0.9964, base = YS.buildParts(wasm, duv, { mount: "none", bed: BED, coupon: false }), scaled = YS.buildParts(wasm, duv, { mount: "none", scale: k, bed: BED, coupon: false });
  const b0 = by(base, "boom_rear"), sr = by(scaled, "boom_rear");
  truth("wider by the same share", near(sr.size[1], b0.size[1] * k, 0.01), sr.size.map((v) => v.toFixed(3)).join(" x "));
  truth("its joint moved to stay on the bed", scaled.plan.sections[0].place.fits && sr.place.fits);

  console.log("\n4. Other designs");
  const yagi = (name, n, gap, L, d, extra) => ({ name, f0: 910, gap: 3, polarization: "vertical", material: "aluminium", elements: Array.from({ length: n }, (_, i) => rod(i === 0 ? "Reflector" : i === 1 ? "Driven" : `D${i - 1}`, i === 0 ? "reflector" : i === 1 ? "driven" : "director", i * gap, L - i, d, "aluminium")), ...extra });
  const cases = [
    ["3 rods, short", yagi("short", 3, 40, 160, 3), { bed: 256 }],
    ["8 rods, 450 mm", yagi("eight", 8, 64, 150, 3), { bed: 256 }],
    ["10 rods, 3 sections", yagi("ten", 10, 90, 150, 3), { bed: 256 }],
    ["14 rods, a small bed", yagi("long", 14, 100, 150, 3), { bed: 220 }],      // at 200, the tail behind the reflector leaves the first piece no room past the driven element's window
    ["Thick rods", yagi("thick", 6, 100, 140, 6), { bed: 256 }],
    ["Horizontal rods", yagi("flat", 6, 70, 150, 3, { polarization: "horizontal" }), { bed: 256 }],
  ];
  for (const [name, d, o] of cases) {
    for (const mount of ["mast", "pole", "grip", "tripod"]) {
      const r = YS.buildParts(wasm, d, Object.assign({ mount }, o));
      const fits = r.parts.filter((p) => p.id.startsWith("boom")).every((p) => p.size[0] <= o.bed - 15.9 && p.place.fits);
      const clear = r.plan.sections.every((s) => !s.next || (s.next.bolts.every((b) => r.plan.rods.every((q) => Math.abs(q.x - b) >= q.hole / 2 + 1.6 + 2 - 1e-6)) && !r.plan.rods.some((q) => Math.abs(q.x - s.next.t) < q.hole / 2 + 3 - 1e-6)));
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
    YS.planParts(yagi("no room", 40, 9, 150, 3), { bed: 180 });
    truth("rods with no room for a joint are refused", false);
  } catch (e) { truth("rods with no room for a joint are refused", /nowhere to join/.test(e.message), e.message); }
  try {
    YS.planParts(yagi("close", 4, 5, 150, 3), {});
    truth("rods too close are refused", false);
  } catch (e) { truth("rods too close are refused", /too close/.test(e.message), e.message); }

  console.log("\nThe fork and tongue");
  {
    const { Manifold } = wasm;
    const solidOf = (p, dx, dy, dz) => {
      const seen = new Map(), verts = [], tris = [];
      for (const t of p.mesh.t) for (const c of t) { const key = c.join(","); if (!seen.has(key)) { seen.set(key, seen.size); verts.push(c[0] + dx, c[1] + dy, c[2] + dz); } tris.push(seen.get(key)); }
      return new Manifold(new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) }));
    };
    // a bed that puts the joint where the draft has it, with the tongue's tip at 224.8: then the front piece is the draft's
    const DRAFT_BED = { x: 274, y: 274, z: 256 };
    const built = YS.buildParts(wasm, duv, { mount: "none", coupon: false, bed: DRAFT_BED, inPlace: true }), joint = built.plan.sections[0].next, t = joint.t;
    const R = by(built, "boom_rear"), F = by(built, "boom_front"), J = YS.PARTS.JOINT;
    truth("the front piece is the draft's, 23.2 mm across the prongs", near(F.size[1], 23.2, 0.01), F.size.map((v) => v.toFixed(2)).join(" x "));
    truth("its bolts are where the draft has them from the tongue's tip", near(t - joint.bolts[0], 23.8, 1e-6) && near(t - joint.bolts[1], 5.8, 1e-6), `${joint.bolts.join(", ")}, tip at ${t}`);
    const rs = solidOf(R, 0, 0, 0), fs2 = solidOf(F, 0, 0, 0);
    truth("the pieces don't overlap, seated, though the tongue is taller than the prongs near its root", Manifold.intersection(rs, fs2).volume() < 0.01, Manifold.intersection(rs, fs2).volume().toFixed(4));
    const slide = [50, 40, 30, 20, 10, 5, 2].map((d) => Manifold.intersection(rs.translate([-d, 0, 0]), fs2).volume());
    truth("and it slides home without touching", slide.every((v) => v < 0.01), slide.map((v) => v.toFixed(3)).join(" "));
    truth("the V is what stops it being pushed up or down", Manifold.intersection(rs, fs2.translate([0, 0, 0.3])).volume() > 0.01, Manifold.intersection(rs, fs2.translate([0, 0, 0.3])).volume().toFixed(3));
    const inR = (x, y, z) => inside(R.mesh, x, y, z), inF = (x, y, z) => inside(F.mesh, x, y, z), b0 = joint.bolts[0], b1 = joint.bolts[1], mid = (b0 + b1) / 2;
    truth("the tongue is solid between the bolts, and the prongs are either side of it", inR(mid, 0, 5) && inF(mid, 6, 5) && inF(mid, -6, 5) && !inF(mid, 0, 5) && !inR(mid, 6, 5));
    truth("the head's recess and the nut's are open to the outside", !inF(b0, 11, 2.5) && !inF(b1, -11, 2.5) && inF(b0, -11, 3.5));
    truth("the bolt holes line up", [b0, b1].every((x) => !inR(x, 0, 0) && !inF(x, 7, 0) && !inF(x, -7, 0)));
    truth("the rear piece's rods, and the front's", !inR(163.8, 0, 0) && !inF(272.4, 0, 0) && !inF(378.6, 0, 0));
    truth("the notes give the longer bolts", /4 M3 x 20|2 M3 x 20/.test(YS.partsNotes(duv, built)));

    // a rod in the way: the first place a joint would go, on the same bed, with D2 moved onto it
    const movedTo = (x) => { const d = JSON.parse(JSON.stringify(duv)); d.elements[3].x = x; return d; };
    const clean = YS.planParts(movedTo(t - 30), { bed: DRAFT_BED, gauge: false }), j2 = clean.sections[0].next;
    truth("a rod where the joint would go moves the joint back, when that costs no piece or gauge mark", !j2.through.length && j2.t < t, `tip at ${j2.t.toFixed(1)}`);
    const kept = YS.planParts(movedTo(t - 30), { bed: DRAFT_BED }), j3 = kept.sections[0].next;
    truth("but goes through the tongue when moving back would lose a gauge mark, and the plan says so",
      j3.through.length === 1 && kept.gauge && kept.gauge.marks.length === 6 && kept.sections.length === 2 && kept.warnings.some((w) => /D2 goes through a joint's tongue/.test(w)), `tip at ${j3.t.toFixed(1)}, ${kept.gauge && kept.gauge.marks.length} marks`);
    const straight = YS.planParts(duv, { bed: 256 });
    truth("on a straight 256 mm bed the DuvYagi is two pieces, with D2 in the tongue behind the bolts and the gauge short only the reflector's mark",
      straight.sections.length === 2 && straight.sections[0].next.through.map((r) => r.name).join() === "D2" && straight.sections[0].next.bolts.every((x) => x > 163.8 + 1.5 + 1.6 + 2) && straight.gauge.marks.length === 5,
      `${straight.sections.length} pieces, bolts ${straight.sections[0].next.bolts.map((x) => x.toFixed(1))}, ${straight.gauge && straight.gauge.marks.length} marks`);
    const sb = YS.buildParts(wasm, duv, { mount: "none", coupon: false, bed: 256, inPlace: true }), SR = by(sb, "boom_rear"), SF = by(sb, "boom_front");
    const zs = [-9, -4, 0, 4, 9], sj = sb.plan.sections[0].next;
    truth("and D2's hole runs clean through the tongue, with plastic round it, and the prongs clear of it",
      zs.every((z) => !inside(SR.mesh, 163.8, 0, z) && inside(SR.mesh, 163.8 + 3, 0, z) && inside(SR.mesh, 163.8 - 3, 0, z) && !inside(SF.mesh, 163.8, 0, z)) &&
      sj.bolts.every((x) => !inside(SR.mesh, x, 0, 0) && !inside(SF.mesh, x, 7, 0)) && inside(SF.mesh, 163.8, 7, 0) && inside(SF.mesh, 163.8, -7, 0));
    const crowded = yagi("crowded", 12, 35, 150, 3), plan = YS.planParts(crowded, { bed: 180 });
    truth("with no clear place, a rod goes through the tongue, and the plan says so", plan.sections.some((s) => s.next && s.next.through.length) && plan.warnings.some((w) => /through a joint's tongue/.test(w)), plan.warnings.join(" ").slice(0, 170));
    const made = YS.buildParts(wasm, crowded, { bed: 180, mount: "none", coupon: false, inPlace: true });
    made.plan.sections.forEach((s, i) => {
      if (!s.next) return;
      const P = made.parts[i];
      s.next.through.forEach((q) => {
        truth(`  ${q.name}, at ${q.x.toFixed(1)}: its hole is in the tongue, with plastic round it`, !inside(P.mesh, q.x, 0, 0) && inside(P.mesh, q.x, q.hole / 2 + 0.5, 0) && inside(P.mesh, q.x, -q.hole / 2 - 0.5, 0));
        s.next.bolts.forEach((b) => truth(`    and clear of the bolt at ${b.toFixed(1)}`, Math.abs(b - q.x) >= q.hole / 2 + 1.6 + 2 - 1e-6));
      });
    });
    const thick = YS.buildParts(wasm, yagi("thick", 6, 100, 140, 6), { bed: 256, mount: "none", coupon: false }), thickF = thick.parts.find((p) => p.id === "boom_front");
    truth("on a thicker boom, the joint's widths grow with it", near(thickF.size[1], 30 * 1.45, 0.01), thickF.size.map((v) => v.toFixed(1)).join(" x "));
    truth("every section of it is one solid", thick.parts.every((p) => p.genus >= 0 && p.volume > 100));
    truth("a very short bed is refused in words", (() => { try { YS.planParts(duv, { bed: 100 }); return false; } catch (e) { return /nowhere to join/.test(e.message); } })());
  }

  console.log("\nThe printer's three dimensions, and corner to corner");
  {
    const six = yagi("six", 6, 76, 150, 3);
    const pieces = (bed) => YS.planParts(six, { bed }).sections.length;
    const close = (a, b, tol) => Math.abs(a - b) <= tol;
    truth("one number still means that much each way", pieces(256) === pieces({ x: 256, y: 256, z: 256 }));
    truth("the longest straight part is the bed's longer side", YS.longestOn({ x: 300, y: 200, z: 100 }, 30) === 300);
    truth("across a square bed, the diagonal less the part's width", close(YS.longestOn({ x: 256, y: 256, corner: true }, 32), 256 * Math.SQRT2 - 32, 0.01), YS.longestOn({ x: 256, y: 256, corner: true }, 32).toFixed(2));
    truth("a part that is too wide doesn't fit at any angle", YS.longestOn({ x: 60, y: 60, corner: true }, 90) === 0);
    const lies = YS.placeOn({ x: 200, y: 300, z: 100 }, 280, 30, 20);
    truth("a part longer than X lies along Y", lies.fits && lies.how === "y" && lies.angle === 90);
    const off = YS.placeOn({ x: 256, y: 256, z: 256 }, 300, 30, 20), on = YS.placeOn({ x: 256, y: 256, z: 256, corner: true }, 300, 30, 20);
    truth("too long straight, and fits corner to corner only when allowed", !off.fits && on.fits && on.how === "corner" && on.angle === 45, `${on.angle} degrees`);
    truth("too tall is its own reason", YS.placeOn({ x: 256, y: 256, z: 50 }, 100, 100, 51).why === "height");
    const a = pieces({ x: 300, y: 300, z: 256 }), b = pieces({ x: 300, y: 300, z: 256, corner: true });
    truth("a longer Y alone is enough", pieces({ x: 150, y: 450, z: 256 }) === 1 && YS.planParts(six, { bed: { x: 150, y: 450, z: 256 } }).sections[0].place.how === "y");
    truth("corner to corner never needs more pieces", b <= a, `${a} straight, ${b} corner to corner`);
    const boomLong = YS.planParts(six, { bed: 2000 }).boom, side = Math.ceil((boomLong + 16 + 32) / Math.SQRT2) + 2;
    const c = YS.planParts(six, { bed: { x: side, y: side, z: 256, corner: true } }), s2 = YS.planParts(six, { bed: { x: side, y: side, z: 256 } });
    truth("and can save a joint", c.sections.length === 1 && c.sections[0].place.how === "corner" && s2.sections.length === 2, `a ${boomLong} mm boom on a ${side} mm bed, at ${c.sections[0].place.angle} degrees`);
    truth("the page is told when it would help", s2.cornerPieces === 1);
    try { YS.planParts(six, { bed: { x: 256, y: 256, z: 15 } }); truth("a printer too low for the boom is refused", false); } catch (e) { truth("a printer too low for the boom is refused", /tall/.test(e.message), e.message); }
    const low = YS.buildParts(wasm, six, { bed: { x: 256, y: 256, z: 60 }, mount: "pole" });
    const tall = low.parts.filter((p) => !p.place.fits);
    truth("a mount too tall for the printer says so", tall.length > 0 && tall.every((p) => /too tall/.test(p.placing)), tall.map((p) => `${p.name} ${p.size[2].toFixed(0)}`).join(", "));
    truth("and so do its build notes", tall.every((p) => YS.partsNotes(six, low).includes(p.placing)));
  }

  console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
