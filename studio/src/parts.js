/*
 * Printable parts made from the design on screen: the boom, in as many sections as the printer's bed needs, a mount
 * and a test coupon. The boom carries a gauge for cutting its own rods, two notches to check the print against
 * calipers, arrows and TOP saying which way up it goes, and Yagi Studio's name.
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
  const GROOVE = 3;                // the coax's slot through a mount's socket and along its arm, which print standing, for RG178 and the like
  const COAX = { depth: 2.5, floor: -1.5, inner: 1.6 };   // the coax's groove along the boom's +y face, mm: how deep, its flat floor's z, and its inside wall's height, under a 45 degree roof
  const WINDOW = [12, 15];         // the solder window at the driven element (x, z): long enough along the rods for a heat-sink clip beside the joint
  const WINDOW_SHORT = 10;         // its length along the rods where the boom can't widen there
  const TAPER_MAX = 5;             // degrees: the steepest the boom's faces slope toward the driven element, so its holes stay near vertical as it prints
  const SCREW = { pilots: [2.4, 2.6, 2.8], pilot: 2.6, lead: 3.1, leadLen: 1.5, wall: 2, head: 6 };   // M3 screws holding the rods: holes under M3 so a screw cuts its own thread, a lead-in to start it, the least plastic either side of one, and its head's size, which a label keeps clear of
  const SCREW_RELIEF = 0.15;       // mm per side a rod's hole is widened where a screw's hole meets it. There the two open to the boom's face, so the slicer doesn't count the rod's as a hole and leaves out its hole compensation, and the owner's rods stuck there (ASA booms, 2026-11-07)
  const SIDE_TEXT = { k: 1, pitch: 4.4, stroke: 0.8, tick: 2 };   // writing on the boom's sides: letters 5k mm tall, their spacing, the stroke, and how far a gauge mark runs down the side before its leader
  const ARROW = { half: 7, head: 3.5, stroke: 0.9, width: 8 };    // an up arrow on a side: half its length at most, its head, stroke and the room it takes along the boom
  const BRAND = "YAGI STUDIO";     // on the boom's side, if it's wanted
  const ROD_TEXT = { k: 0.8, stroke: 0.7, gap: 0.8 };   // each rod's length on the screws' side: letters 5k mm tall, the stroke, and the room kept from a screw's head
  const CUSTOM_MAX = 40;           // characters of the owner's own text on the boom's side
  const NAME_GAP = 4.5;            // mm between the gauge's names on the side, well over the 1.4 between letters, so that R and D1 don't read as RD1
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
  const CRADLE = { len: 40, w: 80, h: 60, seat: 20, half: 49.5, apexIn: 28.1 };   // the owner's v3 clamp (2026-11-10): the block behind the socket, its V's round seat (radius), the V's faces' angle off the boom, and the V's point in from the block's back
  const STRAP = { r: 28.67, t: 3.5, w: 16, z: 16, ahead: 2.74, exit: [24, 27] };   // its strap slots: an arc round the pole (mid radius, thickness), each 16 mm wide at z = +-16, the arc's centre ahead of the pole's, and the extra exits into the V for small poles (y)
  const FILLET = 5;                // mm: where the socket meets the clamp's block
  const BED_TILT = Math.atan2(8, 11) * 180 / Math.PI;   // degrees: the clamp prints lying on a chamfer across its block's corner and the socket's mouth
  const NUTS = { thin: { name: "Thin square nuts, 5.3 x 1.75 mm", flats: 5.3, t: 1.75 }, standard: { name: "Standard square nuts, 5.4 x 2.4 mm", flats: 5.4, t: 2.4 }, hex: { name: "Hex nuts, 5.5 mm across flats", flats: 5.5, t: 2.4 } };
  const NUT_SLOT = { play: 0.3, in: 10 };   // the tail's nut slots: room round a nut and in its thickness, and how far in from the top, the bottom, and the tail's end
  const TUNNEL = { d: 3.2, above: 0.5, exit: 6, bend: 26 };   // the coax's tunnel, for RG316: across, how far above the window's floor its inner side runs, where it leaves the coax's face in front of the reflector, and the bend's length

  /* Letters on a 3 x 5 grid, as bars, so each is a groove a nozzle can follow. */
  const LETTERS = {
    A: [[0, 0, 1.5, 5], [1.5, 5, 3, 0], [0.7, 1.8, 2.3, 1.8]], B: [[0, 0, 0, 5], [0, 5, 2.2, 5], [2.2, 5, 3, 4.2], [3, 4.2, 3, 3.3], [3, 3.3, 2.2, 2.5], [0, 2.5, 2.2, 2.5], [2.2, 2.5, 3, 1.7], [3, 1.7, 3, 0.8], [3, 0.8, 2.2, 0], [2.2, 0, 0, 0]],
    C: [[3, 5, 0, 5], [0, 5, 0, 0], [0, 0, 3, 0]], D: [[0, 0, 0, 5], [0, 5, 2, 5], [2, 5, 3, 4], [3, 4, 3, 1], [3, 1, 2, 0], [2, 0, 0, 0]],
    E: [[3, 5, 0, 5], [0, 5, 0, 0], [0, 0, 3, 0], [0, 2.5, 2.2, 2.5]], H: [[0, 0, 0, 5], [3, 0, 3, 5], [0, 2.5, 3, 2.5]], I: [[1.5, 0, 1.5, 5]],
    L: [[0, 0, 0, 5], [0, 0, 3, 0]], M: [[0, 0, 0, 5], [0, 5, 1.5, 2.5], [1.5, 2.5, 3, 5], [3, 5, 3, 0]], P: [[0, 0, 0, 5], [0, 5, 3, 5], [3, 5, 3, 2.5], [3, 2.5, 0, 2.5]],
    R: [[0, 0, 0, 5], [0, 5, 2.2, 5], [2.2, 5, 3, 4.2], [3, 4.2, 3, 3.3], [3, 3.3, 2.2, 2.5], [0, 2.5, 2.2, 2.5], [1.4, 2.5, 3, 0]],
    G: [[3, 5, 0, 5], [0, 5, 0, 0], [0, 0, 3, 0], [3, 0, 3, 2.5], [3, 2.5, 1.6, 2.5]], O: [[0, 0, 0, 5], [0, 5, 3, 5], [3, 5, 3, 0], [3, 0, 0, 0]],
    Y: [[0, 5, 1.5, 2.5], [3, 5, 1.5, 2.5], [1.5, 2.5, 1.5, 0]],
    S: [[3, 5, 0, 5], [0, 5, 0, 2.5], [0, 2.5, 3, 2.5], [3, 2.5, 3, 0], [3, 0, 0, 0]], T: [[0, 5, 3, 5], [1.5, 5, 1.5, 0]], U: [[0, 5, 0, 0], [0, 0, 3, 0], [3, 0, 3, 5]],
    0: [[0, 0, 0, 5], [0, 5, 3, 5], [3, 5, 3, 0], [3, 0, 0, 0]], 1: [[1.5, 0, 1.5, 5], [1.5, 5, 0.4, 3.9]], 2: [[0, 5, 3, 5], [3, 5, 3, 2.5], [3, 2.5, 0, 2.5], [0, 2.5, 0, 0], [0, 0, 3, 0]],
    3: [[0, 5, 3, 5], [3, 5, 3, 0], [3, 0, 0, 0], [0.8, 2.5, 3, 2.5]], 4: [[0, 5, 0, 2.5], [0, 2.5, 3, 2.5], [3, 5, 3, 0]], 5: [[3, 5, 0, 5], [0, 5, 0, 2.5], [0, 2.5, 3, 2.5], [3, 2.5, 3, 0], [3, 0, 0, 0]],
    6: [[3, 5, 0, 5], [0, 5, 0, 0], [0, 0, 3, 0], [3, 0, 3, 2.5], [3, 2.5, 0, 2.5]], 7: [[0, 5, 3, 5], [3, 5, 1, 0]], 8: [[0, 0, 0, 5], [0, 5, 3, 5], [3, 5, 3, 0], [3, 0, 0, 0], [0, 2.5, 3, 2.5]],
    9: [[3, 0, 3, 5], [3, 5, 0, 5], [0, 5, 0, 2.5], [0, 2.5, 3, 2.5]], "/": [[0, 0, 3, 5]], ".": [[1.5, 0, 1.5, 0.4]],
    // the rest of the alphabet and a little punctuation, for the owner's own text (2026-11-08)
    F: [[0, 0, 0, 5], [0, 5, 3, 5], [0, 2.5, 2.2, 2.5]], J: [[3, 5, 3, 0.8], [3, 0.8, 2.2, 0], [2.2, 0, 0.8, 0], [0.8, 0, 0, 0.8]],
    K: [[0, 0, 0, 5], [3, 5, 0, 2.2], [1, 2.9, 3, 0]], N: [[0, 0, 0, 5], [0, 5, 3, 0], [3, 0, 3, 5]],
    Q: [[0, 0, 0, 5], [0, 5, 3, 5], [3, 5, 3, 0], [3, 0, 0, 0], [1.8, 1.2, 3, 0]], V: [[0, 5, 1.5, 0], [1.5, 0, 3, 5]],
    W: [[0, 5, 0.7, 0], [0.7, 0, 1.5, 2.5], [1.5, 2.5, 2.3, 0], [2.3, 0, 3, 5]], X: [[0, 0, 3, 5], [0, 5, 3, 0]], Z: [[0, 5, 3, 5], [3, 5, 0, 0], [0, 0, 3, 0]],
    "-": [[0.5, 2.5, 2.5, 2.5]], "+": [[1.5, 1, 1.5, 4], [0, 2.5, 3, 2.5]], "(": [[2, 5, 1, 3.8], [1, 3.8, 1, 1.2], [1, 1.2, 2, 0]], ")": [[1, 5, 2, 3.8], [2, 3.8, 2, 1.2], [2, 1.2, 1, 0]],
    ":": [[1.5, 0.8, 1.5, 1.2], [1.5, 3.8, 1.5, 4.2]], ",": [[1.5, 0.6, 1, -0.4]], "'": [[1.5, 5, 1.5, 3.8]], "#": [[1, 0, 1, 5], [2, 0, 2, 5], [0, 1.7, 3, 1.7], [0, 3.3, 3, 3.3]],
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
  function planGauge(design, rods, section, sizes, allowance, taper, screws, lengths) {
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
    // On a tapered boom the tail's top slopes down behind the socket's mouth, so the V carries on along it to the rear end, as a
    // second V: then its only end is the wall, and nobody measures from the wrong end (the owner's catch, 2026-11-07).
    const tail = taper.m ? { x0: REAR - 1, x1: MOUTH + 0.5, px: MOUTH, pz: taper.hz(MOUTH), ang: -taper.ang } : null;
    // a 0 on the top just past the wall, on the V's line, where lengths are measured from
    const zero = { x: end + 1.2, y: sizes.chY - 1.75, k: 0.7 };
    const layout = { stop, end, vFrom, top: taper.hz(end), ang: taper.ang, marks: [], tail, zero };
    if (!fits.length) return Object.assign(layout, { fits: false, reason: "The rods are longer than this boom section, so the gauge doesn't fit. The Cut list's guide still works." });
    const missing = channels.length - fits.length;
    const { k, pitch, tick } = SIDE_TEXT, H = 5 * k, top = taper.hz(end), inner = sizes.chY + sizes.chHalf + 1;
    const marks = fits.map((c) => {
      const label = engravable(c.label), width = textWidth(label, k, pitch);
      return { rod: c.label, label, length: c.length, x: end - c.length, width };
    }).sort((a, b) => a.x - b.x);
    // spread the labels until they stop overlapping, keeping each group centred on its marks
    marks.forEach((m) => { m.lx = m.x; });
    for (let pass = 0; pass < 300; pass++) {
      let moved = false;
      for (let i = 0; i + 1 < marks.length; i++) {
        const a = marks[i], b = marks[i + 1], need = (a.width + b.width) / 2 + NAME_GAP - (b.lx - a.lx);
        if (need > 1e-3) { a.lx -= need / 2; b.lx += need / 2; moved = true; }
      }
      if (!moved) break;
    }
    // The names are on the side below the V, where the boom prints with no steps (the owner's choice, 2026-11-07: on the stepped
    // top they were small and hard to read). Each mark runs over the top's edge and down the side, then a leader slants to its
    // name. The farther the names had to spread, the deeper the row, so that the leaders stay steep enough to follow.
    const shift = Math.max(0, ...marks.map((m) => Math.abs(m.lx - m.x)));
    let drop = Math.min(9, Math.max(2.5, shift * 0.5 + 1.5)), rowTop = 0, rowBottom = 0;
    const setDrop = (d) => { drop = d; rowTop = top - tick - drop - 0.8; rowBottom = rowTop - H; };
    // the screws' heads are on this side too, at the rods' middles: names and leaders keep clear of them
    const heads = [], c = SCREW.head / 2 + 0.8;
    if (screws) {
      const through = section.next ? section.next.through : [];
      sectionRods(rods, section).forEach((r) => {
        if (through.includes(r)) return;
        (r.driven ? (taper.drivenScrews ? [-taper.zs, taper.zs] : []) : [0]).forEach((zc) => heads.push([flat(r.x), top - (taper.hz(r.x) - zc)]));
      });
    }
    // and so are the rods' lengths, in the level layout too
    const boxes = labelBlocks(lengths, section.i, 2.5).map(      // well clear, so that no name reads as a length's: R over the driven element's 73.0 did
      ([x0, x1, z0, z1]) => { const xm = (x0 + x1) / 2, d = taper.hz(xm); return [flat(x0), flat(x1), top - (d - z0), top - (d - z1)]; });
    const clear = (x0, x1, z0, z1) => heads.every(([hx, hz]) => x1 < hx - c || x0 > hx + c || z1 < hz - c || z0 > hz + c) && boxes.every(([p0, p1, q0, q1]) => x1 < p0 || x0 > p1 || z1 < q0 || z0 > q1);
    const inRange = (m, lx) => lx - m.width / 2 > stop && lx + m.width / 2 < end + GAUGE_WALL - 2;
    // the leader is a slanting line, so it's checked along its length rather than by the box round it
    const lineClear = (x0, z0, x1, z1) => { if (!heads.length && !boxes.length) return true; const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3) + 1; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; if (!clear(x - TICK, x + TICK, z - TICK, z + TICK)) return false; } return true; };
    const fitsAt = (m, lx) => inRange(m, lx) && clear(lx - m.width / 2, lx + m.width / 2, rowBottom, rowTop) && lineClear(m.x, top, m.x, top - tick) && lineClear(m.x, top - tick, lx, rowTop + 0.8);
    // The names are placed together, in their marks' order, NAME_GAP apart, each where it and its leader miss the screws' heads, so
    // that they move least in all; a name with nowhere to go is left off, which costs as much as moving one 100 mm. Searched
    // over every place for each name, carrying the last name placed: few enough names that this is quick.
    const place = () => {
      // per name, the states after it: where the last name placed sits, the cost so far, and the state it came from
      const layers = [];
      let prev = [{ x: -1e9, w: 0, cost: 0, from: -1, lx: null }];
      marks.forEach((m) => {
        const cur = prev.map((q, j) => ({ x: q.x, w: q.w, cost: q.cost + 100, from: j, lx: null }));
        for (let d = -30; d <= 30; d += 0.5) {
          const lx = m.x + d;
          if (!fitsAt(m, lx)) continue;
          let from = -1, cost = Infinity;
          prev.forEach((q, j) => { if (q.cost < cost && lx - q.x >= (q.w + m.width) / 2 + NAME_GAP) { cost = q.cost; from = j; } });
          if (from >= 0) cur.push({ x: lx, w: m.width, cost: cost + Math.abs(d), from, lx });
        }
        layers.push(cur); prev = cur;
      });
      let j = prev.reduce((b, q, i) => (q.cost < prev[b].cost ? i : b), 0);
      const cost = prev[j].cost;
      for (let i = marks.length - 1; i >= 0; i--) {
        const q = layers[i][j];
        marks[i].labelled = q.lx !== null; marks[i].lx = q.lx !== null ? q.lx : marks[i].x;
        j = q.from;
      }
      return cost;
    };
    // then the row's depth that moves them least, a little in favour of steeper leaders
    const want = drop;
    let best = null;
    for (let d = want; d >= 2.5 - 1e-9; d -= heads.length || boxes.length ? 0.5 : Infinity) {      // with nothing in the way, the first depth is best
      setDrop(d);
      const cost = place() + 0.5 * (want - d);
      if (!best || cost < best.cost - 1e-9) best = { cost, d };
    }
    setDrop(best.d); place();
    return { fits: true, stop, end, vFrom, top, ang: taper.ang, tail, zero, marks, inner, k, pitch, tick, drop, rowTop, H, unlabelled: marks.filter((m) => !m.labelled).map((m) => m.rod), missing };
  }

  /**
   * Each rod's length to cut, written on the screws' side (-y) beside its hole, so that a boom among several says which rods
   * it takes (the owner, 2026-11-08). Under the screw's head at the rod's middle; the driven element's two halves each get their
   * own, one above the middle and one below, between its screws. Theirs is the length to cut, with the trimming allowance, as
   * the gauge's DE mark and the Cut list give it: the driven element is trimmed by the VNA's readings, not to a length, so a
   * finished length would only be the model's guess (the owner's point). A rod in a joint, where the prongs or
   * the tongue's flare are, gets none. Returns the labels in the boom's own (x, z), and the rods left without one.
   */
  function planRodLabels(design, sections, rods, sizes, T, screws, allowance) {
    const out = [], missed = [], { gap } = ROD_TEXT, under = SCREW.head / 2 + gap;
    sections.forEach((sec) => {
      const a = sec.prev ? sec.prev.t + JOINT.down[1] + 1 : MOUTH + 1, b = sec.next ? sec.next.t - JOINT.flare[0] - 1 : sec.x1 - 1;
      const hz = (x) => (sec.i === 0 && T.m ? T.hz(x) : sizes.h / 2);
      sectionRods(rods, sec).forEach((r) => {
        const text = (r.driven ? (r.L + (allowance || 0) - (design.gap || 0)) / 2 : r.L).toFixed(1);
        // the driven element's labels sit between its screws, so they shrink if those are close to the middle
        const room = r.driven ? (screws && T.drivenScrews && sec.i === 0 ? T.zs - under : hz(r.x) - 1.2) - 1.5 : hz(r.x) - 1.2 - under;
        const k = Math.min(ROD_TEXT.k, room / 5), H = 5 * k, pitch = 4.4 * k, W = textWidth(text, k, pitch);
        // centred on the rod, or slid along to keep off a joint or the socket's mouth, as long as it still reaches the rod
        const x = Math.min(Math.max(r.x, a + W / 2), b - W / 2);
        if (k < 0.5 || b - a < W || Math.abs(x - r.x) > W / 2 - 1) return;
        const z0s = r.driven ? [1.5, -1.5 - H] : [-under - H];      // the halves' two well apart, so their points don't read as a colon
        z0s.forEach((z0) => out.push({ sec: sec.i, rod: r.name, driven: r.driven, x, z0, text, k, pitch, W, H }));
      });
    });
    rods.forEach((r) => { if (!out.some((l) => l.rod === r.name)) missed.push(r.name); });
    return { labels: out, missed };
  }
  const labelBlocks = (L, sec, m) => (L ? L.labels.filter((l) => l.sec === sec).map((l) => [l.x - l.W / 2 - m, l.x + l.W / 2 + m, l.z0 - m, l.z0 + l.H + m]) : []);

  /** The two notches, placed in the gauge's level layout. Carries the layout's tilt, to cut them with or without the gauge. */
  function planNotches(gauge, sizes, rods) {
    const [w] = CAL_NOTCH;
    // Clear of every rod's hole, and well clear of the driven element: there the window leaves only the plastic
    // gripping its halves, and a notch would cut into it (the owner's catch, 2026-11-06). Rods are placed in the gauge's level
    // layout, as the notches are.
    const flat = (x) => gauge.end - (gauge.end - x) / Math.cos((gauge.ang || 0) * Math.PI / 180);
    const keep = rods.map((r) => { const c = flat(r.x), half = r.driven ? WINDOW[0] / 2 + NOTCH_CLEAR_DRIVEN : r.hole / 2 + NOTCH_CLEAR; return [c - half, c + half]; });
    const hit = (a, b) => keep.some(([c0, c1]) => a < c1 && b > c0);      // the gauge's names are on the side, out of their way
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

  /* The coax's groove along the boom's side: a flat floor and a roof sloping up at 45 degrees to the face, so that it prints with
     no supports (the owner's catch, 2026-11-07: the square groove's flat roof took a row of them). A 1.8 mm coax lies on the
     floor against the inside wall, wholly inside the boom. */
  function coaxGroove(K, x0, x1, y) {
    const { depth: d, floor: f, inner: h } = COAX, top = f + h + d;
    return K.turn(K.prism([[y + 1, f], [y + 1, top + 1], [y, top], [y - d, f + h], [y - d, f]], x0, x1), [90, 0, 90]);    // drawn in (y, z), pushed along x
  }

  /* A bolt's hole, across the boom, with a 45 degree point on top so it prints without sagging. */
  const teardrop = (x, d) => [...arc(x, 0, d / 2, -225, 45, 32), [x, d / 2 * Math.SQRT2]];
  const hexUp = (x, flats) => { const r = flats / Math.sqrt(3); return [0, 1, 2, 3, 4, 5].map((k) => [x + r * Math.sin(k * Math.PI / 3), r * Math.cos(k * Math.PI / 3)]); };

  /* The coax's tunnel (the owner's tested tail, 2026-11-10): a teardrop, point up as the boom prints, from inside the driven element's
     window straight back under the boom, then bending gently out through the coax's face just in front of the reflector. Its inner
     side runs just above the window's floor, so the coax comes out low in the solder window. Made as hulls of thin teardrop slices along
     the path, each square to it, so the point stays up the whole way and it needs no supports. */
  function coaxTunnel(K, driven, w) {
    const r = TUNNEL.d / 2, yc = -2 + TUNNEL.above + r, x0 = driven.x - 2, xe = TUNNEL.exit, xb = Math.min(x0, xe + TUNNEL.bend);
    const yEnd = w / 2 + 2.5, pts = [];
    for (let x = x0; x > xb; x -= 2) pts.push([x, yc]);
    for (let i = 1; i <= 24; i++) { const u = i / 24; pts.push([xb - u * (xb - xe), yc + (yEnd - yc) * u * u]); }      // level where it leaves the straight, steepest where it breaks out, about 9 mm in front of the reflector
    const tear = [...steps(-225, 45, 16).map((d) => [r * Math.cos(d * Math.PI / 180), r * Math.sin(d * Math.PI / 180)]), [0, r * Math.SQRT2]];
    const slice = (p, q) => { const n = Math.hypot(q[0], q[1]), nx = -q[1] / n, ny = q[0] / n; return tear.map(([u, v]) => [p[0] + nx * u, p[1] + ny * u, v]); };
    const out = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], dir = [b[0] - a[0], b[1] - a[1]];
      out.push(K.hull([...slice(a, dir), ...slice(b, dir)]));
    }
    return K.fuse(out);
  }

  /* The tail's lock (the owner's tested tail, 2026-11-10): an M3 hole along its middle from its end through the vertical hole, and
     slots for captive nuts entered from the screws' side, centred on their holes so a long screw passes straight through: two across
     the vertical hole, 10 mm in from the top and the bottom, and one across the back hole, 10 mm in from the end. */
  function tailLock(K, T, nut) {
    const N = NUTS[nut] || NUTS.standard, px = REAR + 7, w = N.flats + NUT_SLOT.play, t = N.t + NUT_SLOT.play, far = w / 2, near = -60;
    const bot = T.zb(px), top = bot + T.Ht, zc = bot + T.Ht / 2;
    return [
      K.cylX(REAR - 1, 0, zc, M3_BOOM, px - REAR + 3),
      K.box(px - w / 2, px + w / 2, near, far, top - NUT_SLOT.in - t, top - NUT_SLOT.in),
      K.box(px - w / 2, px + w / 2, near, far, bot + NUT_SLOT.in, bot + NUT_SLOT.in + t),
      K.box(REAR + NUT_SLOT.in, REAR + NUT_SLOT.in + t, near, far, zc - w / 2, zc + w / 2),
    ];
  }

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
    // a tunnel when the driven element is on the first piece; past a joint, the old open groove
    if (driven && sec.i === 0 && driven.x <= b) cuts.push(coaxTunnel(K, driven, w));
    else if (driven && sec.x0 < driven.x) cuts.push(coaxGroove(K, sec.prev ? a : sec.x0 - 1, Math.min(driven.x, b), y));
    if (sec.i === 0) cuts.push(K.cyl(REAR + 7, 0, -zz, M3_BOOM, 2 * zz), ...tailLock(K, T, opts.nut));      // pins a mount
    // screws from the back, at each rod's middle, where they don't change the antenna; the driven element's either side of its window.
    // Not on a rod through a joint's tongue, where the prongs are in the way.
    if (opts.screws) {
      const through = sec.next ? sec.next.through : [];
      sectionRods(rods, sec).forEach((r) => {
        if (through.includes(r)) return;
        const at = r.driven ? (T.drivenScrews ? [-T.zs, T.zs] : []) : [0];
        const face = sec.prev && r.x > sec.prev.t && r.x < sec.prev.t + JOINT.down[1] ? outerY(J, sec.prev.t, r.x) : y;
        at.forEach((zc) => {
          cuts.push(...screwHole(K, r, zc, face, opts.pilot));
          // the rod's hole a little wider where the screw's meets it, from just under the screw's hole to just over its point
          const lo = zc - opts.pilot / 2 - 0.5, hi = zc + opts.pilot / 2 * Math.SQRT2 + 0.5;
          cuts.push(K.cyl(r.x, 0, lo, r.hole + 2 * SCREW_RELIEF, hi - lo));
        });
      });
    }
    s = K.cut(s, cuts);
    if (sec.i === 0 && (opts.gauge || opts.notches)) s = K.cut(s, gaugeCuts(K, opts.gauge, opts.notches, sizes));
    if (opts.faces && opts.faces.section === sec.i) s = K.cut(s, faceCuts(K, opts.faces, sizes));
    if (opts.custom && opts.custom.placed && opts.custom.placed.section === sec.i) s = K.cut(s, [customCut(K, opts.custom, sizes)]);
    if (opts.lengths) {
      // drawn in (x, z) on the -y face, pushed in along y, and turned onto it, as the gauge's names are
      const mine = opts.lengths.labels.filter((l) => l.sec === sec.i), Z0 = w / 2 - DEEP, Z1 = w / 2 + 1;
      if (mine.length) s = K.cut(s, [K.turn(K.fuse(mine.flatMap((l) => K.word(l.text, l.x - l.W / 2, l.z0, l.k, Z0, Z1, ROD_TEXT.stroke, l.pitch))), [90, 0, 0])]);
    }
    return s;
  }

  /* A V along the top, so it prints without supports and a rod lies true in it. Open along its top and off the rear end, like the
     marks, so that hole compensation can't move what sets a rod's length, and an uncut rod of any length can lie in it. */
  function gaugeCuts(K, g, notches, sizes) {
    // either may be off: g is the gauge, notches the check notches, and both share the same level layout and tilt
    const { w, chY, chHalf } = sizes, L = g || notches, top = L.top, out = [];
    if (g) out.push(K.turn(K.prism([[chY - chHalf - 0.5, top + 0.5], [chY + chHalf + 0.5, top + 0.5], [chY, top - chHalf]], g.vFrom, g.end), [90, 0, 90]));     // drawn in (y, z), and pushed along x
    if (g) out.push(...K.word("0", g.zero.x, g.zero.y, g.zero.k, top - DEEP, top + 1, TICK, 0));
    // the side's marks are drawn in (x, z) on the -y face, pushed in along y, and turned onto it
    const side = [], Z0 = w / 2 - DEEP, Z1 = w / 2 + 1;
    if (g) g.marks.forEach((m) => {
      out.push(K.box(m.x - TICK / 2, m.x + TICK / 2, -w / 2 - 1, g.inner, top - DEEP, top + 1));
      side.push(K.bar(m.x, top + 1, m.x, top - g.tick, Z0, Z1, TICK));
      if (!m.labelled) return;
      side.push(K.bar(m.x, top - g.tick, m.lx, g.rowTop + 0.8, Z0, Z1, TICK));
      side.push(...K.word(m.label, m.lx - m.width / 2, g.rowTop - g.H, g.k, Z0, Z1, SIDE_TEXT.stroke, g.pitch));
    });
    if (side.length) out.push(K.turn(K.fuse(side), [90, 0, 0]));
    if (notches) {
      const [nw, nd] = CAL_NOTCH;
      out.push(K.box(notches.from - nw, notches.from, notches.y0, w / 2 + 1, top - nd, top + 1));
      out.push(K.box(notches.to, notches.to + nw, notches.y0, w / 2 + 1, top - nd, top + 1));
    }
    // laid out level, then turned onto the sloped top about the V's front wall, which stays square to the V
    const cuts = L.ang ? [K.tilt(K.fuse(out), L.end, top, L.ang)] : out;
    // the V along the tail, drawn level at the mouth's crest and turned down onto the tail's top about it
    const T = g && g.tail;
    if (T) cuts.push(K.tilt(K.turn(K.prism([[chY - chHalf - 0.5, T.pz + 0.5], [chY + chHalf + 0.5, T.pz + 0.5], [chY, T.pz - chHalf]], T.x0, T.x1), [90, 0, 90]), T.px, T.pz, T.ang));
    return cuts;
  }

  /**
   * Where the arrows, TOP and the name go. Up arrows on both sides and TOP on the top replace THIS SIDE UP, which confused people
   * (the owner, 2026-11-07); TOP is the gauge's face, and the arrows point to it. They go on one piece, near its middle, clear of
   * the joints, the screws' heads, the driven element's window, the coax's groove, the gauge's names and the notches: the last
   * piece if they fit there, as its top is level, or else the one nearest the front where they do. Sides are -1 (-y, where the
   * screws go in) and 1 (+y, the coax's side).
   */
  function planFaces(sections, rods, sizes, T, gauge, notches, o) {
    if (!o.label && !o.brand) return null;
    let best = null;
    for (let i = sections.length - 1; i >= 0; i--) {
      const f = facesOn(sections[i], rods, sizes, T, gauge, notches, o);
      if (!best || f.warnings.length < best.warnings.length) best = f;
      if (!f.warnings.length) break;
    }
    return best;
  }

  /** What's free on a piece's sides and top: the plain stretch between its joints, and what's already there, as boxes in (x, z). */
  function faceSpace(sec, rods, sizes, T, gauge, notches, o) {
    const hzAt = (x) => (sec.i === 0 ? T.hz(x) : sizes.h / 2), all = 1e3, c = SCREW.head / 2 + 1;
    const a = sec.prev ? sec.prev.t + JOINT.down[1] + 1 : MOUTH + 2, b = sec.next ? sec.next.t - JOINT.flare[0] - 1 : sec.x1 - 1;
    const driven = rods.find((r) => r.driven), through = sec.next ? sec.next.through : [];
    const blocks = { "-1": labelBlocks(o.lengthLabels, sec.i, 1.5), 1: [], top: [] };
    if (o.screws) sectionRods(rods, sec).forEach((r) => {
      if (through.includes(r)) return;
      (r.driven ? (T.drivenScrews ? [-T.zs, T.zs] : []) : [0]).forEach((zc) => blocks["-1"].push([r.x - c, r.x + c, zc - c, zc + c]));
    });
    if (driven && driven.x >= sec.x0 && driven.x <= sec.x1) ["-1", 1].forEach((k) => blocks[k].push([driven.x - WINDOW[0] / 2 - 2, driven.x + WINDOW[0] / 2 + 2, -all, all]));
    if (driven && sec.x0 < driven.x) blocks[1].push([sec.x0 - 1, driven.x, COAX.floor - 1, COAX.floor + COAX.inner + COAX.depth + 1]);
    const onBoom = (L, xf) => L.end - (L.end - xf) * Math.cos((L.ang || 0) * Math.PI / 180);
    if (sec.i === 0 && gauge) {
      const xs = [];
      gauge.marks.forEach((m) => { xs.push(m.x); if (m.labelled) xs.push(m.lx - m.width / 2, m.lx + m.width / 2); });
      blocks["-1"].push([onBoom(gauge, Math.min(...xs)) - 2, onBoom(gauge, Math.max(...xs)) + 2, -all, all]);
      blocks.top.push([onBoom(gauge, gauge.end) - 1, onBoom(gauge, gauge.end) + 5, -all, all]);    // the 0
    }
    if (sec.i === 0 && notches) {
      const w = CAL_NOTCH[0];
      blocks.top.push([onBoom(notches, notches.from - w) - 1, onBoom(notches, notches.from) + 1, -all, all], [onBoom(notches, notches.to) - 1, onBoom(notches, notches.to + w) + 1, -all, all]);
    }
    const clear = (list, x0, x1, z0, z1) => x0 >= a && x1 <= b && list.every(([p0, p1, q0, q1]) => x1 < p0 || x0 > p1 || z1 < q0 || z0 > q1);
    const onSide = (k, x0, x1, z0, z1) => clear(blocks[k], x0, x1, z0, z1) && z1 <= Math.min(hzAt(x0), hzAt(x1)) - 1.5 && z0 >= 1.5 - Math.min(hzAt(x0), hzAt(x1));
    const near = (x) => { const xs = []; for (let d = 0; d <= b - a; d += 0.5) xs.push(x + d, x - d); return xs; };
    return { a, b, hzAt, blocks, clear, onSide, near };
  }

  function facesOn(sec, rods, sizes, T, gauge, notches, o) {
    const out = { section: sec.i, arrows: [], top: null, brand: null, warnings: [] };
    const { a, b, hzAt, blocks, clear, onSide, near } = faceSpace(sec, rods, sizes, T, gauge, notches, o), all = 1e3;
    const mid = (a + b) / 2;
    if (o.brand) {
      // full size on either side, or a little smaller if it must
      for (const k of [SIDE_TEXT.k, 0.8 * SIDE_TEXT.k]) {
        const pitch = 4.4 * k, W = textWidth(BRAND, k, pitch), zh = 2.5 * k + 0.6;
        for (const side of [1, -1]) {
          const x = near(mid).find((q) => onSide(side, q - W / 2 - 1, q + W / 2 + 1, -zh, zh));
          if (x === undefined) continue;
          out.brand = { side, x, k, pitch, W };
          blocks[side].push([x - W / 2 - 3, x + W / 2 + 3, -all, all]);
          break;
        }
        if (out.brand) break;
      }
      if (!out.brand) out.warnings.push("There's no clear stretch of the boom's side for Yagi Studio's name, so it's left off.");
    }
    if (o.label) {
      const w2 = ARROW.width / 2 + 0.5, half = (x) => Math.min(ARROW.half, Math.min(hzAt(x - w2), hzAt(x + w2)) - 3);
      const ok = (side, x) => half(x) >= 4 && onSide(side, x - w2, x + w2, -half(x), half(x));
      const start = out.brand ? out.brand.x + out.brand.W / 2 + 3 + w2 : mid;
      const both = near(start).find((x) => ok(-1, x) && ok(1, x));
      [-1, 1].forEach((side) => {
        const x = both !== undefined ? both : near(start).find((q) => ok(side, q));
        if (x === undefined) return out.warnings.push(`There's no clear spot on the boom's ${side < 0 ? "screws'" : "coax's"} side for its up arrow, so it's left off.`);
        out.arrows.push({ side, x, half: half(x) });
      });
      // TOP across the top, between the rods' holes and the +y edge, near the arrows
      const yLo = Math.max(...rods.map((r) => r.hole)) / 2 + 0.8, yHi = sizes.w / 2 - 0.8, k = Math.min(1, (yHi - yLo) / 5), pitch = 4.4 * k, W = textWidth("TOP", k, pitch);
      const x = near(out.arrows.length ? out.arrows[0].x : mid).find((q) => clear(blocks.top, q - W / 2 - 1, q + W / 2 + 1, 0, 0));
      if (x === undefined) out.warnings.push("There's no clear spot on the boom's top for TOP, so it's left off.");
      else out.top = { x, k, pitch, W, y0: yLo + (yHi - yLo - 5 * k) / 2, z: hzAt(x), ang: sec.i === 0 ? T.ang : 0 };
    }
    return out;
  }

  /**
   * The owner's own text (2026-11-08): a name, a call sign, a phone number, a club. Capitals, digits and a little punctuation,
   * along a side wherever there's a clear stretch, the last piece first, clear of the arrows and the name; smaller if it must.
   */
  function planCustom(sections, rods, sizes, T, gauge, notches, o, faces) {
    const raw = String(o.customText || "").toUpperCase().replace(/\s+/g, " ").trim();
    if (!raw) return null;
    const dropped = [...new Set(raw.split("").filter((ch) => ch !== " " && !LETTERS[ch]))];
    const kept = raw.split("").filter((ch) => ch === " " || LETTERS[ch]).join("").replace(/\s+/g, " ").trim();
    const text = kept.slice(0, CUSTOM_MAX).trim(), out = { text, placed: null, warnings: [] };
    if (dropped.length) out.warnings.push(`Your text can't include ${dropped.join(" ")}, so ${dropped.length > 1 ? "those were" : "that was"} left out.`);
    if (kept.length > CUSTOM_MAX) out.warnings.push(`Your text is cut to its first ${CUSTOM_MAX} characters.`);
    if (!text) return out;
    for (const k of [1, 0.8, 0.65]) {
      for (const sec of sections.slice().reverse()) {
        const F = faceSpace(sec, rods, sizes, T, gauge, notches, o);
        if (faces && faces.section === sec.i) {
          if (faces.brand) F.blocks[faces.brand.side].push([faces.brand.x - faces.brand.W / 2 - 3, faces.brand.x + faces.brand.W / 2 + 3, -1e3, 1e3]);
          faces.arrows.forEach((A) => F.blocks[A.side].push([A.x - ARROW.width / 2 - 3, A.x + ARROW.width / 2 + 3, -1e3, 1e3]));
        }
        const pitch = 4.4 * k, W = textWidth(text, k, pitch), zh = 2.5 * k + 0.6;
        for (const side of [1, -1]) {
          const x = F.near((F.a + F.b) / 2).find((q) => F.onSide(side, q - W / 2 - 1, q + W / 2 + 1, -zh, zh));
          if (x !== undefined) { out.placed = { section: sec.i, side, x, k, pitch, W }; return out; }
        }
      }
    }
    out.warnings.push(`There's no clear stretch on the boom's sides long enough for "${text}". Shorten it, or leave off Yagi Studio's name to make room.`);
    return out;
  }

  /* The owner's text, cut as the name is: drawn on the -y face, and turned half round for the +y face. */
  function customCut(K, C, sizes) {
    const P = C.placed, Z0 = sizes.w / 2 - DEEP, Z1 = sizes.w / 2 + 1;
    const m = K.turn(K.fuse(K.word(C.text, -P.W / 2, -2.5 * P.k, P.k, Z0, Z1, SIDE_TEXT.stroke, P.pitch)), [90, 0, 0]);
    return K.at(P.side < 0 ? m : K.turn(m, [0, 0, 180]), [P.x, 0, 0]);
  }

  /* The arrows, TOP and the name, as planFaces placed them. Writing on a side is drawn on the -y face, reading from outside it,
     and turned half round about z for the +y face, so that it reads from outside that one too. */
  function faceCuts(K, F, sizes) {
    const Z0 = sizes.w / 2 - DEEP, Z1 = sizes.w / 2 + 1, out = [];
    const onSide = (side, x, parts) => { const m = K.turn(K.fuse(parts), [90, 0, 0]); return K.at(side < 0 ? m : K.turn(m, [0, 0, 180]), [x, 0, 0]); };
    if (F.brand) { const B = F.brand; out.push(onSide(B.side, B.x, K.word(BRAND, -B.W / 2, -2.5 * B.k, B.k, Z0, Z1, SIDE_TEXT.stroke, B.pitch))); }
    F.arrows.forEach((A) => {
      const { head, stroke } = ARROW, L = A.half;
      out.push(onSide(A.side, A.x, [K.bar(0, -L, 0, L, Z0, Z1, stroke), K.bar(0, L, -head * 0.86, L - head, Z0, Z1, stroke), K.bar(0, L, head * 0.86, L - head, Z0, Z1, stroke)]));
    });
    if (F.top) {
      const T = F.top, m = K.fuse(K.word("TOP", T.x - T.W / 2, T.y0, T.k, T.z - DEEP, T.z + 1, SIDE_TEXT.stroke, T.pitch));
      out.push(T.ang ? K.tilt(m, T.x, T.z, T.ang) : m);      // on a tapered piece, turned onto its sloped top
    }
    return out;
  }

  /* ---------- mounts ----------
     Every socket prints standing, its opening up. The DuvYagi's handle adapter, printed flat with its socket's roof
     bridged, snapped along the layers at that roof when the boom was pushed in. Standing, the walls run the whole way
     round each layer, and printed that way it held. */
  /* The socket over the boom's tail, with an M3 through its walls. It stops behind the reflector, which stays in the boom. Its faces
     are parallel to the tail's, tilted with the taper, and the boom slides in along them. */
  function socketCuts(K, rods, sizes, front, wideY, noGroove) {
    const { w } = sizes, T = sizes.taper, y = w / 2 + PLAY;
    const at = (x, up) => T.zb(x) + (up ? T.Ht + PLAY : -PLAY);
    const cavity = K.acrossY([[REAR, at(REAR, 0)], [front + 1, at(front + 1, 0)], [front + 1, at(front + 1, 1)], [REAR, at(REAR, 1)]], -y, y);
    const out = [cavity, K.cyl(REAR + 7, 0, -60, M3, 120)];
    if (!noGroove) out.push(K.box(REAR, front + 1, w / 2 - 1, wideY + 1, -GROOVE / 2, GROOVE / 2));
    return out;
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

  /* The owner's v3 clamp (designed in Fusion from the mock-up, printed and tested on the DuvYagi, 2026-11-10). The socket runs straight
     into a block, with rounded corners where they meet. The block has a V with a round seat for the pole, two strap slots that curve
     round the pole and run out along the V's faces to the block's back corners, with extra exits into the V for a small pole, and an
     M3 along the boom's middle from the seat into the tail's back nut. It prints tilted, lying on a chamfer across one front corner of
     the block and the socket's mouth, so the socket's layers wrap round it; the slots then need supports. Pinned by short screws
     into the tail's nuts, or a long one straight through. */
  const clampAt = () => { const bx0 = REAR - WALL - CRADLE.len, apex = bx0 + CRADLE.apexIn; return { bx0, apex, px: apex - CRADLE.seat / Math.sin(CRADLE.half * Math.PI / 180) }; };

  function mastMount(K, rods, sizes, roll, soft) {
    const front = MOUTH, sx0 = REAR - WALL, W2 = sizes.w + 2 * WALL + 2 * PLAY, H2 = sizes.sockH + 2 * WALL + 2 * PLAY;
    const { bx0, px, apex } = clampAt(), VW = CRADLE.w, VH = Math.max(CRADLE.h, (roll ? W2 : H2) + 10), ry = (roll ? H2 : W2) / 2, rz = (roll ? W2 : H2) / 2;
    let sock = K.box(sx0 - 0.01, front, -W2 / 2, W2 / 2, -H2 / 2, H2 / 2);
    sock = K.cut(sock, socketCuts(K, rods, sizes, front, W2 / 2, true));
    sock = rolled(K, sock, roll);
    const block = K.box(bx0, sx0, -VW / 2, VW / 2, -VH / 2, VH / 2);
    // rounded where the socket meets the block, on all four sides
    const F = FILLET, fil = [];
    [-1, 1].forEach((sg) => {
      fil.push(K.cut(K.box(sx0 - 0.01, sx0 + F, sg > 0 ? ry - 0.01 : -ry - F, sg > 0 ? ry + F : -ry + 0.01, -rz, rz), [K.cyl(sx0 + F, sg * (ry + F), -rz - 1, 2 * F, 2 * rz + 2)]));
      fil.push(K.cut(K.box(sx0 - 0.01, sx0 + F, -ry, ry, sg > 0 ? rz - 0.01 : -rz - F, sg > 0 ? rz + F : -rz + 0.01), [K.cylY(sx0 + F, -ry - 1, sg * (rz + F), 2 * F, 2 * ry + 2)]));
    });
    let s = K.fuse([sock, block, ...fil]);
    if (!roll) s = K.cut(s, socketCuts(K, rods, sizes, front, W2 / 2, true));      // the fillets mustn't close the socket's end
    const cuts = [];
    // the V, its point rounded into a seat
    const t = Math.tan(CRADLE.half * Math.PI / 180), back = bx0 - 1, wide = (apex - back) * t, seat = [], vz = VH / 2 + 1;
    for (let i = 0; i < 48; i++) { const a = i / 48 * 2 * Math.PI; seat.push([px + CRADLE.seat * Math.cos(a), CRADLE.seat * Math.sin(a)]); }
    cuts.push(K.hull([...seat, [back, -wide], [back, wide]].flatMap(([x, y]) => [[x, y, -vz], [x, y, vz]])));
    // the strap slots: an arc round the pole, legs out along the V's faces, and exits into the V
    const cx = px + STRAP.ahead, ang = 90 - CRADLE.half, c = Math.cos(CRADLE.half * Math.PI / 180), sn = Math.sin(CRADLE.half * Math.PI / 180);
    [-1, 1].forEach((zs) => {
      const z0 = zs * STRAP.z - STRAP.w / 2, z1 = z0 + STRAP.w, arcPts = steps(-ang, ang, 24).map((d) => [cx + STRAP.r * Math.cos(d * Math.PI / 180), STRAP.r * Math.sin(d * Math.PI / 180)]);
      for (let i = 0; i + 1 < arcPts.length; i++) cuts.push(K.bar(arcPts[i][0], arcPts[i][1], arcPts[i + 1][0], arcPts[i + 1][1], z0, z1, STRAP.t));
      [-1, 1].forEach((sy) => {
        const p = arcPts[sy > 0 ? arcPts.length - 1 : 0], L = (VW / 2 + 2 - Math.abs(p[1])) / sn;
        cuts.push(K.bar(p[0], p[1], p[0] - c * L, p[1] + sy * sn * L, z0, z1, STRAP.t));
        const ym = (STRAP.exit[0] + STRAP.exit[1]) / 2, xl = p[0] - c * (ym - Math.abs(p[1])) / sn;
        cuts.push(K.box(back, xl, sy > 0 ? STRAP.exit[0] : -STRAP.exit[1], sy > 0 ? STRAP.exit[1] : -STRAP.exit[0], z0, z1));
      });
    });
    // the M3 from the seat into the tail's back nut, its head in a recess opening into the seat
    const zc = sizes.taper.zb(REAR + 7) + sizes.taper.Ht / 2;
    cuts.push(K.cylX(px, 0, zc, M3, REAR + 2 - px), K.cylX(px, 0, zc, 7.15, sx0 - 14 - px));
    // the corner the print lies on, across the block and the socket's mouth, and the other front corner's chamfer
    const A = [sx0 - 11, -VW / 2], n = Math.hypot(11, 8), u = [11 / n, 8 / n], o = [u[1], -u[0]];
    const far = (k, m) => [A[0] + u[0] * k + o[0] * m, A[1] + u[1] * k + o[1] * m];
    cuts.push(K.prism([far(-200, 0), far(200, 0), far(200, 200), far(-200, 200)], -vz - 50, vz + 50));
    cuts.push(K.prism([[sx0 + 0.5, VW / 2 - 11], [sx0 + 0.5, VW / 2 + 1], [sx0 - 8.7, VW / 2 + 1]], -vz, vz));
    return K.cut(s, cuts);
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
    mast: { name: "Mast or pole clamp", tested: true, hardware: ["2 worm-drive hose clamps, bands up to 15 mm (1/2 in is 12.7 mm)", "2 M3 x 16 screws, one from the top and one from the bottom, into the nuts in the boom's tail. Or 1 M3 x 50 straight through, with a nut", "1 M3 x 30 socket-head screw, from the pole's seat into the nut in the tail's end. Its head sits in the recess in the seat", "3 M3 nuts of the kind chosen for the tail, pushed into its slots from the screws' side"],
      print: "Print it tilted, lying on the chamfer across the block's corner and the socket's mouth, as the file has it, so the socket's layers wrap all the way round. ASA, 5 walls, 40-50% gyroid infill. The strap slots need supports inside them. Clearing the supports out of the slots takes some work with pliers and a pick, but it's doable. Check a strap slides through every slot before it goes outside." },
    pole: { name: "Painter pole", hardware: ["4 M3 x 40 bolts with nuts, joining the socket's plate to the arm", "1 M3 x 30 bolt and nut, to pin the boom. The nut sits in the recess in the bulge under the socket"], print: "Two pieces, each printed its best way. The arm stands on its block, socket up, and the pole socket lies tilted as the file has it, thread end up, the angle of the socket that's proven on a pole. Give it tree supports from the bed, and clear any from the thread." },
    grip: { name: "Hand grip", hardware: ["1 M3 x 40 bolt and nut, to pin the boom. The nut sits in the recess in the bulge under the socket", "Optional: a lanyard through the hole at the bottom"], print: "Stand it as the file has it, with the grip lying on the bed and the socket pointing up, and no supports." },
    tripod: { name: "Camera tripod", hardware: ["1 M3 x 30 bolt and nut, to pin the boom. The nut sits in the recess in the bulge under the socket", "1 1/4-20 UNC nut, 7/16 in (11.1 mm) across flats, dropped into the top"], print: "Stand it on the block, socket up, as the file has it, with no supports." },
  };

  /**
   * Plans the parts without making any: the sections, the gauge's marks and any warnings, for the page to show as you type.
   * opts: { bed, fit, scale, allowance, gauge, notches, label, brand, lengths, customText, mount, screws, pilot }
   */
  function planParts(design, opts) {
    const o = Object.assign({ bed: 256, fit: FIT, scale: 1, allowance: 0, gauge: true, notches: true, label: true, brand: true, lengths: true, customText: "", mount: "mast", screws: false, pilot: SCREW.pilot, nut: "standard" }, opts);
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
    const lengthsFor = (sections, taper) => (o.lengths ? planRodLabels(design, sections, rods, sizes, taper, o.screws, o.allowance) : null);
    const marksOf = (L) => { const g = o.gauge ? planGauge(design, rods, L.sections[0], sizes, o.allowance, L.taper, o.screws, lengthsFor(L.sections, L.taper)) : null; return g && g.fits ? g.marks.length : 0; };
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
    const lengths = lengthsFor(sections, taper);
    if (lengths && lengths.missed.length) warnings.push(`${lengths.missed.join(" and ")} ${lengths.missed.length > 1 ? "have" : "has"} no length written beside ${lengths.missed.length > 1 ? "them" : "it"}: ${lengths.missed.length > 1 ? "they're" : "it's"} in a joint, or there's no room. The Cut list has every length.`);
    const top = o.gauge || o.notches ? planGauge(design, rods, sections[0], sizes, o.allowance, taper, o.screws, lengths) : null;
    const gauge = o.gauge ? top : null;
    const notches = o.notches ? planNotches(gauge && gauge.fits ? gauge : Object.assign({}, top, { marks: [] }), sizes, rods) : null;
    if (gauge && !gauge.fits) warnings.push(gauge.reason);
    if (gauge && gauge.fits && gauge.missing) warnings.push(`${gauge.missing} rod${gauge.missing > 1 ? "s are" : " is"} too long for the gauge. Use the Cut list's guide for ${gauge.missing > 1 ? "those" : "it"}.`);
    if (gauge && gauge.fits && gauge.unlabelled.length) warnings.push(`There was no clear way to label ${gauge.unlabelled.join(", ")} on the gauge, so ${gauge.unlabelled.length > 1 ? "those marks have" : "that mark has"} no name. Counting along them still works.`);
    const faces = planFaces(sections, rods, sizes, taper, gauge && gauge.fits ? gauge : null, notches, Object.assign({}, o, { lengthLabels: lengths }));
    if (faces) warnings.push(...faces.warnings);
    const custom = planCustom(sections, rods, sizes, taper, gauge && gauge.fits ? gauge : null, notches, Object.assign({}, o, { lengthLabels: lengths }), faces);
    if (custom) warnings.push(...custom.warnings);
    if (o.notches && !notches) warnings.push(`There's no clear ${CAL_SPAN} mm stretch on the first piece's top for the check notches, away from the rods and the driven element's window. To check the print's size instead, measure with calipers between the outsides of two rods' holes far apart, and compare with their spacing plus a hole's width.`);
    return { o, rods, sizes, sections, taper, gauge: gauge && gauge.fits ? gauge : null, notches, faces, lengths, custom, warnings, boom, bed, cornerPieces, onePiece: boom * o.scale + BRIM };
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
      // a turn can be a function, for turns about more than one axis in an order of its own
      const placed = o.inPlace ? K.at(solid, [0, 0, 0]) : typeof turn === "function" ? K.place(turn(solid), null, o.scale) : K.place(solid, turn, o.scale), b = placed.boundingBox();
      if (placed.status() !== "NoError") throw new Error(`${name} didn't come out as a solid: ${placed.status()}`);
      out.push({ id, name, file: `${safe}_${id}.stl`, mesh: K.mesh(placed), volume: placed.volume(), genus: placed.genus(),
        size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]], print });
      const p = out[out.length - 1];
      p.place = YS.placeOn(plan.bed, p.size[0] + BRIM, p.size[1] + BRIM, p.size[2]);
      p.placing = placing(p.place, plan.bed);
    };
    try {
      sections.forEach((sec) => {
        const solid = boomSection(K, sec, rods, sizes, { gauge: plan.gauge, notches: plan.notches, faces: plan.faces, lengths: plan.lengths, custom: plan.custom, screws: o.screws, pilot: o.pilot, nut: o.nut });
        const nameIt = sections.length === 1 ? "Boom" : sec.i === 0 ? "Rear boom" : sec.i === sections.length - 1 ? "Front boom" : `Boom, section ${sec.i + 1}`;
        const id = sections.length === 1 ? "boom" : sec.i === 0 ? "boom_rear" : sec.i === sections.length - 1 ? "boom_front" : `boom_${sec.i + 1}`;
        // a tapered piece is turned to lie on its bottom face, which slopes by the taper's angle
        const T = plan.taper, lean = sec.i === 0 && T.m > 0;
        add(id, nameIt, solid, lean ? [0, T.ang, 0] : null, lean
          ? `As the file has it, lying on one of its sloped faces, so its rods' holes stand ${T.ang.toFixed(1)} degrees off vertical${sec.next ? ", and the joint's faces standing" : ""}. A brim helps.`
          : "As the file has it, lying flat with its side up, and the joint's faces standing. A brim helps.");
      });
      const roll = rollFor(design.polarization), soft = o.soft !== false;
      // turned so the chamfer it lies on faces down: about z to square it with y, then -y onto the bed
      if (o.mount === "mast") add("mast_mount", MOUNTS.mast.name, mastMount(K, rods, sizes, roll, soft), (m) => K.turn(K.turn(m, [0, 0, -BED_TILT]), [90, 0, 0]), MOUNTS.mast.print);
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
  const mastBehind = (d) => { const { px } = clampAt(), R = CRADLE.seat; return d <= 2 * R ? -(px + R - d / 2) : -px + (d / 2 - R) / Math.sin(CRADLE.half * Math.PI / 180); };

  /** What to print and buy, as text to keep with the files. */
  function partsNotes(design, result) {
    const { plan, parts } = result, { o, rods, sections } = plan, L = [];
    const joints = sections.length - 1, driven = rods.find((r) => r.driven);
    L.push(`${design.name}: printing and building`, "", "TESTED: a boom from this tab has been printed in ASA, built into a working antenna and tuned, with its joint, gauge, check notches and screw holes, and the mast clamp, with the boom's tail (its nut slots and coax tunnel). NOT YET PRINTED: the other mounts, and the rod lengths written on the boom's side. Test-fit those before you rely on them.", "", "PRINTING", `The boom: 0.2 mm layers, 5 walls, 15% gyroid infill, in plain PETG or ASA, no supports.`, ...(o.mount === "mast" ? ["The mast clamp: ASA, 5 walls, 40-50% gyroid infill, printed tilted as the file has it, with supports in its strap slots (below)."] : []), "Not carbon fiber filled filament: its fibers conduct, and around the rods they would detune the antenna and soak up power. Glass fiber filled should be fine for the antenna, but print a new coupon in it, as it shrinks differently.",
      `X-Y hole compensation ${HOLE_COMP} mm for the boom and coupon: their holes are modelled for it and come out too small without it. A mount's fine with or without it.`,
      o.scale === 1 ? "Set your filament's shrinkage in the slicer, or the lengths will be short. For SUNLU ASA it's estimated at 99.65%, from a printed boom. Other brands differ." : `These are scaled ${(100 * o.scale).toFixed(2)}% across the bed for your printer's shrinkage. Leave the slicer's shrinkage at 100%.`, "");
    parts.forEach((p) => L.push(`${p.file}: ${p.size.map((v) => v.toFixed(1)).join(" x ")} mm. ${p.print}${p.placing ? " " + p.placing : ""}`));
    if (parts.some((p) => p.place && p.place.how === "corner")) L.push("", "CORNER TO CORNER: check that your slicer lets you use the plate's corners. Some printers keep an edge or a corner clear for purge lines, clips or the wipe tower.");
    if (plan.notches) L.push("", plan.gauge ? "CHECK THE PRINT BEFORE USING THE GAUGE" : "CHECK THE PRINT'S SIZE", `Set your calipers' outside jaws into the two notches on the boom's top and close them on the stretch of top between the notches, against the notches' inner walls. It should read ${CAL_SPAN.toFixed(2)} mm, within about 0.15 mm. If it's off, the gauge's marks are off by about the same share, so fix the shrinkage and reprint, or cut with calipers instead.`);
    if (plan.gauge) {
      L.push("", "CUTTING RODS WITH THE GAUGE", "Lay the rod in the V on top of the boom, with its end against the wall at the V's front end, by the 0. It can run off the boom's rear end. Each mark runs over the edge and down the side to its rod's name. Each mark is 0.6 mm wide and its middle is the length: its edge toward the 0 is 0.3 mm short, its other edge 0.3 mm long. Cut a little past the mark, away from the 0, then file to the mark's middle. Measure the first rod with calipers before you trust the rest.");
      plan.gauge.marks.forEach((m) => L.push(`  ${m.rod}: ${m.length.toFixed(1)} mm`));
    }
    if (joints) L.push("", "THE JOINT" + (joints > 1 ? "S" : ""), "Slide the tongue into the fork, ridges into grooves, until it stops. If it binds, sand the ridges, not the tongue's faces. Tighten the bolts only until the prongs close on the V: too much bends them. A little glue on the faces makes it stronger if you'll never take it apart. If a rod passes through the tongue, slide the joint together before fitting that rod.");
    if (plan.lengths && plan.lengths.labels.length) {
      const seen = [], each = plan.lengths.labels.filter((l) => !seen.includes(l.rod) && seen.push(l.rod));
      L.push("", "ROD LENGTHS ON THE BOOM", `Each rod's length to cut is written on the screws' side, beside its hole, so the boom says which rods it takes. The driven element's two halves each have their own: the length to cut each half${plan.o.allowance > 0 ? `, ${(+plan.o.allowance).toFixed(1)} mm longer in all than the model's guess` : ", with no trimming allowance set"}, as on the gauge and the Cut list. Then trim both tips equally by the VNA's readings, not to a length.`, ...each.map((l) => `  ${l.rod}: ${l.text} mm${l.driven ? " each half" : ""}`));
    }
    if (plan.custom && plan.custom.placed) {
      const P = plan.custom.placed, piece = sections.length === 1 ? "the boom" : P.section === 0 ? "the rear piece" : P.section === sections.length - 1 ? "the front piece" : `piece ${P.section + 1}`;
      L.push("", "YOUR TEXT", `"${plan.custom.text}", on the ${P.side > 0 ? "coax's" : "screws'"} side of ${piece}, ${(5 * P.k).toFixed(1)} mm tall.`);
    }
    if (plan.faces && (plan.faces.top || plan.faces.arrows.length)) L.push("", "WHICH WAY UP", "TOP marks the boom's top, the face with the gauge's V, and the arrows on both sides point to it.");
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
    if (o.mount === "mast") L.push("", "THE MAST CLAMP", MOUNTS.mast.print, `Before the boom goes in, push the three nuts (${(NUTS[o.nut] || NUTS.standard).name.toLowerCase()}) into the tail's slots from the screws' side, and run a screw through each to line it up. Then slide the tail in, and fit a short screw from the top and one from the bottom into the tail's nuts, or one long one straight through, and the back screw from the pole's seat into the nut in the tail's end. Strap it to the pole with two hose clamps through the curved slots, or through the extra exits into the V for a thin pole.`);
    if (driven && plan.sections[0].x1 >= driven.x && !(plan.sections[0].prev)) L.push("", "THE COAX", `It runs in a tunnel from the solder window back under the boom, and out through the coax's side just in front of the reflector, then back along the outside of the socket. Thread it through before soldering, from the window end. ${TUNNEL.d} mm across: made for RG316 (2.5 mm) or thinner. Seal both ends with neutral cure silicone.`);
    L.push("", "HARDWARE");
    rods.forEach((r) => L.push(`  ${r.driven ? `${r.name}: 2 rods` : `${r.name}: 1 rod`}, ${r.d} mm ${r.material === "aluminium" ? "aluminum" : r.material}`));
    if (joints) {
      const grip = 2 * jointY(plan.sizes.w).thick - JOINT.bolt.headDepth - JOINT.bolt.nutDepth + JOINT.bolt.nut, bolt = [20, 25, 30, 35, 40, 50].find((n) => n >= grip) || Math.ceil(grip);
      L.push(`  ${2 * joints} M3 x ${bolt} socket-head bolts with nuts, across the joint${joints > 1 ? "s" : ""}. The heads and nuts sit in the recesses in the prongs`);
    }
    if (driven) L.push("  Coax, RG316 or thinner, soldered at the window at the driven element, through the tunnel");
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

  Object.assign(YS, { PARTS: { MOUNTS, HOLE_COMP, CAL_SPAN, FIT, REAR, MOUTH, SCREW, WINDOW, POLE_BEHIND: -poleBehind(), POLE_TILT: POLE.tilt, NUTS }, planParts, buildParts, partsNotes, mastBehind, loadManifold, partPlacing: placing });
  YS.PARTS.JOINT = JOINT;
})(typeof globalThis !== "undefined" ? globalThis : this);
