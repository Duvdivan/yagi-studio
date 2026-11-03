/*
 * The general solver: rods that aren't straight, parallel or centred, and closed loops.
 *
 * solver.js folds every rod about the boom and uses a closed form for parallel rods. Those two shortcuts make
 * it fast, and they are why it can't take a rod that leans, bends or sits to one side. This drops both and keeps
 * the rest: the same graded mesh, tube kernel, flat-end and tip corrections. YS.sweep and YS.pattern3d hand a
 * design over to it when any rod has a crook.
 *
 * Method. Galerkin with Richmond's sine tents on every panel of a whole rod, in the mixed-potential form,
 * which holds for panels at any angle (Harrington, "Field Computation by Moment Methods", 1968):
 *
 *     Z_mn = j eta / (4 pi) * [ k * integral integral (t.t') f_m f_n G  -  1 / k * integral integral f_m' f_n' G ]
 *
 * Within a rod G is the tube kernel, as in solver.js, taken at the distance between the two points, so a bent
 * rod joins up with a straight one as the bend goes to nothing. Between rods it is a filament, also as in
 * solver.js. Each frequency takes tens of milliseconds, against 1 ms there.
 *
 * Bends, leans and shifts keep each rod's length along its curve, as bending a real rod does. A rod is held
 * straight inside the boom, so each half bends on its own, in any direction, from where it leaves the boom or
 * from further out. The mesh nodes follow the curve and each panel is the straight chord between two of them.
 *
 * tests/crooked.js checks this against solver.js and against nec2++. Millimetres, MHz, degrees. No DOM.
 */
