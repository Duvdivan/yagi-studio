/*
 * Lifts the owner's own mast clamp (v5, printed and tested 2026-11-11) out of their 3MF or binary STL, unchanged, into
 * src/mast-clamp.js, so that parts.js offers exactly that part, every fillet included:
 *     node tests/make_mast_clamp.js "path/to/DuvYagi_10_dBd_as_built__mast_mount v5 new 45.3mf"
 *
 * The file is in the owner's frame: the boom along +x with the socket's mouth at the largest x, the pole's V toward -x, and
 * z up as it's used. Rays straight up through the socket find its floor near the mouth and farther in, which gives the floor's
 * height at the mouth and its slope, so parts.js can line the socket up with any boom's tail.
 */
const fs = require("fs"), path = require("path"), zlib = require("zlib");

const RAY_Y = 4;               // mm off the middle, clear of the back screw's hole
const RAY_IN = [3, 12];        // mm in from the mouth, either side of nothing: the pins are 20 mm in

/** The files in a zip (a 3MF is one), by name. */
function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Not a zip file.");
  const n = buf.readUInt16LE(e + 10), out = {};
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), at = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nl), data = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const raw = buf.subarray(data, data + size);
    out[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    p += 46 + nl + xl + cl;
  }
  return out;
}

/** Vertices and triangles from a 3MF (its biggest mesh) or a binary STL. */
function read(file) {
  const buf = fs.readFileSync(file);
  if (/\.3mf$/i.test(file)) {
    const files = unzip(buf), name = Object.keys(files).filter((k) => /\.model$/i.test(k)).sort((a, b) => files[b].length - files[a].length)[0];
    const x = files[name].toString("utf8");
    const verts = [...x.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((m) => [+m[1], +m[2], +m[3]]);
    const tris = [...x.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].flatMap((m) => [+m[1], +m[2], +m[3]]);
    return { verts, tris, from: `${path.basename(file)} (${name})` };
  }
  const count = buf.readUInt32LE(80);
  if (buf.length !== 84 + 50 * count) throw new Error("This reads 3MF and binary STL files only.");
  const index = new Map(), verts = [], tris = [];
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 3; k++) {
      const at = 84 + 50 * t + 12 + 12 * k, p = [buf.readFloatLE(at), buf.readFloatLE(at + 4), buf.readFloatLE(at + 8)], key = p.join();
      if (!index.has(key)) { index.set(key, verts.length); verts.push(p); }
      tris.push(index.get(key));
    }
  }
  return { verts, tris, from: path.basename(file) };
}

/** Where a vertical line at (x, y) crosses the mesh, bottom up. */
function crossings(verts, tris, x, y) {
  const zs = [];
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [verts[tris[t]], verts[tris[t + 1]], verts[tris[t + 2]]];
    const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / d, v = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    zs.push(a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
  }
  return zs.sort((p, q) => p - q).filter((z, i, s) => i === 0 || z - s[i - 1] > 1e-4);
}

