/*
 * Lifts the threaded painter-pole socket out of the owner's pole attachment, whose thread is proven on a real pole,
 * into src/pole-socket.js, so that parts.js can build on exactly that thread:
 *     node tests/make_pole_socket.js "path/to/YAgi pole attachment.stl"
 *
 * It finds the boss's axis by fitting a circle to its outer wall, keeps a cylinder around it from the open end to a
 * little past the bottom of the thread, and turns it so that the opening points up (+z), its solid end at z = 0.
 */
const fs = require("fs"), path = require("path");

const KEEP_R_OVER = 0.05;    // mm past the boss's outer wall, so the cut doesn't shave it
const CAP = 3;               // mm of solid kept past the bottom of the thread

/** Least-squares circle (Kasa): the centre and radius of points in a plane. */
function fitCircle(pts) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  const n = pts.length, A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], b = [sxz, syz, sz];
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const f = A[j][i] / A[i][i];
      for (let k = i; k < 3; k++) A[j][k] -= f * A[i][k];
      b[j] -= f * b[i];
    }
  }
  const s = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let v = b[i];
    for (let k = i + 1; k < 3; k++) v -= A[i][k] * s[k];
    s[i] = v / A[i][i];
  }
  const cx = s[0] / 2, cy = s[1] / 2;
  return { cx, cy, r: Math.sqrt(s[2] + cx * cx + cy * cy) };
}

(async () => {
  const file = process.argv[2];
  if (!file) throw new Error("Give the path to the pole attachment's STL.");
  const buf = fs.readFileSync(file), count = buf.readUInt32LE(80);
  if (buf.length !== 84 + 50 * count) throw new Error("This reads binary STL files only.");
  const index = new Map(), verts = [], tris = new Uint32Array(count * 3);
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 3; k++) {
      const at = 84 + 50 * t + 12 + 12 * k, p = [buf.readFloatLE(at), buf.readFloatLE(at + 4), buf.readFloatLE(at + 8)], key = p.join();
      if (!index.has(key)) { index.set(key, verts.length); verts.push(p); }
      tris[3 * t + k] = index.get(key);
    }
  }
  console.log(`${count} triangles, ${verts.length} vertices`);
  // the boss runs along y, from y0 to where the block starts. x and z are across it
  const y0 = Math.min(...verts.map((v) => v[1]));
  const ring = verts.filter((v) => v[1] < y0 + 20);     // well short of the block
  const rough = { cx: (Math.min(...ring.map((v) => v[0])) + Math.max(...ring.map((v) => v[0]))) / 2, cy: (Math.min(...ring.map((v) => v[2])) + Math.max(...ring.map((v) => v[2]))) / 2 };
  const radial = (v, c) => Math.hypot(v[0] - c.cx, v[2] - c.cy);
  const outerRough = Math.max(...ring.map((v) => radial(v, rough)));
  const c = fitCircle(ring.filter((v) => radial(v, rough) > outerRough - 1.5).map((v) => [v[0], v[2]]));
  const walls = ring.map((v) => radial(v, c)).filter((r) => r > c.r - 1.5);
  console.log(`axis at x ${c.cx.toFixed(3)}, z ${c.cy.toFixed(3)}; outer radius ${c.r.toFixed(3)}, from ${Math.min(...walls).toFixed(3)} to ${Math.max(...walls).toFixed(3)}`);
  // the thread: everything well inside the wall, and how far along it goes
  const bossEnd = Math.min(...verts.filter((v) => radial(v, c) > c.r + 3).map((v) => v[1]));
  const inner = verts.filter((v) => radial(v, c) < c.r - 2 && v[1] < bossEnd + 15);
  const yEnd = Math.max(...inner.map((v) => v[1]));
  const rs = inner.map((v) => radial(v, c));
  console.log(`thread from y ${y0.toFixed(2)} to ${yEnd.toFixed(2)}: ${(yEnd - y0).toFixed(2)} mm deep, radius ${Math.min(...rs).toFixed(3)} to ${Math.max(...rs).toFixed(3)}`);
  console.log(`the block starts at y ${bossEnd.toFixed(2)}: the boss is ${(bossEnd - y0).toFixed(2)} mm long`);

  const Module = (await import("file:///" + path.join(__dirname, "..", "src", "vendor", "manifold.js").replace(/\\/g, "/"))).default;
  const wasm = await Module();
  wasm.setup();
  const { Manifold, Mesh } = wasm;
  const whole = new Manifold(new Mesh({ numProp: 3, vertProperties: Float32Array.from(verts.flat()), triVerts: tris }));
  console.log(`read as a solid: ${whole.status()}, volume ${whole.volume().toFixed(0)} mm3`);
  const top = yEnd + CAP;
  // along z to along y, with the open end down, at the boss's axis
  const keep = Manifold.cylinder(top - y0 + 2, c.r + KEEP_R_OVER, c.r + KEEP_R_OVER, 128).rotate([-90, 0, 0]).translate([c.cx, y0 - 1, c.cy]);
  const cut = keep.intersect(whole);
  // the solid end at z = 0 and the opening up: -y becomes z
  const up = cut.translate([-c.cx, -top, -c.cy]).rotate([-90, 0, 0]);
  const b = up.boundingBox(), g = up.getMesh();
  console.log(`socket: ${g.triVerts.length / 3} triangles, ${g.vertProperties.length / g.numProp} vertices, volume ${up.volume().toFixed(0)} mm3, genus ${up.genus()}, status ${up.status()}`);
  console.log(`z ${b.min[2].toFixed(3)} to ${b.max[2].toFixed(3)}, x ${b.min[0].toFixed(3)} to ${b.max[0].toFixed(3)}, y ${b.min[1].toFixed(3)} to ${b.max[1].toFixed(3)}`);
  const pos = new Float32Array(g.vertProperties.length / g.numProp * 3);
  for (let i = 0; i < pos.length / 3; i++) for (let k = 0; k < 3; k++) pos[3 * i + k] = g.vertProperties[g.numProp * i + k];
  const idx = Uint32Array.from(g.triVerts);
  const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");
  const out = `/*
 * The threaded painter-pole socket from the owner's pole attachment, whose thread is proven on a real pole. Made by
 * tests/make_pole_socket.js: don't edit by hand. Its opening points up (+z), with its solid end at z = 0.
 * Depth ${(yEnd - y0).toFixed(1)} mm, outer diameter ${(2 * c.r).toFixed(1)} mm. Little-endian Float32 positions and Uint32 triangles, in base 64.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});
  YS.POLE_SOCKET = {
    height: ${(b.max[2] - b.min[2]).toFixed(4)}, radius: ${c.r.toFixed(4)}, depth: ${(yEnd - y0).toFixed(4)},
    positions: "${b64(pos)}",
    triangles: "${b64(idx)}",
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
`;
  const to = path.join(__dirname, "..", "src", "pole-socket.js");
  fs.writeFileSync(to, out);
  console.log(`${to}: ${Math.round(out.length / 1024)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
