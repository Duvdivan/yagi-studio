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
  const REAR = -15;                // the boom's rear end, from the reflector
  const FRONT = 10;                // how far it runs past the last rod
  const FIT = 0.05;                // rod holes over the rod's diameter, before hole compensation
  const HOLE_COMP = 0.125;         // the slicer's X-Y hole compensation these are modelled for, per side
  const CLEAR = 3.6;               // over a 3 mm rod's size: a mount's holes, which the rod passes loosely
  const M3 = 3.4, M3_BOOM = 3.0;   // M3 clearance in a mount, without compensation; in the boom, with it
  const NUT_FLATS = 5.45, NUT_DEPTH = 3.6, HEAD_BORE = 5.6, HEAD_DEPTH = 3;   // M3 nut trap and socket-head counterbore
  const LAP = 30, GAP = 0.2;       // the half-lap joint's length, and the play at its shoulders
  const LAP_CLEAR = 8;             // from a rod to the joint's nearest end
  const BRIM = 16;                 // bed length a section can't use: a brim on both ends, and a margin
  const GROOVE = 3;                // the coax's groove, for RG178 and the like, on the +y face
  const WINDOW = [12, 10];         // the solder window at the driven element (x, z)
  const WALL = 3, PLAY = 0.2;      // a mount's socket: its walls, and the room around the boom
  const SEGMENTS = 64;             // round holes: 0.002 mm under a 3 mm rod's radius
  const FLOPPY = 1200;             // mm of boom past which a printed one sags too much to recommend
  const STOP = 4;                  // from the boom's rear end to the wall a rod butts against
  const TICK = 0.6;                // a length mark's width: the narrowest a 0.4 mm nozzle draws cleanly
  const DEEP = 0.6;                // how deep marks are cut: three 0.2 mm layers
  const CAL_SPAN = 100;            // between the notches' far walls, to check with calipers
  const CAL_NOTCH = [4, 2.5];      // each notch's width (x) and depth (z)
  const GRIP = { width: 30, depth: 34, length: 115, back: 60, chamfer: 5 };   // the hand grip, and how far it's held behind the reflector
  const TRIPOD = { size: 36, back: 34, flats: 11.2, nut: 5.6, shelf: 5, bolt: 6.6 };   // block, and a 1/4-20 nut
  const POLE = { plate: 8, bolts: 14 };          // the pole socket's plate, and its four M3 bolts either side of centre
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
        const s = keep(keep(t.translate([-b.min[0], -b.min[1], -b.min[2]])).scale([scale, scale, 1]));
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

  /**
   * Where the half-lap joints go. Each section takes as much as fits the bed, so that the first is long enough for the
   * gauge, with the joint's whole length clear of the rods.
   */
  function planSections(rods, bed, scale) {
    const front = rods[rods.length - 1].x + FRONT, usable = (bed - BRIM) / scale;
    const starts = [], laps = [];
    let at = REAR;
    while (front - at > usable) {
      let a = at + usable - LAP;
      for (;;) {
        const bad = rods.find((r) => r.x > a - LAP_CLEAR && r.x < a + LAP + LAP_CLEAR);
        if (!bad) break;
        a = bad.x - LAP - LAP_CLEAR;
      }
      if (a < at + LAP + 20) throw new Error(`There's nowhere to join the boom within a ${Math.round(bed)} mm bed: the rods leave no ${LAP + 2 * LAP_CLEAR} mm gap in reach. Try a bigger bed or wider spacing.`);
      laps.push(a);
      at = a;
    }
    starts.push(REAR);
    const sections = [];
    for (let i = 0; i <= laps.length; i++) {
      const prev = i ? laps[i - 1] : null, next = i < laps.length ? laps[i] : null;
      sections.push({ i, x0: prev === null ? REAR : prev + GAP, x1: next === null ? front : next + LAP - GAP, prev, next, upper: i % 2 === 1 });
    }
    return sections;
  }

  /** A section's tabs alternate: the lower half of the joint on odd ones, upper on even, so each prints with them on the bed. */
  function sectionRods(rods, s) { return rods.filter((r) => r.x >= s.x0 && r.x <= s.x1); }

  /**
   * Where the gauge's marks and their labels go on the top face. The labels spread along x where the marks crowd,
   * with leaders from the marks, and a mark whose leader would hit a rod's hole keeps only its tick.
   */
  function planGauge(design, rods, section, sizes, allowance) {
    const channels = YS.guideChannels(design, allowance);
    const stop = REAR + STOP, end = section.next === null ? section.x1 : section.next;
    const fits = channels.filter((c) => stop + c.length < end - 2);
    if (!fits.length) return { fits: false, reason: "The rods are longer than this boom section, so the gauge doesn't fit. The Cut list's guide still works." };
    const missing = channels.length - fits.length;
    const k = 0.7, pitch = 3.2, labelY = sizes.w / 2 - 4.4;
    const marks = fits.map((c) => {
      const label = engravable(c.label), width = textWidth(label, k, pitch);
      return { rod: c.label, label, length: c.length, x: stop + c.length, width };
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
      const dx = x1 - x0, dy = y1 - y0, t = Math.max(0, Math.min(1, ((h.x - x0) * dx + (0 - y0) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x0 + t * dx - h.x, y0 + t * dy) < h.hole / 2 + 0.7 + TICK / 2;
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
    return { fits: true, stop, end, marks, inner, labelY, k, pitch, unlabelled: marks.filter((m) => !m.labelled).map((m) => m.rod), missing };
  }

  /** The two notches: as near the middle of the boom's top as they'll go, clear of the labels. */
  function planNotches(gauge, sizes) {
    const [w] = CAL_NOTCH;
    const hit = (a, b) => gauge.marks.some((m) => m.labelled && a < m.lx + m.width / 2 + 1 && b > m.lx - m.width / 2 - 1);
    const lo = gauge.stop, hi = gauge.end - CAL_SPAN - 2;
    const middle = (lo + hi) / 2;
    const tries = [];
    for (let p = lo; p <= hi; p += 1) tries.push(p);
    tries.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
    const p = tries.find((q) => !hit(q, q + w) && !hit(q + CAL_SPAN - w, q + CAL_SPAN));
    return p === undefined ? null : { from: p, to: p + CAL_SPAN, y0: sizes.w / 2 - 4 };
  }

  function boomSizes(rods) {
    const big = Math.max.apply(null, rods.map((r) => r.d));
    const w = Math.max(BOOM_W, Math.ceil(5 * big)), h = Math.max(BOOM_H, Math.ceil(6.2 * big));
    const chHalf = Math.max(2, big * 0.67), hole = big + FIT;
    return { w, h, chHalf, chY: -(hole / 2 + 1 + chHalf) };
  }

  /* ---------- the boom ---------- */
  function boomSection(K, sec, rods, sizes, opts) {
    const { w, h } = sizes;
    const y = w / 2, z = h / 2;
    // the body, then the half of the joint at each end. Lower halves on section 0, 2 ..., upper on the others
    const tabZ = sec.upper ? [0, z] : [-z, 0];
    const parts = [K.box(sec.prev === null ? REAR : sec.prev + LAP, sec.next === null ? sec.x1 : sec.next, -y, y, -z, z)];
    if (sec.prev !== null) parts.push(K.box(sec.prev + GAP, sec.prev + LAP, -y, y, tabZ[0], tabZ[1]));
    if (sec.next !== null) parts.push(K.box(sec.next, sec.next + LAP - GAP, -y, y, tabZ[0], tabZ[1]));
    let s = K.fuse(parts);
    const cuts = [];
    sectionRods(rods, sec).forEach((r) => cuts.push(K.cyl(r.x, 0, -z - 5, r.hole, h + 10)));
    const driven = rods.find((r) => r.driven);
    if (driven && driven.x >= sec.x0 && driven.x <= sec.x1) cuts.push(K.box(driven.x - WINDOW[0] / 2, driven.x + WINDOW[0] / 2, -2, y + 1, -WINDOW[1] / 2, WINDOW[1] / 2));
    // the coax runs from the driven element back to the rear end, on any section it reaches
    if (driven && sec.x0 < driven.x) cuts.push(K.box(sec.x0 - 1, Math.min(driven.x, sec.x1 + 1), y - 2.5, y + 1, -GROOVE / 2, GROOVE / 2));
    if (sec.i === 0) cuts.push(K.cyl(REAR + 7, 0, -z - 5, M3_BOOM, h + 10));      // pins a mount
    [[sec.prev, true], [sec.next, false]].forEach(([lap]) => {
      if (lap === null) return;
      [lap + 8, lap + LAP - 8].forEach((x) => {
        cuts.push(K.cyl(x, 0, -z - 5, M3_BOOM, h + 10));
        if (sec.upper) cuts.push(K.cyl(x, 0, z - HEAD_DEPTH, HEAD_BORE, HEAD_DEPTH + 1));     // the head sits flush on an upper half
        else cuts.push(K.hex(x, 0, NUT_FLATS, -z - 1, -z + NUT_DEPTH));                       // the nut in a lower half
      });
    });
    s = K.cut(s, cuts);
    if (sec.i === 0 && opts.gauge) s = K.cut(s, gaugeCuts(K, opts.gauge, opts.notches, sizes));
    if (sec.i === 0 && opts.label) s = K.cut(s, labelCuts(K, sec, rods, sizes));
    return s;
  }

  /* A V along the top, so it prints without supports and a rod lies true in it. Open at the far end, like the marks,
     so that hole compensation can't move what sets a rod's length. */
  function gaugeCuts(K, g, notches, sizes) {
    const { w, h, chY, chHalf } = sizes, top = h / 2, out = [];
    const v = K.prism([[chY - chHalf - 0.5, top + 0.5], [chY + chHalf + 0.5, top + 0.5], [chY, top - chHalf]], g.stop, g.end + 1);
    out.push(K.turn(v, [90, 0, 90]));     // drawn in (y, z), and pushed along x
    g.marks.forEach((m) => {
      out.push(K.box(m.x - TICK / 2, m.x + TICK / 2, -w / 2 - 1, g.inner, top - DEEP, top + 1));
      if (!m.labelled) return;
      out.push(K.bar(m.x, g.inner, m.lx, g.labelY - 0.6, top - DEEP, top + 1, TICK));
      out.push(...K.word(m.label, m.lx - m.width / 2, g.labelY, g.k, top - DEEP, top + 1, TICK, g.pitch));
    });
    if (notches) {
      const [nw, nd] = CAL_NOTCH;
      out.push(K.box(notches.from, notches.from + nw, notches.y0, w / 2 + 1, top - nd, top + 1));
      out.push(K.box(notches.to - nw, notches.to, notches.y0, w / 2 + 1, top - nd, top + 1));
    }
    return out;
  }

  /* On the boom's -y side. It reads upright only with the rods vertical, and on horizontal rods it's the side that faces up. */
  function labelCuts(K, sec, rods, sizes) {
    const y = sizes.w / 2, z = sizes.h / 2;
    const text = "THIS SIDE UP", depth0 = y - DEEP, depth1 = y + 1;
    const clearOfMount = rods[0].x + 14, end = sec.next === null ? sec.x1 : sec.next;
    const room = end - clearOfMount - 4;
    const k = Math.min(0.12 * sizes.h / 2 * 1, 1.2 * sizes.h / BOOM_H), pitch = 5 * k;
    const width = textWidth(text, k, pitch) + 12;
    if (room < width * 0.6) return [];
    const scale = Math.min(1, room / width), kk = k * scale, pp = pitch * scale;
    const x0 = clearOfMount + (room - width * scale) / 2 + 2, h = 5 * kk, bars = [];
    bars.push(...K.word(text, x0, -h / 2, kk, depth0, depth1, 0.8, pp));
    const ax = x0 + textWidth(text, kk, pp) + 6 * scale, tip = Math.min(z - 3, h);
    bars.push(K.bar(ax, -tip, ax, tip, depth0, depth1, 0.9), K.bar(ax, tip, ax - 3 * scale, tip - 3.5 * scale, depth0, depth1, 0.9), K.bar(ax, tip, ax + 3 * scale, tip - 3.5 * scale, depth0, depth1, 0.9));
    return bars.map((b) => K.turn(b, [90, 0, 0]));
  }

  /* ---------- mounts ----------
     Every socket prints standing, its opening up. The DuvYagi's handle adapter, printed flat with its socket's roof
     bridged, snapped along the layers at that roof when the boom was pushed in. Standing, the walls run the whole way
     round each layer, and printed that way it held. */
  /* The socket over the boom's rear end, as parts.py has it, with the reflector and an M3 through its walls. */
  function socketCuts(K, rods, sizes, front, wideY) {
    const { w, h } = sizes, y = w / 2 + PLAY, z = h / 2 + PLAY;
    const r0 = rods[0], clear = Math.max(CLEAR, r0.d + 0.6);
    return [K.box(REAR, front + 1, -y, y, -z, z), K.cyl(r0.x, 0, -50, clear, 100), K.cyl(REAR + 7, 0, -50, M3, 100),
      K.box(REAR, front + 1, w / 2 - 1, wideY + 1, -GROOVE / 2, GROOVE / 2)];
  }

  /* How far a mount's socket runs past the reflector: to just past it, without reaching the next rod. */
  const socketFront = (rods) => Math.min(12, rods[1].x - rods[0].x - 4);

  /* Round the boom's axis when the rods lie flat, so that a mount's mast or grip stays upright. */
  const rollFor = (polar) => (polar === "horizontal" ? [90, 0, 0] : null);
  const rolled = (K, m, roll) => (roll ? K.turn(m, roll) : m);

  function mastMount(K, rods, sizes, roll) {
    const front = socketFront(rods), sx0 = REAR - WALL, W2 = sizes.w + 2 * WALL + 2 * PLAY, H2 = sizes.h + 2 * WALL + 2 * PLAY;
    const { apex, w: VW } = CRADLE, VH = Math.max(CRADLE.h, (roll ? W2 : H2) + 10), vx0 = apex - 28, vx1 = apex + 12;
    let s = K.box(sx0, front, -W2 / 2, W2 / 2, -H2 / 2, H2 / 2);
    s = K.cut(s, socketCuts(K, rods, sizes, front, W2 / 2));
    s = K.fuse([s, K.box(vx1, sx0 + 0.01, -W2 / 2, W2 / 2, -H2 / 2, H2 / 2)]);
    s = rolled(K, s, roll);
    let block = K.box(vx0, vx1, -VW / 2, VW / 2, -VH / 2, VH / 2);
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
  function handGrip(K, rods, sizes, roll) {
    const front = socketFront(rods), sx0 = REAR - WALL, half = GRIP.width / 2;
    const gx1 = -GRIP.back, gx0 = gx1 - GRIP.depth;
    // the head is square, as wide as the grip, so that the part lies flat on the bed whichever way the rods go
    const half2 = Math.max(half, sizes.h / 2 + PLAY + WALL);
    const sock = K.box(sx0, front, -half2, half2, -half2, half2);
    let head = K.cut(sock, socketCuts(K, rods, sizes, front, half2));
    head = rolled(K, head, roll);
    const top = half2, bottom = -top, c = GRIP.chamfer;
    const arm = K.box(gx1 - 0.01, sx0 + 0.01, -half2, half2, bottom, top);
    const grip = K.prism([[gx0 + c, -half2], [gx1 - c, -half2], [gx1, -half2 + c], [gx1, half2 - c], [gx1 - c, half2], [gx0 + c, half2], [gx0, half2 - c], [gx0, -half2 + c]], bottom - GRIP.length, top);
    const lanyard = K.cylY(gx0 + GRIP.depth / 2, -half2 - 1, bottom - GRIP.length + 10, 6, 2 * half2 + 2);
    // a brace in the corner under the arm, where a dropped or leaned-on antenna bends it across the layers
    const brace = K.turn(K.prism([[gx1 - 0.01, 0], [gx1 + 22, 0], [gx1 - 0.01, 22]], -half2, half2), [-90, 0, 0]);
    return K.cut(K.fuse([head, arm, grip, K.at(brace, [0, 0, bottom + 0.01])]), [lanyard]);
  }

  function tripodMount(K, rods, sizes, roll) {
    const front = socketFront(rods), sx0 = REAR - WALL, W2 = sizes.w + 2 * WALL + 2 * PLAY, H2 = sizes.h + 2 * WALL + 2 * PLAY;
    const T = TRIPOD, half = T.size / 2, cx = -(T.back + half + 18);
    const yh = roll ? H2 / 2 : W2 / 2, zh = roll ? W2 / 2 : H2 / 2;
    let head = K.box(sx0, front, -W2 / 2, W2 / 2, -H2 / 2, H2 / 2);
    head = K.cut(head, socketCuts(K, rods, sizes, front, W2 / 2));
    head = rolled(K, head, roll);
    const arm = K.box(cx + half - 0.01, sx0 + 0.01, -yh, yh, -zh, zh);
    const block = K.box(cx - half, cx + half, -half, half, -zh, zh);
    let s = K.fuse([head, arm, block]);
    // a 1/4-20 tripod screw comes up from below into a nut sitting on the shelf
    s = K.cut(s, [K.cyl(cx, 0, -zh - 1, T.bolt, T.shelf + 2), K.hex(cx, 0, T.flats, -zh + T.shelf, zh + 1)]);
    return s;
  }

  /* The arm is the tripod mount's, with bolt holes where the nut would go. The two pieces are bolted because the thread
     and the socket each want to print pointing up, and they're at right angles in use. */
  function poleArm(K, rods, sizes, roll) {
    const front = socketFront(rods), sx0 = REAR - WALL, W2 = sizes.w + 2 * WALL + 2 * PLAY, H2 = sizes.h + 2 * WALL + 2 * PLAY;
    const T = TRIPOD, half = T.size / 2, cx = poleBehind();
    const yh = roll ? H2 / 2 : W2 / 2, zh = roll ? W2 / 2 : H2 / 2;
    let head = K.box(sx0, front, -W2 / 2, W2 / 2, -H2 / 2, H2 / 2);
    head = K.cut(head, socketCuts(K, rods, sizes, front, W2 / 2));
    head = rolled(K, head, roll);
    const s = K.fuse([head, K.box(cx + half - 0.01, sx0 + 0.01, -yh, yh, -zh, zh), K.box(cx - half, cx + half, -half, half, -zh, zh)]);
    return K.cut(s, poleBolts(K, cx, -zh - 1, 2 * zh + 2));
  }

  /* The owner's own thread, unchanged, on a plate that bolts under the arm. Printed flat on its plate, opening up. */
  function poleSocket(K) {
    const half = TRIPOD.size / 2, P = YS.POLE_SOCKET;
    const raw = K.fromData(P.positions, P.triangles), z0 = raw.boundingBox().min[2];
    const boss = K.at(raw, [0, 0, POLE.plate - 1 - z0]);    // its solid end a millimetre into the plate
    const plate = K.cut(K.box(-half, half, -half, half, 0, POLE.plate), poleBolts(K, 0, -1, POLE.plate + 2));
    return K.fuse([plate, boss]);
  }

  const poleBolts = (K, cx, z0, h) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => K.cyl(cx + a * POLE.bolts, b * POLE.bolts, z0, M3, h));
  /* Where the pole's axis ends up behind the reflector, as x. */
  const poleBehind = () => -(TRIPOD.back + TRIPOD.size / 2 + 18);

  /* ---------- the coupon ---------- */
  /** A row of holes for each rod size, to find the fit on this printer, and the boom's M3 hole and nut trap. */
  function coupon(K, rods) {
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
    s = K.cut(s, cuts);
    return s;
  }

  /* ---------- what the page calls ---------- */
  const MOUNTS = {
    none: { name: "No mount" },
    mast: { name: "Mast or pole clamp", hardware: ["2 hose clamps, for bands up to 13 mm", "1 M3 x 30 bolt and nut, to pin the boom"], print: "Stand it on the cradle, socket up, as the file has it. The V's sides are 45 degree overhangs, so it needs no supports." },
    pole: { name: "Painter pole", hardware: ["4 M3 x 40 bolts with nuts, joining the socket's plate to the arm", "1 M3 x 30 bolt and nut, to pin the boom"], print: "Two pieces, each printed its best way. The arm stands on its block, socket up, and the pole socket lies flat on its plate, opening up, with no supports." },
    grip: { name: "Hand grip", hardware: ["1 M3 x 40 bolt and nut, to pin the boom", "Optional: a lanyard through the hole at the bottom"], print: "Stand it as the file has it, with the grip lying on the bed and the socket pointing up, and no supports." },
    tripod: { name: "Camera tripod", hardware: ["1 M3 x 30 bolt and nut, to pin the boom", "1 1/4-20 UNC nut, 7/16 in (11.1 mm) across flats, dropped into the top"], print: "Stand it on the block, socket up, as the file has it, with no supports." },
  };

  /**
   * Plans the parts without making any: the sections, the gauge's marks and any warnings, for the page to show as you type.
   * opts: { bed, fit, scale, allowance, gauge, label }
   */
  function planParts(design, opts) {
    const o = Object.assign({ bed: 256, fit: FIT, scale: 1, allowance: 0, gauge: true, label: true, mount: "mast" }, opts);
    const rods = rodsOf(design, o.fit), sizes = boomSizes(rods), warnings = [];
    if (rods.length < 2) throw new Error("A boom needs at least two rods.");
    rods.forEach((r, i) => {
      if (i && r.x - rods[i - 1].x < r.hole / 2 + rods[i - 1].hole / 2 + 4) throw new Error(`${r.name} is too close to ${rods[i - 1].name} for the boom to hold them both.`);
    });
    const sections = planSections(rods, o.bed, o.scale);
    const boom = rods[rods.length - 1].x - REAR + FRONT;
    if (boom > FLOPPY) warnings.push(`At ${Math.round(boom)} mm, a printed boom will sag and flex. A metal or fibreglass boom suits this better, and metal changes the tuning.`);
    if (sizes.w > BOOM_W) warnings.push(`These rods are thick, so the boom grows to ${sizes.w} x ${sizes.h} mm, a size nobody has printed and tried yet.`);
    if (rods.length > 1 && rods[1].x - rods[0].x < 16) warnings.push("The first two rods are close, so the mount's socket is short and holds the boom less firmly.");
    const gauge = o.gauge ? planGauge(design, rods, sections[0], sizes, o.allowance) : null;
    const notches = gauge && gauge.fits ? planNotches(gauge, sizes) : null;
    if (gauge && !gauge.fits) warnings.push(gauge.reason);
    if (gauge && gauge.fits && gauge.missing) warnings.push(`${gauge.missing} rod${gauge.missing > 1 ? "s are" : " is"} too long for the gauge. Use the Cut list's guide for ${gauge.missing > 1 ? "those" : "it"}.`);
    if (gauge && gauge.fits && gauge.unlabelled.length) warnings.push(`There was no clear way to label ${gauge.unlabelled.join(", ")} on the gauge, so ${gauge.unlabelled.length > 1 ? "those marks have" : "that mark has"} no name. Counting along them still works.`);
    if (gauge && gauge.fits && !notches) warnings.push(`The first section is too short for the ${CAL_SPAN} mm check notches.`);
    return { o, rods, sizes, sections, gauge: gauge && gauge.fits ? gauge : null, notches, warnings, boom };
  }

  /** Makes the solids. Returns [{ id, name, file, mesh, size, volume, print }] and the same plan as planParts. */
  function buildParts(wasm, design, opts) {
    const plan = planParts(design, opts), { o, rods, sizes, sections } = plan;
    const K = kit(wasm), out = [];
    const safe = design.name.replace(/[^\w-]+/g, "_");
    const add = (id, name, solid, turn, print) => {
      const placed = K.place(solid, turn, o.scale), b = placed.boundingBox();
      if (placed.status() !== "NoError") throw new Error(`${name} didn't come out as a solid: ${placed.status()}`);
      out.push({ id, name, file: `${safe}_${id}.stl`, mesh: K.mesh(placed), volume: placed.volume(), genus: placed.genus(),
        size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]], print });
    };
    try {
      sections.forEach((sec) => {
        const solid = boomSection(K, sec, rods, sizes, { gauge: plan.gauge, notches: plan.notches, label: o.label });
        const nameIt = sections.length === 1 ? "Boom" : sec.i === 0 ? "Rear boom" : sec.i === sections.length - 1 ? "Front boom" : `Boom, section ${sec.i + 1}`;
        const id = sections.length === 1 ? "boom" : sec.i === 0 ? "boom_rear" : sec.i === sections.length - 1 ? "boom_front" : `boom_${sec.i + 1}`;
        add(id, nameIt, solid, sec.upper ? [180, 0, 0] : null, sec.upper ? "As the file has it, already upside down so its joint lies on the bed. A brim helps." : "As the file has it, with the joint on the bed. A brim helps.");
      });
      const roll = rollFor(design.polarization);
      if (o.mount === "mast") add("mast_mount", MOUNTS.mast.name, mastMount(K, rods, sizes, roll), [0, -90, 0], MOUNTS.mast.print);
      if (o.mount === "pole") {
        add("pole_arm", "Painter pole arm", poleArm(K, rods, sizes, roll), [0, -90, 0], MOUNTS.pole.print);
        add("pole_socket", "Painter pole socket", poleSocket(K), null, MOUNTS.pole.print);
      }
      if (o.mount === "grip") add("hand_grip", MOUNTS.grip.name, handGrip(K, rods, sizes, roll), [0, -90, 0], MOUNTS.grip.print);
      if (o.mount === "tripod") add("tripod_mount", MOUNTS.tripod.name, tripodMount(K, rods, sizes, roll), [0, -90, 0], MOUNTS.tripod.print);
      if (o.coupon !== false) add("coupon", "Hole test coupon", coupon(K, rods), null, "As the file has it. Print it on the same plate as the boom, so that it prints under the same conditions.");
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
    L.push(`${design.name}: printing and building`, "", "NEW AND UNTESTED: nothing from Yagi Studio's 3D print tab has been printed yet. Print one, measure it and test-fit it before you rely on it.", "", "PRINTING", `0.2 mm layers, 5 walls, 15% gyroid infill, in PETG or ASA, no supports.`,
      `X-Y hole compensation ${HOLE_COMP} mm for the boom and coupon: their holes are modelled for it and come out too small without it. A mount's fine with or without it.`,
      o.scale === 1 ? "Set your filament's shrinkage in the slicer, or the lengths will be short." : `These are scaled ${(100 * o.scale).toFixed(2)}% across the bed for your printer's shrinkage. Leave the slicer's shrinkage at 100%.`, "");
    parts.forEach((p) => L.push(`${p.file}: ${p.size.map((v) => v.toFixed(1)).join(" x ")} mm. ${p.print}`));
    if (plan.notches) L.push("", "CHECK THE PRINT BEFORE USING THE GAUGE", `Spread your calipers' inside jaws between the far walls of the two notches on the boom's top. It should read ${CAL_SPAN.toFixed(2)} mm, within about 0.15 mm. If it's off, the gauge's marks are off by about the same share, so fix the shrinkage and reprint, or cut with calipers instead.`);
    if (plan.gauge) {
      L.push("", "CUTTING RODS WITH THE GAUGE", "Lay the rod in the V on top of the boom, against the wall at the rear. Cut a little past its mark, then file to the mark. Measure the first rod with calipers before you trust the rest.");
      plan.gauge.marks.forEach((m) => L.push(`  ${m.rod}: ${m.length.toFixed(1)} mm`));
    }
    L.push("", "HARDWARE");
    rods.forEach((r) => L.push(`  ${r.driven ? `${r.name}: 2 rods` : `${r.name}: 1 rod`}, ${r.d} mm ${r.material === "aluminium" ? "aluminum" : r.material}`));
    if (joints) L.push(`  ${2 * joints} M3 x 16 socket-head bolts with 2.5 mm nuts, for the joint${joints > 1 ? "s" : ""}`);
    if (driven) L.push("  Coax, soldered at the window at the driven element, running back along the groove");
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

  Object.assign(YS, { PARTS: { MOUNTS, HOLE_COMP, CAL_SPAN, FIT, REAR, POLE_BEHIND: -poleBehind() }, planParts, buildParts, partsNotes, mastBehind, loadManifold });
})(typeof globalThis !== "undefined" ? globalThis : this);
