/*
 * A printable guide for cutting rods to length: a block with one channel for each length. A rod lies in
 * its channel against the stop at the far end, and its other end sticks out past the block's front
 * face. Cut it a little long, then file it flush with that face.
 *
 * A printed guide is only as accurate as the print. On a 150 mm rod, the 0.36% a filament can shrink is
 * 0.54 mm, which is more than the +-0.3 mm the rods need. So nobody gets a guide without calibrating first:
 * print the test bar in the same filament and settings, measure it, and the guide is scaled to suit.
 *
 * The channels are open-topped, so they print cleanly with no supports and get no hole compensation. The
 * block is a height map on a grid, so the mesh is watertight by construction. The raised lettering is
 * separate closed boxes standing on the top face, which slicers merge with the block.
 *
 * Millimetres. No DOM: this file runs in a page and in Node.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  const STOP = 8;               // solid end behind the longest channel
  const CLEARANCE = 0.4;        // channel width over the rod's diameter: an easy fit, as it only has to lie there
  const WALL = 11;              // between channels: wide enough for each channel's label
  const SIDE = 4;               // outer wall beyond the first and last channels
  const FLOOR = 5;              // plastic under the channels: enough that a long guide stays stiff and flat
  const DEPTH_SHARE = 0.85;     // channel depth, as a share of the rod's diameter: the stop catches most of the rod's end
  const MIN_DEPTH = 2;          // ... but never shallower than this
  const LETTER = 0.8;           // size of one pixel of the lettering
  const RAISE = 0.6;            // how far the lettering stands up (three 0.2 mm layers)
  const TOUCH = 0.01;           // far below what a printer can draw
  const BAR = { length: 100, width: 12, height: 5 };    // the calibration test bar
  const BED_DEFAULT = 256;      // mm, the longest part a Bambu X2D prints; users can change it
  const CORNER_STEP = 0.25;        // degrees between the angles tried when a part lies corner to corner
  const SHRINK_LIMIT = 0.03;    // a measured bar more than this share off is probably a mistake

  /* 5 x 7 lettering, as rows of bits, for labels only. */
  const FONT = {
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14],
    4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
    8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12], ".": [0, 0, 0, 0, 0, 12, 12], "-": [0, 0, 0, 31, 0, 0, 0], " ": [0, 0, 0, 0, 0, 0, 0],
    "/": [1, 1, 2, 4, 8, 16, 16], "<": [2, 4, 8, 16, 8, 4, 2],
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
    E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
    I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
    Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  };

  /** The channels a design needs: one for each different rod. Rods of the same length and size share. */
  function guideChannels(design, allowance) {
    const out = [];
    const add = (label, length, d, count) => {
      const same = out.find((c) => Math.abs(c.length - length) < 0.05 && Math.abs(c.d - d) < 0.01);
      if (same) { same.label += "/" + label; same.count += count; } else out.push({ label, length, d, count });
    };
    design.elements.slice().sort((a, b) => a.x - b.x).forEach((e) => {
      if (e.type === "driven") add("DE", (e.L + (allowance || 0) - design.gap) / 2, e.d, 2);
      else add(e.name === "Reflector" ? "R" : e.name, e.L, e.d, 1);
    });
    return out.sort((a, b) => b.length - a.length);
  }

  /** What calibration measured: the scale for the guide, and whether the number looks like a mistake. */
  function guideScale(measured) {
    if (!(measured > 0)) return null;
    const scale = BAR.length / measured;
    return { scale, percent: 100 * scale, suspicious: Math.abs(scale - 1) > SHRINK_LIMIT };
  }

  /* ---------- mesh ---------- */
  function Mesh() { this.t = []; }
  Mesh.prototype.quad = function (a, b, c, d) { this.t.push([a, b, c], [a, c, d]); };
  /** A closed box. */
  Mesh.prototype.box = function (x0, x1, y0, y1, z0, z1) {
    const p = (x, y, z) => [x, y, z];
    this.quad(p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0));
    this.quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1));
    this.quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1));
    this.quad(p(x1, y1, z0), p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1));
    this.quad(p(x0, y1, z0), p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1));
    this.quad(p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1));
  };

  /**
   * A height map as a closed solid. xs, ys: grid lines. height(i, j): the top of cell i, j.
   * Walls are split at every height in use, so that wall edges always meet edge to edge. Without that,
   * a tall wall beside a low one leaves a corner in the middle of an edge, and the mesh isn't strictly closed.
   */
  function heightMap(mesh, xs, ys, height) {
    const nx = xs.length - 1, ny = ys.length - 1;
    const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : height(i, j));
    const seen = new Set([0]);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) seen.add(at(i, j));
    const levels = Array.from(seen).sort((a, b) => a - b);
    /** A wall on the line from (ax, ay) to (bx, by), outward to its right, from height lo up to hi. */
    const wall = (ax, ay, bx, by, lo, hi) => {
      for (let k = 0; k + 1 < levels.length; k++) {
        const z0 = levels[k], z1 = levels[k + 1];
        if (z0 >= lo && z1 <= hi) mesh.quad([ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]);
      }
    };
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const h = at(i, j), x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
        mesh.quad([x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0]);
        mesh.quad([x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]);
        // a wall wherever this cell stands above its neighbour; the neighbour's own turn covers the other way
        const hx = at(i + 1, j), hy = at(i, j + 1), xb = at(i - 1, j), yb = at(i, j - 1);
        if (h > hx) wall(x1, y0, x1, y1, hx, h);
        if (h > xb) wall(x0, y1, x0, y0, xb, h);
        if (h > hy) wall(x1, y1, x0, y1, hy, h);
        if (h > yb) wall(x0, y0, x1, y0, yb, h);
      }
    }
  }

  /** Raised lettering on a top face at height z, reading along +x, with its lower left corner at x, y. */
  function letters(mesh, text, x, y, z) {
    const sink = 0.2;     // the boxes reach into the block, so the slicer merges them
    let cx = x;
    for (const ch of String(text).toUpperCase()) {
      const rows = FONT[ch] || FONT[" "];
      rows.forEach((bits, r) => {
        const yy = y + (6 - r) * LETTER;
        let c = 0;
        while (c < 5) {
          if (bits & (1 << (4 - c))) {
            let run = c;
            while (run + 1 < 5 && (bits & (1 << (4 - (run + 1))))) run++;
            // rows overlap a touch and runs stand a touch apart, so that no two boxes share an edge
            mesh.box(cx + c * LETTER + TOUCH, cx + (run + 1) * LETTER - TOUCH, yy - TOUCH, yy + LETTER + TOUCH, z - sink, z + RAISE);
            c = run + 1;
          } else c++;
        }
      });
      cx += 6 * LETTER;
    }
  }
  const lettersWidth = (text) => String(text).length * 6 * LETTER;

  /**
   * The guide as a mesh, scaled so that it prints true. Returns the mesh and its sizes: length and width are
   * what the printed guide should measure, and channels are the rods it cuts.
   * channels: from guideChannels. scale: from guideScale.
   */
  function buildGuide(channels, scale) {
    const k = scale || 1, longest = Math.max.apply(null, channels.map((c) => c.length)), length = longest + STOP;
    const depth = (c) => Math.max(MIN_DEPTH, DEPTH_SHARE * c.d);
    const top = FLOOR + Math.max.apply(null, channels.map(depth));
    // the near wall is plain; after each channel comes a wall with that channel's label
    const ys = [0], slot = [];
    let y = SIDE;
    channels.forEach((c) => {
      slot.push([y, y + c.d + CLEARANCE]);
      ys.push(y, y + c.d + CLEARANCE);
      y += c.d + CLEARANCE + WALL;
    });
    ys.push(y);
    const xs = Array.from(new Set([0, length].concat(channels.map((c) => c.length)))).sort((a, b) => a - b);
    const mesh = new Mesh();
    heightMap(mesh, xs, ys, (i, j) => {
      const yMid = 0.5 * (ys[j] + ys[j + 1]), xMid = 0.5 * (xs[i] + xs[i + 1]);
      for (let c = 0; c < channels.length; c++) {
        if (yMid > slot[c][0] && yMid < slot[c][1] && xMid < channels[c].length) return top - depth(channels[c]);
      }
      return top;
    });
    const inset = (WALL - 7 * LETTER) / 2;
    channels.forEach((c, i) => letters(mesh, `${c.label} ${c.length.toFixed(1)}`, 2, slot[i][1] + inset, top));
    // the end to file at, where there's room for it along the last wall
    const note = "< FILE FLUSH", last = channels[channels.length - 1];
    const used = 2 + lettersWidth(`${last.label} ${last.length.toFixed(1)}`) + 6;
    if (used + lettersWidth(note) < length) letters(mesh, note, used, slot[slot.length - 1][1] + inset, top);
    // scaled in x and y only: the height sets no rod's length, and layers don't shrink the same way
    mesh.t = mesh.t.map((tri) => tri.map((p) => [p[0] * k, p[1] * k, p[2]]));
    return { mesh, length, width: y, height: top + RAISE, modelLength: length * k, modelWidth: y * k, scale: k, channels };
  }

  /** The test bar: a plain length to measure, with its nominal size on it. */
  function buildBar() {
    const mesh = new Mesh();
    mesh.box(0, BAR.length, 0, BAR.width, 0, BAR.height);
    letters(mesh, "MEASURE 100", 8, 3, BAR.height);
    return { mesh, length: BAR.length, width: BAR.width, height: BAR.height + RAISE, modelLength: BAR.length, modelWidth: BAR.width };
  }

  /** ASCII STL: plain text, so the app's every way of saving a file can carry it. */
  function toStl(mesh, name) {
    const lines = [`solid ${name}`];
    const fix = (v) => v.toFixed(4);
    for (const t of mesh.t) {
      const at = t.map((c) => c.map(fix).join(" "));
      if (at[0] === at[1] || at[1] === at[2] || at[0] === at[2]) continue;     // a sliver thinner than these numbers: its neighbours close the gap
      const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
      lines.push(`facet normal ${fix(n[0] / l)} ${fix(n[1] / l)} ${fix(n[2] / l)}`, " outer loop");
      for (const p of at) lines.push(`  vertex ${p}`);
      lines.push(" endloop", "endfacet");
    }
    lines.push(`endsolid ${name}`);
    return lines.join("\n") + "\n";
  }

  /* ---------- the printer's build space ---------- */

  /** { x, y, z, corner } from what's given: a bed as one number means that much each way, as it did before there were three. */
  function bedOf(bed) {
    if (bed && typeof bed === "object") return { x: bed.x || BED_DEFAULT, y: bed.y || bed.x || BED_DEFAULT, z: bed.z || bed.x || BED_DEFAULT, corner: !!bed.corner };
    const n = bed || BED_DEFAULT;
    return { x: n, y: n, z: n, corner: false };
  }

  /** How long a part `across` wide can be, lying at an angle to the bed's x side: the tighter of the x and y limits. */
  function reachAt(b, across, deg) {
    const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
    if (across * s > b.x + 1e-9 || across * c > b.y + 1e-9) return 0;
    return Math.min(c > 1e-9 ? (b.x - across * s) / c : Infinity, s > 1e-9 ? (b.y - across * c) / s : Infinity);
  }

  /** The longest part `across` wide that fits: straight along either side or, if allowed, at any angle between. */
  function longestOn(bed, across) {
    const b = bedOf(bed);
    let best = Math.max(reachAt(b, across, 0), reachAt(b, across, 90));
    if (b.corner) for (let q = 1; q < 360; q++) best = Math.max(best, reachAt(b, across, q * CORNER_STEP));
    return best;
  }

  /**
   * Where a part goes, its sizes already including any margin: { fits, how: "x" | "y" | "corner" | null, angle, why }.
   * Straight is preferred. Corner to corner takes the middle of the angles that fit, which leaves the most room at the corners.
   */
  function placeOn(bed, length, across, height) {
    const b = bedOf(bed), L = Math.max(length, across), t = Math.min(length, across);
    if (height > b.z + 1e-9) return { fits: false, how: null, angle: 0, why: "height" };
    if (L <= reachAt(b, t, 0) + 1e-9) return { fits: true, how: "x", angle: 0 };
    if (L <= reachAt(b, t, 90) + 1e-9) return { fits: true, how: "y", angle: 90 };
    if (b.corner) {
      const ok = [];
      for (let q = 1; q < 360; q++) if (L <= reachAt(b, t, q * CORNER_STEP) + 1e-9) ok.push(q * CORNER_STEP);
      if (ok.length) return { fits: true, how: "corner", angle: ok[Math.floor(ok.length / 2)] };
    }
    return { fits: false, how: null, angle: 0, why: "size" };
  }

  /** Whether the guide fits a printer's bed, with a little room to spare. */
  function guideFits(guide, bed) {
    return placeOn(bed, guide.modelLength + 4, guide.modelWidth + 4, 0).fits;
  }

  Object.assign(YS, { GUIDE: { BAR, BED_DEFAULT }, guideChannels, guideScale, buildGuide, buildBar, meshToStl: toStl, guideFits, bedOf, longestOn, placeOn });
})(typeof globalThis !== "undefined" ? globalThis : this);
