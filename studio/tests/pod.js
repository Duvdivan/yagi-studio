/*
 * The node pod in the 3D print tab (src/pod.js), against cad/node_pod.py, which it copies:
 *     node tests/pod.js
 *
 * 1. Every option makes valid solids, each one piece.
 * 2. Their volumes match the script's for the DuvYagi (numbers from node_pod.py, 2026-11-16) within 1.5%: the two differ only in
 *    how they facet curves and a few small edge rounds.
 * 3. On the antenna, the DuvYagi's rear boom slides into the socket with no overlap, and so do the wedge over its tail and
 *    the side solar arm in its place; the body, the core and the ring don't overlap; the top piece sits in its hole.
 * 4. A horizontally polarized design gets no socket; the notes ask for a brim.
 * Exits non-zero on a failure.
 */
const path = require("path");
for (const f of ["solver", "rf", "guide", "pole-socket", "mast-clamp", "parts", "pod-bee", "pod"]) require(path.join(__dirname, "..", "src", f + ".js"));
const YS = globalThis.YS;

let failed = 0;
const truth = (name, pass, detail) => {
  if (!pass) failed++;
  console.log(`${pass ? "pass" : "FAIL"}  ${name}${detail !== undefined ? ": " + detail : ""}`);
};

const rod = (name, type, x, L, d, material) => ({ id: name, name, type, x, L, d, material });
const duv = {
  name: "DuvYagi", f0: 910.525, gap: 3, polarization: "vertical", material: "aluminium",
  elements: [rod("Reflector", "reflector", 0, 158.6, 3, "aluminium"), rod("Driven", "driven", 39.8, 149, 3.175, "brass"), rod("D1", "director", 73.5, 142.3, 3, "aluminium"),
    rod("D2", "director", 163.8, 140.8, 3, "aluminium"), rod("D3", "director", 272.4, 138.3, 3, "aluminium"), rod("D4", "director", 378.6, 136.1, 3, "aluminium")],
};
const BED = { x: 256, y: 256, z: 256, corner: true };

/* node_pod.py's volumes, cm3, for the DuvYagi 10 dBd tail (its TAIL) */
const PY = {
  default: { pod_body: 162.16, pod_core: 26.83, pod_ring: 11.85, pod_finial: 5.55, pod_solar_stem: 16.76, pod_solar_nut: 3.57, pod_solar_plate: 46.23, pod_boom_wedge: 1.61, pod_solar_arm: 40.65, pod_ring_magnet: 87.09 },
  "top=sma mount=pad back=pg9 front=pg7": { pod_body: 105.78, pod_core: 26.48, pod_top_sma: 1.87, pod_top_plug: 4.65, pod_mount_block: 56.07, pod_mount_wall: 21.11, pod_mount_magnet: 49.54 },
  "top=n socket=none lace=no marks=no front=none sma=no": { pod_body: 133.44, pod_core: 27.19, pod_top_n: 7.29, pod_top_plug_n: 14.78 },
  "battery=26650": { pod_body: 171.46, pod_core: 27.82, pod_solar_stem: 14.47 },
};
const parse = (s) => (s === "default" ? {} : Object.fromEntries(s.split(" ").map((kv) => kv.split("="))));

