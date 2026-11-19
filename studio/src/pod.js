/*
 * The node pod: a sealed, round, upright housing for a Heltec V4 node and its battery, with a socket for the boom's tail,
 * so the antenna and the node go up the mast as one piece. Made here as cad/node_pod.py makes it, from the same numbers
 * and the same steps, so the 3D print tab can make it with any of the script's options; that script is the reference, and
 * tests/pod.js compares the two. The socket is cut to this design's own tail. Its notes (how it works, why each number) are
 * in node_pod.py; here they're kept short.
 *
 * Frame: z up from the tube's bottom end, x toward the antenna (the boom points +x), y across, mm.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});
  const PI = Math.PI, SQ2 = Math.SQRT2, SQ3 = Math.sqrt(3), rad = (d) => d * PI / 180;

  // ---------- the numbers (node_pod.py's) ----------
  const CELLS = {
    pouch: { shape: "box", w: 37.0, d: 12.0, h: 69.0, name: "a 1S pouch cell up to 67.4 x 36 x 11 mm (Meshnology 3000 mAh), with its protection board" },
    "2x18650": { shape: "box", w: 38.2, d: 19.4, h: 72.0, name: "a 1S2P 18650 pack with its BMS, about 70 x 37.2 x 18.6 mm" },
    "26650": { shape: "round", w: 27.4, d: 27.4, h: 72.0, name: "one protected 26650 cell, about 70 x 26.6 mm" },
  };
  const BOARD = { w: 25.5, l: 52.8, back: 4.0, front: 5.6 }, PCB_T = 1.2;
  const BORE = 55.0, WALL = 2.4, R_IN = BORE / 2, R_OUT = BORE / 2 + WALL, LEAD_IN = 1.5;
  const GROOVE = [2.4, 4.0], RIM_H = 10.0, GROOVE_Z = 3.5, RIM_PLAY = 0.2, FLANGE = [2.5, 29.9], KEY = [8.0, 3.0, 1.0];
  const PITCH = 3.0, T_DEPTH = 1.25, T_CREST = 0.3, T_PLAY = 0.3, THREAD_Z = [1.5, 10.5];
  const RING_LIP = [3.0, 24.0], RING_WALL = 2.4, RING_TOP = 10.5, FLUTES = [24, 2.0, 1.0], DETENT = [12, 3, 0.3];
  const PORT_TYPES = {
    pg7: { hole: 12.7, wall: 3.0, inset: 0.0, nut: [19.0, 5.0], name: "PG7 gland" },
    pg9: { hole: 15.6, wall: 3.0, inset: 0.8, nut: [21.65, 6.0], name: "PG9 gland" },
    vent: { hole: 12.4, wall: 3.5, inset: 0.0, nut: [18.5, 7.0], name: "M12 x 1.5 breather" },
  };
  const PORT_X = { back: -12.0, front: 12.0 }, SMA = [-5.0, -15.5], D_HOLE = [6.6, 2.85], FLOOR = 3.0;
  const SMA_HEX = [8.0, 0.4, 2.0];    // the SMA's hex pocket: across flats (a flat parallel to the D's), play, the wall left under it
  const SPINE = [4.5, 2.0], BOARD_Z = 10.0, CELL_Z = 26.0, GUIDE_PLAY = 0.7, CRUSH = 0.15, CRUSH_RAMP = 2.0, CEILING_GAP = 3.0;
  const EDGE_PLAY = 0.5, RAIL_LIP = 1.7;   // each guide slot's bottom past the board's edge; the guides' lips in front of the slots
  const REAR = -32.0, MOUTH = -5.0, PLAY = 0.2, DEEPER = 0.2, SOCK_FLOOR = 1.5, NOSE_WALL = [4.0, 3.0], LEAD = 1.0;
  const CORBEL_Z = 12.0, LOCK_AT = REAR + 7.0, M3 = 3.4, DRAIN = 2.5;
  const V_ANGLE = 112.0, SADDLE_W = 30.0, TUNNEL = [5.0, 16.0, 1.2], JAW = 20.0, SADDLE_CAP = 3.0;
  // each tunnel a half ring in plan, bowed toward the pole, its inside this much over the spine's half-width in radius, so
  // the band leaves the spine's sides at about 11 degrees instead of 90 (the owner, 2026-11-17; node_pod.py's TUNNEL_ARC)
  const TUNNEL_ARC = 0.3;
  const LACE = { n: 20, rib: 1.4, rib_min: 1.0, skin: 1.5, draft: 45.0, foot: 13.0, hem: 2.0, collar: 1.5, ramp: 2.5 }, SH_R = 10.0;
  const BEE = { width: 24.5, h: 0.8, wing_h: 0.45, dz: 2.3 }, LABEL = { size: 6.5, h: 0.6, dz: 9.0 };
  const EMBLEM = { reflector: 11.0, spacing: 5.8, overhang: 2.0, w: 1.4, h: 0.8 };
  const BOSS = [13.0, 12.0], TOP_THREAD = [20.0, 2.5, 10.0], TOP_FLOOR = 2.0;
  const TOP_HOLES = { solar: [TOP_THREAD, false], sma: [TOP_THREAD, true], n: [[36.0, 3.0, 10.0], true] };
  const INSERTS = {
    plug: { hole: null, flats: [], head: 4.0, bore: null, reach: 0 },
    sma: { hole: 6.6, flats: [2.85], head: 2.0, bore: 15.0, reach: 20.0 },
    n: { hole: 16.3, flats: [6.85, -6.85], head: 3.0, bore: 27.0, reach: 32.0 },
  };
  const INSERT_ORINGS = { 20: [18.0, 2.5], 36: [34.0, 2.5] };
  const PANEL = [136.0, 110.0, 3.0], TILT = 30.0, PANEL_LOW = 95.0, STEM_R = 11.0, SPIGOT = [16.0, 14.0], PIN = 3.3, NUT_AF = 30.0, PLATE_T = 4.0;
  const PADS = { w: 34.0, depth: 9.0, bolts: [11.0, 15.0], zc: 48.0, play: 0.3 }, M3_NUT = [5.5, 2.4], PAD_NUT_IN = 6.0;
  const SIDE = { reach: 50.0, clear: 5.0, beam: 8.0 }, SIDE_NUT = [5.4, 2.4];
  const BLOCK = { size: 36.0, pole_bolts: 14.0, pole_nut_z: 4.0, tripod: [11.2, 5.6, 5.0, 6.6] };
  const WALL_PLATE = { t: 6.0, w: 36.0, keys: 42.0, head: [9.5, 4.6, 3.0] };
  // the rubber-coated pot magnets (43 mm, a threaded hole in the back), each screwed on from behind with an M5 flat head
  // thread, length: the magnet's threaded hole's depth and its screw's length, head and all (the owner's, 2026-11-17)
  const MAGNET = { d: 43.0, h: 6.0, proud: 1.5, play: 0.6, screw: [5.5, 10.4], floor: 3.5, wall: 3.0, at: [23.0, 38.5, 39.0], thread: 5.35, length: 14.3, bite: 3.5 };
  // inner: the fillet up the skirt's inside over each lobe; bore: the counterbore through the buttress to each screw's head
  const MAG_BASE = { r: 40.0, foot: -40.0, wall: 2.4, at: 47.0, lobe: 5.0, fillet: 1.5, notch: [12.0, 14.0], inner: 6.0, bore: 11.0, slope: 40.0 };
  const COVE = { foot: 2.0, foot_back: 3.0, rim: 4.0, rim_top: 6.0, rail: 2.5, rail_foot: 2.0, rail_in: 1.5, pocket: 1.0, lip: 1.0, cradle: 1.0, rim_floor: 1.5, boss: 0.5 };
  const NUT_MARGIN = 0.5;             // no floor fillet within this of a port's nut
  const RIM_CHAMFER = 0.6, F_SEAT = 7.0;
  const SEG = 96;                     // sides on a full circle
  const TOP_R = TOP_THREAD[0] / 2 + T_PLAY;

  const OPTIONS = { battery: "pouch", socket: "boom", top: "solar", mount: "clamps", back: "pg7", front: "vent", sma: "yes", lace: "yes", marks: "yes", label: "" };
  const CHOICES = {
    battery: [["pouch", "Pouch cell"], ["2x18650", "Two 18650s"], ["26650", "One 26650"]],
    socket: [["boom", "The boom's socket"], ["none", "None (a plain front)"]],
    top: [["solar", "Solar-ready"], ["sealed", "Sealed"], ["sma", "SMA antenna"], ["n", "N antenna"]],
    mount: [["clamps", "Hose clamp spine"], ["pad", "Bolt-on pad"]],
    back: [["pg7", "PG7 gland"], ["pg9", "PG9 gland"], ["vent", "Breather"], ["none", "None"]],
    front: [["vent", "Breather"], ["pg7", "PG7 gland"], ["none", "None"]],
  };

  // ---------- a small kit over Manifold ----------
  function kit(wasm) {
    if (wasm.setup) wasm.setup();
    const { Manifold, CrossSection } = wasm;
    const made = [];
    const keep = (m) => { made.push(m); return m; };
    const cs = (pts) => keep(new CrossSection([pts], "NonZero"));
    const K = {
      box: (x0, x1, y0, y1, z0, z1) => keep(keep(Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0])),
      cylZ: (cx, cy, d, z0, z1, n) => keep(keep(Manifold.cylinder(z1 - z0, d / 2, d / 2, n || SEG)).translate([cx, cy, z0])),
      cylX: (cy, cz, d, x0, x1) => keep(keep(keep(Manifold.cylinder(x1 - x0, d / 2, d / 2, SEG)).rotate([0, 90, 0])).translate([x0, cy, cz])),
      xy: (pts, z0, z1) => keep(keep(cs(pts).extrude(z1 - z0)).translate([0, 0, z0])),
      /* a polygon drawn in (x, z), run along y from y0 to y1 */
      xz: (pts, y0, y1) => keep(keep(keep(cs(pts).extrude(y1 - y0)).rotate([90, 0, 0])).translate([0, y1, 0])),
      /* a polygon drawn in (y, z), run along x from x0 to x1 */
      yz: (pts, x0, x1) => keep(keep(keep(cs(pts).extrude(x1 - x0)).rotate([90, 0, 90])).translate([x0, 0, 0])),
      /* a solid of revolution about z from its outline [(r, z)]; all round, or from a0 to a1 degrees */
      revolve: (rz, a0, a1) => {
        let area = 0;                                     // Manifold takes the outline counterclockwise (r, z) only
        for (let i = 0; i < rz.length; i++) { const p = rz[i], q = rz[(i + 1) % rz.length]; area += p[0] * q[1] - q[0] * p[1]; }
        if (area < 0) rz = rz.slice().reverse();
        if (a0 === undefined) return keep(Manifold.revolve([rz], SEG));
        const n = Math.max(3, Math.ceil(SEG * (a1 - a0) / 360));
        return keep(keep(Manifold.revolve([rz], n, a1 - a0)).rotate([0, 0, a0]));
      },
      hull: (pts) => keep(Manifold.hull(pts)),
      /* a ruled solid through two convex sections, each [(x, y, z)] (their convex hull) */
      loft2: (a, b) => keep(Manifold.hull(a.concat(b))),
      fuse: (list) => (list.length === 1 ? list[0] : keep(Manifold.union(list))),
      cut: (a, list) => (list.length ? keep(a.subtract(K.fuse(list))) : a),
      common: (a, b) => keep(a.intersect(b)),
      at: (m, v) => keep(m.translate(v)),
      turn: (m, deg, axis, about) => {
        const r = axis === "x" ? [deg, 0, 0] : axis === "y" ? [0, deg, 0] : [0, 0, deg], p = about || [0, 0, 0];
        return keep(keep(keep(m.translate([-p[0], -p[1], -p[2]])).rotate(r)).translate(p));
      },
      /* the local frame (origin o, x along u, y along v, z along n) into the world, as a column-major 4x4 */
      frame: (m, o, u, v, n) => keep(m.transform([u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, n[0], n[1], n[2], 0, o[0], o[1], o[2], 1])),
      matrix: (m, mat) => keep(m.transform(mat)),
      section: (loops, rule) => keep(new CrossSection(loops, rule || "NonZero")),
      extrude: (section, h, div, twist, scaleTop) => keep(section.extrude(h, div || 0, twist || 0, scaleTop === undefined ? [1, 1] : scaleTop)),
      keep,
      free: () => { made.forEach((m) => { try { m.delete(); } catch (e) { /* gone */ } }); made.length = 0; },
      Manifold, CrossSection,
    };
    return K;
  }

  // ---------- small shapes ----------
  const teardropX = (r, y, z) => { const p = []; for (let a = 135; a <= 405; a += 15) p.push([y + r * Math.cos(rad(a)), z + r * Math.sin(rad(a))]); p.push([y, z + r * SQ2]); return p; };
  const teardropY = teardropX;        // the same section, drawn in (x, z)
  const peaked = (a0, a1, z0, z1) => { const m = (a0 + a1) / 2, h = (a1 - a0) / 2; return [[a0, z0], [a1, z0], [a1, z1], [m, z1 + h], [a0, z1]]; };
  function rrect(a0, a1, b0, b1, r, n) {
    n = n || 8; const pts = [];
    [[a1 - r, b1 - r, 0], [a0 + r, b1 - r, 90], [a0 + r, b0 + r, 180], [a1 - r, b0 + r, 270]].forEach(([ca, cb, a]) => {
      for (let k = 0; k <= n; k++) pts.push([ca + r * Math.cos(rad(a + 90 * k / n)), cb + r * Math.sin(rad(a + 90 * k / n))]);
    });
    return pts;
  }
  /* A hexagon's corners in plan round c, af across flats, its flats facing +x and -x. */
  const hexagon = (c, af) => [0, 1, 2, 3, 4, 5].map((k) => [c[0] + af / SQ3 * Math.cos(rad(30 + 60 * k)), c[1] + af / SQ3 * Math.sin(rad(30 + 60 * k))]);
  /* A fillet's section in an inside corner: the corner c, the walls running away along unit vectors u and v, the arc r. */
  function cove2d(c, u, v, r, n) {
    n = n || 24;
    const th = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))), t = r / Math.tan(th / 2);
    const b = [u[0] + v[0], u[1] + v[1]], bl = Math.hypot(b[0], b[1]), d = r / Math.sin(th / 2);
    const m = [c[0] + b[0] / bl * d, c[1] + b[1] / bl * d];
    const pa = [c[0] + t * u[0], c[1] + t * u[1]], pb = [c[0] + t * v[0], c[1] + t * v[1]];
    const a0 = Math.atan2(pa[1] - m[1], pa[0] - m[0]), a1 = Math.atan2(pb[1] - m[1], pb[0] - m[0]);
    const da = ((a1 - a0 + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI;
    // its corner set 0.2 mm into the corner it fills, so it overlaps the walls and joins them (on a curved wall, its tangent's
    // side would otherwise only touch at a line)
    const out = [[c[0] - b[0] / bl * 0.2, c[1] - b[1] / bl * 0.2]];
    for (let k = 0; k <= n; k++) out.push([m[0] + r * Math.cos(a0 + da * k / n), m[1] + r * Math.sin(a0 + da * k / n)]);
    return out;
  }
  /* A 3 x 3 solve (Cramer), for the lace's corners. */
  function solve3(A, b) {
    const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(A), col = (j) => A.map((row, i) => row.map((v, k) => (k === j ? b[i] : v)));
    return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
  }

  /* A thread's ridge standing on a cylinder of radius rRoot, from z0 to z1, outward (on a shaft) or inward (in a bore): a
     45 degree trapezoid swept round a right-hand helix (its section, extruded with a twist), its ends tapered off at 45
     degrees by the envelope, as node_pod.py's. */
  function thread(K, rRoot, z0, z1, inward, pitch, depth, crest) {
    pitch = pitch || PITCH; depth = depth === undefined ? T_DEPTH : depth; crest = crest === undefined ? T_CREST : crest;
    const s = inward ? -1 : 1, w0 = 2 * depth + crest;
    const ra = rRoot - s * 0.2, rb = rRoot + s * depth;
    // the script's profile: full width w0 at 0.2 mm inside the root, narrowing straight to the crest (its flanks a little
    // steeper than 45 degrees): the thread that's been printed, and fits
    const half = (r) => w0 / 2 - (w0 / 2 - crest / 2) * Math.min(1, Math.max(0, Math.abs(r - ra) / Math.abs(rb - ra)));
    const zs = z0 - pitch, ze = z1 + pitch, th0 = 2 * PI * (zs - z0) / pitch;        // the ridge's angle at the extrusion's foot
    // the flanks wind about 160 degrees round the axis across the tooth's depth: sampled every 5 degrees or so, and the twist
    // in 5 degree steps (coarser steps fatten an inward ridge: its faces between the steps cut inside the circle)
    const rs = []; for (let i = 0; i <= 32; i++) rs.push(ra + (rb - ra) * i / 32);
    const side = (sg) => rs.map((r) => { const a = th0 + sg * 2 * PI * half(r) / pitch; return [r * Math.cos(a), r * Math.sin(a)]; });
    const arc = (r, a0, a1) => { const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / rad(5))), p = []; for (let i = 1; i < n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([r * Math.cos(a), r * Math.sin(a)]); } return p; };
    const dB = 2 * PI * half(rb) / pitch, dA = 2 * PI * half(ra) / pitch;
    const loop = side(-1).concat(arc(rb, th0 - dB, th0 + dB), side(1).reverse(), arc(ra, th0 + dA, th0 - dA));
    const turns = (ze - zs) / pitch;
    const sweep = K.at(K.extrude(K.section([loop]), ze - zs, Math.ceil(turns * 72), 360 * turns), [0, 0, zs]);
    const t = depth + 0.5;
    const env = inward ? K.revolve([[rRoot + 1, z0], [rRoot, z0], [rRoot - t, z0 + t], [rRoot - t, z1 - t], [rRoot, z1], [rRoot + 1, z1]])
      : K.revolve([[0, z0], [rRoot, z0], [rRoot + t, z0 + t], [rRoot + t, z1 - t], [rRoot, z1], [0, z1]]);
    return K.common(sweep, env);
  }


  /* A convex polygon's corner rounded: the points before and after it, the corner, the radius. */
  function roundCorner(P, C, N, r, n) {
    n = n || 8;
    const u = [P[0] - C[0], P[1] - C[1]], v = [N[0] - C[0], N[1] - C[1]], lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
    const a = [u[0] / lu, u[1] / lu], b = [v[0] / lv, v[1] / lv];
    const th = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))), t = r / Math.tan(th / 2);
    const bis = [a[0] + b[0], a[1] + b[1]], bl = Math.hypot(bis[0], bis[1]), d = r / Math.sin(th / 2);
    const m = [C[0] + bis[0] / bl * d, C[1] + bis[1] / bl * d];
    const pa = [C[0] + a[0] * t, C[1] + a[1] * t], pb = [C[0] + b[0] * t, C[1] + b[1] * t];
    const a0 = Math.atan2(pa[1] - m[1], pa[0] - m[0]), a1 = Math.atan2(pb[1] - m[1], pb[0] - m[0]);
    const da = ((a1 - a0 + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI, out = [];
    for (let k = 0; k <= n; k++) out.push([m[0] + r * Math.cos(a0 + da * k / n), m[1] + r * Math.sin(a0 + da * k / n)]);
    return out;
  }
  /* A round-ended stroke from p to q, w wide, as a counterclockwise loop. */
  function stroke(p, q, w) {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-9, a = Math.atan2(q[1] - p[1], q[0] - p[0]), out = [];
    for (let k = 0; k <= 12; k++) { const t = a - PI / 2 + PI * k / 12; out.push([q[0] + w / 2 * Math.cos(t), q[1] + w / 2 * Math.sin(t)]); }
    for (let k = 0; k <= 12; k++) { const t = a + PI / 2 + PI * k / 12; out.push([p[0] + w / 2 * Math.cos(t), p[1] + w / 2 * Math.sin(t)]); }
    return out;
  }

  /* Everything that follows from the options and the boom's tail: tail = { Ht, w, m, zb(bx) } (zb: the tail's bottom at bx
     along the boom from the reflector, z from the boom's axis). */
  function layout(opts, tail) {
    const o = Object.assign({}, OPTIONS, opts || {});
    const L = { o, CELL: CELLS[o.battery], SOCKET: o.socket === "boom", TOP: o.top, PAD: o.mount === "pad", LACE_ON: o.lace === "yes", MARKS: o.marks === "yes", tail };
    const C = L.CELL;
    L.CORE_TOP = CELL_Z + C.h + 2.0;
    const xs0 = SPINE[0] - SPINE[1] / 2, xs1 = SPINE[0] + SPINE[1] / 2, hw = C.w / 2 + 1.5;
    const reach = C.shape === "box" ? Math.max(Math.hypot(xs1, hw), Math.hypot(xs0 - C.d - 1.5, hw)) : Math.max(Math.hypot(xs1, hw), Math.abs(xs0 - C.w / 2) + C.w / 2 + 1.5);
    L.Z_CEIL = L.CORE_TOP + CEILING_GAP / 2 - (R_IN - reach);
    L.Z_CYL = L.Z_CEIL + WALL * (SQ2 - 1);
    L.APEX = L.Z_CEIL + R_IN;
    L.HOLE = TOP_HOLES[L.TOP] ? TOP_HOLES[L.TOP][0] : null;
    L.HOLE_R = L.HOLE ? L.HOLE[0] / 2 + T_PLAY : null;
    L.BOSS_R = L.HOLE ? bossR(L.HOLE[0]) : null;
    L.Z_TOP = { solar: L.APEX + TOP_FLOOR + TOP_THREAD[2], sealed: L.APEX + WALL, sma: L.APEX + WALL,
                n: Math.max(L.APEX + WALL, L.CORE_TOP + 3.0 + INSERTS.n.reach - INSERTS.n.head) }[L.TOP];
    L.Z_BOSS = L.BOSS_R ? L.Z_CYL + (R_OUT - L.BOSS_R) : L.Z_TOP;
    L.R_TIP = L.Z_CYL + R_OUT - L.Z_TOP;
    L.X_F = R_OUT + SOCK_FLOOR;
    L.X_MOUTH = L.X_F + (MOUTH - REAR + DEEPER);
    L.NOSE_HW = tail.w / 2 + PLAY + NOSE_WALL[0];
    L.SOCK_HW = tail.w / 2 + PLAY;
    L.X_FOOT = Math.sqrt(R_OUT * R_OUT - L.NOSE_HW * L.NOSE_HW);
    L.Z_NOSE0 = CORBEL_Z + (L.X_MOUTH - L.X_FOOT);
    L.Z_B = L.Z_NOSE0 + NOSE_WALL[1] + PLAY - tail.zb(MOUTH);
    L.bx_at = (x) => REAR - DEEPER + (x - L.X_F);
    L.sock_bot = (x) => L.Z_B + tail.zb(L.bx_at(x)) - PLAY;
    L.sock_top = (x) => L.Z_B + tail.zb(L.bx_at(x)) + tail.Ht + PLAY;
    L.NOSE_XC = (L.X_FOOT + 3.0 + L.X_MOUTH - 1.5) / 2;
    L.ports = ["back", "front"].filter((w) => o[w] !== "none").map((w) => {
      const p = PORT_TYPES[o[w]];
      return { where: w, kind: o[w], x: PORT_X[w] * (1 - p.inset / Math.abs(PORT_X[w])), spec: p };
    });
    return L;
  }
  const bossR = (d) => (d === TOP_THREAD[0] ? BOSS[0] : d / 2 + T_PLAY + 2.5 + 1.0);
  const R_G = R_IN - GROOVE[0], R_RIM = R_IN - RIM_PLAY, R_RIM_IN = R_G - 1.6, Z_FLOOR = FLOOR - FLANGE[0];
  const PCB_X = SPINE[0] + SPINE[1] / 2 + BOARD.back + 0.3;
  const SLOT_X = [PCB_X - 0.1, PCB_X - 0.1 + PCB_T + GUIDE_PLAY], RAIL_X = SLOT_X[1] + RAIL_LIP;
  const R_RING_ROOT = R_OUT + T_DEPTH + T_PLAY, R_RING_OUT = R_RING_ROOT + RING_WALL;

  // ---------- the socket, the nose, the lock ----------
  function gable(yh, bot, top, grow) {
    grow = grow || 0; const h = yh + grow;
    return [[-h, bot - grow], [h, bot - grow], [h, top + grow * (SQ2 - 1)], [0, top + yh + grow * SQ2], [-h, top + grow * (SQ2 - 1)]];
  }
  const atX = (x, pts) => pts.map(([y, z]) => [x, y, z]);
  function socket(K, L) {
    const x0 = L.X_F, x1 = L.X_MOUTH + 3.0;
    const cav = K.loft2(atX(x0, gable(L.SOCK_HW, L.sock_bot(x0), L.sock_top(x0) - PLAY)), atX(x1, gable(L.SOCK_HW, L.sock_bot(x1), L.sock_top(x1) - PLAY)));
    const xl = L.X_MOUTH - LEAD;
    const lead = K.loft2(atX(xl, gable(L.SOCK_HW, L.sock_bot(xl), L.sock_top(xl) - PLAY)), atX(L.X_MOUTH + 0.5, gable(L.SOCK_HW, L.sock_bot(L.X_MOUTH), L.sock_top(L.X_MOUTH) - PLAY, LEAD + 0.5)));
    return [cav, lead];
  }
  function nose(K, L) {
    const xa = R_OUT - 8.0, H = L.NOSE_HW;
    const sec = (x) => { const top = L.sock_top(x); return atX(x, [[-H, CORBEL_Z - 20], [H, CORBEL_Z - 20], [H, top], [0, top + H], [-H, top]]); };
    const body = K.loft2(sec(xa), sec(L.X_MOUTH));
    const above = K.xz([[xa - 5, L.Z_NOSE0 - (L.X_MOUTH - xa + 5)], [L.X_MOUTH + 1, L.Z_NOSE0 + 1], [L.X_MOUTH + 1, 400], [xa - 5, 400]], -50, 50);
    return K.common(body, above);
  }
  function lock(K, L) {
    const x = L.X_F + (LOCK_AT - (REAR - DEEPER)), head = L.sock_top(x) - PLAY + 12.9;
    return { add: K.cylZ(x, 0, 9.0, L.sock_top(x), head), holes: [K.cylZ(x, 0, M3, L.sock_top(x) - 1, head + 1)], x, head, end: head - 25.0 };
  }
  const drain = (K, L) => { const x = L.X_F + 2.0; return K.cylZ(x, 0, DRAIN, L.Z_NOSE0 - (L.X_MOUTH - x) - 1, L.sock_bot(x) + 0.5); };

  // ---------- the spine, the pad ----------
  function spineLayout(L) {
    const hw = SADDLE_W / 2, x_apex = -(R_OUT + TUNNEL[2] + TUNNEL[0] + JAW), x_corner = x_apex - hw / Math.tan(rad(V_ANGLE / 2));
    const x_t = -Math.sqrt(R_OUT * R_OUT - hw * hw), low = CORBEL_Z + (x_t - x_corner) + SADDLE_CAP, z_top = L.Z_CYL + 15.0;
    return { hw, x_apex, x_corner, x_t, low, high: z_top - (TUNNEL[1] + TUNNEL[0] / 2 + SADDLE_CAP + 1.5), z_top };
  }
  // the tunnels' plan: their centre (x, on the middle), the inside's and outside's radii, where each meets the sides (x)
  function tunnelArc() {
    const hw = SADDLE_W / 2, ri = hw + TUNNEL_ARC, ro = ri + TUNNEL[0], xc = -(R_OUT + TUNNEL[2] + TUNNEL[0]) - ri;
    return { xc, ri, ro, xi: xc + Math.sqrt(ri * ri - hw * hw), xo: xc + Math.sqrt(ro * ro - hw * hw) };
  }
  function tunnels(K, L) {
    const S = spineLayout(L), A = tunnelArc(), ri = A.ri, ro = A.ro;
    return [S.low, S.high].map((zt) => K.at(K.revolve([[ri, zt], [ro, zt], [ro, zt + TUNNEL[1]], [(ri + ro) / 2, zt + TUNNEL[1] + TUNNEL[0] / 2], [ri, zt + TUNNEL[1]]], -90, 90), [A.xc, 0, 0]));
  }
  function backSpine(K, L) {
    const S = spineLayout(L), hw = S.hw, x_in = -(R_OUT - 16.0), z0 = S.low - SADDLE_CAP;
    // its plan, the V's corners rounded 2 mm
    const P = [[x_in, -hw], [S.x_corner, -hw], [S.x_apex, 0], [S.x_corner, hw], [x_in, hw]];
    const plan = [P[0], ...roundCorner(P[0], P[1], P[2], 2.0), P[2], ...roundCorner(P[2], P[3], P[4], 2.0), P[4]];
    let s = K.xy(plan, z0 - 40, S.z_top + 10);
    const xu = S.x_t + 10;
    const under = K.xz([[xu, z0 - (xu - S.x_corner)], [S.x_corner - 1, z0 + 1], [S.x_corner - 1, S.z_top + 40], [xu, S.z_top + 40]], -50, 50);
    const over = K.xz([[x_in + 1, S.z_top + 0.1], [S.x_corner - 1, S.z_top - (x_in - S.x_corner + 2) / 10], [S.x_corner - 1, z0 - 60], [x_in + 1, z0 - 60]], -50, 50);
    s = K.cut(K.common(K.common(s, under), over), tunnels(K, L));
    // the sharp upright edge of each mouth on the block against the tube, rounded 1 mm (the jaw's edge, which the band
    // leaves over, turns only 11 degrees: the script rounds it 3 mm, which takes off next to nothing, so it's left here)
    const A = tunnelArc(), r = 1.0, tools = [];
    [S.low, S.high].forEach((zt) => [1, -1].forEach((sg) => {
      // the wedge between the side (toward the tube, +x) and the ring's outside (toward the middle), outside a circle of r
      const tx = hw / A.ro, ty = -sg * (A.xo - A.xc) / A.ro, al = Math.acos(tx), h = al / 2;
      const bx = Math.cos(-sg * h), by = Math.sin(-sg * h), dc = r / Math.sin(h), dt = r / Math.tan(h);
      const cx = A.xo + dc * bx, cy = sg * hw + dc * by;
      const a1 = Math.atan2(sg * hw - cy, A.xo + dt - cx), a2 = Math.atan2(sg * hw + dt * ty - cy, A.xo + dt * tx - cx);
      const pts = [[A.xo - 0.05, sg * (hw + 0.05)], [A.xo + dt, sg * (hw + 0.05)]];
      let da = a2 - a1; while (da > PI) da -= 2 * PI; while (da < -PI) da += 2 * PI;
      for (let k = 0; k <= 8; k++) { const a = a1 + da * k / 8; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      tools.push(K.xy(sg > 0 ? pts : pts.reverse(), zt - 0.01, zt + TUNNEL[1] + 0.01));
    }));
    return K.cut(s, tools);
  }
  function padLayout() {
    const hw = PADS.w / 2, x_back = -(R_OUT + PADS.depth), x_t = -Math.sqrt(R_OUT * R_OUT - hw * hw);
    return { hw, x_back, x_t, z_under: CORBEL_Z + (x_t - x_back), z_top: PADS.zc + PADS.bolts[1] + M3_NUT[0] / 2 + 6.0 };
  }
  const padBolts = () => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => [sy * PADS.bolts[0], PADS.zc + sz * PADS.bolts[1]]));
  function backPad(K) {
    const P = padLayout(), x_in = -(R_OUT - 12.0), r = 1.5, hw = P.hw;
    const plan = [[x_in, -hw]];
    for (let a = 90; a >= 0; a -= 15) plan.push([P.x_back + r - r * Math.cos(rad(a)), -hw + r - r * Math.sin(rad(a))]);
    for (let a = 0; a <= 90; a += 15) plan.push([P.x_back + r - r * Math.cos(rad(a)), hw - r + r * Math.sin(rad(a))]);
    plan.push([x_in, hw]);
    const s = K.xy(plan, CORBEL_Z - 40, P.z_top + 10);
    const under = K.xz([[P.x_t + 12, CORBEL_Z - 12], [P.x_back - 1, P.z_under + 1], [P.x_back - 1, P.z_top + 40], [P.x_t + 12, P.z_top + 40]], -50, 50);
    const over = K.xz([[x_in + 1, P.z_top + (P.x_back - x_in) / -10 + 0.1], [P.x_back - 1, P.z_top - 0.1], [P.x_back - 1, CORBEL_Z - 60], [x_in + 1, CORBEL_Z - 60]], -50, 50);
    return K.common(K.common(s, under), over);
  }
  function padHoles(K) {
    const P = padLayout(), a = M3_NUT[0] + PADS.play, t = M3_NUT[1] + PADS.play, out = [];
    padBolts().forEach(([y, z]) => {
      const x_end = -Math.sqrt(R_OUT * R_OUT - (Math.abs(y) + M3 / 2) ** 2) - 0.8;
      out.push(K.yz(teardropX(M3 / 2, y, z), P.x_back - 1, x_end));
      const s = y > 0 ? 1 : -1, ya = y - s * (M3_NUT[0] / Math.sqrt(3) + PADS.play / 2), yb = s * (P.hw + 1);
      const x0 = P.x_back + PAD_NUT_IN;
      out.push(K.xz(peaked(x0, x0 + t, z - a / 2, z + a / 2), Math.min(ya, yb), Math.max(ya, yb)));
    });
    return out;
  }

  // ---------- the lace ----------
  function meridian(L) {
    const q = SH_R * Math.tan(rad(22.5)), s_a = L.Z_CYL - q, s_b = s_a + SH_R * PI / 4, k = Math.SQRT1_2, rc0 = R_OUT - SH_R;
    const rb = rc0 + SH_R * k, zb = s_a + SH_R * k;
    const at = (s) => {
      if (s <= s_a) return [R_OUT, s, 1, 0, 0, 1];
      if (s <= s_b) { const p = (s - s_a) / SH_R; return [rc0 + SH_R * Math.cos(p), s_a + SH_R * Math.sin(p), Math.cos(p), Math.sin(p), -Math.sin(p), Math.cos(p)]; }
      const d = s - s_b; return [rb - d * k, zb + d * k, k, k, -k, k];
    };
    const sd = (x, y, z) => {
      const rho = Math.hypot(x, y);
      if (z <= s_a) return rho - R_OUT;
      if (z - s_a <= rho - rc0) return Math.hypot(rho - rc0, z - s_a) - SH_R;
      return (rho - rb) * k + (z - zb) * k;
    };
    return { at, sd, s_a, s_b };
  }
  function lace(K, L) {
    const LC = LACE, n_c = LC.n, dr = rad(LC.draft), M = meridian(L), at = M.at, k = Math.SQRT1_2;
    const r_b = at(M.s_b)[0], s_max = M.s_b + (r_b - (L.BOSS_R || L.R_TIP)) / k, r_end = (L.BOSS_R || BOSS[0]) + 1.5;
    const NS = 40001, ss = new Float64Array(NS), sig = new Float64Array(NS);
    for (let i = 0; i < NS; i++) ss[i] = s_max * i / (NS - 1);
    let prev = 1 / at(0)[0];
    for (let i = 1; i < NS; i++) { const cur = 1 / at(ss[i])[0]; sig[i] = sig[i - 1] + (ss[i] - ss[i - 1]) * 0.5 * (prev + cur); prev = cur; }
    const interp = (x, xs, ys) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[NS - 1]) return ys[NS - 1];
      let lo = 0, hi = NS - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
      return ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo]);
    };
    const s_of = (g) => interp(g, sig, ss), sig_of = (s) => interp(s, ss, sig);
    const height = (r) => LC.skin * r / R_OUT, rib = (r) => Math.max(LC.rib * r / R_OUT, LC.rib_min);
    const a = PI / n_c, rc = a / Math.cos(rad(30)), dsig = Math.sqrt(3) * a, z_hem = LC.foot + LC.hem, g0 = sig_of(z_hem);
    const topEnd = (rows) => { const s_col = s_of(g0 + rows * dsig), s_end = s_col + height(at(s_col)[0]) + LC.collar; return [s_col, s_end, s_end + LC.ramp * height(at(s_end)[0])]; };
    let rows = Math.floor((sig_of(M.s_b + (r_b - r_end) / k) - g0) / dsig);
    while (at(topEnd(rows)[2])[0] < r_end) rows -= 1;
    const [s_col, s_end, s_ramp] = topEnd(rows), r_col = at(s_col)[0];
    const pts = (s0, s1, off) => {
      const list = [s0];
      for (let i = 0; i < 24; i++) { const s = M.s_a + (M.s_b - M.s_a) * i / 23; if (s0 < s && s < s1) list.push(s); }
      list.push(s1);
      return list.map((s) => { const [r, z, nr, nz] = at(s), h = off(r); return [r + h * nr, z + h * nz]; });
    };
    const foot0 = LC.foot - (LC.skin + 0.05) / Math.tan(rad(40.0));
    const inner = [[R_OUT - 0.05, foot0]].concat(pts(LC.foot, s_ramp, () => -0.05).slice(1));
    const outer = pts(LC.foot, s_end, height);
    const skin = K.revolve(inner.concat(outer.slice().reverse()));
    const frame = (th, g) => {
      const [r, z, nr, nz, tr, tz] = at(s_of(g)), c = Math.cos(th), s = Math.sin(th);
      return { B: [r * c, r * s, z], N: [nr * c, nr * s, nz], T: [tr * c, tr * s, tz], H: [-s, c, 0], r };
    };
    const add = (p, q, f) => [p[0] + f * q[0], p[1] + f * q[1], p[2] + f * q[2]], dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const c_hem = z_hem + R_OUT + LC.skin;
    const hemKeep = K.revolve([[0, c_hem], [150, c_hem - 150], [150, 500], [0, 500]]);
    const colCut = K.cylZ(0, 0, 2 * r_col, -10, 400);
    const hw = SADDLE_W / 2, x_t = -Math.sqrt(R_OUT * R_OUT - hw * hw), th = Math.atan2(hw, x_t) - 3.2 / R_OUT;
    const ax = x_t - 3.2, bx = x_t - 3.2 + 1.6 * (R_OUT * Math.cos(th) - x_t + 3.2), by = hw + 1.6 * (R_OUT * Math.sin(th) - hw), z_feet = 22.0;
    const feet = L.SOCKET ? [K.box(0, 80, -L.NOSE_HW, L.NOSE_HW, -10, z_feet)] : [];
    if (L.PAD) { const P = padLayout(); feet.push(K.box(-80, P.x_t + 1.0, -P.hw, P.hw, -10, z_feet)); }
    else feet.push(K.xy([[-80, -hw], [ax, -hw], [bx, -by], [bx, by], [ax, hw], [-80, hw]], -10, z_feet));
    const feetAll = K.fuse(feet);
    const tools = [];
    for (let i = 0; i <= rows; i++) {
      const g_c = g0 + i * dsig;
      for (let j = 0; j < n_c; j++) {
        const th_c = 2 * PI * (j + 0.5 * (i % 2)) / n_c, Fc = frame(th_c, g_c), h_c = height(Fc.r);
        const walls = [];
        for (let m = 0; m < 6; m++) {
          const ps = rad(60 * m), F = frame(th_c + a * Math.cos(ps), g_c + a * Math.sin(ps));
          const inward = [-(Math.cos(ps) * F.H[0] + Math.sin(ps) * F.T[0]), -(Math.cos(ps) * F.H[1] + Math.sin(ps) * F.T[1]), -(Math.cos(ps) * F.H[2] + Math.sin(ps) * F.T[2])];
          const W = add(add(F.B, F.N, height(F.r)), inward, rib(F.r) / 2);
          const f = [Math.sin(dr) * F.N[0] + Math.cos(dr) * inward[0], Math.sin(dr) * F.N[1] + Math.cos(dr) * inward[1], Math.sin(dr) * F.N[2] + Math.cos(dr) * inward[2]];
          walls.push([f, dot(f, W)]);
        }
        const ringAt = (t) => walls.map((w, m) => solve3([walls[m][0], walls[(m + 1) % 6][0], Fc.N], [walls[m][1], walls[(m + 1) % 6][1], dot(Fc.N, Fc.B) + t]));
        const t_top = h_c + 0.25, r0 = ringAt(0), r1 = ringAt(1);
        const t_v = [];
        for (let m = 0; m < 6; m++) {
          let lo = -6.0, hi = t_top;
          const P = (t) => [r0[m][0] + t * (r1[m][0] - r0[m][0]), r0[m][1] + t * (r1[m][1] - r0[m][1]), r0[m][2] + t * (r1[m][2] - r0[m][2])];
          if (M.sd(...P(lo)) > 0) throw new Error(`lace: cell ${i}, ${j}: a corner line never reaches the wall`);
          for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; if (M.sd(...P(mid)) < 0) lo = mid; else hi = mid; }
          t_v.push(lo);
        }
        const top = ringAt(t_top), bot = ringAt(Math.min(...t_v) - 0.3);
        let tool = K.hull(bot.concat(top));
        if (i === 0) tool = K.common(tool, hemKeep);
        if (i === rows) tool = K.cut(tool, [colCut]);
        if (Math.min(...bot.concat(top).map((v) => v[2])) < z_feet) tool = K.cut(tool, [feetAll]);
        tools.push(tool);
      }
    }
    return K.cut(skin, tools.concat(L.PAD ? [] : tunnels(K, L)));
  }

  // ---------- the raised marks ----------
  /* Flat drawings raised out of a wall: pieces [(CrossSection, h)] in the XY plane, x along xdir and their height along
     the wall's outward normal, (0, 0) at origin; each the prism of its face cut by the same pushed out 45 degrees up and 45
     degrees down, so every top and underside slopes 45 degrees (node_pod.py's raised()). */
  function raised(K, pieces, origin, normal, xdir) {
    const n = normal, u = xdir, v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const zl = [u[2], v[2], n[2]];                       // the world's up, in the drawing's frame
    const o = [origin[0] - 0.05 * n[0], origin[1] - 0.05 * n[1], origin[2] - 0.05 * n[2]];
    return K.fuse(pieces.map(([sec, h]) => {
      const H = h + 0.05, straight = K.extrude(sec, H);
      const shear = (sg) => K.matrix(straight, [1, 0, 0, 0, 0, 1, 0, 0, sg * zl[0], sg * zl[1], 1, 0, 0, 0, 0, 1]);
      // where a thin stroke's slopes meet before full height, specks come away from the wall: keep only what stands on it
      const relief = K.common(K.common(straight, shear(1)), shear(-1));
      const kept = relief.decompose().map(K.keep).filter((q) => q.boundingBox().min[2] < 0.01);
      return K.frame(kept.length ? K.fuse(kept) : relief, o, u, v, n);
    }));
  }
  function bee(K, L) {
    const B = YS.POD_BEE, b = B.bounds, k = BEE.width / (b[2] - b[0]), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const loops = (list) => list.map((lp) => { const out = []; for (let i = 0; i < lp.length; i += 2) out.push([(lp[i] - cx) * k, (lp[i + 1] - cy) * k]); return out; });
    return raised(K, [[K.section(loops(B.body), "EvenOdd"), BEE.h], [K.section(loops(B.wings), "EvenOdd"), BEE.wing_h]],
      [L.NOSE_XC, L.NOSE_HW, L.Z_B + BEE.dz], [0, 1, 0], [-1, 0, 0]);
  }
  /* The label, in Yagi Studio's stroke letters (the script uses Arial Bold), as large as fits the nose's flat. */
  function label(K, L) {
    const text = String(L.o.label || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim(), LET = YS.PARTS && YS.PARTS.LETTERS;
    if (!text || !LET) return null;
    const flat = (L.X_MOUTH - 1.5) - (L.X_FOOT + 3.0) - 2.0, pitch = 4.0;
    const kk = Math.min(LABEL.size / 5, flat / (text.length * pitch - 1)), w = Math.max(0.9, 0.16 * kk * 5);
    const loops = [], x0 = -(text.length * pitch - 1) * kk / 2, y0 = -2.5 * kk;
    text.split("").forEach((ch, i) => (LET[ch] || []).forEach((s) => loops.push(stroke([x0 + (i * pitch + s[0]) * kk, y0 + s[1] * kk], [x0 + (i * pitch + s[2]) * kk, y0 + s[3] * kk], w))));
    if (!loops.length) return null;
    return raised(K, [[K.section(loops, "NonZero"), LABEL.h]], [L.NOSE_XC, -L.NOSE_HW, L.Z_B + LABEL.dz], [0, -1, 0], [1, 0, 0]);
  }
  function emblems(K, L) {
    const E = EMBLEM, us = [0, 1, 2, 3, 4].map((kk) => (kk - 2) * E.spacing), halves = [1.0, 0.87, 0.74, 0.63, 0.52].map((r) => E.reflector / 2 * r);
    const loops = [stroke([us[0] - E.overhang, 0], [us[4] + E.overhang, 0], E.w)].concat(us.map((u, i) => stroke([u, -halves[i]], [u, halves[i]], E.w)));
    const S = spineLayout(L), xc = ((S.x_t - 3.2) + (S.x_corner + 2.0)) / 2;
    return K.fuse([1, -1].map((s) => raised(K, [[K.section(loops, "NonZero"), E.h]], [xc, s * S.hw, (S.low + TUNNEL[1] + S.high) / 2], [0, s, 0], [1, 0, 0])));
  }

  // ---------- the body ----------
  function topCuts(K, L) {
    if (!L.HOLE) return [];
    const [d, pitch, deep] = L.HOLE, R = L.HOLE_R, Z = L.Z_TOP;
    const out = [K.revolve([[0, Z - deep], [R, Z - deep], [R, Z - 2.5], [R + 2.5, Z], [R + 2.5, Z + 1], [0, Z + 1]])];
    if (TOP_HOLES[L.TOP][1]) out.push(K.cylZ(0, 0, INSERTS[L.TOP].bore, L.Z_CEIL, Z - deep + 0.1));
    void d; void pitch;
    return out;
  }
  /* The shell's outline, the shoulder and the cone into the boss rounded (node_pod.py rounds them with fillets: the same arcs). */
  function shellOutline(L) {
    const q = SH_R * Math.tan(rad(22.5)), pts = [[0, 0], [R_OUT, 0], [R_OUT, L.Z_CYL - q]];
    for (let k = 1; k <= 12; k++) { const p = PI / 4 * k / 12; pts.push([R_OUT - SH_R + SH_R * Math.cos(p), L.Z_CYL - q + SH_R * Math.sin(p)]); }
    if (L.BOSS_R) {
      const r = 3.0, q3 = r * Math.tan(rad(22.5)), cx = L.BOSS_R + r, cz = L.Z_BOSS + q3;
      pts.push([L.BOSS_R + q3 / SQ2, L.Z_BOSS - q3 / SQ2]);          // the cone, then the arc (225 to 180 degrees about its centre)
      for (let k = 1; k < 8; k++) { const a = rad(225 - 45 * k / 8); pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); }
      pts.push([L.BOSS_R, L.Z_BOSS + q3], [L.BOSS_R, L.Z_TOP], [0, L.Z_TOP]);
    } else pts.push([L.R_TIP, L.Z_TOP], [0, L.Z_TOP]);
    return pts;
  }
  function body(K, L) {
    let s = K.revolve(shellOutline(L));
    const extra = [L.PAD ? backPad(K) : backSpine(K, L)];
    if (L.SOCKET) {
      extra.push(nose(K, L));
      // the nose's sides blend into the tube (3 mm, as the script's fillets)
      const above = K.xz([[R_OUT - 13, L.Z_NOSE0 - (L.X_MOUTH - R_OUT + 13)], [L.X_MOUTH + 1, L.Z_NOSE0 + 1], [L.X_MOUTH + 1, 400], [R_OUT - 13, 400]], -50, 50);
      [1, -1].forEach((sg) => {                          // between the nose's side (on along +x) and the tube (its tangent, away)
        const c = [L.X_FOOT, sg * L.NOSE_HW], tan = [-L.NOSE_HW / R_OUT, sg * L.X_FOOT / R_OUT];
        extra.push(K.common(K.xy(cove2d(c, [1, 0], tan, 3.0), 0, L.sock_top(L.X_FOOT)), above));
      });
    }
    if (!L.PAD) {
      // the spine's sides meet the tube in a 45 degree chamfer, from its 45 degree underside up to just under the shoulder
      const S = spineLayout(L), hw = SADDLE_W / 2, x_t = -Math.sqrt(R_OUT * R_OUT - hw * hw), z0s = S.low - SADDLE_CAP;
      const under = K.xz([[x_t + 12, z0s - (x_t + 12 - S.x_corner)], [S.x_corner - 1, z0s + 1], [S.x_corner - 1, 300], [x_t + 12, 300]], -50, 50);
      [1, -1].forEach((sg) => {
        const th = Math.atan2(sg * hw, x_t) - sg * 3.2 / R_OUT;
        extra.push(K.common(K.xy([[x_t - 3.2, sg * hw], [R_OUT * Math.cos(th), R_OUT * Math.sin(th)], [x_t + 1.5, sg * (hw - 1.5)]], 0, L.Z_CYL - 4.5), under));
      });
    }
    s = K.fuse([s].concat(extra));
    if (L.LACE_ON) s = K.fuse([s, lace(K, L)]);
    s = K.fuse([s, thread(K, R_OUT, THREAD_Z[0], THREAD_Z[1], false)]);
    let lk = null;
    if (L.SOCKET) { lk = lock(K, L); s = K.fuse([s, lk.add]); }
    const inside = K.fuse([K.revolve([[0, -1], [R_IN + LEAD_IN, -1], [R_IN + LEAD_IN, 0], [R_IN, LEAD_IN * Math.sqrt(3)], [R_IN, L.Z_CEIL + 0.01], [0, L.Z_CEIL + 0.01]]),
      K.revolve([[0, L.Z_CEIL], [R_IN, L.Z_CEIL], [0, L.APEX]])]);
    const r0 = R_OUT - KEY[2] - 0.3, r1 = R_OUT + T_DEPTH + 1, kh = KEY[1] + 0.3;
    const notch = K.xz([[r0, -1], [r1, -1], [r1, kh + (r1 - r0)], [r0, kh]], -KEY[0] / 2 - 0.2, KEY[0] / 2 + 0.2);
    const cuts = [inside, notch, K.turn(notch, 180)].concat(topCuts(K, L), L.SOCKET ? socket(K, L).concat(lk.holes, [drain(K, L)]) : [], L.PAD ? padHoles(K) : []);
    s = K.cut(s, cuts);
    if (L.HOLE) s = K.fuse([s, thread(K, L.HOLE_R, L.Z_TOP - L.HOLE[2] + 0.5, L.Z_TOP - 3.0, true, L.HOLE[1], 1.0)]);
    if (L.MARKS) {
      const marks = [];
      if (L.SOCKET && YS.POD_BEE) marks.push(bee(K, L));
      if (L.SOCKET) { const lb = label(K, L); if (lb) marks.push(lb); }
      if (!L.PAD) marks.push(emblems(K, L));
      if (marks.length) s = K.fuse([s].concat(marks));
    }
    return { solid: s, lock: lk };
  }

  // ---------- the core ----------
  function plug(K, L) {
    const g0 = GROOVE_Z, g1 = GROOVE_Z + GROOVE[1], c = RIM_CHAMFER;
    let p = K.revolve([[0, -FLANGE[0]], [FLANGE[1], -FLANGE[0]], [FLANGE[1], 0], [R_RIM, 0], [R_RIM, g0], [R_G, g0], [R_G, g1], [R_RIM, g1 + (R_RIM - R_G)],
      [R_RIM, RIM_H - c], [R_RIM - c, RIM_H], [R_RIM_IN + c, RIM_H], [R_RIM_IN, RIM_H - c], [R_RIM_IN, Z_FLOOR], [0, Z_FLOOR]]);
    const add = [];
    L.ports.forEach(({ x, spec }) => {
      if (spec.wall > FLOOR) {
        const dia = Math.max(20.0, spec.nut[0] + 1.5), sg = x > 0 ? 1 : -1, xe = sg * (R_RIM_IN + 1.0);
        add.push(K.cylZ(x, 0, dia, Z_FLOOR - 0.01, -FLANGE[0] + spec.wall), K.box(Math.min(x, xe), Math.max(x, xe), -dia / 2, dia / 2, Z_FLOOR - 0.01, -FLANGE[0] + spec.wall));
      }
    });
    [0, 180].forEach((ang) => add.push(K.turn(K.box(R_OUT - 0.1 - KEY[2], R_OUT - 0.1, -KEY[0] / 2, KEY[0] / 2, -0.01, KEY[1]), ang)));
    p = K.fuse([p].concat(add));
    const holes = L.ports.map(({ x, spec }) => K.cylZ(x, 0, spec.hole, -FLANGE[0] - 1, 3));
    if (L.o.sma === "yes") holes.push(K.cut(K.cylZ(SMA[0], SMA[1], D_HOLE[0], -FLANGE[0] - 1, 3), [K.box(SMA[0] + D_HOLE[1], SMA[0] + 5, SMA[1] - 5, SMA[1] + 5, -5, 5)]),
      K.xy(hexagon(SMA, SMA_HEX[0] + SMA_HEX[1]), -FLANGE[0] + SMA_HEX[2], Z_FLOOR + 1));
    for (let k = 0; k < DETENT[0]; k++) holes.push(K.turn(K.box(25.0, FLANGE[1] + 1, -0.6, 0.6, -FLANGE[0] - 1, -FLANGE[0] + DETENT[2]), 360 * k / DETENT[0]));
    return K.cut(p, holes);
  }
  function sled(K, L) {
    const C = L.CELL, xs0 = SPINE[0] - SPINE[1] / 2, xs1 = SPINE[0] + SPINE[1] / 2, w = C.w, d = C.d, hw = w / 2 + 1.5;
    const parts = [K.box(xs0, xs1, -hw, hw, Z_FLOOR - 0.01, L.CORE_TOP)];
    const yb = BOARD.w / 2, yi = yb - 1.3, yo = yb + 3.25, rail_top = BOARD_Z + BOARD.l + 5.0, slot = SLOT_X;
    [-1, 1].forEach((s) => {
      const [y0, y1] = [s * yi, s * yo].sort((p, q) => p - q);
      let r = K.box(xs1 - 0.01, RAIL_X, y0, y1, Z_FLOOR - 0.01, rail_top);
      const [sy0, sy1] = [s * (yi - 0.5), s * (yb + EDGE_PLAY)].sort((p, q) => p - q);
      r = K.cut(r, [K.box(slot[0], slot[1], sy0, sy1, BOARD_Z, rail_top + 1)]);
      const bumps = [BOARD_Z + 4, rail_top - 12].map((z) => K.xz([[slot[0] - 0.01, z], [slot[0] + CRUSH, z + CRUSH_RAMP], [slot[0] + CRUSH, z + CRUSH_RAMP + 2.0], [slot[0] - 0.01, z + 2 * CRUSH_RAMP + 2.0]], sy0, sy1));
      parts.push(K.fuse([r].concat(bumps)));
    });
    const xb = xs0 - d, z_attach = CELL_Z - 1.0;
    const grow = K.xz([[xs0 + 1, z_attach - 1], [xb - 6, z_attach + (xs0 - xb + 6) + 1], [xb - 6, 300], [xs0 + 1, 300]], -50, 50);
    if (C.shape === "box") {
      [-1, 1].forEach((s) => {
        const [y0, y1] = [s * (w / 2), s * hw].sort((p, q) => p - q);
        const wall = K.box(xb - 1.5, xs0 + 0.01, y0, y1, CELL_Z - 5, L.CORE_TOP);
        const [ly0, ly1] = [s * (w / 2 - 3.0), s * hw].sort((p, q) => p - q);
        let lip = K.box(xb - 1.5, xb, ly0, ly1, CELL_Z - 5, L.CORE_TOP);
        const zl = CELL_Z - 1.0 + (xs0 - xb + 1.5) + 0.5, ye = s * (w / 2);
        lip = K.common(lip, K.yz([[ye + s * 2.5, zl - 2.5], [ye - s * 4.0, zl + 4.0], [ye - s * 4.0, 300], [ye + s * 2.5, 300]], -40, 40));
        parts.push(K.common(K.fuse([wall, lip]), grow));
      });
    } else {
      const xc = xs0 - w / 2, rc = w / 2;
      const shell = K.cut(K.cylZ(xc, 0, 2 * rc + 3.0, CELL_Z - 5, L.CORE_TOP), [K.cylZ(xc, 0, 2 * rc, CELL_Z - 6, L.CORE_TOP + 1), K.box(xc - rc - 5, xc - rc * 0.5, -rc * 0.866, rc * 0.866, CELL_Z - 6, L.CORE_TOP + 1)]);
      parts.push(K.common(K.cut(shell, [K.box(xs0, xs0 + 20, -30, 30, 0, 300)]), grow));
    }
    parts.push(K.xz([[xs0 + 0.01, CELL_Z - 2.5], [xs0 - 2.5, CELL_Z], [xs0 + 0.01, CELL_Z]], -w / 2 + 2, w / 2 - 2));
    let s = K.fuse(parts);
    const y_rim = Math.sqrt((R_RIM_IN + RIM_CHAMFER + 0.4) ** 2 - Math.min(Math.abs(xs0), Math.abs(xs1)) ** 2);
    const ties = [];
    [1, -1].forEach((sg) => {
      const [y0, y1] = [sg * (hw - 0.1), sg * y_rim].sort((p, q) => p - q);
      ties.push(K.box(xs0, xs1, y0, y1, Z_FLOOR - 0.01, RIM_H));
    });
    s = K.fuse([s].concat(ties));
    const oh = 8.5;
    return K.cut(s, [K.yz([[-oh, Z_FLOOR - 1], [oh, Z_FLOOR - 1], [oh, Z_FLOOR + 9.0], [0, Z_FLOOR + 9.0 + oh], [-oh, Z_FLOOR + 9.0]], xs0 - 0.5, xs1 + 0.5),
      K.box(xs0 - 1, xs1 + 1, -5, 5, L.CORE_TOP - 5, L.CORE_TOP + 1)]);
  }
  /* The quarter turn between two directions in plan, a and b degrees, as [from, to] for K.revolve. */
  const quarter = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); return hi - lo > 180 ? [hi, lo + 360] : [lo, hi]; };
  /* A foot's fillet carried round an upright outside corner at c: its section turned about the corner's edge, a0 to a1. */
  const cornerWrap = (K, c, r, [a0, a1]) => K.at(K.revolve(cove2d([0, Z_FLOOR], [1, 0], [0, 1], r), a0, a1),
    [c[0] - 0.04 * Math.cos(rad((a0 + a1) / 2)), c[1] - 0.04 * Math.sin(rad((a0 + a1) / 2)), 0]);   // its axis 0.04 mm into the corner
  /* Where the floor's fillets must not go: round each port's nut (held a flat toward the middle) and the SMA's hex pocket. */
  function keepouts(K, L) {
    const out = L.ports.map(({ x, spec }) => {
      const seat = Math.max(Z_FLOOR, -FLANGE[0] + spec.wall);
      return K.xy(hexagon([x, 0], spec.nut[0] + 2 * NUT_MARGIN), seat, seat + spec.nut[1] + 1.0);
    });
    if (L.o.sma === "yes") out.push(K.cylZ(SMA[0], SMA[1], 2 * ((SMA_HEX[0] + SMA_HEX[1]) / SQ3 + NUT_MARGIN), Z_FLOOR - 1.0, Z_FLOOR + 8.0));
    return out;
  }
  function coreCoves(K, L) {
    const C = L.CELL, xs0 = SPINE[0] - SPINE[1] / 2, xs1 = SPINE[0] + SPINE[1] / 2, w = C.w, d = C.d, hw = w / 2 + 1.5;
    const yb = BOARD.w / 2, yi = yb - 1.3, yo = yb + 3.25, rail_top = BOARD_Z + BOARD.l + 5.0, rail_x = RAIL_X, oh = 8.5, V = COVE;
    const low = [], high = [];
    const span = (a, b) => [Math.min(a, b), Math.max(a, b)];
    [1, -1].forEach((sg) => {
      // the spine's feet, both faces, from the opening to the rim, each carried round its corner into the opening
      [[xs1, 1, V.foot], [xs0, -1, V.foot_back]].forEach(([xf, ox, r]) => {
        const yf = Math.sqrt(R_RIM_IN ** 2 - xf ** 2);
        low.push(K.xz(cove2d([xf, Z_FLOOR], [ox, 0], [0, 1], r), ...span(sg * oh, sg * yf)));
        low.push(cornerWrap(K, [xf, sg * oh], r, quarter(ox > 0 ? 0 : 180, sg > 0 ? 270 : 90)));
      });
      // and along the foot's end in the opening, from the back foot's radius to the front's (drawn about the corner, shrunk
      // along x, then turned so its run is +x)
      const end = K.extrude(K.section([cove2d([0, 0], [-sg, 0], [0, 1], V.foot_back)]), xs1 - xs0, 0, 0, [V.foot / V.foot_back, V.foot / V.foot_back]);
      low.push(K.at(K.keep(end.rotate([90, 0, 90])), [xs0, sg * oh, Z_FLOOR]));
      // the spine's ends in the rim: its faces and the rim's wall, from the floor to the rim's top
      [[xs1, 1], [xs0, -1]].forEach(([xf, ox]) => {
        const yr = Math.sqrt(R_RIM_IN ** 2 - xf ** 2);
        low.push(K.xy(cove2d([xf, sg * yr], [0, -sg], [ox * yr / R_RIM_IN, -sg * ox * xf / R_RIM_IN], V.rim), Z_FLOOR - 0.01, RIM_H));
      });
      // over the rim, from its top up the spine's end, as large as stops short of the rim's outer chamfer
      const r = Math.min(V.rim_top, Math.sqrt((R_RIM - RIM_CHAMFER) ** 2 - Math.max(xs0 * xs0, xs1 * xs1)) - hw - 0.3);
      high.push(K.yz(cove2d([sg * hw, RIM_H], [sg, 0], [0, 1], r), xs0, xs1));
    });
    [1, -1].forEach((sg) => {
      low.push(K.xy(cove2d([xs1, sg * yo], [0, sg], [1, 0], V.rail), Z_FLOOR - 0.01, rail_top));
      const sec = cove2d([xs1, sg * yi], [0, -sg], [1, 0], V.rail_in);
      low.push(K.xy(sec, Z_FLOOR - 0.01, BOARD_Z));
      // over the board's parts it starts in the air, so its foot tapers in to the corner at 45 degrees (drawn about the corner,
      // shrunk going up, then turned over)
      const z0 = BOARD_Z + BOARD.l - 0.5, r = V.rail_in, rel = sec.map(([x, y]) => [x - xs1, y - sg * yi]);
      const taper = K.keep(K.extrude(K.section([rel]), r, 0, 0, [0.05, 0.05]).mirror([0, 0, 1]));
      high.push(K.at(taper, [xs1, sg * yi, z0 + r]), K.xy(sec, z0 + r - 0.01, rail_top));
      const rf = V.rail_foot;
      low.push(K.yz(cove2d([sg * yo, Z_FLOOR], [sg, 0], [0, 1], rf), xs1, rail_x));
      low.push(K.yz(cove2d([sg * yi, Z_FLOOR], [-sg, 0], [0, 1], rf), xs1, rail_x));
      low.push(K.xz(cove2d([rail_x, Z_FLOOR], [1, 0], [0, 1], rf), ...span(sg * yi, sg * yo)));
      low.push(cornerWrap(K, [rail_x, sg * yo], rf, quarter(0, sg > 0 ? 90 : 270)), cornerWrap(K, [rail_x, sg * yi], rf, quarter(0, sg > 0 ? 270 : 90)));
    });
    // the rim's foot all round; on a port's thicker floor (which runs out to the rim) from its top; and round that floor's edge
    low.push(K.revolve(cove2d([R_RIM_IN, Z_FLOOR], [-1, 0], [0, 1], V.rim_floor).map(([r, z]) => [r + 0.01, z])));
    L.ports.forEach(({ x, spec }) => {
      if (spec.wall <= FLOOR) return;
      const zb = -FLANGE[0] + spec.wall, half = Math.max(20.0, spec.nut[0] + 1.5) / 2;
      const mid = x > 0 ? 0 : 180, sp = Math.asin(half / R_RIM_IN) * 180 / PI;
      low.push(K.revolve(cove2d([R_RIM_IN, zb], [-1, 0], [0, 1], V.rim_floor).map(([r, z]) => [r + 0.01, z]), mid - sp, mid + sp));
      const [a0, a1] = x > 0 ? [90, 270] : [-90, 90];
      low.push(K.at(K.revolve(cove2d([half, Z_FLOOR], [1, 0], [0, 1], V.boss), a0, a1), [x, 0, 0]));
      [1, -1].forEach((s) => low.push(K.yz(cove2d([s * half, Z_FLOOR], [s, 0], [0, 1], V.boss), ...span(x, Math.sign(x) * (R_RIM_IN + 0.5)))));
    });
    // the battery's pocket: its front corners, its back corners at the lips; or a round cell's cradle on the spine
    const z_attach = CELL_Z - 1.0, xb = xs0 - d;
    const grow = K.xz([[xs0 + 1, z_attach - 1], [xb - 6, z_attach + (xs0 - xb + 6) + 1], [xb - 6, 300], [xs0 + 1, 300]], -50, 50);
    [1, -1].forEach((sg) => {
      if (C.shape === "box") {
        high.push(K.common(K.xy(cove2d([xs0, sg * w / 2], [-1, 0], [0, -sg], V.pocket), z_attach - 5, L.CORE_TOP), grow));
        const ye = sg * (w / 2), zl = CELL_Z - 1.0 + (xs0 - xb + 1.5) + 0.5;
        const lipcut = K.yz([[ye + sg * 2.5, zl - 2.5], [ye - sg * 4.0, zl + 4.0], [ye - sg * 4.0, 300], [ye + sg * 2.5, 300]], -40, 40);
        high.push(K.common(K.common(K.xy(cove2d([xb, sg * w / 2], [1, 0], [0, -sg], V.lip), z_attach - 5, L.CORE_TOP), grow), lipcut));
      } else {
        const rc = w / 2, ro = w / 2 + 1.5, yc = Math.sqrt(ro * ro - rc * rc);
        high.push(K.common(K.xy(cove2d([xs0, sg * yc], [0, sg], [-yc / ro, sg * rc / ro], V.cradle), z_attach - 5, L.CORE_TOP), grow));
      }
    });
    return { low, high };
  }
  function core(K, L) {
    const { low, high } = coreCoves(K, L);
    return K.fuse([plug(K, L), sled(K, L), K.cut(K.fuse(low), keepouts(K, L))].concat(high));
  }

  // ---------- the rings ----------
  function ring(K) {
    const z0 = -FLANGE[0] - RING_LIP[0];
    let s = K.revolve([[RING_LIP[1], z0 + 0.6], [RING_LIP[1] + 0.6, z0], [R_RING_OUT - 0.8, z0], [R_RING_OUT, z0 + 0.8], [R_RING_OUT, RING_TOP - 0.8],
      [R_RING_OUT - 0.8, RING_TOP], [R_RING_ROOT, RING_TOP], [R_RING_ROOT, -FLANGE[0]], [RING_LIP[1], -FLANGE[0]]]);
    s = K.fuse([s, thread(K, R_RING_ROOT, THREAD_Z[0] - PITCH / 2, RING_TOP - 0.3, true)]);
    const [n, r, dep] = FLUTES, flutes = [];
    for (let k = 0; k < n; k++) flutes.push(K.cylZ(Math.cos(2 * PI * k / n) * (R_RING_OUT + r - dep), Math.sin(2 * PI * k / n) * (R_RING_OUT + r - dep), 2 * r, z0 + 2.0, RING_TOP + 1.0, 32));
    s = K.cut(s, flutes);
    const bumps = [];
    for (let k = 0; k < DETENT[1]; k++) bumps.push(K.turn(K.box(25.5, 29.0, -0.5, 0.5, -FLANGE[0] - 0.01, -FLANGE[0] + DETENT[2]), 360 * k / DETENT[1]));
    return K.fuse([s].concat(bumps));
  }
  /* A flat head screw's hole along z at (cx, cy), from z0 to z1, its 90 degree countersink at z1. */
  const countersunk = (K, cx, cy, z0, z1, hole, head) => {
    const rh = hole / 2, rc = head / 2;
    return K.at(K.revolve([[0, z0], [rh, z0], [rh, z1 - (rc - rh)], [rc, z1], [rc, z1 + 1.0], [0, z1 + 1.0]]), [cx, cy, 0]);
  };
  /* The outline round circles of radius r at centres (each on their convex hull, counterclockwise). */
  function roundHull(centres, r, n) {
    n = n || 24; const pts = [], m = centres.length;
    centres.forEach(([cu, cv], i) => {
      const [pu, pv] = centres[(i + m - 1) % m], [nu, nv] = centres[(i + 1) % m];
      const a0 = Math.atan2(cv - pv, cu - pu) - PI / 2; let a1 = Math.atan2(nv - cv, nu - cu) - PI / 2;
      while (a1 < a0) a1 += 2 * PI;
      for (let k = 0; k <= n; k++) pts.push([cu + r * Math.cos(a0 + (a1 - a0) * k / n), cv + r * Math.sin(a0 + (a1 - a0) * k / n)]);
    });
    return pts;
  }
  /* The ring on a round skirt with a lobe at its foot over each of three magnets, screwed flat under it from above and
     standing out their whole height, so only their rubber touches the steel. */
  function ringMagnet(K) {
    const B = MAG_BASE, M = MAGNET, z0 = -FLANGE[0] - RING_LIP[0], zf = B.foot + M.h, rs = B.r, t = B.wall;
    const under = (r0, zb) => K.revolve([[0, zb], [r0 - zb + z0, zb], [0, z0 + r0]]);
    let outer = K.common(K.cylZ(0, 0, 2 * rs, zf, z0 + 0.01), under(R_RING_OUT, zf - 1));
    outer = K.cut(outer, [K.common(K.cylZ(0, 0, 2 * (rs - t), zf - 1, z0 + 1), under(RING_LIP[1], zf - 2))]);
    // each screw's head held high enough that it takes only its bite of the magnet's thread: a buttress falls at B.slope
    // from where the roof meets the skirt down over each lobe, and a fillet runs up the skirt's inside over it
    const zl = zf + B.lobe, seat = Math.max(B.lobe, M.length - Math.min(M.bite, M.thread - 0.35)), hb = (z0 + R_RING_OUT - rs) - zl;
    const buttress = K.revolve([[rs - 0.01, zl - 0.01], [rs + hb / Math.tan(rad(B.slope)), zl - 0.01], [rs - 0.01, zl + hb]]);
    const ri = rs - t, inner = K.revolve([[ri + 0.01, zl - 0.01], [ri - B.inner, zl - 0.01], [ri + 0.01, zl + B.inner]]);
    const lobes = [], holes = [];
    for (let k = 0; k < 3; k++) {
      const a = rad(90 + 120 * k), cx = B.at * Math.cos(a), cy = B.at * Math.sin(a), foot = K.cylZ(cx, cy, M.d + 2.0, zf - 1, zl + hb + 1);
      lobes.push(K.cylZ(cx, cy, M.d + 2.0, zf, zl), K.common(buttress, foot), K.common(inner, foot));
      holes.push(countersunk(K, cx, cy, zf - 1, zf + seat, M.screw[0], M.screw[1]), K.cylZ(cx, cy, B.bore, zf + seat, zl + hb + 2));
    }
    const s = K.fuse([ring(K), outer].concat(lobes));
    const notch = K.xz(peaked(-B.notch[0] / 2, B.notch[0] / 2, zf - 1, zf + B.notch[1]), 0, rs + 1);
    return K.cut(s, holes.concat([-60, 60, 180].map((a) => K.turn(notch, a))));
  }

  // ---------- the top's pieces ----------
  function finial(K) {
    const rs = TOP_R - 1.0 - T_PLAY, top = F_SEAT + 3.0 + BOSS[0] - 1.5;
    const prof = [[0, 0], [rs - 0.5, 0], [rs, 0.5], [rs, F_SEAT - (TOP_R - rs)], [TOP_R, F_SEAT], [TOP_R + 2.5, F_SEAT + 2.5], [BOSS[0], F_SEAT + 2.5], [BOSS[0], F_SEAT + 3.0], [1.5, top], [0, top]];
    return K.fuse([K.revolve(prof), thread(K, rs, 1.0, F_SEAT - 0.5, false, TOP_THREAD[1], 1.0)]);
  }
  function topInsert(K, kind, hole) {
    const I = INSERTS[kind], [d, pitch, deep] = hole || TOP_THREAD, hr = d / 2 + T_PLAY, rs = hr - 1.0 - T_PLAY, ru = hr - 1.0, R = bossR(d);
    const z0 = I.head, zt = z0 + deep - 0.5;
    let s = K.revolve([[0, 0], [R - 0.8, 0], [R, 0.8], [R, z0], [ru, z0], [ru, z0 + 3.3], [rs, z0 + 3.3 + (ru - rs)], [rs, zt - 0.5], [rs - 0.5, zt], [0, zt]]);
    // its ridge as it sits in the hole (the boss's top at z 0), turned over into this frame
    const ridge = thread(K, rs, -deep + 0.5 + pitch / 2, -3.3, false, pitch, 1.0);
    s = K.fuse([s, K.at(K.turn(ridge, 180, "x"), [0, 0, z0])]);
    const cuts = [];
    if (I.bore) cuts.push(K.cylZ(0, 0, I.bore, z0, zt + 1));
    if (I.hole) {
      let h = K.cylZ(0, 0, I.hole, -1, z0 + 1);
      I.flats.forEach((f) => { h = K.cut(h, [f > 0 ? K.box(f, 30, -30, 30, -2, z0 + 2) : K.box(-30, f, -30, 30, -2, z0 + 2)]); });
      cuts.push(h);
    }
    if (kind === "plug") {
      const notch = K.fuse([K.cylZ(R + 1.2, 0, 4.0, -1, z0 - 1.6), K.at(K.revolve([[0, 0], [2.0, 0], [0, 2.0]]), [R + 1.2, 0, z0 - 1.6])]);
      for (let k = 0; k < 6; k++) cuts.push(K.turn(notch, 60 * k));
    }
    return K.cut(s, cuts);
  }

  /**
   * A sleeve dipole's foot on the pod (src/dipole.js, src/sleeve-parts.js): the SMA insert's head and threaded stub, the same
   * 18 x 2.5 mm O-ring under the head, and a post on the head's outer face holding the tube's lower end in a socket, the
   * coax going on down through the post and the stub into the pod. Its frame as topInsert's: the head's outer face at z 0;
   * the post below it, its end at z -post. A 45 degree cone carries the head out from the post, so it prints standing on the
   * post's end with nothing overhanging. tube: the tube's diameter; coax: the hole for the coax.
   */
  function tubeInsert(K, tube, coax) {
    const [d, pitch, deep] = TOP_THREAD, hr = d / 2 + T_PLAY, rs = hr - 1.0 - T_PLAY, ru = hr - 1.0, R = bossR(d);
    const head = 4.0, z0 = head, zt = z0 + deep - 0.5, pr = tube / 2 + 3.5, socket = 20, post = socket + 4 + (R - pr);
    let s = K.revolve([[0, -post], [pr, -post], [pr, -(R - pr)], [R, 0], [R, z0], [ru, z0], [ru, z0 + 3.3], [rs, z0 + 3.3 + (ru - rs)], [rs, zt - 0.5], [rs - 0.5, zt], [0, zt]]);
    const ridge = thread(K, rs, -deep + 0.5 + pitch / 2, -3.3, false, pitch, 1.0);
    s = K.fuse([s, K.at(K.turn(ridge, 180, "x"), [0, 0, z0])]);
    return { solid: K.cut(s, [K.cylZ(0, 0, tube + 0.3, -post - 1, -post + socket), K.cylZ(0, 0, coax, -post - 1, zt + 1)]), post, socket };
  }

  // ---------- the solar roof ----------
  function solarLayout(L) {
    const t = rad(TILT), back = L.Z_B + PANEL_LOW + (PANEL[1] / 2) * Math.sin(t) - PLATE_T * Math.cos(t);
    return { back, stem_top: back - 3.5, foot: L.Z_TOP - TOP_THREAD[2] + 0.2 };
  }
  function solarStem(K, L) {
    const S = solarLayout(L), top = S.stem_top - S.foot, rs = TOP_R - 1.0 - T_PLAY, tz = TOP_THREAD[2] + 7.5, sp0 = top - SPIGOT[1] - 2.0;
    let s = K.revolve([[0, 0], [rs - 0.5, 0], [rs, 0.5], [rs, tz], [STEM_R, tz + (STEM_R - rs)], [STEM_R, sp0 - (STEM_R - SPIGOT[0] / 2)],
      [SPIGOT[0] / 2, sp0], [SPIGOT[0] / 2, top - 0.5], [SPIGOT[0] / 2 - 0.5, top], [0, top]]);
    const phase = (L.Z_TOP - TOP_THREAD[2] + 0.5 + TOP_THREAD[1] / 2) - S.foot;
    s = K.fuse([s, thread(K, rs, phase, tz - 0.5, false, TOP_THREAD[1], 1.0)]);
    s = K.cut(s, [K.box(SPIGOT[0] / 2 - 1.0, 20, -20, 20, sp0 - 0.01, top + 1)]);
    return K.cut(s, [K.yz(teardropX(PIN / 2, 0, (S.back - 10.5) - S.foot), -20, 20)]);
  }
  function solarNut(K, L) {
    const rc = NUT_AF / Math.sqrt(3), hex = [];
    for (let i = 0; i < 6; i++) hex.push([rc * Math.cos(rad(60 * i + 30)), rc * Math.sin(rad(60 * i + 30))]);
    let s = K.cut(K.fuse([K.xy(hex, 2.5, 9.5), K.revolve([[0, 0], [TOP_R, 0], [TOP_R + 2.5, 2.5], [TOP_R + 2.5, 2.6], [0, 2.6]])]), [K.cylZ(0, 0, 2 * TOP_R, -1, 11)]);
    const stem_phase = L.Z_TOP - TOP_THREAD[2] + 0.5 + TOP_THREAD[1] / 2, base = L.Z_TOP - 2.5;
    const kk = Math.ceil((base + 0.5 - (stem_phase + TOP_THREAD[1] / 2)) / TOP_THREAD[1]), z0 = stem_phase + TOP_THREAD[1] / 2 + kk * TOP_THREAD[1] - base;
    return K.fuse([s, thread(K, TOP_R, z0, 9.3, true, TOP_THREAD[1], 1.0)]);
  }
  /* The plate the panel sticks to: its own frame (the panel's face on z 0, the socket's axis along d), and d and LB. */
  function solarPlate(K) {
    const t = rad(TILT), Lp = PANEL[0] + 4, Wp = PANEL[1] + 4;
    let p = K.xy(rrect(-Lp / 2, Lp / 2, -Wp / 2, Wp / 2, 6.0), 0, PLATE_T);
    const rim = 7.0, wall = 2.5, rcell = 9.0, w = Math.sqrt(3) * rcell, ri = (w - wall) / 2, rco = ri / Math.cos(rad(30)), holes = [];
    const nz = Math.floor((Wp - 2 * rim - 2 * rco) / (1.5 * rcell)) + 1, nu = Math.floor((Lp - 2 * rim - 2 * ri - w / 2) / w) + 1;
    const ys0 = -((nz - 1) * 1.5 * rcell) / 2, xs0 = -((nu - 1) * w + w / 2) / 2;
    for (let row = 0; row < nz; row++) {
      const yc = ys0 + row * 1.5 * rcell;
      for (let col = 0; col < nu; col++) {
        const xc = xs0 + col * w + (row % 2 ? w / 2 : 0);
        if (Math.abs(xc) + ri > Lp / 2 - rim || Math.abs(yc) + rco > Wp / 2 - rim) continue;
        const hx = []; for (let kk = 0; kk < 6; kk++) hx.push([xc + rco * Math.cos(rad(90 + 60 * kk)), yc + rco * Math.sin(rad(90 + 60 * kk))]);
        holes.push(K.xy(hx, -1, PLATE_T + 1));
      }
    }
    p = K.cut(p, holes);
    p = K.fuse([p, K.cylZ(0, 0, 34.0, 0, PLATE_T), K.box(-32, 32, -5, 5, 0, PLATE_T)]);
    const d = [0, Math.sin(t), Math.cos(t)], LB = 18.0, o = [0, 0, PLATE_T - 1.0];
    const along = (m, from) => K.at(K.turn(m, -TILT, "x"), from);           // a z-axis solid turned to lie along d
    const boss = along(K.cylZ(0, 0, 24.0, 0, LB + 1.0), o);
    const tip = [o[0] + (LB + 1) * d[0], o[1] + (LB + 1) * d[1], o[2] + (LB + 1) * d[2]];
    const gus = [];
    [-1, 1].forEach((sx) => {
      const n = [0, Math.cos(t), -Math.sin(t)];
      const tri = [[0, o[1], 1.5], [sx * 30, o[1], 1.5], [0, o[1] + 0.85 * (tip[1] - o[1]), o[2] + 0.85 * (tip[2] - o[2])]];
      gus.push(K.hull(tri.flatMap((q) => [[q[0] - 1.5 * n[0], q[1] - 1.5 * n[1], q[2] - 1.5 * n[2]], [q[0] + 1.5 * n[0], q[1] + 1.5 * n[1], q[2] + 1.5 * n[2]]])));
    });
    const collar = K.cylZ(0, 2.0, 30.0, 0, PLATE_T + 2 * 12.0 * Math.sin(t) + 1.0);
    p = K.cut(K.fuse([p, boss, collar].concat(gus)), [K.box(-Lp, Lp, -Wp, Wp, -20, 0)]);
    const depth = SPIGOT[1] + 0.5, s0 = [tip[0] - depth * d[0], tip[1] - depth * d[1], tip[2] - depth * d[2]];
    let sock = K.cut(along(K.cylZ(0, 0, SPIGOT[0] + 0.4, 0, depth + 2), s0), [K.box(SPIGOT[0] / 2 - 1.0 + 0.2, 30, -40, 40, -40, 60)]);
    const mid = [s0[0] + 7 * d[0], s0[1] + 7 * d[1], s0[2] + 7 * d[2]];
    return { solid: K.cut(p, [sock, K.yz(teardropX(PIN / 2, mid[1], mid[2]), -30, 30)]), d, LB };
  }
  /* The plate as it sits: on the stem (solar roof) or on the side arm's spigot, the panel facing +x there. */
  function platePlaced(K, plate, topZ, at, quarter) {
    const { solid, d, LB } = plate, k = (LB + 1.0) - (SPIGOT[1] + 0.5);
    const p = K.turn(solid, TILT - 180, "x");
    const c = Math.cos(rad(TILT - 180)), sn = Math.sin(rad(TILT - 180)), y = k * d[1], z = (PLATE_T - 1.0) + k * d[2];
    const q = [0, y * c - z * sn, y * sn + z * c];
    let placed = K.at(p, [-q[0], -q[1], topZ - q[2]]);
    if (quarter) placed = K.turn(placed, 90);
    return K.at(placed, [at, 0, 0]);
  }

  // ---------- the boom's wedge, the side arm ----------
  function boomWedge(K, L) {
    const h = L.SOCK_HW - PLAY * SQ2, xa = L.X_F + 0.2, xb = L.X_MOUTH - 0.3;
    const sec = (x) => atX(x, [[-h, L.sock_top(x) - PLAY], [h, L.sock_top(x) - PLAY], [0, L.sock_top(x) - PLAY + h]]);
    const x = L.X_F + (LOCK_AT - (REAR - DEEPER));
    return K.cut(K.loft2(sec(xa), sec(xb)), [K.cylZ(x, 0, M3, L.sock_top(x) - 5, L.sock_top(x) + 15)]);
  }
  function sideLayout(L) {
    const x_s = L.X_MOUTH + SIDE.reach, t = rad(TILT), x_high = x_s - (PANEL[1] + 4) / 2 * Math.cos(t);
    const lk = { x: L.X_F + (LOCK_AT - (REAR - DEEPER)) }; lk.head = L.sock_top(lk.x) - PLAY + 12.9;
    const h = L.SOCK_HW - PLAY * SQ2;
    const things = [[lk.x, lk.head + 3.0], [L.X_MOUTH, L.sock_top(L.X_MOUTH) + L.NOSE_HW], [L.X_MOUTH, L.sock_top(L.X_MOUTH) - PLAY + h]];
    const need = things.filter(([x]) => x > x_high - 2.0).map(([x, z]) => z + SIDE.clear - (x_s - x) * Math.tan(t) - 3.5);
    const floor = L.sock_bot(L.X_MOUTH) + PLAY + L.tail.m * SIDE.reach + SIDE.beam + 3.0 + SPIGOT[1] + 2.0;
    return { x_s, z_st: Math.max(floor, ...need) };
  }
  function sideArm(K, L) {
    const { x_s, z_st } = sideLayout(L), hw = L.SOCK_HW - PLAY, h = L.SOCK_HW - PLAY * SQ2;
    const bot = (x) => L.sock_bot(Math.min(x, L.X_MOUTH)) + PLAY + L.tail.m * Math.max(0, x - L.X_MOUTH);
    const tailSec = (x) => { const top = L.sock_top(x) - PLAY; return atX(x, [[-hw, bot(x) - 3], [hw, bot(x) - 3], [hw, top + h - hw], [0, top + h], [-hw, top + h - hw]]); };
    const sp0 = z_st - SPIGOT[1] - 2.0, xb = x_s - STEM_R;
    const rect = (x) => atX(x, [[-hw, bot(x) - 3], [hw, bot(x) - 3], [hw, sp0 - 3], [0, sp0 - 1.5], [-hw, sp0 - 3]]);
    const xa = L.X_F + DEEPER;
    const tail = K.loft2(tailSec(xa), tailSec(L.X_MOUTH)), beam = K.loft2(tailSec(L.X_MOUTH - 0.01), rect(xb)), under = K.loft2(rect(xb - 0.01), rect(x_s));
    const post = K.at(K.revolve([[0, bot(x_s) - 8], [STEM_R, bot(x_s) - 8], [STEM_R, sp0 - (STEM_R - SPIGOT[0] / 2)], [SPIGOT[0] / 2, sp0], [SPIGOT[0] / 2, z_st - 0.5], [SPIGOT[0] / 2 - 0.5, z_st], [0, z_st]]), [x_s, 0, 0]);
    let s = K.fuse([tail, beam, under, post]);
    const x0 = L.X_F - 5, x1 = x_s + STEM_R + 5;
    const floor = K.loft2(atX(x0, [[-40, bot(x0) - 40], [40, bot(x0) - 40], [40, bot(x0)], [-40, bot(x0)]]), atX(x1, [[-40, bot(x1) - 40], [40, bot(x1) - 40], [40, bot(x1)], [-40, bot(x1)]]));
    s = K.cut(s, [floor, K.box(x_s - 20, x_s + 20, SPIGOT[0] / 2 - 1.0, 20, sp0 - 0.01, z_st + 1)]);
    const tilt = -Math.atan(L.tail.m) * 180 / PI;
    s = K.cut(s, [K.turn(K.xz(teardropY(PIN / 2, x_s, z_st - 7.0), -20, 20), tilt, "y", [x_s, 0, z_st - 7.0])]);
    const xl = L.X_F + (LOCK_AT - (REAR - DEEPER)), top = L.sock_top(xl) - PLAY, a = SIDE_NUT[0] + 0.3, t = SIDE_NUT[1] + 0.3;
    return K.cut(s, [K.cylZ(xl, 0, M3, bot(xl) - 1, top + h + 1), K.turn(K.xz(peaked(xl - a / 2, xl + a / 2, top - 10.0 - t, top - 10.0), -30, a / 2), tilt, "y", [xl, 0, top - 10.0])]);
  }

  // ---------- the bolt-on mounts ----------
  function blockMount(K) {
    const P = padLayout(), S = BLOCK.size, half = S / 2, zc = PADS.zc, bz = PADS.bolts[1];
    const z0 = zc - bz - 15.5, z1 = zc + bz + 6.0, x0 = P.x_back - S, xc = P.x_back - half;
    const s = K.xy(rrect(x0, P.x_back, -half, half, 2.0), z0, z1), cuts = [];
    padBolts().forEach(([y, z]) => { cuts.push(K.yz(teardropX(M3 / 2, y, z), x0 - 1, P.x_back + 1), K.yz(teardropX(3.2, y, z), x0 - 1, P.x_back - 6.0)); });
    const pb = BLOCK.pole_bolts, a = M3_NUT[0] + 0.3, t = M3_NUT[1] + 0.3;
    [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => {
      const x = xc + sx * pb, y = sy * pb;
      cuts.push(K.fuse([K.cylZ(x, y, M3, z0 - 1, z0 + 11.0), K.at(K.revolve([[0, 0], [M3 / 2, 0], [0, M3 / 2]]), [x, y, z0 + 11.0])]));
      const ya = y - sy * (M3_NUT[0] / Math.sqrt(3) + 0.15), yb = sy * (half + 1), zn = z0 + BLOCK.pole_nut_z;
      cuts.push(K.xz(peaked(x - a / 2, x + a / 2, zn, zn + t), Math.min(ya, yb), Math.max(ya, yb)));
    }));
    const [fl, , shelf, hole] = BLOCK.tripod, rc = fl / Math.sqrt(3), hex = [];
    for (let k = 0; k < 6; k++) hex.push([xc + rc * Math.cos(rad(60 * k)), rc * Math.sin(rad(60 * k))]);
    cuts.push(K.cylZ(xc, 0, hole, z0 - 1, z0 + shelf + 0.5), K.xy(hex, z0 + shelf, z1 + 1));
    return K.cut(s, cuts);
  }
  function wallPlate(K) {
    const P = padLayout(), W = WALL_PLATE, zc = PADS.zc, t = W.t, half = W.w / 2, zr = W.keys + 12.0;
    const s = K.yz(rrect(-half, half, zc - zr, zc + zr, 6.0), P.x_back - t, P.x_back), cuts = [];
    padBolts().forEach(([y, z]) => cuts.push(K.cylX(y, z, M3, P.x_back - t - 1, P.x_back + 1), K.cylX(y, z, 6.4, P.x_back - t - 1, P.x_back - t + 3.2)));
    const [e, w, ch] = W.head;
    [-1, 1].forEach((sz) => {
      const zk = zc + sz * W.keys;
      cuts.push(K.cylX(0, zk, e, P.x_back - t - 1, P.x_back + 1), K.box(P.x_back - t - 1, P.x_back + 1, -w / 2, w / 2, zk, zk + 10.0),
        K.box(P.x_back - t - 1, P.x_back - t + ch, -e / 2, e / 2, zk, zk + 10.0), K.cylX(0, zk + 10.0, e, P.x_back - t - 1, P.x_back - t + ch));
    });
    return K.cut(s, cuts);
  }
  /* The magnet plate's three magnets, [y, z], counterclockwise: one below the pad's bolts, two above them. */
  const magnetCentres = () => { const [a, h1, h2] = MAGNET.at, zc = PADS.zc; return [[0, zc - h2], [a, zc + h1], [-a, zc + h1]]; };
  /* Three magnets in shallow pockets in its outer face, screwed on from behind first (flat heads flush in the pad side),
     then the pad's four M3 x 12 between the pockets, their heads sunk. */
  function magnetPlate(K) {
    const P = padLayout(), M = MAGNET, deep = M.h - M.proud, xo = P.x_back - deep - M.floor, rp = (M.d + M.play) / 2, centres = magnetCentres();
    const s = K.yz(roundHull(centres, rp + M.wall), xo, P.x_back), cuts = [];
    padBolts().forEach(([y, z]) => cuts.push(K.cylX(y, z, M3, xo - 1, P.x_back + 1), K.cylX(y, z, 6.4, xo - 1, P.x_back - 2.8)));
    centres.forEach(([y, z]) => cuts.push(K.cylX(y, z, 2 * rp, xo - 1, xo + deep),
      K.turn(countersunk(K, -z, y, xo + deep - 1, P.x_back, M.screw[0], M.screw[1]), 90, "y")));
    return K.cut(s, cuts);
  }
  /* A plate drawn against the pad's back face, turned to print on that face, its outer face up. */
  const flatOnPadSide = (K, m) => K.turn(K.at(m, [-padLayout().x_back, 0, -PADS.zc]), 90, "y");
  /* A part whose base follows the tail's slope, turned level. */
  const layOnSlope = (K, L, m) => K.turn(m, Math.atan(L.tail.m) * 180 / PI, "y");

  /* The pod's parts for these options, each { id, name, solid, print } in print orientation (the 3D print tab rests each on
     the bed), and the layout. In parts.js's units and frame: the pod's own frame, z up. */
  function build(wasm, opts, tail) {
    const K = kit(wasm), L = layout(opts, tail), out = [];
    const add = (id, name, solid, print, inPod) => out.push({ id, name, solid, print, inPod });
    const B = body(K, L);
    add("pod_body", "Pod: body", B.solid, "Upright on its open end, on an 8 mm outer brim (its end meets the bed on a ring under 1 mm wide). 6 walls, 40% gyroid with the clamps' spine, else 25%. No supports.");
    add("pod_core", "Pod: core", core(K, L), "On its plug, upright. 6 walls, 25%. No supports.");
    add("pod_ring", "Pod: ring", ring(K), "On its lip. 6 walls, 25%. No supports.");
    if (L.TOP === "solar") {
      add("pod_finial", "Pod: finial", finial(K), "On its threaded stub. No supports.");
      add("pod_solar_stem", "Pod: solar roof stem", solarStem(K, L), "Standing on its foot. No supports.");
      add("pod_solar_nut", "Pod: solar roof nut", K.turn(solarNut(K, L), 180, "x"), "On a hex face. No supports.", () => K.at(solarNut(K, L), [0, 0, L.Z_TOP - 2.5]));
    }
    if (L.TOP === "sma" || L.TOP === "n") {
      add(`pod_top_${L.TOP}`, `Pod: ${L.TOP === "sma" ? "SMA" : "N"} antenna insert`, topInsert(K, L.TOP, L.HOLE), "Head down, as the file has it: both of the head's faces come out flat. No supports.");
      add(L.TOP === "n" ? "pod_top_plug_n" : "pod_top_plug", "Pod: plug for its top", topInsert(K, "plug", L.HOLE), "Head down, as the file has it. No supports.");
    }
    if (L.TOP === "solar" || L.SOCKET) add("pod_solar_plate", "Pod: solar plate", solarPlate(K).solid, "On the panel's face. No supports.");
    if (L.SOCKET) {
      add("pod_boom_wedge", "Pod: wedge over the tail", layOnSlope(K, L, boomWedge(K, L)), "On its flat base. No supports.", () => boomWedge(K, L));
      add("pod_solar_arm", "Pod: side solar arm", layOnSlope(K, L, sideArm(K, L)), "Standing on its flat bottom. 40%. No supports.", () => sideArm(K, L));
    }
    if (L.PAD) {
      add("pod_mount_block", "Pod: tripod and pole block", blockMount(K), "Standing, as in use. 40%. No supports.");
      add("pod_mount_wall", "Pod: wall plate", flatOnPadSide(K, wallPlate(K)), "On its pad side, the keyholes' channels up. No supports.", () => wallPlate(K));
      add("pod_mount_magnet", "Pod: magnet plate", flatOnPadSide(K, magnetPlate(K)), "On its pad side, the magnet pockets up. No supports.", () => magnetPlate(K));
    }
    add("pod_ring_magnet", "Pod: magnet base", ringMagnet(K), "On its foot, as it stands. No supports.");
    // from the pod's frame to the antenna's (x along the boom from the reflector, z from its axis), for fitting them together
    const toAntenna = [REAR - DEEPER - L.X_F, 0, -L.Z_B];
    return { parts: out, layout: L, K, lock: B.lock, toAntenna, side: L.SOCKET ? sideLayout(L) : null, solar: L.TOP === "solar" ? solarLayout(L) : null,
      placed: { finial: () => K.at(finial(K), [0, 0, L.Z_TOP - 2.5 - F_SEAT]), wedge: () => boomWedge(K, L), arm: () => sideArm(K, L),
        sidePlate: () => platePlaced(K, solarPlate(K), sideLayout(L).z_st, sideLayout(L).x_s, true), core: () => core(K, L) } };
  }

  YS.POD = { build, layout, kit, thread, tubeInsert, CELLS, CHOICES, OPTIONS, INSERTS, INSERT_ORINGS, PORT_TYPES, MAGNET, MAG_BASE, PADS, BLOCK };
})(typeof globalThis !== "undefined" ? globalThis : this);
