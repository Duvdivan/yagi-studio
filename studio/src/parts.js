/*
 * Printable parts made from the design on screen: the boom, in as many sections as the printer's bed needs, a mount
 * and a test coupon. The boom carries a gauge for cutting its own rods, two notches to check the print against
 * calipers, and a label saying which way up it goes.
 *
 * It follows cad/parts.py, which made the DuvYagi's, and tests/print_parts.js checks them against each other. x runs
 * along the boom with the reflector at 0, z along the rods, y across. Millimetres.
 *
 * The solids come from Manifold (src/vendor), given in as `wasm`, so this file has no DOM and runs in Node too.
 *
 * The slicer's X-Y hole compensation matters here. It widens any closed outline in a layer, and print settings need
 * it on for the rod holes. The channel and the marks that set a rod's length are therefore open to the boom's edge or
 * end, so that it leaves them alone and only shrinkage can move them, which the notches catch.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  const BOOM_W = 16, BOOM_H = 20;  // the boom's width (y) and height (z), for rods up to 3.2 mm: the hole's length holds the rod straight
  const REAR = -32;                // the boom's rear end, from the reflector: a tail for a mount's socket, which stops behind the reflector
  const MOUTH = -5;                // where a mount's socket ends, behind the reflector, so the reflector stays glued in the boom while it's mounted
  const FRONT = 10;                // how far it runs past the last rod
  const FIT = 0.05;                // rod holes over the rod's diameter, before hole compensation
  const HOLE_COMP = 0.125;         // the slicer's X-Y hole compensation these are modelled for, per side
  const CLEAR = 3.6;               // over a 3 mm rod's size: a mount's holes, which the rod passes loosely
  const M3 = 3.4, M3_BOOM = 3.0;   // M3 clearance in a mount, without compensation; in the boom, with it
  const NUT_FLATS = 5.45, NUT_DEPTH = 3.6;   // M3 nut trap
  /* The fork and tongue joining two sections, as lengths back from the tongue's tip. Its faces run along the rods, so a rod on the
     boom's centre line passes through the tongue alone and crosses no joint face. Widths are for a 16 mm boom, and grow with it. */
  const JOINT = {
    tongue: 4, play: 0.15, thick: 11.6,   // half widths, mm: the tongue, the room each side of it, and across the prongs
    flare: [54.8, 34.8],                  // the tongue's root narrows from the boom's width between these
    forkTip: 47.3, up: 27.3,              // the prongs' tips, and where they've reached full thickness
    crotch: 0.55,                         // the fork's inside end, past the tip
    down: [2.2, 27.2],                    // past the tip, where the fork's outside comes back to the boom's width
    bolts: [23.8, 5.8],                   // the two M3 bolts, across the boom, where nothing's in their way
    boltMin: 12,                          // the closest they're moved together
    rodClear: 2,                          // plastic left between a rod's hole and a bolt's, or a hole and the tongue's tip or the crotch at 3
    v: { depth: 1, half: 1, gap: 0.05, tipOut: 0.8, full: [28.8, 8.8], ease: [34.8, 3.8] },   // the centring V: a ridge on the tongue, a groove in each prong. Depth, half height, room at the flats when seated, the ridge's reach, where it's full, where it eases out
    tipClear: 3, sectionMin: 30,          // mm of plastic from a rod's hole to the tip and crotch; the shortest a rear section's plain boom can be
    bolt: { hole: 3.2, head: 5.8, headDepth: 3, nutFlats: 5.6, nutDepth: 3.6, nut: 2.4 },     // the bolts' holes, and the recesses in the prongs
  };
  const GAUGE_WALL = 8;            // from the V's end wall to the tongue's root or the boom's front end
  const BRIM = 16;                 // bed length a section can't use: a brim on both ends, and a margin
  const GROOVE = 3;                // the coax's groove, for RG178 and the like, on the +y face
  const WINDOW = [12, 15];         // the solder window at the driven element (x, z): long enough along the rods for a heat-sink clip beside the joint
  const WINDOW_SHORT = 10;         // its length along the rods where the boom can't widen there
  const TAPER_MAX = 5;             // degrees: the steepest the boom's faces slope toward the driven element, so its holes stay near vertical as it prints
  const SCREW = { pilots: [2.4, 2.6, 2.8], pilot: 2.6, lead: 3.1, leadLen: 1.5, wall: 2, head: 6 };   // M3 screws holding the rods: holes under M3 so a screw cuts its own thread, a lead-in to start it, the least plastic either side of one, and its head's size, which a label keeps clear of
  const PIN_NUT = { flats: 5.6, height: 3.6, top: 4.4, shoulder: 1.2, foot: 1 };   // the bulge for the pin's nut, mm: recess across flats, height, flat top's radius, and the rounding of its shoulder and foot
  const SOFT = { edge: 2.5, rim: 1, block: 4, blockRim: 1.5 };   // rounded outside edges, mm: a socket's long edges and open end, and a block's
  const WALL = 3, PLAY = 0.2;      // a mount's socket: its walls, and the room around the boom
  const SEGMENTS = 64;             // round holes: 0.002 mm under a 3 mm rod's radius
  const FLOPPY = 1200;             // mm of boom past which a printed one sags too much to recommend
  const MARK_FROM = 1;             // the first a mark can be from the boom's rear end, where the V runs off it
  const TICK = 0.6;                // a length mark's width: the narrowest a 0.4 mm nozzle draws cleanly
  const DEEP = 0.6;                // how deep marks are cut: three 0.2 mm layers
  const CAL_SPAN = 100;            // between the notches' inner walls, across the land between them, to check with calipers' outside jaws
  const CAL_NOTCH = [4, 2.5];      // each notch's width (x) and depth (z)
  const NOTCH_CLEAR = 2;           // mm of top face kept between a notch and a rod's hole
  const NOTCH_CLEAR_DRIVEN = 10;   // mm kept between a notch and the driven element's window, whose plastic is all that holds its halves
  const GRIP = { width: 30, depth: 34, length: 115, back: 60, chamfer: 5 };   // the hand grip, and how far it's held behind the reflector
  const TRIPOD = { size: 36, back: 34, flats: 11.2, nut: 5.6, shelf: 5, bolt: 6.6 };   // block, and a 1/4-20 nut
  const POLE = { plate: 8, bolts: 14, tilt: 30 };          // the pole socket's plate, and its four M3 bolts either side of centre, and how many degrees the thread's axis rises above the bed
  const CRADLE = { apex: -62, w: 80, h: 60 };    // the mast's V, from the reflector

  /* Letters on a 3 x 5 grid, as bars, so each is a groove a nozzle can follow. */
  const LETTERS = {
    A: [[0, 0, 1.5, 5], [1.5, 5, 3, 0], [0.7, 1.8, 2.3, 1.8]], B: [[0, 0, 0, 5], [0, 5, 2.2, 5], [2.2, 5, 3, 4.2], [3, 4.2, 3, 3.3], [3, 3.3, 2.2, 2.5], [0, 2.5, 2.2, 2.5], [2.2, 2.5, 3, 1.7], [3, 1.7, 3, 0.8], [3, 0.8, 2.2, 0], [2.2, 0, 0, 0]],
    C: [[3, 5, 0, 5], [0, 5, 0, 0], [0, 0, 3, 0]], D: [[0, 0, 0, 5], [0, 5, 2, 5], [2, 5, 3, 4], [3, 4, 3, 1], [3, 1, 2, 0], [2, 0, 0, 0]],
    E: [[3, 5, 0, 5], [0, 5, 0, 0], [0, 0, 3, 0], [0, 2.5, 2.2, 2.5]], H: [[0, 0, 0, 5], [3, 0, 3, 5], [0, 2.5, 3, 2.5]], I: [[1.5, 0, 1.5, 5]],
    L: [[0, 0, 0, 5], [0, 0, 3, 0]], M: [[0, 0, 0, 5], [0, 5, 1.5, 2.5], [1.5, 2.5, 3, 5], [3, 5, 3, 0]], P: [[0, 0, 0, 5], [0, 5, 3, 5], [3, 5, 3, 2.5], [3, 2.5, 0, 2.5]],
    R: [[0, 0, 0, 5], [0, 5, 2.2, 5], [2.2, 5, 3, 4.2], [3, 4.2, 3, 3.3], [3, 3.3, 2.2, 2.5], [0, 2.5, 2.2, 2.5], [1.4, 2.5, 3, 0]],
    S: [[3, 5, 0, 5], [0, 5, 0, 2.5], [0, 2.5, 3, 2.5], [3, 2.5, 3, 0], [3, 0, 0, 0]], T: [[0, 5, 3, 5], [1.5, 5, 1.5, 0]], U: [[0, 5, 0, 0], [0, 0, 3, 0], [3, 0, 3, 5]],
    0: [[0, 0, 0, 5], [0, 5, 3, 5], [3, 5, 3, 0], [3, 0, 0, 0]], 1: [[1.5, 0, 1.5, 5], [1.5, 5, 0.4, 3.9]], 2: [[0, 5, 3, 5], [3, 5, 3, 2.5], [3, 2.5, 0, 2.5], [0, 2.5, 0, 0], [0, 0, 3, 0]],
    3: [[0, 5, 3, 5], [3, 5, 3, 0], [3, 0, 0, 0], [0.8, 2.5, 3, 2.5]], 4: [[0, 5, 0, 2.5], [0, 2.5, 3, 2.5], [3, 5, 3, 0]], 5: [[3, 5, 0, 5], [0, 5, 0, 2.5], [0, 2.5, 3, 2.5], [3, 2.5, 3, 0], [3, 0, 0, 0]],
    6: [[3, 5, 0, 5], [0, 5, 0, 0], [0, 0, 3, 0], [3, 0, 3, 2.5], [3, 2.5, 0, 2.5]], 7: [[0, 5, 3, 5], [3, 5, 1, 0]], 8: [[0, 0, 0, 5], [0, 5, 3, 5], [3, 5, 3, 0], [3, 0, 0, 0], [0, 2.5, 3, 2.5]],
    9: [[3, 0, 3, 5], [3, 5, 0, 5], [0, 5, 0, 2.5], [0, 2.5, 3, 2.5]], "/": [[0, 0, 3, 5]],
  };
  const textWidth = (s, k, pitch) => (s.length - 1) * pitch + 3 * k;
  /* What a rod's name can be written as: D1 from anything, and nothing the letters above can't draw. */
  const engravable = (s) => String(s).toUpperCase().split("").filter((c) => LETTERS[c]).join("");

  /** The solids this file makes, on top of Manifold, keeping hold of them all to free together at the end. */
  function kit(wasm) {
    if (wasm.setup) wasm.setup();
    const { Manifold, CrossSection } = wasm;
    const made = [];
    const keep = (m) => { made.push(m); return m; };
    const K = {
      box: (x0, x1, y0, y1, z0, z1) => keep(keep(Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0])),
      cyl: (x, y, z0, d, h) => keep(keep(Manifold.cylinder(h, d / 2, d / 2, SEGMENTS)).translate([x, y, z0])),
      cylX: (x0, y, z, d, h) => K.at(K.turn(keep(Manifold.cylinder(h, d / 2, d / 2, SEGMENTS)), [0, 90, 0]), [x0, y, z]),
      cylY: (x, y0, z, d, h) => K.at(K.turn(keep(Manifold.cylinder(h, d / 2, d / 2, SEGMENTS)), [-90, 0, 0]), [x, y0, z]),
      prism: (pts, z0, z1) => {
        const cs = keep(new CrossSection([pts], "NonZero"));
        return K.at(keep(cs.extrude(z1 - z0)), [0, 0, z0]);
      },
      hex: (x, y, flats, z0, z1) => {
        const r = flats / Math.sqrt(3), pts = [];
        for (let i = 0; i < 6; i++) pts.push([x + r * Math.cos(i * Math.PI / 3), y + r * Math.sin(i * Math.PI / 3)]);
        return K.prism(pts, z0, z1);
      },
      /* A straight groove from (x0, y0) to (x1, y1), with square ends a little past both. */
      bar: (x0, y0, x1, y1, z0, z1, w) => {
        const n = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / n, uy = (y1 - y0) / n, a = uy * w / 2, b = -ux * w / 2;
        const p0 = [x0 - ux * w / 2, y0 - uy * w / 2], p1 = [x1 + ux * w / 2, y1 + uy * w / 2];
        return K.prism([[p0[0] + a, p0[1] + b], [p1[0] + a, p1[1] + b], [p1[0] - a, p1[1] - b], [p0[0] - a, p0[1] - b]], z0, z1);
      },
      word: (text, x0, y0, k, z0, z1, w, pitch) => {
        const out = [];
        String(text).split("").forEach((ch, i) => {
          (LETTERS[ch] || []).forEach((s) => out.push(K.bar(x0 + i * pitch + s[0] * k, y0 + s[1] * k, x0 + i * pitch + s[2] * k, y0 + s[3] * k, z0, z1, w)));
        });
        return out;
      },
      /* A box along x with its long edges rounded, and its far end's edge too, by the convex hull of its outline at each height. */
      rbox: (x0, x1, y0, y1, z0, z1, edge, rim) => {
        const pts = [], levels = [[x0, 0], [x1 - rim, 0]];
        for (let i = 1; rim > 0 && i <= 6; i++) { const a = i / 6 * Math.PI / 2; levels.push([x1 - rim + rim * Math.sin(a), rim * (1 - Math.cos(a))]); }
        levels.forEach(([x, inset]) => {
          const r = Math.max(edge - inset, 0.001);
          [[y1 - edge, z1 - edge, 0], [y0 + edge, z1 - edge, 1], [y0 + edge, z0 + edge, 2], [y1 - edge, z0 + edge, 3]].forEach(([y, z, q]) => {
            for (let i = 0; i <= 8; i++) { const a = (q + i / 8) * Math.PI / 2; pts.push([x, y + r * Math.cos(a), z + r * Math.sin(a)]); }
          });
        });
        return keep(Manifold.hull(pts));
      },
      /* A solid of revolution around z, from its outline as [radius, z]. */
      revolve: (outline) => keep(Manifold.revolve([outline], SEGMENTS)),
      hull: (pts) => keep(Manifold.hull(pts)),
      meet: (a, b) => keep(a.intersect(b)),
      /* Turned by deg about a line along y through (px, pz). */
      tilt: (m, px, pz, deg) => K.at(K.turn(K.at(m, [-px, 0, -pz]), [0, deg, 0]), [px, 0, pz]),
      /* A cone along +y from y0, d0 across there and d1 at its far end. */
      coneY: (x, y0, z, d0, d1, h) => K.at(K.turn(keep(Manifold.cylinder(h, d0 / 2, d1 / 2, SEGMENTS)), [-90, 0, 0]), [x, y0, z]),
      /* A shape drawn in (x, z), run across the boom from y0 to y1. */
      acrossY: (pts, y0, y1) => {
        const cs = keep(new CrossSection([pts], "NonZero"));
        return K.at(K.turn(keep(cs.extrude(y1 - y0)), [90, 0, 0]), [0, y1, 0]);
      },
      turn: (m, r) => keep(m.rotate(r)),
      at: (m, t) => keep(m.translate(t)),
      /* A solid from base-64 Float32 positions and Uint32 triangles. */
      fromData: (positions, triangles) => {
        const bytes = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };
        return keep(new Manifold(new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(bytes(positions)), triVerts: new Uint32Array(bytes(triangles)) })));
      },
      cut: (a, list) => (list.length ? keep(a.subtract(keep(Manifold.union(list)))) : a),
      fuse: (list) => keep(Manifold.union(list)),
      free: () => { made.forEach((m) => { try { m.delete(); } catch (e) { /* already gone */ } }); made.length = 0; },
      /* Print orientation, resting on the bed at the origin, and scaled across the bed for the printer's shrinkage. */
      place: (m, turn, scale) => {
        const t = turn ? K.turn(m, turn) : m, b = t.boundingBox();
        const s = keep(keep(keep(t.translate([-b.min[0], -b.min[1], -b.min[2]])).scale([scale, scale, 1])).simplify(0.001));   // no slivers too thin for an STL's numbers
        return s;
      },
      mesh: (m) => {
        const g = m.getMesh(), n = g.numProp, v = g.vertProperties, tv = g.triVerts, t = [];
        const pt = (i) => [v[i * n], v[i * n + 1], v[i * n + 2]];
        for (let i = 0; i < tv.length; i += 3) t.push([pt(tv[i]), pt(tv[i + 1]), pt(tv[i + 2])]);
        return { t };
      },
    };
    return K;
  }

  /* ---------- planning: everything that can be said before any solid is made ---------- */

  /** Rods from the rear, measured from the reflector, as the boom needs them. */
  function rodsOf(design, fit) {
    const sorted = design.elements.slice().sort((a, b) => a.x - b.x), x0 = sorted[0].x;
    return sorted.map((e) => ({ x: e.x - x0, d: e.d, L: e.L, name: e.name, driven: e.type === "driven", hole: e.d + fit, material: e.material || design.material }));
  }

  /* The joint's widths for a boom this wide. */
  const jointY = (w) => { const k = w / BOOM_W; return { hb: w / 2, tongue: JOINT.tongue * k, thick: JOINT.thick * k }; };
  /* How the widths run along the boom, at x from a tongue whose tip is at t. */
  const ease = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return (1 - Math.cos(Math.PI * u)) / 2; };
  const tongueY = (J, t, x) => J.hb - (J.hb - J.tongue) * ease(t - JOINT.flare[0], t - JOINT.flare[1], x);
  const outerY = (J, t, x) => (x <= t + JOINT.down[0] ? J.hb + (J.thick - J.hb) * ease(t - JOINT.forkTip, t - JOINT.up, x) : J.thick - (J.thick - J.hb) * ease(t + JOINT.down[0], t + JOINT.down[1], x));
  /* A prong's tip is round, as wide as what's left beyond the tongue there. */
  const prongTipR = (J, t) => (outerY(J, t, t - JOINT.forkTip) - tongueY(J, t, t - JOINT.forkTip) - JOINT.play) / 2;

  /**
   * Where a joint's two bolts go with a tongue tip at t, or null if rods leave no room. They stay on the prongs' full thickness,
   * as near their usual places as the rods allow, with a rod's hole and a bolt's kept apart.
   */
  function placeBolts(t, rods) {
    const lo = t - JOINT.up, hi = t - JOINT.bolts[1], want = [t - JOINT.bolts[0], t - JOINT.bolts[1]];
    const free = (x) => rods.every((r) => Math.abs(r.x - x) >= r.hole / 2 + JOINT.bolt.hole / 2 + JOINT.rodClear);
    let best = null;
    for (let a = lo; a <= hi; a += 0.5) {
      if (!free(a)) continue;
      for (let b = a + JOINT.boltMin; b <= hi + 1e-9; b += 0.5) {
        if (!free(b)) continue;
        const cost = Math.abs(a - want[0]) + Math.abs(b - want[1]);
        if (!best || cost < best.cost) best = { cost, x: [a, b] };
      }
    }
    return best && best.x;
  }

  /** Whether a joint can go with its tongue's tip at t. Returns its bolts and the rods through its tongue, or null. */
  function jointAt(t, rods, J, cleanOnly) {
    const root = t - JOINT.flare[0], out = t + JOINT.down[1];
    const driven = rods.find((r) => r.driven);
    if (driven && driven.x > root - WINDOW[0] / 2 - 4 && driven.x < out + WINDOW[0] / 2 + 4) return null;        // its window would cut the joint away
    const through = rods.filter((r) => r.x + r.hole / 2 + 2 > root && r.x - r.hole / 2 - JOINT.tipClear < t + JOINT.crotch);
    if (cleanOnly && through.length) return null;
    // the rods that would stay: through the tongue, short of its tip, or past the fork's crotch
    const fine = through.every((r) => (r.x + r.hole / 2 + JOINT.tipClear <= t || r.x - r.hole / 2 - JOINT.tipClear >= t + JOINT.crotch) && r.hole <= 2 * J.tongue - 4);
    if (!fine) return null;
    const bolts = placeBolts(t, rods);
    return bolts && { t, bolts, through: through.filter((r) => r.x <= t) };
  }

  /**
   * Where the joints go. Each section takes as much as fits the bed, so that the first is long enough for the gauge. With
   * cleanFirst, a place with no rod in the tongue comes first, however far back that is, and a rod goes through the tongue only
   * if there's none. Without it, the joint goes as far forward as it can, rod or no rod. planParts tries both and chooses.
   */
  function planSections(rods, bed, scale, sizes, rearLess = 0, cleanFirst = true) {
    const J = jointY(sizes.w), front = rods[rods.length - 1].x + FRONT;
    const usableFor = (w) => (YS.longestOn(bed, w * scale + BRIM) - BRIM) / scale;
    const rear = usableFor(sizes.w) - rearLess, rest = usableFor(2 * J.thick);   // rearLess: what the first piece's lean on the bed takes
    const size = YS.bedOf(bed);
    if (rear <= 0) throw new Error(`A boom ${sizes.w} mm wide doesn't fit a bed ${size.x} x ${size.y} mm, with room for a brim.`);
    const joints = [];
    let x0 = REAR, usable = rear, floor = rods[0].x + JOINT.sectionMin + JOINT.flare[0];
    while (front - x0 > usable) {
      const top = Math.min(x0 + usable - 0.2, front - JOINT.down[1] - 2);
      const scan = (clean) => { for (let t = top; t >= floor; t -= 0.5) { const j = jointAt(t, rods, J, clean); if (j) return j; } return null; };
      const j = rest > 0 ? (cleanFirst ? scan(true) || scan(false) : scan(false)) : null;
      if (!j) throw new Error(`There's nowhere to join the boom within a ${size.x} x ${size.y} mm bed: a section can't reach far enough, the driven element's window is in the way, or the rods leave no room for the joint's two bolts. Try a bigger bed, corner to corner printing, or wider spacing.`);
      joints.push(j);
      x0 = j.t - JOINT.forkTip - prongTipR(J, j.t);
      usable = rest;
      floor = j.t + JOINT.down[1] + JOINT.flare[0];       // the next tongue's root starts where this fork has come back to the boom's width
    }
    return joints.concat([null]).map((next, i) => {
      const prev = i ? joints[i - 1] : null;
      return { i, x0: prev ? prev.t - JOINT.forkTip - prongTipR(J, prev.t) : REAR, x1: next ? next.t : front, prev, next, wide: prev ? 2 * J.thick : sizes.w };
    });
  }

  function sectionRods(rods, s) { return rods.filter((r) => r.x >= s.x0 && r.x <= s.x1); }

  /**
   * Where the gauge's marks and their labels go on the top face. The labels spread along x where the marks crowd,
   * with leaders from the marks, and a mark whose leader would hit a rod's hole keeps only its tick.
   */
  function planGauge(design, rods, section, sizes, allowance, taper) {
    const channels = YS.guideChannels(design, allowance);
    // a rod butts against the wall at the V's front end, and the V runs off the boom's rear end, so that an uncut rod of any length lies in it
    const end = (section.next === null ? section.x1 : section.next.t - JOINT.flare[0]) - GAUGE_WALL;
    // On a tapered boom the top slopes, so everything here is laid out flat, along the slope, as if the top were level, and turned
    // onto it when cut: lengths along the V are what a rod measures. flat() is where a point of the boom lands in that layout.
    // The V then stops at the socket's mouth, where the tail's top drops away from it, and an uncut rod overhangs there.
    const cos = Math.cos(Math.atan(taper.m)), flat = (x) => end - (end - x) / cos;
    const stop = taper.m ? flat(MOUTH + MARK_FROM) : REAR + MARK_FROM, vFrom = taper.m ? flat(MOUTH - 1) : REAR - 1;
    const fits = channels.filter((c) => end - c.length > stop);
    // the layout alone, which the check notches use with or without the gauge
    const layout = { stop, end, vFrom, top: taper.hz(end), ang: taper.ang, marks: [] };
    if (!fits.length) return Object.assign(layout, { fits: false, reason: "The rods are longer than this boom section, so the gauge doesn't fit. The Cut list's guide still works." });
    const missing = channels.length - fits.length;
    const k = 0.7, pitch = 3.2, labelY = sizes.w / 2 - 4.4;
    const marks = fits.map((c) => {
      const label = engravable(c.label), width = textWidth(label, k, pitch);
      return { rod: c.label, label, length: c.length, x: end - c.length, width };
    }).sort((a, b) => a.x - b.x);
    // spread the labels until they stop overlapping, keeping each group centred on its marks
    marks.forEach((m) => { m.lx = m.x; });
    for (let pass = 0; pass < 200; pass++) {
      let moved = false;
      for (let i = 0; i + 1 < marks.length; i++) {
        const a = marks[i], b = marks[i + 1], need = (a.width + b.width) / 2 + 1.4 - (b.lx - a.lx);
        if (need > 1e-3) { a.lx -= need / 2; b.lx += need / 2; moved = true; }
      }
      if (!moved) break;
    }
    const inner = sizes.chY + sizes.chHalf + 1;
    const holeHit = (x0, y0, x1, y1, h) => {
      const hx = flat(h.x), dx = x1 - x0, dy = y1 - y0, t = Math.max(0, Math.min(1, ((hx - x0) * dx + (0 - y0) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x0 + t * dx - hx, y0 + t * dy) < h.hole / 2 + 0.7 + TICK / 2;
    };
    const inRange = (m, lx) => lx - m.width / 2 > stop && lx + m.width / 2 < end - 1;
    const clearOfHoles = (m, lx) => !rods.some((h) => holeHit(m.x, inner, lx, labelY - 0.6, h));
    // a leader that would run into a rod's hole slides its label along until it passes, if there's room
    marks.forEach((m) => { m.labelled = inRange(m, m.lx) && clearOfHoles(m, m.lx); });
    marks.filter((m) => !m.labelled).forEach((m) => {
      const free = (lx) => marks.every((q) => q === m || !q.labelled || Math.abs(q.lx - lx) >= (q.width + m.width) / 2 + 1.4);
      for (let d = 1; d <= 40 && !m.labelled; d++) {
        for (const lx of [m.x - d, m.x + d]) {
          if (inRange(m, lx) && clearOfHoles(m, lx) && free(lx)) { m.lx = lx; m.labelled = true; break; }
        }
      }
    });
    return { fits: true, stop, end, vFrom, top: taper.hz(end), ang: taper.ang, marks, inner, labelY, k, pitch, unlabelled: marks.filter((m) => !m.labelled).map((m) => m.rod), missing };
  }

  /** The two notches, placed in the gauge's level layout, clear of its labels if it has any. Carries the layout's tilt, to cut them with or without the gauge. */
  function planNotches(gauge, sizes, rods) {
    const [w] = CAL_NOTCH;
    // Clear of the labels, of every rod's hole, and well clear of the driven element: there the window leaves only the plastic
    // gripping its halves, and a notch would cut into it (the owner's catch, 2026-11-06). Rods are placed in the gauge's level
    // layout, as the notches are.
    const flat = (x) => gauge.end - (gauge.end - x) / Math.cos((gauge.ang || 0) * Math.PI / 180);
    const keep = rods.map((r) => { const c = flat(r.x), half = r.driven ? WINDOW[0] / 2 + NOTCH_CLEAR_DRIVEN : r.hole / 2 + NOTCH_CLEAR; return [c - half, c + half]; });
    const hit = (a, b) => gauge.marks.some((m) => m.labelled && a < m.lx + m.width / 2 + 1 && b > m.lx - m.width / 2 - 1) || keep.some(([c0, c1]) => a < c1 && b > c0);
    // from and to are the inner walls, CAL_SPAN apart; each notch lies outside them
    const lo = gauge.stop + w, hi = gauge.end - CAL_SPAN - w - 2;
    // as far from the driven element as they'll go; with no driven element, as near the middle
    const driven = rods.find((r) => r.driven), middle = (lo + hi) / 2;
    const away = (q) => driven ? -Math.min(Math.abs(q - w - flat(driven.x)), Math.abs(q - flat(driven.x)), Math.abs(q + CAL_SPAN - flat(driven.x)), Math.abs(q + CAL_SPAN + w - flat(driven.x))) : Math.abs(q - middle);
    const tries = [];
    for (let p = lo; p <= hi; p += 1) tries.push(p);
    tries.sort((a, b) => away(a) - away(b));
    const p = tries.find((q) => !hit(q - w, q) && !hit(q + CAL_SPAN, q + CAL_SPAN + w));
    return p === undefined ? null : { from: p, to: p + CAL_SPAN, y0: sizes.w / 2 - 4, end: gauge.end, top: gauge.top, ang: gauge.ang };
  }

  function boomSizes(rods) {
    const big = Math.max.apply(null, rods.map((r) => r.d));
    const w = Math.max(BOOM_W, Math.ceil(5 * big)), h = Math.max(BOOM_H, Math.ceil(6.2 * big));
    const chHalf = Math.max(2, big * 0.67), hole = big + FIT;
    return { w, h, chHalf, chY: -(hole / 2 + 1 + chHalf) };
  }

  /**
   * The boom's taper. The section holding the driven element widens toward its rear, the same both ways along the rods, so that
   * each half of the driven element passes through as much plastic as half of any other rod, with a longer window for soldering.
   * It's widest at the rear and narrows to the plain boom at the joint's tongue tip or the front end, and prints lying on one
   * sloped face, so its holes stand a degree or two off vertical. Behind the reflector, the tail that goes in a mount's socket has
   * its two faces parallel, carrying on the bottom face's slope, so that it slides in: a socket can't follow a boom that widens
   * going in. hz(x) is the half height from the socket's mouth forward, and zb(x) the bottom face, anywhere on the section.
   */
  function planTaper(rods, sections, sizes) {
    const h2 = sizes.h / 2, s0 = sections[0], end = s0.next ? s0.next.t : s0.x1, driven = rods.find((r) => r.driven);
    let m = 0, win = WINDOW_SHORT, capped = false;
    if (driven && driven.x < end - 1) {
      const want = (WINDOW[1] + sizes.h) / 2;               // the window, with a plain rod's grip either side
      m = (want - h2) / (end - driven.x);
      const most = Math.tan(TAPER_MAX * Math.PI / 180);
      if (m > most) { m = most; capped = true; }
      win = Math.min(WINDOW[1], Math.max(WINDOW_SHORT, 2 * (h2 + m * (end - driven.x)) - sizes.h));
    }
    const hz = (x) => h2 + m * Math.max(0, end - x), zb = (x) => -hz(x), Ht = 2 * hz(MOUTH);
    const t = { m, end, ang: Math.atan(m) * 180 / Math.PI, hz, zb, Ht, win, capped, half: hz(REAR), peak: Math.max(sizes.h, Ht) };
    if (driven && driven.x < end) {
      // the driven element's screws go halfway along the plastic each half passes through
      const hzD = hz(driven.x), zs = (win / 2 + hzD) / 2, big = SCREW.pilots[SCREW.pilots.length - 1] / 2;
      Object.assign(t, { hzD, grip: hzD - win / 2, zs, drivenScrews: zs - win / 2 - big >= SCREW.wall && hzD - zs - big >= SCREW.wall });
    }
    return t;
  }

  /* How long the first section is on the bed, lying on its sloped face: its ends lean, so it's a little longer than along the boom. */
  function leanLength(T, s, h) {
    const a = Math.atan(T.m), c = Math.cos(a), sn = Math.sin(a);
    const xs = [[REAR, T.zb(REAR)], [REAR, T.zb(REAR) + T.Ht], [MOUTH, T.hz(MOUTH)], [s.x1, -h / 2], [s.x1, h / 2]].map(([x, z]) => x * c + z * sn);
    return Math.max(...xs) - Math.min(...xs);
  }

  /* The taper's outline in (x, z), to cut the first section to. */
  const taperOutline = (T, h2) => {
    const x0 = REAR - 2, far = T.end + 100;
    return [[x0, T.zb(x0)], [T.end, -h2], [far, -h2], [far, h2], [T.end, h2], [MOUTH, T.hz(MOUTH)], [x0, T.zb(x0) + T.Ht]];
  };

  /* A hole under M3 from the boom's back into a rod's hole, with a lead-in, so that a screw cuts its own thread and presses on the
     rod. Pointed on top, as it prints lying across the layers. */
  function screwHole(K, r, zc, face, pilot) {
    const shape = teardrop(r.x, pilot).map(([x, z]) => [x, z + zc]);
    const d0 = SCREW.lead + 0.5 * (SCREW.lead - pilot) / SCREW.leadLen;
    return [K.acrossY(shape, -face - 1, -r.hole / 2 + 0.3), K.coneY(r.x, -face - 0.5, zc, d0, pilot, SCREW.leadLen + 0.5)];
  }

  /* ---------- the boom ---------- */
  const steps = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
  const arc = (cx, cy, r, a0, a1, n) => steps(a0, a1, n).map((d) => [cx + r * Math.cos(d * Math.PI / 180), cy + r * Math.sin(d * Math.PI / 180)]);

  /* The tongue, from the boom's full width at its root to its round tip, with a ridge on each face to centre it in the prongs' grooves. */
  function tongue(K, t, J, z) {
    const from = t - JOINT.flare[0] - 1, r = t - J.tongue, side = (s) => steps(from, r, 90).map((x) => [x, s * tongueY(J, t, x)]);
    const body = K.prism([...side(-1), ...arc(r, 0, J.tongue, -90, 90, 16), ...side(1).reverse()], -z, z);
    const V = JOINT.v, seat = J.tongue + V.gap, base = J.tongue - 0.3, hb = V.half + (seat - base), ht = V.half - (J.tongue + V.tipOut - seat);
    const ridge = (s) => {
      const at = (x) => [[x, s * base, hb], [x, s * base, -hb], [x, s * (J.tongue + V.tipOut), ht], [x, s * (J.tongue + V.tipOut), -ht]];
      const end = (x) => [[x, s * J.tongue, 0.01], [x, s * J.tongue, -0.01], [x, s * base, hb], [x, s * base, -hb]];
      return K.hull([...at(t - V.full[0]), ...at(t - V.full[1]), ...end(t - V.ease[0]), ...end(t - V.ease[1])]);
    };
    return K.fuse([body, ridge(-1), ridge(1)]);
  }

  /* The fork, from its prongs' round tips to where its outside has come back to the boom's width, with the grooves for the tongue's ridges. */
  function fork(K, t, J, z, end) {
    const tip = t - JOINT.forkTip, r = t + JOINT.crotch - J.tongue - JOINT.play, tipR = prongTipR(J, t);
    const inner = (s) => steps(tip, r, 60).map((x) => [x, s * (tongueY(J, t, x) + JOINT.play)]);
    const outer = (s) => [...steps(tip, t + JOINT.down[1], 90), end].map((x) => [x, s * outerY(J, t, x)]);
    const tipY = tongueY(J, t, tip) + JOINT.play + tipR;
    const pts = [...outer(-1), ...outer(1).reverse(), ...arc(tip, tipY, tipR, 90, 270, 8).slice(1, -1), ...inner(1),
      ...arc(r, 0, J.tongue + JOINT.play, 90, -90, 24).slice(1, -1), ...inner(-1).reverse(), ...arc(tip, -tipY, tipR, 90, 270, 8).slice(1, -1)];
    const V = JOINT.v, face = J.tongue + JOINT.play, h = V.half + 0.25;
    const groove = (s) => {
      const at = (x) => [[x, s * (face + V.depth), 0], [x, s * (face - 0.25), h], [x, s * (face - 0.25), -h]];
      return K.hull([...at(tip - 2), ...at(t + JOINT.crotch - 3.5), [t + JOINT.crotch - 1, s * face, 0], [t + JOINT.crotch - 1, s * (face - 0.25), h / 3], [t + JOINT.crotch - 1, s * (face - 0.25), -h / 3]]);
    };
    return K.cut(K.prism(pts, -z, z), [groove(-1), groove(1)]);
  }

  /* A bolt's hole, across the boom, with a 45 degree point on top so it prints without sagging. */
  const teardrop = (x, d) => [...arc(x, 0, d / 2, -225, 45, 32), [x, d / 2 * Math.SQRT2]];
  const hexUp = (x, flats) => { const r = flats / Math.sqrt(3); return [0, 1, 2, 3, 4, 5].map((k) => [x + r * Math.sin(k * Math.PI / 3), r * Math.cos(k * Math.PI / 3)]); };

  function boomSection(K, sec, rods, sizes, opts) {
    const { w, h } = sizes, J = jointY(w), T = sizes.taper, tapered = sec.i === 0 && T.m > 0;
    // a tapered section is made tall and cut to the taper's outline; zz reaches through any of it, for holes along the rods
    const y = w / 2, z = tapered ? T.half + 2 : h / 2, zz = Math.max(T.half, h / 2) + 5;
    // the plain boom between the joint at each end
    const a = sec.prev ? sec.prev.t + JOINT.down[1] : REAR, b = sec.next ? sec.next.t - JOINT.flare[0] : sec.x1;
    const parts = [K.box(a, b, -y, y, -z, z)];
    if (sec.prev) parts.push(fork(K, sec.prev.t, J, z, a + 1));
    if (sec.next) parts.push(tongue(K, sec.next.t, J, z));
    let s = K.fuse(parts);
    if (tapered) s = K.meet(s, K.acrossY(taperOutline(T, h / 2), -y - 2, y + 2));
    const cuts = [];
    const B = JOINT.bolt;
    if (sec.next) sec.next.bolts.forEach((x) => cuts.push(K.acrossY(teardrop(x, B.hole), -J.thick - 1, J.thick + 1)));
    if (sec.prev) sec.prev.bolts.forEach((x) => {
      cuts.push(K.acrossY(teardrop(x, B.hole), -J.thick - 1, J.thick + 1));
      cuts.push(K.acrossY(teardrop(x, B.head), J.thick - B.headDepth, J.thick + 1));       // the head sits in this prong
      cuts.push(K.acrossY(hexUp(x, B.nutFlats), -J.thick - 1, -J.thick + B.nutDepth));     // and the nut in that one
    });
    sectionRods(rods, sec).forEach((r) => cuts.push(K.cyl(r.x, 0, -zz, r.hole, 2 * zz)));
    const driven = rods.find((r) => r.driven);
    if (driven && driven.x >= sec.x0 && driven.x <= sec.x1) cuts.push(K.box(driven.x - WINDOW[0] / 2, driven.x + WINDOW[0] / 2, -2, y + 1, -T.win / 2, T.win / 2));
    // the coax runs from the driven element back to the rear end, on any section it reaches
    // but not through a joint, where there are bolts and a prong's wall in its way: there it runs outside
    if (driven && sec.x0 < driven.x) cuts.push(K.box(sec.prev ? a : sec.x0 - 1, Math.min(driven.x, b), y - 2.5, y + 1, -GROOVE / 2, GROOVE / 2));
    if (sec.i === 0) cuts.push(K.cyl(REAR + 7, 0, -zz, M3_BOOM, 2 * zz));      // pins a mount
    // screws from the back, at each rod's middle, where they don't change the antenna; the driven element's either side of its window.
    // Not on a rod through a joint's tongue, where the prongs are in the way.
    if (opts.screws) {
      const through = sec.next ? sec.next.through : [];
      sectionRods(rods, sec).forEach((r) => {
        if (through.includes(r)) return;
        const at = r.driven ? (T.drivenScrews ? [-T.zs, T.zs] : []) : [0];
        const face = sec.prev && r.x > sec.prev.t && r.x < sec.prev.t + JOINT.down[1] ? outerY(J, sec.prev.t, r.x) : y;
        at.forEach((zc) => cuts.push(...screwHole(K, r, zc, face, opts.pilot)));
      });
    }
    s = K.cut(s, cuts);
    if (sec.i === 0 && (opts.gauge || opts.notches)) s = K.cut(s, gaugeCuts(K, opts.gauge, opts.notches, sizes));
    if (sec.i === 0 && opts.label) s = K.cut(s, labelCuts(K, sec, rods, sizes, opts.screws));
    return s;
  }

  /* A V along the top, so it prints without supports and a rod lies true in it. Open along its top and off the rear end, like the
     marks, so that hole compensation can't move what sets a rod's length, and an uncut rod of any length can lie in it. */
  function gaugeCuts(K, g, notches, sizes) {
    // either may be off: g is the gauge, notches the check notches, and both share the same level layout and tilt
    const { w, chY, chHalf } = sizes, L = g || notches, top = L.top, out = [];
    if (g) out.push(K.turn(K.prism([[chY - chHalf - 0.5, top + 0.5], [chY + chHalf + 0.5, top + 0.5], [chY, top - chHalf]], g.vFrom, g.end), [90, 0, 90]));     // drawn in (y, z), and pushed along x
    if (g) g.marks.forEach((m) => {
      out.push(K.box(m.x - TICK / 2, m.x + TICK / 2, -w / 2 - 1, g.inner, top - DEEP, top + 1));
      if (!m.labelled) return;
      out.push(K.bar(m.x, g.inner, m.lx, g.labelY - 0.6, top - DEEP, top + 1, TICK));
      out.push(...K.word(m.label, m.lx - m.width / 2, g.labelY, g.k, top - DEEP, top + 1, TICK, g.pitch));
    });
    if (notches) {
      const [nw, nd] = CAL_NOTCH;
      out.push(K.box(notches.from - nw, notches.from, notches.y0, w / 2 + 1, top - nd, top + 1));
      out.push(K.box(notches.to, notches.to + nw, notches.y0, w / 2 + 1, top - nd, top + 1));
    }
    // laid out level, then turned onto the sloped top about the V's front wall, which stays square to the V
    return L.ang ? [K.tilt(K.fuse(out), L.end, top, L.ang)] : out;
  }

  /* On the boom's -y side. It reads upright only with the rods vertical, and on horizontal rods it's the side that faces up. */
  function labelCuts(K, sec, rods, sizes, screws) {
    const y = sizes.w / 2, z = sizes.h / 2;
    const text = "THIS SIDE UP", depth0 = y - DEEP, depth1 = y + 1;
    const clearOfMount = rods[0].x + 14, end = sec.next === null ? sec.x1 : sec.next.t - JOINT.flare[0];
    const room = end - clearOfMount - 4;
    const k = Math.min(0.12 * sizes.h / 2 * 1, 1.2 * sizes.h / BOOM_H), pitch = 5 * k;
    const width = textWidth(text, k, pitch) + 12;
    if (room < width * 0.6) return [];
    const scale = Math.min(1, room / width), pp = pitch * scale;
    let kk = k * scale;
    // with screws, the screws' heads are on this side at the rods' middles, so the words and arrow move above them, smaller if need be
    const clear = SCREW.head / 2 + 0.5;
    if (screws) kk = Math.min(kk, (z - 1.5 - clear) / 5);
    const h = 5 * kk, zc = screws ? clear + h / 2 : 0, x0 = clearOfMount + (room - width * scale) / 2 + 2, bars = [];
    bars.push(...K.word(text, x0, zc - h / 2, kk, depth0, depth1, 0.8, pp));
    const ax = x0 + textWidth(text, kk, pp) + 6 * scale, tip = screws ? h / 2 : Math.min(z - 3, h), head = screws ? Math.min(3.5 * scale, 0.6 * h) : 3.5 * scale;
    bars.push(K.bar(ax, zc - tip, ax, zc + tip, depth0, depth1, 0.9), K.bar(ax, zc + tip, ax - head * 0.86, zc + tip - head, depth0, depth1, 0.9), K.bar(ax, zc + tip, ax + head * 0.86, zc + tip - head, depth0, depth1, 0.9));
    return bars.map((b) => K.turn(b, [90, 0, 0]));
  }

  /* ---------- mounts ----------
     Every socket prints standing, its opening up. The DuvYagi's handle adapter, printed flat with its socket's roof
     bridged, snapped along the layers at that roof when the boom was pushed in. Standing, the walls run the whole way
     round each layer, and printed that way it held. */
  /* The socket over the boom's tail, with an M3 through its walls. It stops behind the reflector, which stays in the boom. Its faces
     are parallel to the tail's, tilted with the taper, and the boom slides in along them. */
  function socketCuts(K, rods, sizes, front, wideY) {
    const { w } = sizes, T = sizes.taper, y = w / 2 + PLAY;
    const at = (x, up) => T.zb(x) + (up ? T.Ht + PLAY : -PLAY);
    const cavity = K.acrossY([[REAR, at(REAR, 0)], [front + 1, at(front + 1, 0)], [front + 1, at(front + 1, 1)], [REAR, at(REAR, 1)]], -y, y);
    return [cavity, K.cyl(REAR + 7, 0, -60, M3, 120), K.box(REAR, front + 1, w / 2 - 1, wideY + 1, -GROOVE / 2, GROOVE / 2)];
  }

  /* A length of arm or socket, rounded along its length unless these are the plain solids. */
  const pipe = (K, soft, x0, x1, y, z, rim) => (soft ? K.rbox(x0, x1, -y, y, -z, z, SOFT.edge, rim) : K.box(x0, x1, -y, y, -z, z));

  /* The outline of the bulge for the pin's nut, as [radius, height off the wall]: a flat top, a rounded shoulder, a 45 degree
     side, and a foot blending into the wall. So it prints standing with no supports. */
  function nutBulge() {
    const { height: H, top, shoulder: s, foot: c } = PIN_NUT, side = top + s * Math.SQRT2 + H - s, far = side + c * Math.tan(Math.PI / 8);
    const out = [[0, -0.01], [far, -0.01]];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 - (i / 6) * Math.PI / 4; out.push([far + c * Math.cos(a), c + c * Math.sin(a)]); }
    for (let i = 0; i <= 6; i++) { const a = Math.PI / 4 + (i / 6) * Math.PI / 4; out.push([top + s * Math.cos(a), H - s + s * Math.sin(a)]); }
    out.push([0, H]);
    return out;
  }

  /* The socket with its holes, and a bulge on its underside with a recess that holds the pin's nut. The bulge adds to the wall
     and takes nothing from it, because the socket is where a flat print snapped. The recess is open outward, so a nut of any
     thickness goes in, and its point is up as printed, so its roof needs no bridge. */
  function socketWithNut(K, solid, rods, sizes, front, wideY, face, soft) {
    if (!soft) return K.cut(solid, socketCuts(K, rods, sizes, front, wideY));
    const px = REAR + 7, bulge = K.at(K.turn(K.revolve(nutBulge()), [180, 0, 0]), [px, 0, -face]);
    return K.cut(K.fuse([solid, bulge]), [...socketCuts(K, rods, sizes, front, wideY), K.hex(px, 0, PIN_NUT.flats, -face - PIN_NUT.height - 1, -face)]);
  }

  /* Round the boom's axis when the rods lie flat, so that a mount's mast or grip stays upright. */
  const rollFor = (polar) => (polar === "horizontal" ? [90, 0, 0] : null);
  const rolled = (K, m, roll) => (roll ? K.turn(m, roll) : m);

  function mastMount(K, rods, sizes, roll, soft) {
    const front = MOUTH, sx0 = REAR - WALL, W2 = sizes.w + 2 * WALL + 2 * PLAY, H2 = sizes.sockH + 2 * WALL + 2 * PLAY;
    const { apex, w: VW } = CRADLE, VH = Math.max(CRADLE.h, (roll ? W2 : H2) + 10), vx0 = apex - 28, vx1 = apex + 12;
    let s = pipe(K, soft, sx0, front, W2 / 2, H2 / 2, SOFT.rim);
    s = socketWithNut(K, s, rods, sizes, front, W2 / 2, H2 / 2, soft);
    s = K.fuse([s, pipe(K, soft, vx1, sx0 + 0.01, W2 / 2, H2 / 2, 0)]);
    s = rolled(K, s, roll);
    let block = soft ? K.rbox(vx0, vx1, -VW / 2, VW / 2, -VH / 2, VH / 2, SOFT.block, SOFT.blockRim) : K.box(vx0, vx1, -VW / 2, VW / 2, -VH / 2, VH / 2);
    const back = apex - vx0 + 1;
    const cuts = [K.prism([[apex, 0], [vx0 - 1, -back], [vx0 - 1, back]], -VH / 2 - 1, VH / 2 + 1)];
    [-24, 10].forEach((z0) => cuts.push(K.box(apex + 4, apex + 8, -VW / 2 - 1, VW / 2 + 1, z0, z0 + 14)));     // hose-clamp slots, for bands up to 13 mm
    // the SMA bulkhead: a 4 mm wall with a 6.6 mm hole, a pocket behind it for the nut and the jumper
    const ys = VW / 2 - 9;
    cuts.push(K.cylX(vx1 - 4 - 0.01, ys, 0, 6.6, 5), K.cylX(vx0 - 1, ys, 0, 13, vx1 - 4 - (vx0 - 1)));
    block = K.cut(block, cuts);
    s = K.fuse([s, block]);
    const groove = rolled(K, K.box(vx1 - 0.5, sx0 + 0.5, W2 / 2 - 2.5, W2 / 2 + 1, -GROOVE / 2, GROOVE / 2), roll);    // the coax along the arm
    return K.cut(s, [groove]);
  }

  /* A socket, an arm behind the reflector, and a block for the hand or the tripod, all made with the rods upright. */
  function handGrip(K, rods, sizes, roll, soft) {
    const front = MOUTH, sx0 = REAR - WALL, half = GRIP.width / 2;
    const gx1 = -GRIP.back, gx0 = gx1 - GRIP.depth;
    // the head is square, as wide as the grip, so that the part lies flat on the bed whichever way the rods go
    const half2 = Math.max(half, sizes.sockH / 2 + PLAY + WALL);
    const sock = pipe(K, soft, sx0, front, half2, half2, SOFT.rim);
    let head = socketWithNut(K, sock, rods, sizes, front, half2, half2, soft);
    head = rolled(K, head, roll);
    const top = half2, bottom = -top, c = GRIP.chamfer;
    const arm = pipe(K, soft, gx1 - 0.01, sx0 + 0.01, half2, top, 0);
    // rounded on the side that prints up, and chamfered on the bed's side, where a round would hang in the air
    const round = (cy, a0) => Array.from({ length: 7 }, (_, i) => { const a = a0 + i / 6 * Math.PI / 2; return [gx1 - c + c * Math.cos(a), cy + c * Math.sin(a)]; });
    const grip = K.prism([[gx0 + c, -half2], [gx1 - c, -half2], ...round(-half2 + c, -Math.PI / 2), ...round(half2 - c, 0), [gx0 + c, half2], [gx0, half2 - c], [gx0, -half2 + c]], bottom - GRIP.length, top);
    // the grip at full width under the arm and the brace, whose edges would otherwise hang over its rounded corners
    const under = K.box(gx1 - c, gx1, -half2, half2, bottom - 22, top);
    const lanyard = K.cylY(gx0 + GRIP.depth / 2, -half2 - 1, bottom - GRIP.length + 10, 6, 2 * half2 + 2);
    // a brace in the corner under the arm, where a dropped or leaned-on antenna bends it across the layers
    const brace = K.turn(K.prism([[gx1 - 0.01, 0], [gx1 + 22, 0], [gx1 - 0.01, 22]], -half2, half2), [-90, 0, 0]);
    return K.cut(K.fuse([head, arm, grip, under, K.at(brace, [0, 0, bottom + 0.01])]), [lanyard]);
  }

  function tripodMount(K, rods, sizes, roll, soft) {
    const front = MOUTH, sx0 = REAR - WALL, W2 = sizes.w + 2 * WALL + 2 * PLAY, H2 = sizes.sockH + 2 * WALL + 2 * PLAY;
    const T = TRIPOD, half = T.size / 2, cx = -(T.back + half + 18);
    const yh = roll ? H2 / 2 : W2 / 2, zh = roll ? W2 / 2 : H2 / 2;
    let head = pipe(K, soft, sx0, front, W2 / 2, H2 / 2, SOFT.rim);
    head = socketWithNut(K, head, rods, sizes, front, W2 / 2, H2 / 2, soft);
    head = rolled(K, head, roll);
    const arm = pipe(K, soft, cx + half - SOFT.blockRim - 0.5, sx0 + 0.01, yh, zh, 0);      // down into the block, past its rounded edge
    const bw = Math.max(half, yh);                                                          // at least as wide as the arm, which mustn't hang over it
    const block = K.rbox(cx - half, cx + half, -bw, bw, -zh, zh, SOFT.block, SOFT.blockRim);
    let s = K.fuse([head, arm, block]);
    // a 1/4-20 tripod screw comes up from below into a nut sitting on the shelf
    s = K.cut(s, [K.cyl(cx, 0, -zh - 1, T.bolt, T.shelf + 2), K.hex(cx, 0, T.flats, -zh + T.shelf, zh + 1)]);
    return s;
  }

  /* The arm is the tripod mount's, with bolt holes where the nut would go. The two pieces are bolted because the socket
     wants to print pointing up and the thread wants to print tilted, and they're at right angles in use. */
  function poleArm(K, rods, sizes, roll, soft) {
    const front = MOUTH, sx0 = REAR - WALL, W2 = sizes.w + 2 * WALL + 2 * PLAY, H2 = sizes.sockH + 2 * WALL + 2 * PLAY;
    const T = TRIPOD, half = T.size / 2, cx = poleBehind();
    const yh = roll ? H2 / 2 : W2 / 2, zh = roll ? W2 / 2 : H2 / 2;
    let head = pipe(K, soft, sx0, front, W2 / 2, H2 / 2, SOFT.rim);
    head = socketWithNut(K, head, rods, sizes, front, W2 / 2, H2 / 2, soft);
    head = rolled(K, head, roll);
    const bw = Math.max(half, yh);      // at least as wide as the arm, which mustn't hang over it
    const s = K.fuse([head, pipe(K, soft, cx + half - SOFT.blockRim - 0.5, sx0 + 0.01, yh, zh, 0), K.rbox(cx - half, cx + half, -bw, bw, -zh, zh, SOFT.block, SOFT.blockRim)]);
    return K.cut(s, poleBolts(K, cx, -zh - 1, 2 * zh + 2));
  }

  /* The owner's own thread, unchanged, on a plate that bolts under the arm. Printed tilted, thread end up, on supports,
     as the proven one was: standing straight, a pole's sideways load would pull the boss's layers apart at its root. */
  function poleSocket(K) {
    const half = TRIPOD.size / 2, P = YS.POLE_SOCKET;
    const raw = K.fromData(P.positions, P.triangles), z0 = raw.boundingBox().min[2];
    const boss = K.at(raw, [0, 0, POLE.plate - 1 - z0]);    // its solid end a millimetre into the plate
    const plate = K.cut(K.turn(K.rbox(0, POLE.plate, -half, half, -half, half, SOFT.block, SOFT.rim), [0, -90, 0]), poleBolts(K, 0, -1, POLE.plate + 2));
    // a fillet where the boss meets the plate, which a sideways load bends most, and a rounded lip on the open end
    const r0 = P.radius, c = 3, top = POLE.plate - 1 + P.height, arc = (cx, cy, r, a0, a1) => Array.from({ length: 9 }, (_, i) => { const a = a0 + (a1 - a0) * i / 8; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
    const collar = K.revolve([[r0 - 1.5, POLE.plate - 0.01], [r0 + c, POLE.plate - 0.01], ...arc(r0 + c, POLE.plate + c, c, -Math.PI / 2, -Math.PI), [r0 - 1.5, POLE.plate + c]]);
    const lip = K.revolve([[r0, top - 1], [r0 + 1, top - 1], [r0 + 1, top + 1], [r0 - 1, top + 1], ...arc(r0 - 1, top - 1, 1, Math.PI / 2, 0)]);
    return K.cut(K.fuse([plate, boss, collar]), [lip]);
  }

  const poleBolts = (K, cx, z0, h) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => K.cyl(cx + a * POLE.bolts, b * POLE.bolts, z0, M3, h));
  /* Where the pole's axis ends up behind the reflector, as x. */
  const poleBehind = () => -(TRIPOD.back + TRIPOD.size / 2 + 18);

  /* ---------- the coupon ---------- */
  /** A row of holes for each rod size, to find the fit on this printer, and the boom's M3 hole and nut trap. */
  function coupon(K, rods, screws) {
    const sizes = [];
    rods.forEach((r) => { if (!sizes.find((s) => Math.abs(s.d - r.d) < 0.001)) sizes.push({ d: r.d, material: r.material }); });
    const OFFSETS = [-0.1, -0.05, 0, 0.05, 0.1], n = sizes.length, two = n === 2;
    const length = two ? 64 : 74, width = 2 + 12 * n, height = 12;
    let s = K.box(0, length, 0, width, 0, height);
    const cuts = [];
    sizes.forEach((rod, row) => {
      const y = 7 + 12 * row;
      const name = { aluminium: "AL", brass: "BR", copper: "CU" }[rod.material] || "AL";
      OFFSETS.forEach((off, i) => {
        const x = 17 + 10 * i;
        cuts.push(K.cyl(x, y, -1, rod.d + off, height + 2));
        if (row !== 0 && row !== n - 1) return;       // the notches count along the edge a row is next to
        const edge = row === 0 ? [-1, 1] : [width - 1, width + 1];
        for (let k = 0; k <= i; k++) cuts.push(K.box(x - 3.5 + 1.3 * k, x - 3.5 + 1.3 * k + 0.6, edge[0], edge[1], 9, 13));
      });
      name.split("").forEach((ch, j) => {
        (LETTERS[ch] || []).forEach((b) => cuts.push(K.bar(1.5 + 5 * j + b[0], y - 2.5 + b[1], 1.5 + 5 * j + b[2], y - 2.5 + b[3], height - 0.6, height + 1, 0.8)));
      });
    });
    const mx = two ? 7 : 69, my = two ? 13 : width / 2;
    cuts.push(K.cyl(mx, my, -1, M3_BOOM, height + 2), K.hex(mx, my, NUT_FLATS, -1, NUT_DEPTH));
    if (screws) {
      // the boom's screw holes, each from a face into a rod's hole as deep as the boom's, marked 1, 2 and 3 notches for the sizes
      s = K.fuse([s, K.box(-30, 0, 0, width, 0, height)]);
      const r = rods.find((q) => !q.driven) || rods[0], deep = BOOM_W / 2;
      SCREW.pilots.forEach((d, i) => {
        const x = -25 + 10 * i, rod = { x, hole: r.hole };
        cuts.push(K.cyl(x, deep, -1, r.hole, height + 2));
        cuts.push(...screwHole(K, rod, 0, deep, d).map((c) => K.at(c, [0, deep, height / 2])));
        for (let k = 0; k <= i; k++) cuts.push(K.box(x - 3.5 + 1.3 * k, x - 3.5 + 1.3 * k + 0.6, width - 1, width + 1, 9, 13));
      });
    }
    s = K.cut(s, cuts);
    return s;
  }

  /* ---------- what the page calls ---------- */
  const MOUNTS = {
    none: { name: "No mount" },
    mast: { name: "Mast or pole clamp", hardware: ["2 hose clamps, for bands up to 13 mm", "1 M3 x 30 bolt and nut, to pin the boom. The nut sits in the recess in the bulge under the socket"], print: "Stand it on the cradle, socket up, as the file has it. The V's sides are 45 degree overhangs, so it needs no supports." },
    pole: { name: "Painter pole", hardware: ["4 M3 x 40 bolts with nuts, joining the socket's plate to the arm", "1 M3 x 30 bolt and nut, to pin the boom. The nut sits in the recess in the bulge under the socket"], print: "Two pieces, each printed its best way. The arm stands on its block, socket up, and the pole socket lies tilted as the file has it, thread end up, the angle of the socket that's proven on a pole. Give it tree supports from the bed, and clear any from the thread." },
    grip: { name: "Hand grip", hardware: ["1 M3 x 40 bolt and nut, to pin the boom. The nut sits in the recess in the bulge under the socket", "Optional: a lanyard through the hole at the bottom"], print: "Stand it as the file has it, with the grip lying on the bed and the socket pointing up, and no supports." },
    tripod: { name: "Camera tripod", hardware: ["1 M3 x 30 bolt and nut, to pin the boom. The nut sits in the recess in the bulge under the socket", "1 1/4-20 UNC nut, 7/16 in (11.1 mm) across flats, dropped into the top"], print: "Stand it on the block, socket up, as the file has it, with no supports." },
  };

  /**
   * Plans the parts without making any: the sections, the gauge's marks and any warnings, for the page to show as you type.
   * opts: { bed, fit, scale, allowance, gauge, label, mount, screws, pilot }
   */
  function planParts(design, opts) {
    const o = Object.assign({ bed: 256, fit: FIT, scale: 1, allowance: 0, gauge: true, notches: true, label: true, mount: "mast", screws: false, pilot: SCREW.pilot }, opts);
    const rods = rodsOf(design, o.fit), sizes = boomSizes(rods), warnings = [];
    if (rods.length < 2) throw new Error("A boom needs at least two rods.");
    rods.forEach((r, i) => {
      if (i && r.x - rods[i - 1].x < r.hole / 2 + rods[i - 1].hole / 2 + 4) throw new Error(`${r.name} is too close to ${rods[i - 1].name} for the boom to hold them both.`);
    });
    const bed = YS.bedOf(o.bed);
    if (sizes.h > bed.z) throw new Error(`The boom stands ${sizes.h} mm tall as it prints, and your printer's height is ${bed.z} mm.`);
    // the taper depends on where the first joint goes, and the first piece's lean on the bed on the taper, so plan again with room for it
    const layout = (b, cleanFirst) => {
      let sections = planSections(rods, b, o.scale, sizes, 0, cleanFirst), taper = planTaper(rods, sections, sizes), less = 0;
      for (let i = 0; i < 4; i++) {
        const over = leanLength(taper, sections[0], sizes.h) - (sections[0].x1 - sections[0].x0);
        if (sections.length === 1 || over <= less + 1e-6) break;
        less = over + 0.2;
        sections = planSections(rods, b, o.scale, sizes, less, cleanFirst);
        taper = planTaper(rods, sections, sizes);
      }
      return { sections, taper };
    };
    // A joint with no rod in its tongue is kept unless letting a rod through it (the owner's choice, 2026-11-06) saves a piece,
    // or, with as many pieces, keeps more of the gauge's marks.
    const marksOf = (L) => { const g = o.gauge ? planGauge(design, rods, L.sections[0], sizes, o.allowance, L.taper) : null; return g && g.fits ? g.marks.length : 0; };
    const choose = (b) => {
      let clean = null, open = null;
      try { clean = layout(b, true); } catch (e) { open = layout(b, false); return open; }
      try { open = layout(b, false); } catch (e) { return clean; }
      const better = open.sections.length < clean.sections.length || (open.sections.length === clean.sections.length && marksOf(open) > marksOf(clean));
      return better ? open : clean;
    };
    const { sections, taper } = choose(bed);
    sizes.taper = taper; sizes.sockH = 2 * taper.half;
    if (taper.peak > bed.z) throw new Error(`The boom's first piece stands ${Math.ceil(taper.peak)} mm tall as it prints, where it widens for the driven element, and your printer's height is ${bed.z} mm.`);
    sections.forEach((s) => { s.place = YS.placeOn(bed, (s.i === 0 ? leanLength(taper, s, sizes.h) : s.x1 - s.x0) * o.scale + BRIM, s.wide * o.scale + BRIM, s.i === 0 ? taper.peak : sizes.h); });
    sections.forEach((s) => {
      if (!s.next || !s.next.through.length) return;
      warnings.push(`${s.next.through.map((r) => r.name).join(" and ")} ${s.next.through.length > 1 ? "go" : "goes"} through a joint's tongue, between the prongs, and its bolts have moved to clear ${s.next.through.length > 1 ? "them" : "it"}. Glue ${s.next.through.length > 1 ? "those rods" : "that rod"} in with CA, or use a wider spacing or a bigger bed to avoid it.`);
    });
    const driven0 = rods.find((r) => r.driven);
    if (driven0 && sections.some((s) => s.next && s.next.t < driven0.x)) warnings.push("A joint falls behind the driven element, so the coax's groove stops at it. Tape the coax along the outside of the joint.");
    if (driven0 && driven0.x >= taper.end) warnings.push("The driven element isn't on the boom's first piece, so the boom doesn't widen for it, and its halves pass through less plastic. A bigger bed would put it there.");
    else if (driven0 && taper.capped) warnings.push(`The driven element is close to ${sections.length > 1 ? "the joint" : "the boom's front end"}, so the boom can only widen to ${Math.round(2 * taper.hzD)} mm there, and each half of it passes through ${taper.grip.toFixed(0)} mm of plastic.`);
    if (o.screws && driven0 && !taper.drivenScrews) warnings.push("There's no room for screws in the driven element's halves, so they have none. The silicone in the window, or glue, holds them.");
    if (o.screws && sections.some((s) => s.next && s.next.through.length)) warnings.push("A rod through a joint's tongue has no screw hole, as the prongs are in the way. Glue it.");
    // what the other choice would do, so the page can say when corner to corner is worth trying
    let cornerPieces = null;
    if (!bed.corner) {
      try { cornerPieces = choose(Object.assign({}, bed, { corner: true })).sections.length; } catch (e) { cornerPieces = null; }
    }
    const boom = rods[rods.length - 1].x - REAR + FRONT;
    if (boom > FLOPPY) warnings.push(`At ${Math.round(boom)} mm, a printed boom will sag and flex. A metal or fibreglass boom suits this better, and metal changes the tuning.`);
    if (sizes.w > BOOM_W) warnings.push(`These rods are thick, so the boom grows to ${sizes.w} x ${sizes.h} mm, a size nobody has printed and tried yet.`);
    // the gauge and the notches are separate choices; the notches use the gauge's layout, and its labels only if it's on
    const top = o.gauge || o.notches ? planGauge(design, rods, sections[0], sizes, o.allowance, taper) : null;
    const gauge = o.gauge ? top : null;
    const notches = o.notches ? planNotches(gauge && gauge.fits ? gauge : Object.assign({}, top, { marks: [] }), sizes, rods) : null;
    if (gauge && !gauge.fits) warnings.push(gauge.reason);
    if (gauge && gauge.fits && gauge.missing) warnings.push(`${gauge.missing} rod${gauge.missing > 1 ? "s are" : " is"} too long for the gauge. Use the Cut list's guide for ${gauge.missing > 1 ? "those" : "it"}.`);
    if (gauge && gauge.fits && gauge.unlabelled.length) warnings.push(`There was no clear way to label ${gauge.unlabelled.join(", ")} on the gauge, so ${gauge.unlabelled.length > 1 ? "those marks have" : "that mark has"} no name. Counting along them still works.`);
    if (o.notches && !notches) warnings.push(`There's no clear ${CAL_SPAN} mm stretch on the first piece's top for the check notches, away from the gauge's labels, the rods and the driven element's window. To check the print's size instead, measure with calipers between the outsides of two rods' holes far apart, and compare with their spacing plus a hole's width.`);
    return { o, rods, sizes, sections, taper, gauge: gauge && gauge.fits ? gauge : null, notches, warnings, boom, bed, cornerPieces, onePiece: boom * o.scale + BRIM };
  }

  /** How to lay a part on the bed, in words, when the file as it opens won't do. Files always lie along x. */
  function placing(place, bed) {
    if (!place.fits) return place.why === "height" ? `It's too tall for your printer's ${bed.z} mm height.` : `It doesn't fit your ${bed.x} x ${bed.y} mm bed.`;
    if (place.how === "y") return `Turn it 90 degrees in the slicer, to lie along the bed's ${bed.y} mm side.`;
    if (place.how === "corner") return `Turn it ${+place.angle.toFixed(2)} degrees in the slicer, to lie corner to corner.`;
    return "";
  }

  /** Makes the solids. Returns [{ id, name, file, mesh, size, volume, print }] and the same plan as planParts. */
  function buildParts(wasm, design, opts) {
    const plan = planParts(design, opts), { o, rods, sizes, sections } = plan;
    const K = kit(wasm), out = [];
    const safe = design.name.replace(/[^\w-]+/g, "_");
    const add = (id, name, solid, turn, print) => {
      // inPlace, for tests: left where it sits on the antenna, unturned and unscaled, so that parts can be fitted together
      const placed = o.inPlace ? K.at(solid, [0, 0, 0]) : K.place(solid, turn, o.scale), b = placed.boundingBox();
      if (placed.status() !== "NoError") throw new Error(`${name} didn't come out as a solid: ${placed.status()}`);
      out.push({ id, name, file: `${safe}_${id}.stl`, mesh: K.mesh(placed), volume: placed.volume(), genus: placed.genus(),
        size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]], print });
      const p = out[out.length - 1];
      p.place = YS.placeOn(plan.bed, p.size[0] + BRIM, p.size[1] + BRIM, p.size[2]);
      p.placing = placing(p.place, plan.bed);
    };
    try {
      sections.forEach((sec) => {
        const solid = boomSection(K, sec, rods, sizes, { gauge: plan.gauge, notches: plan.notches, label: o.label, screws: o.screws, pilot: o.pilot });
        const nameIt = sections.length === 1 ? "Boom" : sec.i === 0 ? "Rear boom" : sec.i === sections.length - 1 ? "Front boom" : `Boom, section ${sec.i + 1}`;
        const id = sections.length === 1 ? "boom" : sec.i === 0 ? "boom_rear" : sec.i === sections.length - 1 ? "boom_front" : `boom_${sec.i + 1}`;
        // a tapered piece is turned to lie on its bottom face, which slopes by the taper's angle
        const T = plan.taper, lean = sec.i === 0 && T.m > 0;
        add(id, nameIt, solid, lean ? [0, T.ang, 0] : null, lean
          ? `As the file has it, lying on one of its sloped faces, so its rods' holes stand ${T.ang.toFixed(1)} degrees off vertical${sec.next ? ", and the joint's faces standing" : ""}. A brim helps.`
          : "As the file has it, lying flat with its side up, and the joint's faces standing. A brim helps.");
      });
      const roll = rollFor(design.polarization), soft = o.soft !== false;
      if (o.mount === "mast") add("mast_mount", MOUNTS.mast.name, mastMount(K, rods, sizes, roll, soft), [0, -90, 0], MOUNTS.mast.print);
      if (o.mount === "pole") {
        add("pole_arm", "Painter pole arm", poleArm(K, rods, sizes, roll, soft), [0, -90, 0], MOUNTS.pole.print);
        add("pole_socket", "Painter pole socket", poleSocket(K), [90 - POLE.tilt, 0, 0], MOUNTS.pole.print);
      }
      if (o.mount === "grip") add("hand_grip", MOUNTS.grip.name, handGrip(K, rods, sizes, roll, soft), [0, -90, 0], MOUNTS.grip.print);
      if (o.mount === "tripod") add("tripod_mount", MOUNTS.tripod.name, tripodMount(K, rods, sizes, roll, soft), [0, -90, 0], MOUNTS.tripod.print);
      if (o.coupon !== false) add("coupon", "Hole test coupon", coupon(K, rods, o.screws), null, "As the file has it. Print it on the same plate as the boom, so that it prints under the same conditions." + (o.screws ? ` Its end has the three screw hole sizes, ${SCREW.pilots.join(", ")} mm, marked with 1, 2 and 3 notches.` : ""));
    } finally {
      K.free();
    }
    return { parts: out, plan };
  }

  /** How far the mast's centre ends up behind the reflector in the clamp, for the design's mast setting. */
  const mastBehind = (d) => -CRADLE.apex + d * Math.SQRT1_2;

  /** What to print and buy, as text to keep with the files. */
  function partsNotes(design, result) {
    const { plan, parts } = result, { o, rods, sections } = plan, L = [];
    const joints = sections.length - 1, driven = rods.find((r) => r.driven);
    L.push(`${design.name}: printing and building`, "", "NEW AND UNTESTED: nothing from Yagi Studio's 3D print tab has been printed yet. Print one, measure it and test-fit it before you rely on it.", "", "PRINTING", `0.2 mm layers, 5 walls, 15% gyroid infill, in plain PETG or ASA, no supports.`, "Not carbon fiber filled filament: its fibers conduct, and around the rods they would detune the antenna and soak up power. Glass fiber filled should be fine for the antenna, but print a new coupon in it, as it shrinks differently.",
      `X-Y hole compensation ${HOLE_COMP} mm for the boom and coupon: their holes are modelled for it and come out too small without it. A mount's fine with or without it.`,
      o.scale === 1 ? "Set your filament's shrinkage in the slicer, or the lengths will be short." : `These are scaled ${(100 * o.scale).toFixed(2)}% across the bed for your printer's shrinkage. Leave the slicer's shrinkage at 100%.`, "");
    parts.forEach((p) => L.push(`${p.file}: ${p.size.map((v) => v.toFixed(1)).join(" x ")} mm. ${p.print}${p.placing ? " " + p.placing : ""}`));
    if (parts.some((p) => p.place && p.place.how === "corner")) L.push("", "CORNER TO CORNER: check that your slicer lets you use the plate's corners. Some printers keep an edge or a corner clear for purge lines, clips or the wipe tower.");
    if (plan.notches) L.push("", plan.gauge ? "CHECK THE PRINT BEFORE USING THE GAUGE" : "CHECK THE PRINT'S SIZE", `Set your calipers' outside jaws into the two notches on the boom's top and close them on the stretch of top between the notches, against the notches' inner walls. It should read ${CAL_SPAN.toFixed(2)} mm, within about 0.15 mm. If it's off, the gauge's marks are off by about the same share, so fix the shrinkage and reprint, or cut with calipers instead.`);
    if (plan.gauge) {
      L.push("", "CUTTING RODS WITH THE GAUGE", "Lay the rod in the V on top of the boom, with its end against the wall at the V's front end. It can run off the boom's rear end. Cut a little past its mark, toward the rear, then file to the mark. Measure the first rod with calipers before you trust the rest.");
      plan.gauge.marks.forEach((m) => L.push(`  ${m.rod}: ${m.length.toFixed(1)} mm`));
    }
    if (joints) L.push("", "THE JOINT" + (joints > 1 ? "S" : ""), "Slide the tongue into the fork, ridges into grooves, until it stops. If it binds, sand the ridges, not the tongue's faces. Tighten the bolts only until the prongs close on the V: too much bends them. A little glue on the faces makes it stronger if you'll never take it apart. If a rod passes through the tongue, slide the joint together before fitting that rod.");
    const T = plan.taper;
    if (driven) {
      L.push("", "THE DRIVEN ELEMENT", `Its window is ${T.win} mm long along the rods, so there's room to clip a heat sink, such as an alligator clip or hemostats, on each rod between the joint and the plastic. PETG softens at about 80 C and ASA at about 100 C, and brass carries heat fast, so keep the iron's touch short:`,
        "  1. Tin both rods' inner ends and the coax's core and shield before the rods go in the boom.",
        `  2. Slide the rods in and set the ${design.gap || 3} mm gap between them, centred in the window.`,
        "  3. Clip the heat sink on, touch each joint with a hot iron for about a second, and let it cool.",
        o.screws && T.drivenScrews ? "  4. Only then fit the two screws, so that they cut into cool plastic." : "  4. Let it cool fully before handling.",
        "  5. If you fill the window, use a neutral cure silicone: the kind that smells of vinegar is acid and attacks brass and copper. A deep pocket takes days to cure from its open face. Sweep and trim after it has cured, as it changes the tuning a little.");
    }
    if (o.screws) {
      const through = sections.flatMap((s) => (s.next ? s.next.through : []));
      const n = rods.filter((r) => !r.driven && !through.includes(r)).length + (driven && T.drivenScrews ? 2 : 0);
      L.push("", "SCREWS HOLDING THE RODS", `${n} holes in the boom's back, ${o.pilot} mm, under M3 so that the screw cuts its own thread. Check the size on the coupon first. A screw's tip reaches the rod about ${(plan.sizes.w / 2 - rods[0].hole / 2).toFixed(1)} mm in, so an M3 x 8 stands about 1.5 mm proud when it's tight. Turn it in only until it presses on the rod.`,
        "In the models, a screw at a rod's middle changes nothing, because it sits where the field across the rod is zero. The two on the driven element move the tuning by about 1 MHz. Fit them all before you trim on the VNA, and leave them in.");
    }
    if (o.mount !== "none") L.push("", "MOUNTING", `Push the boom's tail into the socket until it stops, and fit the pin. The socket ends ${-MOUTH} mm behind the reflector, so the reflector stays in the boom, glued if you like.`);
    L.push("", "HARDWARE");
    rods.forEach((r) => L.push(`  ${r.driven ? `${r.name}: 2 rods` : `${r.name}: 1 rod`}, ${r.d} mm ${r.material === "aluminium" ? "aluminum" : r.material}`));
    if (joints) {
      const grip = 2 * jointY(plan.sizes.w).thick - JOINT.bolt.headDepth - JOINT.bolt.nutDepth + JOINT.bolt.nut, bolt = [20, 25, 30, 35, 40, 50].find((n) => n >= grip) || Math.ceil(grip);
      L.push(`  ${2 * joints} M3 x ${bolt} socket-head bolts with nuts, across the joint${joints > 1 ? "s" : ""}. The heads and nuts sit in the recesses in the prongs`);
    }
    if (driven) L.push("  Coax, soldered at the window at the driven element, running back along the groove");
    if (o.screws) {
      const through = sections.flatMap((s) => (s.next ? s.next.through : []));
      const n = rods.filter((r) => !r.driven && !through.includes(r)).length + (driven && T.drivenScrews ? 2 : 0);
      L.push(`  ${n} M3 x 8 screws, steel or stainless, to hold the rods`);
    }
    (MOUNTS[o.mount].hardware || []).forEach((h) => L.push("  " + h));
    L.push("", "IF IT GOES ON A ROOF OR A MAST", "Look up first and stay well clear of power lines, including while raising it. Ground the mast and coax as your local rules require, and check any permits. Don't raise it in wind or near storms.");
    L.push("", "These parts come from Yagi Studio. They're a model's answer until you've swept the real antenna with a VNA.");
    return L.join("\n") + "\n";
  }

  /**
   * The vendored library, loaded the first time it's needed: its module and its binary are carried in the page as text.
   * In Node, tests give it directly.
   */
  let loading = null;
  function loadManifold() {
    if (loading) return loading;
    loading = (async () => {
      const code = document.getElementById("ys-manifold-js").textContent;
      const bin = atob(document.getElementById("ys-manifold-wasm").textContent.trim());
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      const mod = await import(url);
      URL.revokeObjectURL(url);
      // it never fetches with the binary in hand, but without locateFile it works out a URL from this blob's first, which fails
      return mod.default({ wasmBinary: bytes, locateFile: (f) => f });
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  Object.assign(YS, { PARTS: { MOUNTS, HOLE_COMP, CAL_SPAN, FIT, REAR, MOUTH, SCREW, WINDOW, POLE_BEHIND: -poleBehind(), POLE_TILT: POLE.tilt }, planParts, buildParts, partsNotes, mastBehind, loadManifold, partPlacing: placing });
  YS.PARTS.JOINT = JOINT;
})(typeof globalThis !== "undefined" ? globalThis : this);