(async () => {
  const file = process.argv[2];
  if (!file) throw new Error("Give the path to the clamp's 3MF or STL.");
  const { verts, tris, from } = read(file);
  console.log(`${from}: ${tris.length / 3} triangles, ${verts.length} vertices`);
  const Module = (await import("file:///" + path.join(__dirname, "..", "src", "vendor", "manifold.js").replace(/\\/g, "/"))).default;
  const wasm = await Module();
  wasm.setup();
  const solid = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: Float32Array.from(verts.flat()), triVerts: Uint32Array.from(tris) }));
  const b = solid.boundingBox();
  console.log(`read as a solid: ${solid.status()}, volume ${solid.volume().toFixed(0)} mm3, genus ${solid.genus()}`);
  console.log(`x ${b.min[0].toFixed(2)} to ${b.max[0].toFixed(2)}, y ${b.min[1].toFixed(2)} to ${b.max[1].toFixed(2)}, z ${b.min[2].toFixed(2)} to ${b.max[2].toFixed(2)}`);
  if (solid.status() !== "NoError") throw new Error("The clamp isn't a closed solid.");
  // the socket's floor: the second crossing from below, near the mouth and farther in
  const mouth = b.max[0], floor = RAY_IN.map((d) => { const z = crossings(verts, tris, mouth - d, RAY_Y); return [mouth - d, z[1], z]; });
  floor.forEach(([x, z, all]) => console.log(`at x ${x.toFixed(1)}: crossings ${all.map((v) => v.toFixed(2)).join(", ")}`));
  const slope = (floor[0][1] - floor[1][1]) / (floor[0][0] - floor[1][0]), atMouth = floor[0][1] + slope * (mouth - floor[0][0]);
  const height = floor[0][2][2] - floor[0][1];
  console.log(`socket floor ${atMouth.toFixed(3)} at the mouth, sloping ${(Math.atan(slope) * 180 / Math.PI).toFixed(3)} degrees, ${height.toFixed(3)} mm tall inside`);
  // its back wall: rays along x inside it, near its floor, its middle and its ceiling; the last crossing is the wall
  const along = verts.map((v) => [v[1], v[2], v[0]]);
  const backs = [0.3, height / 2, height - 0.3].map((dz) => Math.max(...crossings(along, tris, RAY_Y, atMouth + dz)));
  const back = Math.max(...backs);
  console.log(`its back wall at x ${backs.map((v) => v.toFixed(3)).join(", ")}: ${(mouth - back).toFixed(3)} mm deep`);
  // the screw holes: the vertical one, from rays along x through the socket's top and bottom walls, and the back one, from a
  // ray up through the block just behind the socket; each is the pair of crossings in the middle
  const pair = (zs, lo, hi) => { const q = zs.filter((v) => v > lo && v < hi); if (q.length !== 2) throw new Error(`Expected one hole between ${lo.toFixed(1)} and ${hi.toFixed(1)}, found crossings ${q.map((v) => v.toFixed(2))}`); return (q[0] + q[1]) / 2; };
  const hxTop = pair(crossings(along, tris, 0, atMouth + height + 1.5), back + 1, mouth - 1), hxBot = pair(crossings(along, tris, 0, atMouth - 1.5), back + 1, mouth - 1);
  const bz = pair(crossings(verts, tris, back - 5, 0), atMouth + 1, atMouth + height - 1);
  console.log(`the vertical screw at x ${hxTop.toFixed(3)} through the top wall and ${hxBot.toFixed(3)} through the bottom; the back screw at z ${bz.toFixed(3)}`);
  if (Math.abs(hxTop - hxBot) > 0.05) throw new Error("The vertical screw's hole isn't vertical.");
  const hx = (hxTop + hxBot) / 2;
  const g = solid.getMesh(), pos = new Float32Array(g.vertProperties.length / g.numProp * 3);
  for (let i = 0; i < pos.length / 3; i++) for (let k = 0; k < 3; k++) pos[3 * i + k] = g.vertProperties[g.numProp * i + k];
  const nv = pos.length / 3, idx = nv < 65536 ? Uint16Array.from(g.triVerts) : Uint32Array.from(g.triVerts);
  const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");
  const out = `/*
 * The owner's own mast clamp, v5, printed and tested 2026-11-11, unchanged. Made by tests/make_mast_clamp.js from
 * ${from}: don't edit by hand. In the owner's frame: the socket's mouth at x = mouth, the pole's V toward -x, z up as used.
 * floor is the socket's floor at the mouth, slope its rise per mm toward the mouth, and height the socket's inside height near
 * the mouth, from rays up through the socket, and back is where its back wall is, from rays along it. hx is where the
 * vertical screw's hole is along x, and bz the back screw's height, which the boom's tail lines its own up with.
 * Little-endian Float32 positions and Uint${idx.BYTES_PER_ELEMENT * 8} triangles, in base 64.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});
  YS.MAST_CLAMP = {
    mouth: ${mouth.toFixed(4)}, floor: ${atMouth.toFixed(4)}, slope: ${slope.toFixed(6)}, height: ${height.toFixed(4)}, back: ${back.toFixed(4)}, hx: ${hx.toFixed(4)}, bz: ${bz.toFixed(4)}, width: ${(b.max[1] - b.min[1]).toFixed(3)}, bits: ${idx.BYTES_PER_ELEMENT * 8},
    positions: "${b64(pos)}",
    triangles: "${b64(idx)}",
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
`;
  const to = path.join(__dirname, "..", "src", "mast-clamp.js");
  fs.writeFileSync(to, out);
  console.log(`${to}: ${Math.round(out.length / 1024)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
