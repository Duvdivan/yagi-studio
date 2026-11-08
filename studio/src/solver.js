/*
 * Yagi Studio solver: method of moments for parallel, centre-fed rods.
 *
 * Method. Galerkin moment method with Richmond's piecewise-sinusoidal basis (the same basis as
 * yagi_nec.py, the first solver written for the DuvYagi). The sine tent has a closed-form field, so only the test integral is
 * numeric. It differs from yagi_nec.py and from NEC-2 in two ways, both about thick rods:
 *
 *  1. The kernel. NEC-2's thin-wire kernel and yagi_nec.py put the current on the axis and test
 *     on the surface. That is only accurate while segments are much longer than the radius, so
 *     results drift with segment count on a 3 mm rod at 900 MHz. Here the current is a uniform
 *     tube, as on a real rod, and the field is averaged round the surface (the "exact kernel" of
 *     Pocklington's and Hallen's equations: King, "The Theory of Linear Antennas", 1956; Werner,
 *     IEEE Trans. AP 46, 1998). The mean of 1/R round a circle of radius a is exactly
 *     1 / agm(sqrt(z^2 + 4 a^2), |z|), the arithmetic-geometric mean form of the complete elliptic
 *     integral. The dynamic remainder is smooth and is taken at the mean squared distance.
 *
 *  2. The mesh. The current on a tube has a square-root edge at each tip, so uniform segments
 *     converge slowly. Panels here are graded: fine at the tips, and at the gap on the fed rod,
 *     coarse between. A fixed panel count per rod makes results smooth in the rod's length, which
 *     the optimiser needs. What error remains acts like a small change in the rod's length, in
 *     proportion to the tip panel, and the same across rod sizes and bands, so it is corrected.
 *
 * Flat ends. A solid rod with flat ends acts like a tube about 0.10 radii longer per end. That
 * figure was measured with the full-surface reference in tests/bor_reference.py, on rods from
 * 1.5 to 10 mm at 142 and 910 MHz, and it doesn't depend on the rod.
 *
 * Speed. A centre-fed Yagi is symmetric about the boom, so only even currents exist. Folding the
 * tents into even pairs halves the unknowns and makes the elimination eight times faster.
 *
 * Millimetres, MHz. No DOM: this file runs in a page, a Web Worker and Node.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  const C = 299.792458;           // speed of light: lambda[mm] = C * 1000 / f[MHz]
  const ETA = 376.730313;         // free-space impedance, ohm
  const MU0 = 4e-7 * Math.PI;     // H/m
  const FAST_ZETA = 20;           // beyond this many radii the averaged kernel needs no AGM
  const THICK_RATIO = 0.08;       // radius / spacing above which a neighbour is averaged round its circle
  const THICK_POINTS = 8;         // points round that circle
  const Q_SINGULAR = 16;          // Gauss points on a panel touching the source (log-singular)
  const Q_NEAR = 8;               // on a panel close to the source
  const Q_FAR = 4;                // on a panel far from the source
  const MESH_GROWTH = 0.35;       // panel size grows by this many mm per mm away from a tip or gap
  const MESH_TIP = 0.5;           // tip panel size, in radii
  const MESH_MAX = 1 / 20;        // largest panel, in wavelengths
  const TIP_FIX = 0.116;          // numerical shortening of a rod, per end, as a share of its tip panel (measured)
  const LEAD_FIT = 0.26;          // added to ln(a / r) in the feed wire's reactance: fits tests/gap_reference.py within about 1 ohm

  const MATERIALS = {             // conductivity, S/m
    aluminium: { name: "Aluminium", sigma: 3.5e7 },
    brass: { name: "Brass", sigma: 1.5e7 },
    copper: { name: "Copper", sigma: 5.8e7 },
    steel: { name: "Stainless steel", sigma: 1.4e6 },
    perfect: { name: "Lossless", sigma: Infinity },
  };

  const QUALITY = {               // panels per unit of the mesh density (see meshCount)
    draft: 0.5, normal: 1.0, fine: 1.8, reference: 3.2,
  };

  /** Gauss-Legendre nodes and weights on [0, 1], cached. */
  const glCache = new Map();
  function gaussLegendre01(n) {
    let g = glCache.get(n);
    if (g) return g;
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
    g = { x, w };
    glCache.set(n, g);
    return g;
  }

  /** Gauss rule on [0, 1] crowded at both ends, for log singularities at a panel's ends. */
  const endCache = new Map();
  function endClustered01(n) {
    let g = endCache.get(n);
    if (g) return g;
    const b = gaussLegendre01(n);
    const x = new Float64Array(n), w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = b.x[i], s2 = s * s, s1 = 1 - s;
      x[i] = s * s2 * (10 + s * (-15 + 6 * s));       // smootherstep
      w[i] = b.w[i] * 30 * s2 * s1 * s1;
    }
    g = { x, w };
    endCache.set(n, g);
    return g;
  }

  function agm(a, b) {
    for (let i = 0; i < 12; i++) {
      const m = 0.5 * (a + b), g = Math.sqrt(a * b);
      if (Math.abs(a - b) < 1e-13 * m) return m;
      a = m; b = g;
    }
    return a;
  }

  /** The panel sizes wanted at distance z from the centre of a half rod. */
  function panelSize(z, h, a, lam, gap) {
    const tip = MESH_TIP * a + MESH_GROWTH * (h - z);
    const dMax = lam * MESH_MAX;
    const mid = gap > 0 ? 0.5 * gap + MESH_GROWTH * z : dMax;
    return Math.min(tip, mid, dMax);
  }

  /** Integral of 1 / panelSize over the half rod: how many panels the mesh wants at size 1. */
  function meshDensity(h, a, lam, gap, out) {
    const n = 400, dz = h / n;
    let sum = 0;
    if (out) out[0] = 0;
    let prev = 1 / panelSize(0, h, a, lam, gap);
    for (let i = 1; i <= n; i++) {
      const v = 1 / panelSize(i * dz, h, a, lam, gap);
      sum += 0.5 * (prev + v) * dz;
      prev = v;
      if (out) out[i] = sum;
    }
    return sum;
  }

  /** Panels on a half rod. Fixed across the usual lengths, so results stay smooth in length. */
  function meshCount(h, a, lam, gap, quality) {
    const ref = Math.max(h, 0.3 * lam);
    return Math.max(3, Math.ceil(meshDensity(ref, a, lam, gap) * quality));
  }

  /** Graded half-rod nodes: z[0] = 0 ... z[m] = h, equally spaced in the mesh density. */
  function meshNodes(h, a, lam, gap, m) {
    const cdf = new Float64Array(401);
    const total = meshDensity(h, a, lam, gap, cdf);
    const z = new Float64Array(m + 1), dz = h / 400;
    let j = 0;
    for (let i = 1; i < m; i++) {
      const target = total * i / m;
      while (j < 399 && cdf[j + 1] < target) j++;
      z[i] = (j + (target - cdf[j]) / (cdf[j + 1] - cdf[j])) * dz;
    }
    z[m] = h;
    return z;
  }

  /**
   * Turns a design into wires.
   * design: { f0, feed, gap, z0, material, endCap, elements: [{ x, y?, L, d, material?, sigma? }],
   *           extra: [more wires, such as a mast] }
   * options: { quality: "normal" or a number, counts: [panels per half rod, to pin the mesh] }
   */
  function buildWires(design, options) {
    const o = options || {};
    const q = typeof o.quality === "number" ? o.quality : QUALITY[o.quality || "normal"];
    const lam0 = C * 1000 / design.f0;
    const cap = design.endCap === undefined ? YS.END_CAP : design.endCap;
    const gap = design.gap === undefined ? 3 : design.gap;
    const list = design.elements.concat(design.extra || []);
    return list.map((e, i) => {
      const a = e.d / 2;
      const L0 = e.L + 2 * cap * a;                // flat-ended rods act longer than open tubes
      const g = i === design.feed ? gap : 0;
      const m = o.counts && o.counts[i] ? o.counts[i] : meshCount(L0 / 2, a, lam0, g, q);
      const sigma = e.sigma !== undefined ? e.sigma : (MATERIALS[e.material] || MATERIALS[design.material] || MATERIALS.aluminium).sigma;
      const z = meshNodes(L0 / 2, a, lam0, g, m);
      // coarse tip panels make a rod act short by a fixed share of the panel: put that back
      const h = L0 / 2 + TIP_FIX * (z[m] - z[m - 1]);
      const stretch = 2 * h / L0, L = 2 * h;
      for (let j = 0; j <= m; j++) z[j] *= stretch;
      const d = new Float64Array(m);
      for (let j = 0; j < m; j++) d[j] = z[j + 1] - z[j];
      return { x: e.x, y: e.y || 0, L, h, a, sigma, m, z, d, off: 0, leadX: i === design.feed ? feedWireX(design, a) : 0 };
    });
  }

  /**
   * The coax's leads in the feed gap: series reactance per MHz, in ohm. The rod is modelled as full thickness up to
   * the gap, but across it the current really runs in the coax's thin centre wire and braid, one to each half (design.feedWire,
   * the centre wire's diameter in mm; 0 leaves it out). Nothing joins the halves. This is
   * the inductance of a wire thinner than the rod it replaces, w mu0 / (2 pi) * gap * ln(a / r), plus a small fit.
   */
  function feedWireX(design, a) {
    const gap = design.gap === undefined ? 3 : design.gap, wire = design.feedWire || 0;
    if (!(wire > 0) || !(gap > 0) || wire / 2 >= a) return 0;
    return 1.25664e-3 * gap * (Math.log(a / (wire / 2)) + LEAD_FIT);
  }

  function assignOffsets(wires) {
    let off = 0;
    for (const w of wires) { w.off = off; off += w.m; }
    return off;
  }

  function workspace(size) {
    return { size, re: new Float64Array(size * size), im: new Float64Array(size * size),
      vr: new Float64Array(size), vi: new Float64Array(size), v0: new Float64Array(size), piv: new Int32Array(size) };
  }

  /**
   * The even-source potentials on the panels of test wire wi, from source points of wire wj.
   * Writes, for panel j and source s: the integral over the panel of each of the two shape
   * functions times Phi_s(z), where Phi_0 = g(z) and Phi_s = g(z - zs) + g(z + zs).
   * dn: the shape falling away from panel's lower node; up: the shape rising toward its upper.
   */
  function panelPotentials(wi, wj, k, same, rho, buf) {
    const mi = wi.m, nj = wj.m + 1, zi = wi.z, zj = wj.z;
    const dnR = buf.dnR, dnI = buf.dnI, upR = buf.upR, upI = buf.upI;
    const a = wi.a, a2 = a * a, rho2 = rho * rho, zetaFast = FAST_ZETA * a;
    const thick = Math.max(wi.a, wj.a);
    const useCircle = !same && thick / rho > THICK_RATIO;
    const cosTab = buf.cosTab, sinTab = buf.sinTab;
    const ruleEnd = endClustered01(Q_SINGULAR), ruleNear = gaussLegendre01(Q_NEAR), ruleFar = gaussLegendre01(Q_FAR), ruleThin = gaussLegendre01(3);
    const shapes = (rule, dj, sinD, out) => {
      for (let q = 0; q < rule.x.length; q++) {
        const t = rule.x[q] * dj;
        out.t[q] = t;
        out.fd[q] = rule.w[q] * dj * Math.sin(k * (dj - t)) / sinD;
        out.fu[q] = rule.w[q] * dj * Math.sin(k * t) / sinD;
      }
    };
    const sEnd = buf.sEnd, sNear = buf.sNear, sFar = buf.sFar, sThin = buf.sThin;

    for (let j = 0; j < mi; j++) {
      const dj = wi.d[j], zLo = zi[j], sinD = Math.sin(k * dj), zHi = zLo + dj;
      // the shape functions depend only on this panel: work them out once for each rule in use
      let single = null;
      if (same) {
        shapes(ruleEnd, dj, sinD, sEnd);
        shapes(ruleNear, dj, sinD, sNear);
        shapes(ruleFar, dj, sinD, sFar);
      } else {
        single = dj > rho ? sNear : dj > 0.4 * rho ? sFar : sThin;
        shapes(dj > rho ? ruleNear : dj > 0.4 * rho ? ruleFar : ruleThin, dj, sinD, single);
      }
      for (let s = 0; s < nj; s++) {
        const zs = zj[s];
        let sh = single;
        if (same) {
          const dLo = zLo - zs, dHi = zHi - zs;
          const dist = Math.min(dLo < 0 ? -dLo : dLo, dHi < 0 ? -dHi : dHi);
          sh = s === j || s === j + 1 ? sEnd : dist < 1.6 * dj ? sNear : sFar;
        }
        const qn = sh.n, T = sh.t, FD = sh.fd, FU = sh.fu;
        let dr = 0, di = 0, ur = 0, ui = 0;
        for (let q = 0; q < qn; q++) {
          const z = zLo + T[q];
          let gr = 0, gi = 0;
          const nImages = s === 0 ? 1 : 2;
          for (let im = 0; im < nImages; im++) {
            const dz = im === 0 ? z - zs : z + zs;
            if (same) {
              const az = dz < 0 ? -dz : dz, R = Math.sqrt(az * az + 2 * a2), kR = k * R, sk = Math.sin(kR);
              if (az > zetaFast) {
                gr += Math.cos(kR) / R;
                gi -= sk / R;
              } else {
                const half = Math.sin(0.5 * kR);
                gr += 1 / agm(Math.sqrt(az * az + 4 * a2), Math.max(az, 1e-300)) - 2 * half * half / R;
                gi -= sk / R;
              }
            } else if (!useCircle) {
              const R = Math.sqrt(dz * dz + rho2), kR = k * R;
              gr += Math.cos(kR) / R;
              gi -= Math.sin(kR) / R;
            } else {
              // a thick neighbour, such as a mast: average round its circle
              for (let c = 0; c < THICK_POINTS; c++) {
                const rx = rho + thick * cosTab[c], ry = thick * sinTab[c];
                const R = Math.sqrt(dz * dz + rx * rx + ry * ry), kR = k * R;
                gr += Math.cos(kR) / R / THICK_POINTS;
                gi -= Math.sin(kR) / R / THICK_POINTS;
              }
            }
          }
          const fd = FD[q], fu = FU[q];
          dr += fd * gr; di += fd * gi;
          ur += fu * gr; ui += fu * gi;
        }
        const ix = j * nj + s;
        dnR[ix] = 2 * dr; dnI[ix] = 2 * di;
        upR[ix] = 2 * ur; upI[ix] = 2 * ui;
      }
    }
  }

  const shapeTable = (n) => ({ n, t: new Float64Array(n), fd: new Float64Array(n), fu: new Float64Array(n) });

  /** Fills the even-mode impedance matrix at wavenumber k. */
  function fill(wires, k, omega, ws) {
    const re = ws.re, im = ws.im, N = ws.size;
    let maxM = 0;
    for (const w of wires) maxM = Math.max(maxM, w.m);
    const bufSize = maxM * (maxM + 1);
    const buf = ws.buf && ws.buf.size === bufSize ? ws.buf : {
      size: bufSize, dnR: new Float64Array(bufSize), dnI: new Float64Array(bufSize),
      upR: new Float64Array(bufSize), upI: new Float64Array(bufSize),
      cosTab: Float64Array.from({ length: THICK_POINTS }, (_, c) => Math.cos((c + 0.5) * 2 * Math.PI / THICK_POINTS)),
      sinTab: Float64Array.from({ length: THICK_POINTS }, (_, c) => Math.sin((c + 0.5) * 2 * Math.PI / THICK_POINTS)),
      sEnd: shapeTable(Q_SINGULAR), sNear: shapeTable(Q_NEAR), sFar: shapeTable(Q_FAR), sThin: shapeTable(3),
    };
    ws.buf = buf;
    const preIm = ETA / (4 * Math.PI);    // Z = j preIm * (...)
    if (!ws.fold || ws.fold.size < maxM + 2) {
      ws.fold = { size: maxM + 2, csc: new Float64Array(maxM + 2), cot: new Float64Array(maxM + 2), brow: new Float64Array(maxM + 2), bimg: new Float64Array(maxM + 2) };
    }
    const { csc, cot, brow, bimg } = ws.fold;

    for (let ii = 0; ii < wires.length; ii++) {
      const wi = wires[ii];
      for (let jj = ii; jj < wires.length; jj++) {
        const wj = wires[jj], same = ii === jj;
        const dx = wi.x - wj.x, dy = wi.y - wj.y, rho = Math.hypot(dx, dy);
        panelPotentials(wi, wj, k, same, rho, buf);
        const nj = wj.m + 1, mj = wj.m;
        // 1 / sin(k d) and cot(k d) for each source panel
        for (let q = 0; q < mj; q++) {
          const kq = k * wj.d[q], sq = Math.sin(kq);
          csc[q] = 1 / sq;
          cot[q] = Math.cos(kq) / sq;
        }
        const dnR = buf.dnR, dnI = buf.dnI, upR = buf.upR, upI = buf.upI;
        for (let p = 0; p < wi.m; p++) {
          // B_{p,s}: test tent p against source point s, from its two panels
          const rowD = p * nj, rowU = (p - 1) * nj;
          for (let s = 0; s < nj; s++) {
            brow[s] = dnR[rowD + s] + (p > 0 ? upR[rowU + s] : 0);
            bimg[s] = dnI[rowD + s] + (p > 0 ? upI[rowU + s] : 0);
          }
          const r0 = (wi.off + p) * N + wj.off;
          for (let q = 0; q < mj; q++) {
            let er, ei;
            if (q === 0) {
              er = brow[1] * csc[0] - 2 * cot[0] * brow[0];
              ei = bimg[1] * csc[0] - 2 * cot[0] * bimg[0];
            } else {
              const below = q === 1 ? 2 : 1;      // both mirror tents share the centre node
              const cc = cot[q] + cot[q - 1];
              er = brow[q + 1] * csc[q] + below * brow[q - 1] * csc[q - 1] - cc * brow[q];
              ei = bimg[q + 1] * csc[q] + below * bimg[q - 1] * csc[q - 1] - cc * bimg[q];
            }
            const vr = -preIm * ei, vi = preIm * er;
            re[r0 + q] = vr; im[r0 + q] = vi;
            if (!same) {
              const r2 = (wj.off + q) * N + wi.off + p;
              re[r2] = vr; im[r2] = vi;      // Galerkin: the matrix is symmetric
            }
          }
        }
      }
      // skin effect: a surface impedance per unit length of rod, over the tent overlaps
      if (isFinite(wi.sigma)) {
        const rs = Math.sqrt(omega * MU0 / (2 * wi.sigma));
        const zs = rs / (2 * Math.PI * wi.a * 1e-3) * 1e-3;   // ohm per mm; real and imaginary parts equal
        for (let j = 0; j < wi.m; j++) {
          const kd = k * wi.d[j], s = Math.sin(kd), c = Math.cos(kd), s2 = s * s;
          const selfOv = (kd - s * c) / (2 * k * s2);         // a side of a tent, squared
          const nbrOv = (s - kd * c) / (2 * k * s2);          // a side of a tent times its neighbour
          // every even basis counts the half rod twice (see panelPotentials)
          const p0 = wi.off + j, p1 = wi.off + j + 1;
          re[p0 * N + p0] += 2 * zs * selfOv; im[p0 * N + p0] += 2 * zs * selfOv;
          if (j + 1 < wi.m) {
            re[p1 * N + p1] += 2 * zs * selfOv; im[p1 * N + p1] += 2 * zs * selfOv;
            const scale = j === 0 ? 2 : 2;
            re[p0 * N + p1] += scale * zs * nbrOv; im[p0 * N + p1] += scale * zs * nbrOv;
            re[p1 * N + p0] += scale * zs * nbrOv; im[p1 * N + p0] += scale * zs * nbrOv;
          }
        }
      }
    }
  }

  /** The gap excitation: 1 V across a gap of width g at the centre of the fed rod. */
  function excitation(wires, feed, gap, k, ws) {
    ws.vr.fill(0); ws.vi.fill(0);
    const w = wires[feed];
    if (!(gap > 0)) { ws.vr[w.off] = 1; ws.v0.set(ws.vr); return; }
    const half = gap / 2;
    // <b_p, E> = 2 * integral over z > 0 of the tent, with E = 1 / gap inside the gap
    for (let j = 0; j < w.m; j++) {
      const lo = w.z[j], hi = Math.min(w.z[j + 1], half);
      if (hi <= lo) break;
      const d = w.d[j], s = Math.sin(k * d);
      const fall = (Math.cos(k * (d - (hi - lo))) - Math.cos(k * d)) / (k * s);   // the tent at node j, on this panel
      const rise = (Math.cos(k * 0) - Math.cos(k * (hi - lo))) / (k * s);         // the tent at node j + 1
      ws.vr[w.off + j] += 2 * fall / gap;
      if (j + 1 < w.m) ws.vr[w.off + j + 1] += 2 * rise / gap;
    }
    ws.v0.set(ws.vr);
  }

  /** In-place complex LU with partial pivoting; solves for ws.vr + j ws.vi. */
  function solveInPlace(ws) {
    const n = ws.size, a = ws.re, b = ws.im, xr = ws.vr, xi = ws.vi;
    for (let c = 0; c < n; c++) {
      let best = c, mag = -1;
      for (let r = c; r < n; r++) {
        const i = r * n + c, m = a[i] * a[i] + b[i] * b[i];
        if (m > mag) { mag = m; best = r; }
      }
      if (best !== c) {
        const i1 = c * n, i2 = best * n;
        for (let j = 0; j < n; j++) {
          let t = a[i1 + j]; a[i1 + j] = a[i2 + j]; a[i2 + j] = t;
          t = b[i1 + j]; b[i1 + j] = b[i2 + j]; b[i2 + j] = t;
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

  /** Solves one frequency: the current coefficients and the input impedance. */
  function solveAt(wires, feed, gap, fMHz, ws) {
    const lam = C * 1000 / fMHz, k = 2 * Math.PI / lam, omega = 2 * Math.PI * fMHz * 1e6;
    fill(wires, k, omega, ws);
    excitation(wires, feed, gap, k, ws);
    solveInPlace(ws);
    let yr = 0, yi = 0;
    for (let i = 0; i < ws.size; i++) { yr += ws.v0[i] * ws.vr[i]; yi += ws.v0[i] * ws.vi[i]; }
    const den = yr * yr + yi * yi;
    return { f: fMHz, k, zr: yr / den, zi: -yi / den, yr, yi, ir: ws.vr, ii: ws.vi };
  }

  /**
   * One side of a tent's radiation integral, of width d, at direction cosine u:
   * the integral over t from 0 to d of sin(k (d - t)) / sin(k d) * exp(j k u t).
   */
  function sideIntegral(k, d, u, out) {
    const kd = k * d, s = Math.sin(kd), den = k * (1 - u * u) * s;
    const ph = k * u * d;
    out[0] = (Math.cos(ph) - Math.cos(kd)) / den;
    out[1] = (Math.sin(ph) - u * s) / den;
  }

  const sideTmp = new Float64Array(2);
  /** The real radiation weight of every even basis at direction cosine u, for one wire. */
  function basisWeights(w, k, u, out) {
    for (let p = 0; p < w.m; p++) {
      const zp = w.z[p], ph = k * u * zp, cp = Math.cos(ph), sp = Math.sin(ph);
      sideIntegral(k, w.d[p], u, sideTmp);
      let ar = sideTmp[0], ai = sideTmp[1];
      if (p === 0) {
        out[p] = 2 * ar;
        continue;
      }
      sideIntegral(k, w.d[p - 1], u, sideTmp);
      ar += sideTmp[0];
      ai -= sideTmp[1];
      out[p] = 2 * (ar * cp - ai * sp);
    }
  }

  /** The radiation integral of the even currents in a direction. Writes real, imag to out. */
  function fieldAt(wires, sol, u, sx, sy, sinT, out) {
    const k = sol.k;
    let fr = 0, fi = 0;
    if (Math.abs(sinT) < 1e-9) { out[0] = 0; out[1] = 0; return; }
    for (const w of wires) {
      const wt = w.wt || (w.wt = new Float64Array(w.m));
      if (w.wtK !== k || w.wtU !== u) { basisWeights(w, k, u, wt); w.wtK = k; w.wtU = u; }
      let sr = 0, si = 0;
      for (let p = 0; p < w.m; p++) {
        sr += sol.ir[w.off + p] * wt[p];
        si += sol.ii[w.off + p] * wt[p];
      }
      const ph = k * (w.x * sx + w.y * sy), cp = Math.cos(ph), sp = Math.sin(ph);
      fr += sr * cp - si * sp;
      fi += sr * sp + si * cp;
    }
    out[0] = fr * sinT;
    out[1] = fi * sinT;
  }

  /** Power gain per |F|^2, against the input power at 1 V. */
  function gainFactor(sol) {
    const pin = 0.5 * sol.yr;
    return 4 * Math.PI * ETA / 2 * Math.pow(sol.k / (4 * Math.PI), 2) / pin;
  }

  function gainDbi(wires, sol, th, ph) {
    const out = new Float64Array(2), s = Math.sin(th);
    fieldAt(wires, sol, Math.cos(th), s * Math.cos(ph), s * Math.sin(ph), s, out);
    return 10 * Math.log10(Math.max(gainFactor(sol) * (out[0] * out[0] + out[1] * out[1]), 1e-30));
  }

  function swrOf(zr, zi, z0) {
    const nr = zr - z0, dr = zr + z0;
    const g = Math.sqrt((nr * nr + zi * zi) / (dr * dr + zi * zi));
    return g >= 1 ? Infinity : (1 + g) / (1 - g);
  }

  /** Integrated directivity in dBi, to check the input-power route to gain. */
  function directivityDbi(wires, sol, nth, nph) {
    nth = nth || 181; nph = nph || 180;
    const out = new Float64Array(2);
    let tot = 0;
    const dT = Math.PI / (nth - 1), dP = 2 * Math.PI / nph;
    for (let i = 1; i < nth - 1; i++) {
      const th = i * dT, s = Math.sin(th), u = Math.cos(th);
      for (let j = 0; j < nph; j++) {
        const ph = j * dP;
        fieldAt(wires, sol, u, s * Math.cos(ph), s * Math.sin(ph), s, out);
        tot += s * (out[0] * out[0] + out[1] * out[1]);
      }
    }
    tot *= dT * dP;
    fieldAt(wires, sol, 0, 1, 0, 1, out);
    return 10 * Math.log10(4 * Math.PI * (out[0] * out[0] + out[1] * out[1]) / tot);
  }

  /** Ohmic power at 1 V, from the same overlaps as the matrix, for the radiation efficiency. */
  function ohmicPower(wires, sol, fMHz) {
    const k = sol.k, omega = 2 * Math.PI * fMHz * 1e6;
    let total = 0;
    for (const w of wires) {
      if (!isFinite(w.sigma)) continue;
      const rs = Math.sqrt(omega * MU0 / (2 * w.sigma));
      const r = rs / (2 * Math.PI * w.a * 1e-3) * 1e-3;
      for (let j = 0; j < w.m; j++) {
        const kd = k * w.d[j], s = Math.sin(kd), c = Math.cos(kd), s2 = s * s;
        const selfOv = (kd - s * c) / (2 * k * s2), nbrOv = (s - kd * c) / (2 * k * s2);
        const ar = sol.ir[w.off + j], ai = sol.ii[w.off + j];
        const br = j + 1 < w.m ? sol.ir[w.off + j + 1] : 0, bi = j + 1 < w.m ? sol.ii[w.off + j + 1] : 0;
        // the panel appears on both halves of the rod
        total += 0.5 * r * 2 * (selfOv * (ar * ar + ai * ai + br * br + bi * bi) + 2 * nbrOv * (ar * br + ai * bi));
      }
    }
    return total;
  }

  /** Current along each rod, normalised to the largest in the array. */
  function currents(wires, sol) {
    const out = [];
    let peak = 0;
    for (const w of wires) {
      const z = [], mag = [], phase = [];
      for (let p = 0; p <= w.m; p++) {
        const r = p < w.m ? sol.ir[w.off + p] : 0, i = p < w.m ? sol.ii[w.off + p] : 0;
        const m = Math.hypot(r, i);
        z.push(w.z[p]); mag.push(m);
        phase.push(Math.atan2(i, r) * 180 / Math.PI);
        if (m > peak) peak = m;
      }
      out.push({ x: w.x, z, mag, phase });
    }
    for (const c of out) c.mag = c.mag.map((m) => m / (peak || 1));
    return out;
  }

  /** Half-power width of a cut (degrees, dB) around its peak at index 0. */
  function halfPowerWidth(angles, gains) {
    const n = gains.length, level = gains[0] - 3.0103;
    const walk = (dir) => {
      let i = 0, dist = 0;
      for (let step = 0; step < n; step++) {
        const j = (i + dir + n) % n;
        const da = Math.abs(((angles[j] - angles[i] + 540) % 360) - 180);
        if (gains[j] <= level) return dist + da * (gains[i] - level) / (gains[i] - gains[j]);
        dist += da;
        i = j;
      }
      return NaN;
    };
    return walk(1) + walk(-1);
  }

  /** Front-to-rear, beamwidths and side lobes, from the two pattern cuts. */
  function cutFigures(r, gDbi, angles, h, e) {
    const n = angles.length;
    let rear = -Infinity;
    for (let i = 91; i < 270; i++) rear = Math.max(rear, h[i], e[i]);
    r.fr = gDbi - rear;
    r.bwH = halfPowerWidth(angles, h);
    r.bwE = halfPowerWidth(angles, e);
    let side = -Infinity;
    for (let i = 0; i < n; i++) {
      if (Math.min(i, n - i) > r.bwH / 2 + 8) side = Math.max(side, h[i]);
    }
    r.sll = gDbi - side;
  }

  /**
   * The summary for one frequency. level: 0 = Z, gain, F/B; 1 = adds pattern cuts, beamwidths and
   * front-to-rear; 2 = adds currents and efficiency.
   */
  function metricsAt(wires, feed, gap, f, ws, z0, level) {
    const sol = solveAt(wires, feed, gap, f, ws);
    const gf = gainFactor(sol), zi = sol.zi + (wires[feed].leadX || 0) * f;
    const out = new Float64Array(2);
    fieldAt(wires, sol, 0, 1, 0, 1, out);
    const front = gf * (out[0] * out[0] + out[1] * out[1]);
    fieldAt(wires, sol, 0, -1, 0, 1, out);
    const back = gf * (out[0] * out[0] + out[1] * out[1]);
    const gDbi = 10 * Math.log10(Math.max(front, 1e-30));
    const r = { f, z: [sol.zr, zi], swr: swrOf(sol.zr, zi, z0), gainDbi: gDbi, gainDbd: gDbi - 2.15,
      fb: gDbi - 10 * Math.log10(Math.max(back, 1e-30)) };
    if (level >= 1) {
      const n = 360, angles = new Array(n), h = new Array(n), e = new Array(n);
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        angles[i] = i;
        fieldAt(wires, sol, 0, ca, sa, 1, out);    // H-plane: across the rods
        h[i] = 10 * Math.log10(Math.max(gf * (out[0] * out[0] + out[1] * out[1]), 1e-12));
        fieldAt(wires, sol, sa, ca, 0, Math.abs(ca), out);   // E-plane: along the rods
        e[i] = 10 * Math.log10(Math.max(gf * (out[0] * out[0] + out[1] * out[1]), 1e-12));
      }
      r.cuts = { angles, h, e };
      if (level >= 2) {
        // the complex field down the two elevation cuts, for the pattern over ground
        const m = 361, ev = new Array(m), hv = new Array(m), rootGf = Math.sqrt(gf);
        for (let i = 0; i < m; i++) {
          const a = (i - 180) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
          fieldAt(wires, sol, sa, ca, 0, Math.abs(ca), out);       // rods vertical: up the rods
          ev[i] = [rootGf * out[0], rootGf * out[1]];
          fieldAt(wires, sol, 0, ca, sa, 1, out);                  // rods horizontal: across them
          hv[i] = [rootGf * out[0], rootGf * out[1]];
        }
        r.fieldCuts = { e: ev, h: hv };
      }
      cutFigures(r, gDbi, angles, h, e);
    }
    if (level >= 2) {
      r.currents = currents(wires, sol);
      r.efficiency = 1 - ohmicPower(wires, sol, f) / (0.5 * sol.yr);
    }
    return r;
  }

  /** Whether a design needs the general solver (crooked.js). */
  function isCrooked(design) {
    return design.elements.some((e) => e.crook || e.fold);
  }

  /** Runs a list of frequencies on a design. */
  function sweep(design, freqs, options) {
    const opts = options || {};
    if (isCrooked(design)) return YS.crooked.sweep(design, freqs, opts);
    const wires = buildWires(design, opts);
    const size = assignOffsets(wires);
    const ws = opts.ws && opts.ws.size === size ? opts.ws : workspace(size);
    const z0 = design.z0 || 50, gap = design.gap === undefined ? 3 : design.gap;
    return freqs.map((f) => metricsAt(wires, design.feed, gap, f, ws, z0, opts.level || 0));
  }

  /** The full radiation pattern as a grid in dBi, for the 3D view. */
  function pattern3d(design, f, options) {
    const o = options || {};
    if (isCrooked(design)) return YS.crooked.pattern3d(design, f, o);
    const wires = buildWires(design, o);
    const ws = workspace(assignOffsets(wires));
    const sol = solveAt(wires, design.feed, design.gap === undefined ? 3 : design.gap, f, ws);
    const gf = gainFactor(sol), out = new Float64Array(2);
    const nth = o.nth || 61, nph = o.nph || 121;
    const g = new Float32Array(nth * nph);
    for (let i = 0; i < nth; i++) {
      const th = Math.PI * i / (nth - 1), s = Math.sin(th), u = Math.cos(th);
      for (let j = 0; j < nph; j++) {
        const ph = 2 * Math.PI * j / (nph - 1);
        fieldAt(wires, sol, u, s * Math.cos(ph), s * Math.sin(ph), s, out);
        g[i * nph + j] = 10 * Math.log10(Math.max(gf * (out[0] * out[0] + out[1] * out[1]), 1e-6));
      }
    }
    return { nth, nph, g };
  }

  Object.assign(YS, { C, ETA, MATERIALS, QUALITY, END_CAP: 0.10, buildWires, assignOffsets, workspace, solveAt, metricsAt,
    sweep, pattern3d, gainDbi, gainFactor, directivityDbi, swrOf, currents, fieldAt, meshNodes, meshCount, cutFigures, isCrooked, feedWireX });
})(typeof globalThis !== "undefined" ? globalThis : this);