(function (root) {
  "use strict";
  const YS = root.YS;
  const ETA = YS.ETA, C = YS.C, MU0 = 4e-7 * Math.PI, RAD = Math.PI / 180;
  const FAST_ZETA = 20;           // beyond this many radii the averaged kernel needs no AGM
  const Q_FAR = 4, Q_NEAR = 8, Q_END = 16;   // Gauss points per panel: far, close, touching
  const NEAR_SAME = 1.6;          // panels of one rod closer than this many panel lengths use Q_NEAR
  const NEAR_OTHER = 1.2;         // the same, for panels of different rods
  const STEP = 0.1;               // mm, step when following a rod's curve
  const BOOM_FACE = 10;           // mm from the rod's centre to where it leaves the boom (the boom is 20 mm through)

  /** Gauss-Legendre rule on [0, 1]. */
  function gauss01(n) {
    const x = new Float64Array(n), w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let t = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), dp = 1;
      for (let it = 0; it < 100; it++) {
        let p0 = 1, p1 = t;
        for (let j = 2; j <= n; j++) { const p2 = ((2 * j - 1) * t * p1 - (j - 1) * p0) / j; p0 = p1; p1 = p2; }
        dp = n * (t * p1 - p0) / (t * t - 1);
        const dt = p1 / dp;
        t -= dt;
        if (Math.abs(dt) < 1e-15) break;
      }
      x[n - 1 - i] = (t + 1) / 2;
      w[n - 1 - i] = 1 / ((1 - t * t) * dp * dp);
    }
    return { x, w };
  }

  /** The same rule crowded at both ends, for log singularities there. */
  function clustered01(n) {
    const b = gauss01(n), x = new Float64Array(n), w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = b.x[i], s2 = s * s, s1 = 1 - s;
      x[i] = s * s2 * (10 + s * (-15 + 6 * s));
      w[i] = b.w[i] * 30 * s2 * s1 * s1;
    }
    return { x, w };
  }

  const RULES = [gauss01(Q_FAR), gauss01(Q_NEAR), clustered01(Q_END)];
  const FAR = 0, NEAR = 1, END = 2;

  function agm(a, b) {
    for (let i = 0; i < 12; i++) {
      const m = 0.5 * (a + b), g = Math.sqrt(a * b);
      if (Math.abs(a - b) < 1e-13 * m) return m;
      a = m; b = g;
    }
    return a;
  }

  let gr = 0, gi = 0;         // the kernel's last value, to save allocating one per call
  function tubeKernel(az, a, k) {
    const a2 = a * a, R = Math.sqrt(az * az + 2 * a2), kR = k * R, sk = Math.sin(kR);
    if (az > FAST_ZETA * a) { gr = Math.cos(kR) / R; gi = -sk / R; return; }
    const half = Math.sin(0.5 * kR);
    gr = 1 / agm(Math.sqrt(az * az + 4 * a2), Math.max(az, 1e-300)) - 2 * half * half / R;
    gi = -sk / R;
  }

  /**
   * Which way a rod points at position u along it, as angles in degrees toward +x and +y.
   * c, all optional:
   *   shift   slid along its own axis, mm
   *   top     top half longer by this and bottom half shorter, around the feed gap, mm
   *   leanX   the whole rod leaning along the boom, top tip forward
   *   leanY   the whole rod leaning across the boom, top tip to +y
   *   upper, lower   that half bent: { deg, az, from, curve }
   *     deg    how far it bends away from the rod's line
   *     az     which way the tip goes: 0 forward, away from the reflector; 180 toward the reflector; 90 to +y
   *     from   where along the half it starts, mm from the centre (default: where it leaves the boom)
   *     curve  an even curve from there, reaching deg at the tip, instead of a sharp bend
   */
  function aimAt(c, u, ends) {
    let ax = c.leanX || 0, ay = c.leanY || 0;
    const half = u >= 0 ? c.upper : c.lower, side = u >= 0 ? 1 : -1;
    if (half) {
      const from = half.from === undefined ? BOOM_FACE : half.from, past = Math.abs(u) - from;
      if (past > 0) {
        const deg = half.curve ? half.deg * past / ((u >= 0 ? ends[1] : -ends[0]) - from) : half.deg;
        ax += side * deg * Math.cos(half.az * RAD);
        ay += side * deg * Math.sin(half.az * RAD);
      }
    }
    return [ax, ay];
  }

  /** The way along the rod from position a to position b, following its curve. */
  function walk(c, a, b, ends, out) {
    const n = Math.max(1, Math.ceil(Math.abs(b - a) / STEP)), ds = (b - a) / n;
    for (let q = 0; q < n; q++) {
      const [ax, ay] = aimAt(c, a + (q + 0.5) * ds, ends), r = Math.hypot(ax, ay);
      const sr = r > 0 ? Math.sin(r * RAD) / r : 0;
      out[0] += sr * ax * ds; out[1] += sr * ay * ds; out[2] += Math.cos(r * RAD) * ds;
    }
    return out;
  }

  /** One rod's mesh in space. */
  function buildRod(w, c) {
    const M = 2 * w.m, s = new Float64Array(M + 1), h = w.h;
    for (let j = 0; j <= w.m; j++) { s[w.m + j] = w.z[j]; s[w.m - j] = -w.z[j]; }
    if (c.top) for (let i = 0; i <= M; i++) s[i] *= s[i] > 0 ? (h + c.top) / h : (h - c.top) / h;
    const ends = [s[0], s[M]];
    // put a node on each sharp bend, so that no panel cuts the corner
    for (const [half, dir] of [[c.upper, 1], [c.lower, -1]]) {
      if (!half || half.curve) continue;
      const from = half.from === undefined ? BOOM_FACE : half.from;
      let best = 1, far = Infinity;
      for (let j = 1; j < w.m; j++) { const e = Math.abs(Math.abs(s[w.m + dir * j]) - from); if (e < far) { far = e; best = j; } }
      s[w.m + dir * best] = dir * from;
    }
    // follow the curve out from the centre
    const p = new Float64Array(3 * (M + 1));
    const set = (i, q) => { p[3 * i] = w.x + q[0]; p[3 * i + 1] = w.y + q[1]; p[3 * i + 2] = (c.shift || 0) + q[2]; };
    set(w.m, [0, 0, 0]);
    for (const dir of [1, -1]) {
      const q = [0, 0, 0];
      for (let j = 1; j <= w.m; j++) { walk(c, s[w.m + dir * (j - 1)], s[w.m + dir * j], ends, q); set(w.m + dir * j, q); }
    }
    const d = new Float64Array(M), tan = new Float64Array(3 * M);
    for (let j = 0; j < M; j++) {
      const dx = p[3 * j + 3] - p[3 * j], dy = p[3 * j + 4] - p[3 * j + 1], dz = p[3 * j + 5] - p[3 * j + 2];
      d[j] = Math.sqrt(dx * dx + dy * dy + dz * dz);
      tan[3 * j] = dx / d[j]; tan[3 * j + 1] = dy / d[j]; tan[3 * j + 2] = dz / d[j];
    }
    const pts = RULES.map((rule) => {
      const Q = rule.x.length, out = new Float64Array(3 * M * Q);
      for (let j = 0; j < M; j++) {
        for (let q = 0; q < Q; q++) {
          const t = rule.x[q] * d[j], o = 3 * (j * Q + q);
          for (let a = 0; a < 3; a++) out[o + a] = p[3 * j + a] + tan[3 * j + a] * t;
        }
      }
      return out;
    });
    return { a: w.a, sigma: w.sigma, M, s, p, d, tan, pts, off: 0, shapes: RULES.map((rule) => new Float64Array(4 * M * rule.x.length)) };
  }

  /** Panel edges along a straight piece, fine at both its ends, as solver.js grades toward a tip. */
  function gradedPiece(length, a, lam, q) {
    const size = (z) => Math.min((0.5 * a + 0.35 * Math.min(z, length - z)) / q, lam / 20 / q);
    const edges = [0];
    while (edges[edges.length - 1] < length) edges.push(edges[edges.length - 1] + size(edges[edges.length - 1]));
    const stretch = length / edges[edges.length - 1];
    return edges.map((z) => z * stretch);
  }

  /**
   * A folded dipole as one closed loop of rod: up from the feed at the middle of one leg, across the top,
   * down the other leg, across the bottom and back to the feed. The legs are fold.gap apart, along x (the boom)
   * or y (across it), and the current has no ends: its tents run right round the loop. The corners are sharp.
   * e.L is the length of the legs, centre to centre of the links.
   */
  function buildFolded(e, fold, lam, q) {
    const a = e.d / 2, h = e.L / 2, dx = fold.along === "x" ? fold.gap : 0, dy = fold.along === "x" ? 0 : fold.gap;
    const x0 = e.x - dx / 2, y0 = -dy / 2;
    const corners = [[x0, y0, 0], [x0, y0, h], [x0 + dx, y0 + dy, h], [x0 + dx, y0 + dy, -h], [x0, y0, -h], [x0, y0, 0]];
    const pts = [corners[0]], s = [0];
    for (let c = 0; c + 1 < corners.length; c++) {
      const A = corners[c], B = corners[c + 1], len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), run = gradedPiece(len, a, lam, q);
      for (let i = 1; i < run.length; i++) {
        const u = run[i] / len;
        pts.push([A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u]);
        s.push(s[s.length - 1] + run[i] - run[i - 1]);
      }
    }
    const M = pts.length - 1, p = new Float64Array(3 * (M + 1)), d = new Float64Array(M), tan = new Float64Array(3 * M);
    pts.forEach((q2, i) => { p[3 * i] = q2[0]; p[3 * i + 1] = q2[1]; p[3 * i + 2] = q2[2]; });
    for (let j = 0; j < M; j++) {
      const ex = p[3 * j + 3] - p[3 * j], ey = p[3 * j + 4] - p[3 * j + 1], ez = p[3 * j + 5] - p[3 * j + 2];
      d[j] = Math.sqrt(ex * ex + ey * ey + ez * ez);
      tan[3 * j] = ex / d[j]; tan[3 * j + 1] = ey / d[j]; tan[3 * j + 2] = ez / d[j];
    }
    const rules = RULES.map((rule) => {
      const Q = rule.x.length, out = new Float64Array(3 * M * Q);
      for (let j = 0; j < M; j++) {
        for (let k = 0; k < Q; k++) {
          const u = rule.x[k] * d[j], o = 3 * (j * Q + k);
          for (let c = 0; c < 3; c++) out[o + c] = p[3 * j + c] + tan[3 * j + c] * u;
        }
      }
      return out;
    });
    const material = YS.MATERIALS[e.material] || YS.MATERIALS.aluminium;
    return { a, sigma: e.sigma !== undefined ? e.sigma : material.sigma, M, s: Float64Array.from(s), p, d, tan, pts: rules, off: 0, closed: true, shapes: RULES.map((rule) => new Float64Array(4 * M * rule.x.length)) };
  }

  /** The unknown for a rod's node: on an open rod the tips carry none, and a loop's two ends are the same node. */
  function unknownOf(r, node) {
    if (r.closed) return r.off + (node % r.M);
    return node >= 1 && node < r.M ? r.off + node - 1 : -1;
  }

  /** The design as rods in space. design: as solver.js, with an optional e.crook on any element, or e.fold on the driven one. */
  function prepare(design, options) {
    const opt = options || { quality: "normal" };
    const wires = YS.buildWires(design, opt);
    const q = typeof opt.quality === "number" ? opt.quality : YS.QUALITY[opt.quality || "normal"], lam = C * 1000 / design.f0;
    const list = design.elements.concat(design.extra || []);
    const rods = wires.map((w, i) => (list[i].fold ? buildFolded(list[i], list[i].fold, lam, q) : buildRod(w, list[i].crook || {})));
    let N = 0;
    for (const r of rods) { r.off = N; N += r.closed ? r.M : r.M - 1; }
    return { design, rods, N, gap: design.gap === undefined ? 3 : design.gap, z0: design.z0 || 50, feed: design.feed, leadX: wires[design.feed].leadX || 0, lastY: 0,
      re: new Float64Array(N * N), im: new Float64Array(N * N), xr: new Float64Array(N), xi: new Float64Array(N), v: new Float64Array(N) };
  }

  /** Sine tents and their slopes at each rule's points, weights included. */
  function fillShapes(sys, k) {
    for (const r of sys.rods) {
      RULES.forEach((rule, ri) => {
        const Q = rule.x.length, sh = r.shapes[ri];
        for (let j = 0; j < r.M; j++) {
          const d = r.d[j], sn = Math.sin(k * d);
          for (let q = 0; q < Q; q++) {
            const t = rule.x[q] * d, w = rule.w[q] * d, o = 4 * (j * Q + q);
            sh[o] = w * Math.sin(k * (d - t)) / sn;
            sh[o + 1] = w * Math.sin(k * t) / sn;
            sh[o + 2] = -w * k * Math.cos(k * (d - t)) / sn;
            sh[o + 3] = w * k * Math.cos(k * t) / sn;
          }
        }
      });
    }
  }

  const E = new Float64Array(8);     // the four shape pairings of one panel pair: re, im of 00, 01, 10, 11

  /** A panel with itself: the kernel depends only on the distance along it, and is singular on the diagonal. */
  function selfPanel(r, j, k) {
    E.fill(0);
    const d = r.d[j], sn = Math.sin(k * d), rule = RULES[END], Q = rule.x.length, a = r.a;
    for (let u = 0; u < Q; u++) {
      const t = rule.x[u] * d, wu = rule.w[u] * d;
      const f0 = wu * Math.sin(k * (d - t)) / sn, f1 = wu * Math.sin(k * t) / sn;
      const g0 = -wu * k * Math.cos(k * (d - t)) / sn, g1 = wu * k * Math.cos(k * t) / sn;
      for (let side = 0; side < 2; side++) {
        const lo = side === 0 ? 0 : t, span = side === 0 ? t : d - t;
        for (let v = 0; v < Q; v++) {
          const tt = lo + rule.x[v] * span, wv = rule.w[v] * span;
          const f2 = wv * Math.sin(k * (d - tt)) / sn, f3 = wv * Math.sin(k * tt) / sn;
          const g2 = -wv * k * Math.cos(k * (d - tt)) / sn, g3 = wv * k * Math.cos(k * tt) / sn;
          tubeKernel(Math.abs(t - tt), a, k);
          const e00 = k * f0 * f2 - g0 * g2 / k, e01 = k * f0 * f3 - g0 * g3 / k;
          const e10 = k * f1 * f2 - g1 * g2 / k, e11 = k * f1 * f3 - g1 * g3 / k;
          E[0] += e00 * gr; E[1] += e00 * gi; E[2] += e01 * gr; E[3] += e01 * gi;
          E[4] += e10 * gr; E[5] += e10 * gi; E[6] += e11 * gr; E[7] += e11 * gi;
        }
      }
    }
  }

  /** Two different panels. */
  function panelPair(A, i, B, j, rule, k, same, apart) {
    E.fill(0);
    const Q = RULES[rule].x.length, pa = A.pts[rule], pb = B.pts[rule], sa = A.shapes[rule], sb = B.shapes[rule], a = A.a;
    const c = A.tan[3 * i] * B.tan[3 * j] + A.tan[3 * i + 1] * B.tan[3 * j + 1] + A.tan[3 * i + 2] * B.tan[3 * j + 2];
    for (let u = 0; u < Q; u++) {
      const oa = 3 * (i * Q + u), ax = pa[oa], ay = pa[oa + 1], az = pa[oa + 2], fa = 4 * (i * Q + u);
      const f0 = sa[fa], f1 = sa[fa + 1], g0 = sa[fa + 2], g1 = sa[fa + 3];
      for (let v = 0; v < Q; v++) {
        const ob = 3 * (j * Q + v), dx = ax - pb[ob], dy = ay - pb[ob + 1], dz = az - pb[ob + 2], fb = 4 * (j * Q + v);
        const D = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (same && !apart) tubeKernel(D, a, k);
        else { const kR = k * D; gr = Math.cos(kR) / D; gi = -Math.sin(kR) / D; }
        const f2 = sb[fb], f3 = sb[fb + 1], g2 = sb[fb + 2], g3 = sb[fb + 3];
        const e00 = k * c * f0 * f2 - g0 * g2 / k, e01 = k * c * f0 * f3 - g0 * g3 / k;
        const e10 = k * c * f1 * f2 - g1 * g2 / k, e11 = k * c * f1 * f3 - g1 * g3 / k;
        E[0] += e00 * gr; E[1] += e00 * gi; E[2] += e01 * gr; E[3] += e01 * gi;
        E[4] += e10 * gr; E[5] += e10 * gi; E[6] += e11 * gr; E[7] += e11 * gi;
      }
    }
  }

  /** Fills the impedance matrix at wavenumber k: every pair of panels, then the skin effect. */
  function fill(sys, k, omega) {
    const { rods, N, re, im } = sys, pre = ETA / (4 * Math.PI);
    re.fill(0); im.fill(0);
    fillShapes(sys, k);
    // Z = j pre * E: put the pairings of panels i, j into the tents they belong to
    const add = (A, i, B, j, both) => {
      for (let a = 0; a < 2; a++) {
        const m = unknownOf(A, i + a);
        if (m < 0) continue;
        for (let b = 0; b < 2; b++) {
          const n = unknownOf(B, j + b);
          if (n < 0) continue;
          const o = 2 * (2 * a + b), vr = -pre * E[o + 1], vi = pre * E[o];
          re[m * N + n] += vr; im[m * N + n] += vi;
          if (both) { re[n * N + m] += vr; im[n * N + m] += vi; }
        }
      }
    };
    for (let ra = 0; ra < rods.length; ra++) {
      const A = rods[ra];
      for (let rb = ra; rb < rods.length; rb++) {
        const B = rods[rb], same = ra === rb;
        for (let i = 0; i < A.M; i++) {
          const ax = 0.5 * (A.p[3 * i] + A.p[3 * i + 3]), ay = 0.5 * (A.p[3 * i + 1] + A.p[3 * i + 4]), az = 0.5 * (A.p[3 * i + 2] + A.p[3 * i + 5]);
          for (let j = same ? i : 0; j < B.M; j++) {
            if (same && i === j) { selfPanel(A, i, k); add(A, i, B, j, false); continue; }
            const dx = ax - 0.5 * (B.p[3 * j] + B.p[3 * j + 3]), dy = ay - 0.5 * (B.p[3 * j + 1] + B.p[3 * j + 4]), dz = az - 0.5 * (B.p[3 * j + 2] + B.p[3 * j + 5]);
            const big = Math.max(A.d[i], B.d[j]), gapTo = Math.sqrt(dx * dx + dy * dy + dz * dz) - 0.5 * (A.d[i] + B.d[j]);
            const touching = same && (j === i + 1 || (A.closed && i === 0 && j === A.M - 1));
            const rule = touching ? END : gapTo < (same ? NEAR_SAME : NEAR_OTHER) * big ? NEAR : FAR;
            // the two legs of a loop run side by side: seen from there, a tube's current acts as if on its axis
            let apart = false;
            if (A.closed && same) {
              const c = A.tan[3 * i] * A.tan[3 * j] + A.tan[3 * i + 1] * A.tan[3 * j + 1] + A.tan[3 * i + 2] * A.tan[3 * j + 2];
              const along = dx * A.tan[3 * i] + dy * A.tan[3 * i + 1] + dz * A.tan[3 * i + 2];
              apart = Math.abs(c) > 0.99 && Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along)) > 3 * A.a;
            }
            panelPair(A, i, B, j, rule, k, same, apart);
            add(A, i, B, j, true);
          }
        }
      }
      // skin effect: a surface impedance per unit length, over the tents' overlaps
      if (isFinite(A.sigma)) {
        const rs = Math.sqrt(omega * MU0 / (2 * A.sigma)), zs = rs / (2 * Math.PI * A.a * 1e-3) * 1e-3;
        for (let j = 0; j < A.M; j++) {
          const kd = k * A.d[j], s = Math.sin(kd), c = Math.cos(kd), s2 = s * s;
          const selfOv = (kd - s * c) / (2 * k * s2), nbrOv = (s - kd * c) / (2 * k * s2);
          const m = unknownOf(A, j), n = unknownOf(A, j + 1);
          if (m >= 0) { re[m * N + m] += zs * selfOv; im[m * N + m] += zs * selfOv; }
          if (n >= 0) { re[n * N + n] += zs * selfOv; im[n * N + n] += zs * selfOv; }
          if (m >= 0 && n >= 0) {
            re[m * N + n] += zs * nbrOv; im[m * N + n] += zs * nbrOv;
            re[n * N + m] += zs * nbrOv; im[n * N + m] += zs * nbrOv;
          }
        }
      }
    }
  }

  /** 1 V across the gap, spread evenly over it, as in solver.js. */
  function excite(sys, k) {
    const r = sys.rods[sys.feed], g = sys.gap, v = sys.v;
    v.fill(0);
    if (r.closed) {
      // the feed is the loop's first node: its field spreads over the panels each side
      if (!(g > 0)) { v[r.off] = 1; return; }
      const half = g / 2, total = r.s[r.M];
      for (let j = 0; j < r.M; j++) {
        const lo = Math.max(r.s[j], 0), hi = Math.min(r.s[j + 1], half), lo2 = Math.max(r.s[j], total - half), hi2 = Math.min(r.s[j + 1], total);
        for (const [a, b] of [[lo, hi], [lo2, hi2]]) {
          if (b <= a) continue;
          const d = r.d[j], sn = Math.sin(k * d), t1 = a - r.s[j], t2 = b - r.s[j];
          v[unknownOf(r, j)] += (Math.cos(k * (d - t2)) - Math.cos(k * (d - t1))) / (k * sn) / g;
          v[unknownOf(r, j + 1)] += (Math.cos(k * t1) - Math.cos(k * t2)) / (k * sn) / g;
        }
      }
      return;
    }
    if (!(g > 0)) { v[r.off + r.M / 2 - 1] = 1; return; }
    for (let j = 0; j < r.M; j++) {
      const a = Math.max(r.s[j], -g / 2), b = Math.min(r.s[j + 1], g / 2);
      if (b <= a) continue;
      const d = r.d[j], sn = Math.sin(k * d), t1 = a - r.s[j], t2 = b - r.s[j];
      const down = (Math.cos(k * (d - t2)) - Math.cos(k * (d - t1))) / (k * sn), up = (Math.cos(k * t1) - Math.cos(k * t2)) / (k * sn);
      if (j >= 1) v[r.off + j - 1] += down / g;
      if (j + 1 < r.M) v[r.off + j] += up / g;
    }
  }

  /** Complex LU with partial pivoting, in place. */
  function luSolve(sys) {
    const n = sys.N, a = sys.re, b = sys.im, xr = sys.xr, xi = sys.xi;
    xr.set(sys.v); xi.fill(0);
    for (let c = 0; c < n; c++) {
      let best = c, mag = -1;
      for (let r = c; r < n; r++) { const i = r * n + c, m = a[i] * a[i] + b[i] * b[i]; if (m > mag) { mag = m; best = r; } }
      if (best !== c) {
        for (let j = 0; j < n; j++) {
          const i1 = c * n + j, i2 = best * n + j;
          let t = a[i1]; a[i1] = a[i2]; a[i2] = t;
          t = b[i1]; b[i1] = b[i2]; b[i2] = t;
        }
        let t = xr[c]; xr[c] = xr[best]; xr[best] = t;
        t = xi[c]; xi[c] = xi[best]; xi[best] = t;
      }
      const ic = c * n, dr = a[ic + c], di = b[ic + c], den = dr * dr + di * di;
      for (let r = c + 1; r < n; r++) {
        const ir = r * n, ar = a[ir + c], ai = b[ir + c];
        if (ar === 0 && ai === 0) continue;
        const fr = (ar * dr + ai * di) / den, fi = (ai * dr - ar * di) / den;
        for (let j = c + 1; j < n; j++) {
          const pr = a[ic + j], pi = b[ic + j];
          a[ir + j] -= fr * pr - fi * pi;
          b[ir + j] -= fr * pi + fi * pr;
        }
        const vr = xr[c], vi = xi[c];
        xr[r] -= fr * vr - fi * vi;
        xi[r] -= fr * vi + fi * vr;
      }
    }
    for (let r = n - 1; r >= 0; r--) {
      const ir = r * n;
      let sr = xr[r], si = xi[r];
      for (let j = r + 1; j < n; j++) {
        const pr = a[ir + j], pi = b[ir + j];
        sr -= pr * xr[j] - pi * xi[j];
        si -= pr * xi[j] + pi * xr[j];
      }
      const dr = a[ir + r], di = b[ir + r], den = dr * dr + di * di;
      xr[r] = (sr * dr + si * di) / den;
      xi[r] = (si * dr - sr * di) / den;
    }
  }

  /** The radiation vector along direction (ux, uy, uz), as re, im of x, y, z. */
  function radiation(sys, k, ux, uy, uz) {
    const out = new Float64Array(6), Q = Q_FAR;
    for (const r of sys.rods) {
      const pts = r.pts[FAR], sh = r.shapes[FAR];
      for (let j = 0; j < r.M; j++) {
        const m = unknownOf(r, j), n = unknownOf(r, j + 1);
        const mr = m >= 0 ? sys.xr[m] : 0, mi = m >= 0 ? sys.xi[m] : 0, nr = n >= 0 ? sys.xr[n] : 0, ni = n >= 0 ? sys.xi[n] : 0;
        let sr = 0, si = 0;
        for (let q = 0; q < Q; q++) {
          const o = 3 * (j * Q + q), f = 4 * (j * Q + q), ph = k * (ux * pts[o] + uy * pts[o + 1] + uz * pts[o + 2]);
          const cr = Math.cos(ph), ci = Math.sin(ph), ir = sh[f] * mr + sh[f + 1] * nr, ii = sh[f] * mi + sh[f + 1] * ni;
          sr += ir * cr - ii * ci;
          si += ir * ci + ii * cr;
        }
        for (let a = 0; a < 3; a++) { out[2 * a] += sr * r.tan[3 * j + a]; out[2 * a + 1] += si * r.tan[3 * j + a]; }
      }
    }
    return out;
  }

  /** dBi along a direction, from the far field across it and the input power at 1 V. */
  function gainAlong(sys, k, yr, ux, uy, uz) {
    const F = radiation(sys, k, ux, uy, uz);
    const dr = F[0] * ux + F[2] * uy + F[4] * uz, di = F[1] * ux + F[3] * uy + F[5] * uz;
    let p = 0;
    for (let a = 0; a < 3; a++) {
      const u = a === 0 ? ux : a === 1 ? uy : uz, x = F[2 * a] - dr * u, y = F[2 * a + 1] - di * u;
      p += x * x + y * y;
    }
    const gf = 4 * Math.PI * ETA / 2 * Math.pow(k / (4 * Math.PI), 2) / (0.5 * yr);
    return 10 * Math.log10(Math.max(gf * p, 1e-30));
  }

  /** One frequency. wide: also find the beam's peak and how far off the boom it points. */
  function solve(sys, f, wide) {
    const k = 2 * Math.PI / (C * 1000 / f), omega = 2 * Math.PI * f * 1e6;
    fill(sys, k, omega);
    excite(sys, k);
    luSolve(sys);
    let yr = 0, yi = 0;
    for (let i = 0; i < sys.N; i++) { yr += sys.v[i] * sys.xr[i]; yi += sys.v[i] * sys.xi[i]; }
    const den = yr * yr + yi * yi, z = [yr / den, -yi / den + sys.leadX * f];
    sys.lastY = yr;
    const front = gainAlong(sys, k, yr, 1, 0, 0), back = gainAlong(sys, k, yr, -1, 0, 0);
    const out = { f, z, swr: YS.swrOf(z[0], z[1], sys.z0), gainDbd: front - 2.15, fb: front - back };
    if (wide) {
      let peak = -Infinity, az = 0, el = 0;
      for (let i = -14; i <= 14; i++) {
        for (let j = -14; j <= 14; j++) {
          const ta = i * RAD, te = j * RAD, ux = Math.cos(te) * Math.cos(ta), uy = Math.cos(te) * Math.sin(ta), uz = Math.sin(te);
          const g = gainAlong(sys, k, yr, ux, uy, uz);
          if (g > peak) { peak = g; az = i; el = j; }
        }
      }
      Object.assign(out, { peakDbd: peak - 2.15, az, el });
    }
    return out;
  }

  /** The lowest SWR on a grid, then a finer grid round it, then a parabola through the neighbours. */
  function valley(sys, lo, hi, n) {
    const scan = (a, b, m) => {
      let best = Infinity, at = 0;
      const f = [], v = [];
      for (let i = 0; i < m; i++) {
        f.push(a + (b - a) * i / (m - 1));
        v.push(Math.log(solve(sys, f[i]).swr));
        if (v[i] < best) { best = v[i]; at = i; }
      }
      return { f, v, at, best };
    };
    const coarse = scan(lo, hi, n), step = (hi - lo) / (n - 1), mid = coarse.f[coarse.at];
    const fine = scan(mid - step, mid + step, 2 * Math.ceil(step) + 1), i = fine.at;
    let f = fine.f[i];
    if (i > 0 && i < fine.f.length - 1) {
      const a = fine.v[i - 1], b = fine.v[i], c = fine.v[i + 1], den = a - 2 * b + c;
      if (den > 0) f += 0.5 * (a - c) / den * (fine.f[1] - fine.f[0]);
    }
    return { f, swr: Math.exp(fine.best) };
  }


  /** The figures solver.js gives for a frequency: level as in its metricsAt. */
  function metrics(sys, f, level) {
    const base = solve(sys, f), k = 2 * Math.PI / (C * 1000 / f), yr = sys.lastY;
    const gDbi = base.gainDbd + 2.15;
    const r = { f, z: base.z, swr: base.swr, gainDbi: gDbi, gainDbd: base.gainDbd, fb: base.fb };
    if (!(level >= 1)) return r;
    const n = 360, angles = new Array(n), h = new Array(n), e = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = i * RAD, ca = Math.cos(a), sa = Math.sin(a);
      angles[i] = i;
      h[i] = Math.max(gainAlong(sys, k, yr, ca, sa, 0), -120);
      e[i] = Math.max(gainAlong(sys, k, yr, ca, 0, sa), -120);
    }
    r.cuts = { angles, h, e };
    YS.cutFigures(r, gDbi, angles, h, e);
    if (level >= 2) {
      // the field along the rods' direction, for the pattern over ground
      const rootGf = Math.sqrt(4 * Math.PI * ETA / 2 * Math.pow(k / (4 * Math.PI), 2) / (0.5 * yr));
      const m = 361, ev = new Array(m), hv = new Array(m);
      for (let i = 0; i < m; i++) {
        const a = (i - 180) * RAD, ca = Math.cos(a), sa = Math.sin(a);
        const fe = radiation(sys, k, ca, 0, sa), fh = radiation(sys, k, ca, sa, 0), w = Math.abs(ca);
        ev[i] = [rootGf * fe[4] * w, rootGf * fe[5] * w];
        hv[i] = [rootGf * fh[4], rootGf * fh[5]];
      }
      r.fieldCuts = { e: ev, h: hv };
      // the current up the top half of each rod, as solver.js reports it
      let peak = 0, ohmic = 0;
      r.currents = sys.rods.map((rod) => {
        const z = [], mag = [], phase = [], mid = rod.closed ? 0 : rod.M / 2;
        for (let node = mid; node <= rod.M; node++) {
          const u = unknownOf(rod, node), ir = u >= 0 ? sys.xr[u] : 0, ii = u >= 0 ? sys.xi[u] : 0, v = Math.hypot(ir, ii);
          z.push(rod.s[node]); mag.push(v); phase.push(Math.atan2(ii, ir) / RAD);
          if (v > peak) peak = v;
        }
        return { x: rod.p[3 * mid], z, mag, phase };
      });
      r.currents.forEach((c) => { c.mag = c.mag.map((v) => v / (peak || 1)); });
      const omega = 2 * Math.PI * f * 1e6;
      for (const rod of sys.rods) {
        if (!isFinite(rod.sigma)) continue;
        const res = Math.sqrt(omega * MU0 / (2 * rod.sigma)) / (2 * Math.PI * rod.a * 1e-3) * 1e-3;
        for (let j = 0; j < rod.M; j++) {
          const kd = k * rod.d[j], s = Math.sin(kd), c = Math.cos(kd), s2 = s * s;
          const selfOv = (kd - s * c) / (2 * k * s2), nbrOv = (s - kd * c) / (2 * k * s2);
          const ua = unknownOf(rod, j), ub = unknownOf(rod, j + 1);
          const ar = ua >= 0 ? sys.xr[ua] : 0, ai = ua >= 0 ? sys.xi[ua] : 0, br = ub >= 0 ? sys.xr[ub] : 0, bi = ub >= 0 ? sys.xi[ub] : 0;
          ohmic += 0.5 * res * (selfOv * (ar * ar + ai * ai + br * br + bi * bi) + 2 * nbrOv * (ar * br + ai * bi));
        }
      }
      r.efficiency = 1 - ohmic / (0.5 * yr);
    }
    return r;
  }

  function sweep(design, freqs, options) {
    const o = options || {}, sys = prepare(design, { quality: o.quality || "normal", counts: o.counts });
    return freqs.map((f) => metrics(sys, f, o.level || 0));
  }

  /** The full pattern as a grid in dBi, for the 3D view. */
  function pattern3d(design, f, options) {
    const o = options || {}, sys = prepare(design, { quality: o.quality || "normal" });
    const k = 2 * Math.PI / (C * 1000 / f);
    solve(sys, f);
    const nth = o.nth || 61, nph = o.nph || 121, g = new Float32Array(nth * nph);
    for (let i = 0; i < nth; i++) {
      const th = Math.PI * i / (nth - 1), s = Math.sin(th), u = Math.cos(th);
      for (let j = 0; j < nph; j++) {
        const ph = 2 * Math.PI * j / (nph - 1);
        g[i * nph + j] = gainAlong(sys, k, sys.lastY, s * Math.cos(ph), s * Math.sin(ph), u);
      }
    }
    return { nth, nph, g };
  }

  YS.crooked = { prepare, solve, valley, walk, metrics, sweep, pattern3d, BOOM_FACE };
})(typeof globalThis !== "undefined" ? globalThis : this);
