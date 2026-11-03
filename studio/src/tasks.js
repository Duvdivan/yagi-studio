/*
 * Yagi Studio: the heavy calculations, as plain functions of plain data, so they can run in a Web
 * Worker or, where workers are blocked, on the page. Optimiser cost, build-error study,
 * sensitivity, and the fit of the model to VNA readings. No DOM.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  const FIT_PULL = 2e-4;      // how strongly the fit prefers small changes to the rods, per mm squared
  const CABLE_RANGE = 70;     // how far the fit may move an entered cable length, mm

  /** Seeded random numbers, so a study can be repeated. Mulberry32. */
  function rng(seed) {
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.normal = () => {
      const u = Math.max(next(), 1e-12), v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return next;
  }

  function nelderMead(fn, x0, steps, maxEval) {
    const n = x0.length;
    let simplex = [x0.slice()];
    for (let i = 0; i < n; i++) {
      const p = x0.slice();
      p[i] += steps[i];
      simplex.push(p);
    }
    let vals = simplex.map(fn), evals = n + 1;
    while (evals < maxEval) {
      const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
      simplex = order.map((i) => simplex[i]);
      vals = order.map((i) => vals[i]);
      if (Math.abs(vals[n] - vals[0]) < 1e-5) break;
      const c = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
      const worst = simplex[n];
      const at = (t) => c.map((v, j) => v + t * (worst[j] - v));
      const r = at(-1), fr = fn(r);
      evals++;
      if (fr < vals[0]) {
        const e = at(-2), fe = fn(e);
        evals++;
        if (fe < fr) { simplex[n] = e; vals[n] = fe; } else { simplex[n] = r; vals[n] = fr; }
      } else if (fr < vals[n - 1]) {
        simplex[n] = r; vals[n] = fr;
      } else {
        const k = at(fr < vals[n] ? -0.5 : 0.5), fk = fn(k);
        evals++;
        if (fk < Math.min(fr, vals[n])) { simplex[n] = k; vals[n] = fk; } else {
          for (let i = 1; i <= n; i++) {
            simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
            vals[i] = fn(simplex[i]);
            evals++;
          }
        }
      }
    }
    let b = 0;
    for (let i = 1; i <= n; i++) if (vals[i] < vals[b]) b = i;
    return { x: simplex[b], value: vals[b], evals };
  }

  /* ---------- a solver run that reuses its mesh and matrix ---------- */
  function runner(solver, quality, counts) {
    const opts = { quality: quality || "draft" };
    const pin = counts || YS.buildWires(solver, opts).map((w) => w.m);
    let size = 0;
    for (const m of pin) size += m;
    const ws = YS.workspace(size);
    const run = (s, f, level) => {
      if (YS.isCrooked(s)) return YS.crooked.sweep(s, [f], { counts: pin, level })[0];
      const wires = YS.buildWires(s, { counts: pin });
      YS.assignOffsets(wires);
      return YS.metricsAt(wires, s.feed, s.gap === undefined ? 3 : s.gap, f, ws, s.z0 || 50, level || 0);
    };
    /** For many frequencies on one unchanged design: builds its mesh once. */
    run.fixed = (s) => {
      if (YS.isCrooked(s)) {
        const sys = YS.crooked.prepare(s, { counts: pin });
        return (f, level) => YS.crooked.metrics(sys, f, level || 0);
      }
      const wires = YS.buildWires(s, { counts: pin });
      YS.assignOffsets(wires);
      return (f, level) => YS.metricsAt(wires, s.feed, s.gap === undefined ? 3 : s.gap, f, ws, s.z0 || 50, level || 0);
    };
    return run;
  }

  /** The lowest SWR on a frequency grid, refined with a parabola through its neighbours. */
  function valleyOf(run, s, lo, hi, n) {
    let bestI = 0, best = Infinity;
    const fs = [], vals = [], at = run.fixed(s);
    for (let i = 0; i < n; i++) {
      const f = lo + (hi - lo) * i / (n - 1), v = Math.log(at(f).swr);
      fs.push(f); vals.push(v);
      if (v < best) { best = v; bestI = i; }
    }
    let f = fs[bestI];
    if (bestI > 0 && bestI < n - 1) {
      const a = vals[bestI - 1], b = vals[bestI], c = vals[bestI + 1], den = a - 2 * b + c;
      if (den > 0) f += 0.5 * (a - c) / den * (fs[1] - fs[0]);
    }
    return { f, swr: Math.exp(best) };
  }

  /* ---------- optimiser ---------- */
  /**
   * ctx: { base: solver design, vars: [{ kind: "L", i, lo, hi } | { kind: "s", i, lo, hi }],
   *        goals: { fbMin, swrMax, gainWeight, fbWeight, swrWeight, boomMax, boomFixed, minGap },
   *        counts, freqs }
   */
  function applyVector(ctx, v) {
    const b = ctx.base;
    const elements = b.elements.map((e) => ({ x: e.x, L: e.L, d: e.d, material: e.material }));
    const spacing = [];
    for (let i = 0; i + 1 < elements.length; i++) spacing.push(elements[i + 1].x - elements[i].x);
    const free = new Array(spacing.length).fill(false);
    ctx.vars.forEach((va, j) => {
      if (va.kind === "L") elements[va.i].L = v[j];
      else { spacing[va.i] = v[j]; free[va.i] = true; }
    });
    const g = ctx.goals;
    let total = 0, fixed = 0;
    spacing.forEach((s, i) => { total += s; if (!free[i]) fixed += s; });
    const target = g.boomFixed ? g.boomFixed : g.boomMax && total > g.boomMax ? g.boomMax : 0;
    if (target && total > fixed) {
      const k = Math.max(target - fixed, 1e-3) / (total - fixed);
      spacing.forEach((s, i) => { if (free[i]) spacing[i] = s * k; });
    }
    let x = elements[0].x;
    for (let i = 0; i < spacing.length; i++) { x += spacing[i]; elements[i + 1].x = x; }
    return Object.assign({}, b, { elements });
  }

  const costParts = (ctx, run, s) => {
    const g = ctx.goals;
    let worstGain = Infinity, worstSwr = 0, minFb = Infinity, penalty = 0;
    const at = run.fixed(s);
    for (const f of ctx.freqs) {
      const r = at(f);
      if (r.gainDbd < worstGain) worstGain = r.gainDbd;
      if (r.swr > worstSwr) worstSwr = r.swr;
      if (r.fb < minFb) minFb = r.fb;
      if (r.swr > g.swrMax) penalty += g.swrWeight * Math.min(r.swr - g.swrMax, 30);
      if (r.fb < g.fbMin) penalty += g.fbWeight * (g.fbMin - r.fb);
    }
    // rods packed very closely break the model's assumptions and are hard to build
    for (let i = 0; i + 1 < s.elements.length; i++) {
      const gap = s.elements[i + 1].x - s.elements[i].x;
      if (gap < g.minGap) penalty += 5 * (g.minGap - gap);
    }
    return { worstGain, worstSwr, minFb, cost: -(g.gainWeight || 1) * worstGain + penalty };
  };

  let liveCtx = null, liveRun = null;
  function setContext(ctx) {
    liveCtx = ctx;
    liveRun = runner(ctx.base, "draft", ctx.counts);
    return true;
  }

  function evalVectors(vectors) {
    return vectors.map((v) => costParts(liveCtx, liveRun, applyVector(liveCtx, v)));
  }

  /** The final polish, at higher quality, of the best vector. */
  function polish({ ctx, x0, maxEval }) {
    const run = runner(ctx.base, "normal");
    const steps = ctx.vars.map((va) => Math.max((va.hi - va.lo) * 0.01, 0.2));
    const clamp = (v) => v.map((x, j) => Math.min(ctx.vars[j].hi, Math.max(ctx.vars[j].lo, x)));
    const f = (v) => costParts(ctx, run, applyVector(ctx, clamp(v))).cost;
    const res = nelderMead(f, x0, steps, maxEval || 400);
    const x = clamp(res.x);
    return { x, parts: costParts(ctx, run, applyVector(ctx, x)), solver: applyVector(ctx, x) };
  }

  /* ---------- build errors ---------- */
  /** tol: { rod, pos, trim, seed, f0, count }. rod and pos are typical errors (1 sigma), mm. */
  function monteCarlo({ solver, tol, quality }) {
    const run = runner(solver, quality || "draft");
    const r = rng(tol.seed || 1);
    const out = [];
    const f0 = tol.f0 || solver.f0;
    const span = 0.03 * f0;
    for (let n = 0; n < tol.count; n++) {
      // tol.bend: each half bent this far, typically, any way. The general solver makes this much slower
      const halfBend = () => ({ deg: Math.abs(tol.bend * r.normal()), az: 360 * r(), from: solver.boomFace });
      const elements = solver.elements.map((e, i) => ({
        x: e.x + (i === 0 ? 0 : tol.pos * r.normal()), L: e.L + tol.rod * r.normal(), d: e.d, material: e.material,
        crook: tol.bend ? { upper: halfBend(), lower: halfBend() } : e.crook,
      }));
      const s = Object.assign({}, solver, { elements });
      let trimmed = true;
      if (tol.trim) {
        const x = (L) => { elements[s.feed].L = L; return run(s, f0).z[1]; };
        const start = solver.elements[s.feed].L;
        let a = start - 10, b = start + 12, fa = x(a), fb = x(b), de = start;
        if (fa * fb > 0) trimmed = false;
        else {
          for (let i = 0; i < 12; i++) {
            const m = fb - fa !== 0 ? b - fb * (b - a) / (fb - fa) : (a + b) / 2;
            const c = m > Math.min(a, b) && m < Math.max(a, b) ? m : (a + b) / 2;
            const fc = x(c);
            de = c;
            if (Math.abs(fc) < 0.05) break;
            if (fa * fc <= 0) { b = c; fb = fc; } else { a = c; fa = fc; }
          }
        }
        elements[s.feed].L = de;
      }
      const m = run(s, f0);
      const v = valleyOf(run, s, f0 - span, f0 + span, 13);
      out.push({ swr: m.swr, gain: m.gainDbd, fb: m.fb, driven: elements[s.feed].L, trimmed, valley: v.f });
    }
    return out;
  }

  /* ---------- sensitivity ---------- */
  /** What each rod's length and position does, per millimetre, near the design. */
  function sensitivity({ solver: given, f0, delta, names }) {
    const d = delta || 0.5;
    const solver = Object.assign({}, given, { elements: given.elements.map((e) => ({ x: e.x, L: e.L, d: e.d, material: e.material })) });
    const run = runner(solver, "normal");
    const span = 0.035 * f0;
    const measure = (s) => {
      const m = run(s, f0);
      const v = valleyOf(run, s, f0 - span, f0 + span, 29);
      return { swr: m.swr, gain: m.gainDbd, fb: m.fb, x: m.z[1], r: m.z[0], valley: v.f };
    };
    const base = measure(solver);
    const rows = [];
    const change = (mutate, label, kind, index) => {
      const pert = (sign) => {
        const elements = solver.elements.map((e) => ({ x: e.x, L: e.L, d: e.d, material: e.material }));
        mutate(elements, sign * d);
        return measure(Object.assign({}, solver, { elements }));
      };
      const up = pert(1), dn = pert(-1), per = (k) => (up[k] - dn[k]) / (2 * d);
      rows.push({ label, kind, index, swr: per("swr"), gain: per("gain"), fb: per("fb"), valley: per("valley"), r: per("r"), x: per("x") });
    };
    solver.elements.forEach((e, i) => change((el, t) => { el[i].L += t; }, names[i] + " length", "length", i));
    solver.elements.forEach((e, i) => { if (i > 0) change((el, t) => { el[i].x += t; }, names[i] + " position", "position", i); });
    return { base, rows, delta: d };
  }

  /* ---------- the fit to VNA readings ---------- */
  /**
   * readings: [{ f, swr } or { f, g: [re, im] }]; cable: the line between the feed and the VNA,
   * or null. Finds how much longer or shorter each group of rods acts than its listed length.
   * weightPower: readings count as 1 / SWR^power. Tuning cares most about the valley, and the high
   * SWR sides are where a cable or nearby objects disturb a reading most, so 3 is the usual choice.
   * Comparing against 0 shows which answers depend on that choice.
   * fitCable: also find the cable's length. R and X are rotated by every millimetre of cable, so
   * the entered length is only a starting point; the rotation across a sweep gives the real one.
   */
  /**
   * What a design's bends do to its feed impedance, on a grid and interpolated: the general solver is too
   * slow to run thousands of times in a fit, and this difference barely moves with small changes in length.
   */
  function bendCorrection(solver, lo, hi) {
    if (!YS.isCrooked(solver)) return null;
    const straight = Object.assign({}, solver, { elements: solver.elements.map((e) => ({ x: e.x, L: e.L, d: e.d, material: e.material })) });
    const n = 9, grid = [];
    for (let i = 0; i < n; i++) grid.push(lo + (hi - lo) * i / (n - 1));
    const counts = YS.buildWires(straight, { quality: "draft" }).map((w) => w.m);
    const a = YS.crooked.sweep(solver, grid, { counts }), b = YS.sweep(straight, grid, { counts });
    const d = grid.map((_, i) => [a[i].z[0] - b[i].z[0], a[i].z[1] - b[i].z[1]]);
    return (f) => {
      const u = Math.max(0, Math.min(n - 1.000001, (f - lo) / (hi - lo) * (n - 1))), i = Math.floor(u), w = u - i;
      return [d[i][0] * (1 - w) + d[i + 1][0] * w, d[i][1] * (1 - w) + d[i + 1][1] * w];
    };
  }

  function fitReadings({ design, readings, cable, free, starts, weightPower, fitCable }) {
    const solver = YS.toSolver(Object.assign({}, design, { asBuilt: null }));
    const fs_ = readings.map((p) => p.f), bendFix = bendCorrection(solver, Math.min.apply(null, fs_), Math.max.apply(null, fs_) + 1e-6);
    const run = runner(solver, "draft");
    const roles = solver.elements.map((_, i) => (i === solver.feed ? "driven" : i < solver.feed ? "reflector" : "directors"));
    const groups = ["directors", "driven", "reflector"].filter((g) => free[g]);
    const power = weightPower === undefined ? 3 : weightPower;
    const weights = readings.map((p) => Math.pow(p.g ? YS.swrOfGamma(p.g) : p.swr, -power));
    let misfit = 0;
    const withOffsets = (v) => {
      const off = { directors: 0, driven: 0, reflector: 0 };
      groups.forEach((g, i) => { off[g] = v[i]; });
      const elements = solver.elements.map((e, i) => ({ x: e.x, d: e.d, material: e.material, L: e.L + off[roles[i]] }));
      return Object.assign({}, solver, { elements });
    };
    const nRods = groups.length;
    const predicted = (at, s, p, line) => {
      const m = at(p.f), fix = bendFix ? bendFix(p.f) : null;
      const g = YS.gammaOf(fix ? [m.z[0] + fix[0], m.z[1] + fix[1]] : m.z, s.z0 || 50);
      return line ? YS.gammaThroughCable(g, line, p.f) : g;
    };
    const lineFor = (v) => (fitCable ? Object.assign({}, cable, { length: Math.max(0, cable.length + v[nRods]) }) : cable);
    const cost = (v) => {
      for (let i = 0; i < nRods; i++) if (Math.abs(v[i]) > 12) return 1e6 + Math.abs(v[i]);
      if (fitCable && Math.abs(v[nRods]) > CABLE_RANGE) return 1e6 + Math.abs(v[nRods]);
      const s = withOffsets(v), at = run.fixed(s), line = lineFor(v);
      let e = 0, total = 0;
      readings.forEach((p, i) => {
        const g = predicted(at, s, p, line), w = weights[i];
        total += w;
        // near a match, the change in ln(SWR) is about twice the change in reflection
        if (p.g) e += w * 4 * ((g[0] - p.g[0]) ** 2 + (g[1] - p.g[1]) ** 2);
        else e += w * (Math.log(YS.swrOfGamma(g)) - Math.log(p.swr)) ** 2;
      });
      misfit = e / total;
      // with few readings many answers fit equally well: prefer the smallest change
      let pull = 0;
      for (let i = 0; i < nRods; i++) pull += v[i] * v[i];
      return misfit + FIT_PULL * pull;
    };
    let best = null;
    for (const st of starts) {
      const x0 = groups.map((g) => st[g] || 0).concat(fitCable ? [st.cable || 0] : []);
      const res = nelderMead(cost, x0, groups.map(() => 0.6).concat(fitCable ? [8] : []), 70 * x0.length);
      if (!best || res.value < best.value) best = res;
    }
    const offsets = { directors: 0, driven: 0, reflector: 0 };
    groups.forEach((g, i) => { offsets[g] = best.x[i]; });
    cost(best.x);
    const result = { offsets, rms: Math.sqrt(misfit), value: best.value };
    if (fitCable) result.cableLength = lineFor(best.x).length;
    return result;
  }

  /**
   * The ways to bring a built antenna onto its target, given how its rods act (the fitted offsets).
   * design: the antenna with the measured lengths in it. Each option lists what to do to each rod.
   * Filing only shortens a rod; anything longer means cutting a new one.
   */
  function tunePlan({ design, offsets, target }) {
    const base = YS.toSolver(Object.assign({}, design, { asBuilt: null }));
    const plain = runner(base, "draft"), bendFix = bendCorrection(base, 0.94 * target, 1.06 * target);
    const adjust = (m, f) => {
      if (!bendFix) return m;
      const d = bendFix(f), z = [m.z[0] + d[0], m.z[1] + d[1]];
      return Object.assign({}, m, { z, swr: YS.swrOf(z[0], z[1], base.z0 || 50) });
    };
    const run = (s, f, level) => adjust(plain(s, f, level), f);
    run.fixed = (s) => { const at = plain.fixed(s); return (f, level) => adjust(at(f, level), f); };
    const roles = base.elements.map((_, i) => (i === base.feed ? "driven" : i < base.feed ? "reflector" : "directors"));
    const names = design.elements.slice().sort((p, q) => p.x - q.x).map((e) => e.name);
    /** The model of the antenna with physical changes: rod index to added length. */
    const built = (change) => Object.assign({}, base, {
      elements: base.elements.map((e, i) => ({ x: e.x, d: e.d, material: e.material, L: e.L + offsets[roles[i]] + (change[i] || 0) })),
    });
    const span = 0.05 * target;
    const valley = (s) => valleyOf(run, s, target - span, target + span, 41);
    const drv = base.feed;

    /** The driven change that cancels the reactance at the target. */
    const tuneDriven = (change) => {
      const x = (dL) => run(built(Object.assign({}, change, { [drv]: dL })), target).z[1];
      let a = -12, b = 12, fa = x(a), fb = x(b);
      if (fa * fb > 0) return Math.abs(fa) < Math.abs(fb) ? a : b;
      for (let i = 0; i < 22 && b - a > 0.02; i++) {
        const m = 0.5 * (a + b), fm = x(m);
        if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
      }
      return 0.5 * (a + b);
    };

    /** How much to change the given rods together so the valley lands on the target. */
    const solveRods = (rods) => {
      const miss = (x) => {
        const c = {};
        rods.forEach((i) => { c[i] = x; });
        return valley(built(c)).f - target;
      };
      let lo = -9, hi = 9, fl = miss(lo), fh = miss(hi);
      if (fl * fh > 0) return null;
      for (let i = 0; i < 16 && hi - lo > 0.03; i++) {
        const m = 0.5 * (lo + hi), fm = miss(m);
        if (fl * fm <= 0) { hi = m; fh = fm; } else { lo = m; fl = fm; }
      }
      return 0.5 * (lo + hi);
    };

    const describe = (id, title, why, change) => {
      const s = built(change), at = run.fixed(s);
      const m = at(target, 1);
      const curve = [];
      for (let i = 0; i <= 60; i++) {
        const f = target * (0.95 + 0.1 * i / 60);
        curve.push({ f, swr: at(f).swr });
      }
      const v = valley(s);
      const steps = base.elements.map((e, i) => {
        const dL = change[i] || 0;
        const action = Math.abs(dL) < 0.05 ? "keep" : dL < 0 ? "file" : "new";
        return { rod: names[i], role: roles[i], from: e.L, to: e.L + dL, change: dL, action };
      });
      const newRods = steps.filter((t) => t.action === "new").length;
      return { id, title, why, steps, newRods, swr: m.swr, gain: m.gainDbd, fb: m.fb, z: m.z, valley: v.f, valleySwr: v.swr, curve };
    };

    /**
     * Tips of the driven element and D1 moved along the boom, both halves alike. Apart raises the feed resistance and
     * moves the valley down; together does the reverse. Only offered if it clearly helps.
     */
    const bendOption = () => {
      const d1 = drv + 1;
      if (roles[d1] !== "directors") return null;
      const face = base.boomFace === undefined ? 10 : base.boomFace;
      const withTips = (dr, dd) => Object.assign({}, base, { elements: base.elements.map((e, i) => {
        const L = e.L + offsets[roles[i]], add = i === drv ? dr : i === d1 ? dd : 0, b = Object.assign({}, e.bend);
        if (add) { b.topF = (b.topF || 0) + add; b.botF = (b.botF || 0) + add; }
        const crook = YS.crookOf(b, L, face, i === drv);
        return { x: e.x, d: e.d, material: e.material, L, crook };
      }) });
      const counts = YS.buildWires(base, { quality: "draft" }).map((w) => w.m);
      const swrWith = (dr, dd) => YS.crooked.solve(YS.crooked.prepare(withTips(dr, dd), { counts }), target).swr;
      let best = null;
      const pairs = [[3, -3], [6, -6], [-3, 0], [0, 3]];
      for (const dr of [0, -3, -6, -9]) for (const dd of [0, 3, 6, 9]) if (dr || dd) pairs.push([dr, dd]);
      for (const [dr, dd] of pairs) {
        const v = swrWith(dr, dd), rank = v + 0.004 * (Math.abs(dr) + Math.abs(dd));
        if (!best || rank < best.rank) best = { dr, dd, swr: v, rank };
      }
      const now = swrWith(0, 0);
      if (best.swr > now - 0.03) return null;
      const sys = YS.crooked.prepare(withTips(best.dr, best.dd), { counts }), curve = [];
      let lowest = { f: target, swr: Infinity };
      for (let i = 0; i <= 24; i++) {
        const f = target * (0.95 + 0.1 * i / 24), swr = YS.crooked.solve(sys, f).swr;
        curve.push({ f, swr });
        if (swr < lowest.swr) lowest = { f, swr };
      }
      const m = YS.crooked.metrics(sys, target, 0);
      const bends = [[drv, best.dr], [d1, best.dd]].filter((q) => q[1]).map(([i, add]) => ({ rod: names[i], add }));
      return { id: "bend", title: "Bend the rods instead of cutting", why: "No cutting, and you can undo it. It moves the tips of the two rods nearest the feed. It fixes the match, but it can't bring back gain that rods of the wrong length cost.",
        steps: [], bends, newRods: 0, swr: m.swr, gain: m.gainDbd, fb: m.fb, z: m.z, valley: lowest.f, valleySwr: lowest.swr, curve };
    };

    const options = [];
    const none = describe("now", "Leave it as it is", "What the fit says the antenna does now.", {});
    const directors = base.elements.map((_, i) => i).filter((i) => roles[i] === "directors");

    // 1. move all the directors together, then retune the driven element
    if (directors.length) {
      const x = solveRods(directors);
      if (x !== null) {
        const c = {};
        directors.forEach((i) => { c[i] = x; });
        c[drv] = tuneDriven(c);
        options.push(describe("directors", "Change all the directors",
          "The directors decide where the valley sits. Changing them together keeps the design's balance, so it holds the most gain.", c));
      }
    }
    // 2. only the driven element: no new aluminium
    {
      const c = { [drv]: tuneDriven({}) };
      options.push(describe("driven", "Change only the driven element",
        "The least work. It deepens the match where you want it, but it barely moves the valley.", c));
    }
    // 3. the one director that does the most for the least
    let bestSingle = null;
    for (const i of directors) {
      const x = solveRods([i]);
      if (x === null || Math.abs(x) > 8) continue;
      const c = { [i]: x };
      c[drv] = tuneDriven(c);
      const o = describe("single", `Change only ${names[i]}`, `One rod to change. ${names[i]} moves the valley most for its length, but changing one rod alone costs some gain.`, c);
      if (!bestSingle || o.gain - 2 * Math.max(0, o.swr - 1.5) > bestSingle.gain - 2 * Math.max(0, bestSingle.swr - 1.5)) bestSingle = o;
    }
    if (bestSingle) options.push(bestSingle);
    // 4. no cutting at all: bend the driven element and D1, which are close enough for it to work
    const bent = bendOption();
    if (bent) options.push(bent);
    // what's worth doing: gain, a good match, and as few new rods as possible
    const score = (o) => o.gain - 3 * Math.max(0, o.swr - 1.3) - 0.03 * o.newRods;
    options.sort((a, b) => score(b) - score(a));
    return { now: none, options };
  }

  /* ---------- dispatch ---------- */
  const handlers = {
    sweep: ({ solver, freqs, quality, level }) => YS.sweep(solver, freqs, { quality, level }),
    detail: ({ solver, f, quality, grid }) => {
      const one = YS.sweep(solver, [f], { quality, level: 2 })[0];
      const pat = YS.pattern3d(solver, f, { quality, nth: grid ? grid[0] : 61, nph: grid ? grid[1] : 121 });
      return { metrics: one, pattern: { nth: pat.nth, nph: pat.nph, g: Array.from(pat.g) } };
    },
    setContext,
    evalVectors: ({ vectors }) => evalVectors(vectors),
    polish,
    monteCarlo,
    sensitivity,
    fitReadings,
    tunePlan,
    ping: () => "pong",
  };

  function dispatch(type, payload) {
    const h = handlers[type];
    if (!h) throw new Error("Unknown task: " + type);
    return h(payload);
  }

  Object.assign(YS, { dispatch, nelderMead, rng, applyVector, valleyOf });
})(typeof globalThis !== "undefined" ? globalThis : this);
