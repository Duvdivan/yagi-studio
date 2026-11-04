/*
 * Yagi Studio engine: a pool of workers, the optimiser that runs across them, and a link to a
 * NanoVNA over Web Serial. Falls back to the page's own thread where workers are blocked.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  class Pool {
    constructor(source) {
      this.workers = [];
      this.seq = 1;
      this.queue = [];
      this.pending = new Map();
      const hc = navigator.hardwareConcurrency || 4;
      const want = Math.max(1, Math.min(hc - 1, 24));
      try {
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        for (let i = 0; i < want; i++) {
          const w = new Worker(url);
          const slot = { w, busy: false, own: [], ui: i < Math.max(1, Math.min(3, Math.floor(want / 4))) };
          w.onmessage = (ev) => this.done(slot, ev.data);
          w.onerror = (ev) => this.fail(slot, ev);
          this.workers.push(slot);
        }
      } catch (e) {
        this.workers = [];
      }
      this.batchCount = Math.max(1, this.workers.filter((s) => !s.ui).length);
    }

    get threads() { return Math.max(1, this.workers.length); }

    done(slot, msg) {
      slot.busy = false;
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (p) { if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.error)); }
      this.pump();
    }

    fail(slot, ev) {
      // a worker that dies takes its job with it; report rather than hang
      slot.busy = false;
      for (const [id, p] of this.pending) { if (p.slot === slot) { p.reject(new Error(ev.message || "Worker failed")); this.pending.delete(id); } }
      this.pump();
    }

    pump() {
      for (const slot of this.workers) {
        if (slot.busy) continue;
        let job = slot.own.shift();
        if (!job) {
          const i = this.queue.findIndex((j) => (j.lane === "ui") === slot.ui || (j.lane === "ui" && !this.workers.some((s) => s.ui)));
          if (i >= 0) job = this.queue.splice(i, 1)[0];
        }
        if (!job) continue;
        slot.busy = true;
        this.pending.get(job.id).slot = slot;
        slot.w.postMessage({ id: job.id, type: job.type, payload: job.payload });
      }
    }

    /** Runs a task. lane "ui" keeps interactive work clear of long batch jobs. */
    run(type, payload, lane) {
      if (!this.workers.length) {
        // no workers here: run on the page, a task at a time, letting it draw in between
        return new Promise((resolve, reject) => setTimeout(() => {
          try { resolve(YS.dispatch(type, payload)); } catch (e) { reject(e); }
        }, 0));
      }
      return new Promise((resolve, reject) => {
        const id = this.seq++;
        this.pending.set(id, { resolve, reject });
        this.queue.push({ id, type, payload, lane: lane || "batch" });
        this.pump();
      });
    }

    /** Sends a task to every worker: used to hand each the optimiser's context. */
    broadcast(type, payload) {
      if (!this.workers.length) return this.run(type, payload);
      return Promise.all(this.workers.map((slot) => new Promise((resolve, reject) => {
        const id = this.seq++;
        this.pending.set(id, { resolve, reject });
        slot.own.push({ id, type, payload });
      })).concat(this.pump() || []));
    }

    /** One sweep, split between the interactive workers. */
    async sweep(solver, freqs, quality) {
      const uiCount = this.workers.filter((s) => s.ui).length || 1;
      if (uiCount < 2 || freqs.length < 12) return this.run("sweep", { solver, freqs, quality, level: 0 }, "ui");
      const size = Math.ceil(freqs.length / uiCount), parts = [];
      for (let i = 0; i < freqs.length; i += size) parts.push(freqs.slice(i, i + size));
      const res = await Promise.all(parts.map((f) => this.run("sweep", { solver, freqs: f, quality, level: 0 }, "ui")));
      return res.flat();
    }
  }

  /* ---------- optimiser: self-adapting differential evolution, then a local polish ---------- */
  function bandFreqs(band, f0) {
    const [a, b] = band;
    const fs = [a, (a + f0) / 2, f0, (f0 + b) / 2, b].sort((p, q) => p - q);
    return fs.filter((f, i) => i === 0 || f - fs[i - 1] > 1e-6);
  }

  function makeContext(design, goals) {
    const solver = YS.toSolver(design);
    const lam = 299792.458 / design.f0;
    const sorted = design.elements.slice().sort((a, b) => a.x - b.x);
    const near = goals.range === "near";
    const vars = [];
    sorted.forEach((e, i) => {
      const lock = (goals.locks && goals.locks[e.id]) || {};
      if (!lock.L && goals.changeLengths !== false) {
        const wide = e.type === "reflector" ? [0.44, 0.58] : e.type === "driven" ? [0.38, 0.54] : [0.34, 0.52];
        const lo = near ? e.L * 0.92 : wide[0] * lam, hi = near ? e.L * 1.08 : wide[1] * lam;
        vars.push({ kind: "L", i, lo: Math.min(lo, e.L), hi: Math.max(hi, e.L) });
      }
      if (i + 1 < sorted.length && !lock.x && goals.changeSpacing !== false) {
        const gap = sorted[i + 1].x - e.x;
        const lo = near ? gap * 0.7 : goals.minGap, hi = near ? gap * 1.3 : 0.65 * lam;
        vars.push({ kind: "s", i, lo: Math.max(goals.minGap, Math.min(lo, gap)), hi: Math.max(hi, gap) });
      }
    });
    return {
      base: solver,
      vars,
      freqs: bandFreqs(goals.band, design.f0),
      goals: { fbMin: goals.fbMin, swrMax: goals.swrMax, fbWeight: 0.15, swrWeight: 3, gainWeight: 1,
        boomMax: goals.boomMax || 0, boomFixed: goals.boomFixed || 0, minGap: goals.minGap },
      counts: YS.buildWires(solver, { quality: "draft" }).map((w) => w.m),
    };
  }

  /** Puts a solver result back into a copy of the design, rounded to what a person can cut. */
  function applyToDesign(design, solver) {
    const sorted = design.elements.slice().sort((a, b) => a.x - b.x);
    const copy = JSON.parse(JSON.stringify(design));
    const byId = new Map(copy.elements.map((e) => [e.id, e]));
    solver.elements.forEach((e, i) => {
      const t = byId.get(sorted[i].id);
      t.L = Math.round(e.L * 10) / 10;
      t.x = Math.round((e.x - solver.elements[0].x) * 10) / 10;
    });
    copy.elements.sort((a, b) => a.x - b.x);
    return copy;
  }

  async function evaluate(pool, vectors, chunks) {
    const size = Math.ceil(vectors.length / chunks), parts = [];
    for (let i = 0; i < vectors.length; i += size) parts.push(vectors.slice(i, i + size));
    const res = await Promise.all(parts.map((p) => pool.run("evalVectors", { vectors: p })));
    return res.flat();
  }

  /**
   * Runs differential evolution (jDE: Brest et al., IEEE Trans. EC 10, 2006) across the pool.
   * hooks: { onProgress({ gen, gens, evals, best, history, solver }), cancelled() }
   */
  async function optimise(pool, design, goals, effort, hooks) {
    const ctx = makeContext(design, goals);
    const D = ctx.vars.length;
    if (!D) throw new Error("Nothing is free to change. Unlock some rods, or allow lengths or spacing.");
    await pool.broadcast("setContext", ctx);
    const r = YS.rng(goals.seed || (Date.now() & 0xffff));
    const NP = Math.max(24, Math.min(90, 6 * D));
    const gens = effort.gens;
    const clamp = (v, j) => Math.min(ctx.vars[j].hi, Math.max(ctx.vars[j].lo, v));
    // where the design stands now, as a starting vector
    const sorted = ctx.base.elements;
    const start = ctx.vars.map((va) => (va.kind === "L" ? sorted[va.i].L : sorted[va.i + 1].x - sorted[va.i].x));
    const pop = [start.slice()], F = [0.6], CR = [0.9];
    for (let i = 1; i < NP; i++) {
      // half close to the design, half anywhere in range
      pop.push(ctx.vars.map((va, j) => (i % 2 ? clamp(start[j] + (va.hi - va.lo) * 0.08 * r.normal(), j) : va.lo + r() * (va.hi - va.lo))));
      F.push(0.3 + r() * 0.6); CR.push(r());
    }
    const chunks = Math.max(1, Math.min(pool.batchCount, Math.ceil(NP / 6)));
    let scores = await evaluate(pool, pop, chunks);
    let evals = NP, bestI = 0;
    scores.forEach((s, i) => { if (s.cost < scores[bestI].cost) bestI = i; });
    const history = [[0, scores[bestI].worstGain]];
    let lastReport = 0, stall = 0, lastBest = scores[bestI].cost;
    for (let g = 1; g <= gens; g++) {
      if (hooks.cancelled && hooks.cancelled()) break;
      const Fn = [], CRn = [], trial = [];
      for (let i = 0; i < NP; i++) {
        const f = r() < 0.1 ? 0.2 + r() * 0.8 : F[i], cr = r() < 0.1 ? r() : CR[i];
        Fn.push(f); CRn.push(cr);
        let a, b;
        do { a = Math.floor(r() * NP); } while (a === i);
        do { b = Math.floor(r() * NP); } while (b === i || b === a);
        const jr = Math.floor(r() * D), t = pop[i].slice();
        for (let j = 0; j < D; j++) {
          if (r() < cr || j === jr) t[j] = clamp(pop[i][j] + f * (pop[bestI][j] - pop[i][j]) + f * (pop[a][j] - pop[b][j]), j);
        }
        trial.push(t);
      }
      const ts = await evaluate(pool, trial, chunks);
      evals += NP;
      for (let i = 0; i < NP; i++) {
        if (ts[i].cost <= scores[i].cost) { pop[i] = trial[i]; scores[i] = ts[i]; F[i] = Fn[i]; CR[i] = CRn[i]; }
        if (scores[i].cost < scores[bestI].cost) bestI = i;
      }
      history.push([evals, scores[bestI].worstGain]);
      stall = scores[bestI].cost < lastBest - 1e-3 ? 0 : stall + 1;
      lastBest = Math.min(lastBest, scores[bestI].cost);
      const now = performance.now();
      if (now - lastReport > 90 && hooks.onProgress) {
        lastReport = now;
        hooks.onProgress({ gen: g, gens, evals, best: scores[bestI], history, solver: YS.applyVector(ctx, pop[bestI]) });
      }
      if (stall > effort.patience) break;
    }
    if (hooks.onProgress) hooks.onProgress({ gen: gens, gens, evals, best: scores[bestI], history, solver: YS.applyVector(ctx, pop[bestI]), polishing: true });
    // finish at higher quality, from the best found
    const pol = await pool.run("polish", { ctx, x0: pop[bestI], maxEval: effort.polish });
    return { design: applyToDesign(design, pol.solver), parts: pol.parts, evals, history };
  }

  /** The best gain one mix of rods and boom can hold over the band. template.settings carries a design's model settings across. */
  async function boomRun(pool, template, goals, n, boom, gens, hooks) {
    const start = YS.startingDesign(template.f0, n, template.d, template.material);
    const span = YS.boomLength(start), k = boom / span;
    start.elements.forEach((e) => { e.x = Math.round(e.x * k * 10) / 10; });
    Object.assign(start, template.settings || {});
    start.band = goals.band;
    start.gap = template.gap;
    const res = await optimise(pool, start, Object.assign({}, goals, { boomFixed: boom, boomMax: 0, range: "wide" }), { gens, patience: 30, polish: 80 }, { cancelled: hooks.cancelled });
    return { rods: n, boom, gain: res.parts.worstGain, swr: res.parts.worstSwr, fb: res.parts.minFb, design: res.design };
  }

  /** The best gain one mix of rods and boom can hold over the band. template.settings carries a design's model settings across. */
  async function boomRun(pool, template, goals, n, boom, gens, hooks) {
    const start = YS.startingDesign(template.f0, n, template.d, template.material);
    const span = YS.boomLength(start), k = boom / span;
    start.elements.forEach((e) => { e.x = Math.round(e.x * k * 10) / 10; });
    Object.assign(start, template.settings || {});
    start.band = goals.band;
    start.gap = template.gap;
    const res = await optimise(pool, start, Object.assign({}, goals, { boomFixed: boom, boomMax: 0, range: "wide" }), { gens, patience: 30, polish: 80 }, { cancelled: hooks.cancelled });
    return { rods: n, boom, gain: res.parts.worstGain, swr: res.parts.worstSwr, fb: res.parts.minFb, design: res.design };
  }

  /** The best gain each (rods, boom) pair can hold over the band: for picking the shortest boom. */
  async function exploreBooms(pool, template, goals, grid, hooks) {
    const out = [];
    const total = grid.rods.length * grid.booms.length;
    let done = 0;
    for (const n of grid.rods) {
      for (const boom of grid.booms) {
        if (hooks.cancelled && hooks.cancelled()) return out;
        const lam = 299792.458 / template.f0;
        // too many rods for too short a boom can't be built
        if (boom / (n - 1) < 0.04 * lam) { done++; continue; }
        out.push(await boomRun(pool, template, goals, n, boom, grid.gens, hooks));
        done++;
        if (hooks.onProgress) hooks.onProgress({ done, total, results: out });
      }
    }
    return out;
  }

  /* The worst gain across a 1.5% band that each rod count tops out at, dBd, with SWR under 1.5 and F/B over 15 dB. Measured up to 12
     rods; a rough guide for where to start looking, not a limit, so it's given FIND_SLACK of room for narrower bands and looser limits. */
  const GAIN_TOPS = { 3: 6, 4: 7.9, 5: 9.2, 6: 10.2, 7: 11.2, 8: 11.8, 9: 12.3, 10: 12.7, 11: 13, 12: 13.3, 13: 13.6, 14: 13.9, 15: 14.1, 16: 14.3 };
  const FIND_SLACK = 1;       // dB
  const FIND_RODS = 16;       // the most rods it tries: the time grows quickly past this
  const FIND_ROWS = 3;        // how many rod counts it offers
  const FIND_MARGIN = 0.02;   // dB over the target, as rounding lengths to 0.1 mm can cost a little
  const FIND_GENS = 90;       // the optimiser's generations per try, as in Which boom?

  /**
   * The shortest booms that hold a gain across the band: one answer per rod count, from the fewest rods
   * that reach it, because more rods buy a shorter boom. Gain climbs with boom only up to about 0.3 of a wavelength
   * between rods, then falls, so this walks along the boom until it brackets the target or passes the top, and
   * then closes in by interpolating. It stops once another rod no longer shortens the boom.
   * Returns { rows, best, tooHigh }: best is the closest try that held the limits, for when no row reaches it.
   */
  async function findForGain(pool, template, goals, target, hooks) {
    const lam = 299792.458 / template.f0, rows = [];
    const cancelled = () => hooks.cancelled && hooks.cancelled();
    const held = (r) => r.swr <= goals.swrMax + 0.01 && r.fb >= goals.fbMin - 0.1;
    const meets = (r) => held(r) && r.gain >= target + FIND_MARGIN;
    if (target > GAIN_TOPS[FIND_RODS] + FIND_SLACK) return { rows, best: null, tooHigh: FIND_RODS };
    let best = null, tries = 0;
    const run = async (n, boom) => {
      const r = await boomRun(pool, template, goals, n, Math.round(boom), FIND_GENS, hooks);
      tries++;
      if (held(r) && (!best || r.gain > best.gain)) best = r;
      if (hooks.onProgress) hooks.onProgress({ tries, last: r, rows });
      return r;
    };

    async function shortestFor(n, longerRow) {
      const floor = Math.max(0.1 * lam, goals.minGap) * (n - 1), ceil = 0.4 * lam * (n - 1);
      let boom = Math.min(ceil, Math.max(floor, longerRow ? longerRow.boom * 0.9 : 0.22 * lam * (n - 1)));
      let ok = null, short = null;
      // find a boom that does it, and one just too short
      for (;;) {
        if (cancelled()) return ok;
        const r = await run(n, boom);
        if (meets(r)) {
          ok = r;
          if (boom <= floor || short) break;
          boom = Math.max(floor, boom / 1.25);
        } else {
          if (short && !ok && r.gain < short.gain - 0.1) return null;     // past the top
          short = r;
          if (ok) break;
          if (boom >= ceil) return null;
          boom = Math.min(ceil, boom * 1.25);
        }
      }
      // close in. The middle half of the gap, in case the two are near level or the limits are what stopped it
      for (let i = 0; i < 3 && short && ok.boom - short.boom > 0.02 * ok.boom && ok.gain - target > 0.05; i++) {
        if (cancelled()) break;
        const rise = ok.gain - short.gain, at = rise > 0.02 ? (target + FIND_MARGIN - short.gain) / rise : 0.5;
        const r = await run(n, short.boom + (ok.boom - short.boom) * Math.min(0.75, Math.max(0.25, at)));
        if (meets(r)) ok = r; else short = r;
      }
      return ok;
    }

    let n = 3;
    while (n < FIND_RODS && GAIN_TOPS[n] + FIND_SLACK < target) n++;
    for (; n <= FIND_RODS && rows.length < FIND_ROWS && !cancelled(); n++) {
      const prior = rows[rows.length - 1];
      const row = await shortestFor(n, prior);
      if (!row) { if (prior) break; continue; }
      if (prior && row.boom > 0.97 * prior.boom) break;
      rows.push(row);
      if (hooks.onProgress) hooks.onProgress({ tries, last: row, rows });
    }
    return { rows, best, tooHigh: 0 };
  }

  /* ---------- NanoVNA over Web Serial ---------- */
  /**
   * The NanoVNA's USB port is a plain text console: "scan start stop points 3" answers with lines of
   * frequency, S11 real and S11 imaginary, then the "ch>" prompt. Older firmware has no scan, so it
   * falls back to "sweep", "frequencies" and "data 0". In the scan mask, 1 asks for frequency and 2
   * for S11 (NanoVNA-D main.c). Tested against a stand-in for the port, not yet a real unit.
   */
  class NanoVNA {
    static supported() { return "serial" in navigator; }

    async connect() {
      this.port = await navigator.serial.requestPort({});
      await this.port.open({ baudRate: 115200 });
      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      this.buffer = "";
      this.listen();
      await this.command("", 800);  // clears anything half typed
    }

    /** One reader for the life of the link, so a slow answer can't lose bytes to the next command. */
    async listen() {
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          this.buffer += decoder.decode(value, { stream: true });
        }
      } catch (e) { /* the port closed */ }
    }

    async command(cmd, timeoutMs) {
      this.buffer = "";
      await this.writer.write(new TextEncoder().encode(cmd + "\r"));
      const deadline = performance.now() + (timeoutMs || 3000);
      while (performance.now() < deadline && !this.buffer.includes("ch>")) {
        await new Promise((r) => setTimeout(r, 15));
      }
      return this.buffer;
    }

    /** One sweep of S11: [{ f (MHz), g: [re, im] }]. */
    async scan(startMHz, stopMHz, points) {
      const a = Math.round(startMHz * 1e6), b = Math.round(stopMHz * 1e6);
      const txt = await this.command(`scan ${a} ${b} ${points} 3`, 15000);
      const rows = NanoVNA.parseScan(txt);
      if (rows.length >= points * 0.8) { await this.command("resume", 800); return rows; }
      // older firmware: set the sweep, let it run once, then read it back
      await this.command(`sweep ${a} ${b} ${points}`, 5000);
      await this.command("resume", 800);
      await new Promise((r) => setTimeout(r, 2500));
      await this.command("pause", 800);
      const fs = (await this.command("frequencies", 5000)).split(/\r?\n/).map(Number).filter((v) => v > 1000);
      const ds = (await this.command("data 0", 5000)).split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter((v) => v.length === 2 && !v.some(isNaN));
      await this.command("resume", 800);
      return fs.slice(0, ds.length).map((f, i) => ({ f: f / 1e6, g: ds[i] }));
    }

    static parseScan(txt) {
      const rows = [];
      for (const l of txt.split(/\r?\n/)) {
        const v = l.trim().split(/\s+/).map(Number);
        if (v.length >= 3 && !v.some(isNaN) && v[0] > 1000) rows.push({ f: v[0] / 1e6, g: [v[1], v[2]] });
      }
      return rows;
    }

    async close() {
      try { await this.reader.cancel(); this.reader.releaseLock(); this.writer.releaseLock(); await this.port.close(); } catch (e) { /* already gone */ }
    }
  }

  Object.assign(YS, { Pool, optimise, exploreBooms, findForGain, applyToDesign, makeContext, bandFreqs, NanoVNA });
})(typeof globalThis !== "undefined" ? globalThis : this);