(async () => {
  const Module = (await import(path.join(__dirname, "..", "src", "vendor", "manifold.js").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"))).default;
  const wasm = await Module();
  const m = 0.03252026871212343, zbRear = -20.043085013288053;
  const tail = { Ht: 38.3, w: 16.0, m, zb: (bx) => zbRear + m * (bx - (-32)) };

  console.log("1, 2. Valid solids, and the script's volumes");
  for (const [key, want] of Object.entries(PY)) {
    const R = YS.POD.build(wasm, parse(key), tail);
    try {
      const bad = R.parts.filter((p) => p.solid.status() !== "NoError" || p.solid.isEmpty() || p.solid.decompose().length !== 1);
      truth(`${key}: every part a valid solid, in one piece`, !bad.length, bad.map((p) => p.id).join(", ") || `${R.parts.length} parts`);
      const off = Object.entries(want).map(([id, v]) => { const p = R.parts.find((q) => q.id === id); return [id, p ? p.solid.volume() / 1000 : NaN, v]; })
        .filter(([, js, py]) => !(Math.abs(js - py) <= 0.015 * py));
      truth(`${key}: volumes as node_pod.py's, within 1.5%`, !off.length, off.length ? off.map(([id, js, py]) => `${id} ${js.toFixed(2)} vs ${py}`).join("; ") : `${Object.keys(want).length} parts`);
    } finally {
      R.K.free();
    }
  }
  // every other choice once
  for (const opts of [{ top: "sealed" }, { mount: "pad", lace: "no" }, { back: "vent", front: "none", sma: "no" }, { battery: "2x18650", top: "n" }, { socket: "none", marks: "no" }, { back: "none", front: "pg7", label: "DUVYAGI" }]) {
    const R = YS.POD.build(wasm, opts, tail);
    try {
      const bad = R.parts.filter((p) => p.solid.status() !== "NoError" || p.solid.isEmpty());
      truth(`${JSON.stringify(opts)}: valid`, !bad.length, bad.map((p) => p.id).join(", ") || `${R.parts.length} parts`);
    } finally {
      R.K.free();
    }
  }

  console.log("3. Fitted together on the antenna (the DuvYagi's own boom)");
  const r = YS.buildParts(wasm, duv, { mount: "pod", bed: BED, inPlace: true, coupon: false });
  const { Manifold, Mesh } = wasm;
  const solid = (p) => {
    const t = p.mesh.t, pos = new Float32Array(t.length * 9), tri = new Uint32Array(t.length * 3);
    t.forEach((tr, i) => tr.forEach((v, k) => { pos.set(v, 9 * i + 3 * k); tri[3 * i + k] = 3 * i + k; }));
    const mesh = new Mesh({ numProp: 3, vertProperties: pos, triVerts: tri });
    mesh.merge();
    return new Manifold(mesh);
  };
  const by = (id) => r.parts.find((p) => p.id === id);
  const boom = solid(by("boom_rear")), body = solid(by("pod_body")), core = solid(by("pod_core")), ring = solid(by("pod_ring"));
  const wedge = solid(by("pod_boom_wedge")), arm = solid(by("pod_solar_arm"));
  const meet = (a, b) => a.intersect(b).volume();
  truth("the rear boom's tail in the socket, no overlap", meet(boom, body) < 0.05, `${meet(boom, body).toFixed(3)} mm3`);
  truth("the wedge over the tail: clear of the body and on the tail", meet(wedge, body) < 0.05 && meet(wedge, boom) < 0.5, `${meet(wedge, body).toFixed(3)} / ${meet(wedge, boom).toFixed(3)} mm3`);
  truth("the side arm in the socket instead, no overlap", meet(arm, body) < 0.05, `${meet(arm, body).toFixed(3)} mm3`);
  truth("body, core and ring don't overlap", meet(body, core) < 0.05 && meet(body, ring) < 0.05 && meet(core, ring) < 0.05,
    `${meet(body, core).toFixed(3)} / ${meet(body, ring).toFixed(3)} / ${meet(core, ring).toFixed(3)} mm3`);
  // the boom sits in the socket, not in front of it: its end is within a millimetre of the socket's floor
  const tip = by("boom_rear").mesh.t.flat().reduce((a, v) => Math.min(a, v[0]), Infinity);
  truth("the tail goes all the way in", tip < -31.5 && tip > -32.5, `its end at x ${tip.toFixed(2)} (REAR is -32)`);

  console.log("4. Choices and notes");
  const hz = Object.assign({}, duv, { polarization: "horizontal" });
  const rh = YS.buildParts(wasm, hz, { mount: "pod", bed: BED, coupon: false });
  const bodyH = rh.parts.find((p) => p.id === "pod_body"), bodyV = YS.buildParts(wasm, duv, { mount: "pod", bed: BED, coupon: false }).parts.find((p) => p.id === "pod_body");
  truth("horizontal rods: the pod has no socket (a narrower body)", bodyH.size[0] < bodyV.size[0] - 20, `${bodyH.size[0].toFixed(1)} vs ${bodyV.size[0].toFixed(1)} mm`);
  const notes = YS.partsNotes(duv, r);
  truth("the notes ask for a brim under the body", /ON A BRIM/.test(notes) && /outer brim only, 8 mm/.test(notes));
  truth("the notes say what's been printed and what hasn't", /an earlier version of its body, ring and finial was printed/.test(notes) && /NOT YET PRINTED: this version/.test(notes));
  const pad = YS.buildParts(wasm, duv, { mount: "pod", bed: BED, coupon: false, pod: { mount: "pad" } });
  truth("with the pad, the block, both plates and the painter pole socket are made", ["pod_mount_block", "pod_mount_wall", "pod_mount_magnet", "pod_pole_socket"].every((id) => pad.parts.some((p) => p.id === id)));
  truth("every part fits the owner's 256 mm bed", r.parts.every((p) => p.place.fits), r.parts.filter((p) => !p.place.fits).map((p) => p.id).join(", ") || "all");

  console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
