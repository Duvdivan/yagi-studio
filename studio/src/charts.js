/*
 * Yagi Studio charts: the band sweep (small multiples on one frequency axis), Smith chart, polar
 * cuts, histograms, ranked bars and the convergence line. Canvas, so dragging stays smooth.
 * Colours come from the page's tokens, so both themes work. One y-scale per plot, always.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  function tokens() {
    const c = getComputedStyle(document.documentElement);
    const g = (n) => c.getPropertyValue(n).trim();
    return { ink: g("--ink"), ink2: g("--ink2"), muted: g("--muted"), grid: g("--grid"), axis: g("--axis"), band: g("--band"), marker: g("--marker"),
      s1: g("--s1"), s2: g("--s2"), s3: g("--s3"), pin: g("--pin"), panel: g("--panel"), accent: g("--accent"), good: g("--good"), warn: g("--warn"), bad: g("--bad"),
      mono: g("--mono"), sans: g("--sans") };
  }

  /** Sizes a canvas to its box at the screen's pixel density and returns a ready context. */
  function prepare(canvas) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    return { ctx, w: r.width, h: r.height };
  }

  function niceStep(span, n) {
    const raw = span / Math.max(n, 1), mag = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / mag;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * mag;
  }
  function ticks(lo, hi, n) {
    const st = niceStep(hi - lo, n), out = [];
    for (let v = Math.ceil(lo / st - 1e-9) * st; v <= hi + st * 1e-6; v += st) out.push(Math.round(v / st) * st);
    return out;
  }
  const decimalsFor = (st) => Math.max(0, Math.min(3, -Math.floor(Math.log10(st) + 1e-9)));

  function line(ctx, pts, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    let pen = false;
    for (const p of pts) {
      if (p == null || !isFinite(p[0]) || !isFinite(p[1])) { pen = false; continue; }
      if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      pen = true;
    }
    ctx.stroke();
  }

  /* ---------- the sweep: SWR, gain and F/B above one frequency axis ---------- */
  /**
   * plot: { xr: [lo, hi], band: [lo, hi], target, cursor,
   *         rows: [{ key, title, yr?, floor?, refs: [{ v, label }], series: [{ name, color, pts: [[f, y]], width?, marks? }] }] }
   */
  function drawSweep(canvas, plot) {
    const { ctx, w, h } = prepare(canvas);
    const T = tokens();
    const left = 46, right = 12, top = 6, axisBand = 22, gapY = 12;
    if (w < 80 || h < 60) return;      // hidden or not laid out yet
    const rows = plot.rows, n = rows.length;
    const rowH = Math.max(40, (h - top - axisBand - gapY * (n - 1)) / n);
    const xr = plot.xr, X = (f) => left + (f - xr[0]) / (xr[1] - xr[0]) * (w - left - right);
    const layout = [];
    ctx.font = `11px ${T.mono}`;
    rows.forEach((row, i) => {
      const y0 = top + i * (rowH + gapY), y1 = y0 + rowH;
      let lo = Infinity, hi = -Infinity;
      for (const s of row.series) for (const p of s.pts) {
        if (p[0] >= xr[0] && p[0] <= xr[1] && isFinite(p[1])) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
      }
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      if (row.yr) { lo = row.yr[0]; hi = row.yr[1]; } else {
        const pad = Math.max((hi - lo) * 0.12, row.minPad || 0.2);
        lo -= pad; hi += pad;
        if (row.floor !== undefined) lo = Math.max(lo, row.floor);
      }
      const Y = (v) => y1 - (v - lo) / (hi - lo) * rowH;
      layout.push({ y0, y1, Y, lo, hi, row });
      if (plot.band) {
        ctx.fillStyle = T.band;
        ctx.fillRect(X(Math.max(plot.band[0], xr[0])), y0, X(Math.min(plot.band[1], xr[1])) - X(Math.max(plot.band[0], xr[0])), rowH);
      }
      const yt = row.ticks || ticks(lo, hi, rowH < 70 ? 2 : 4);
      const dec = decimalsFor(yt.length > 1 ? yt[1] - yt[0] : 1);
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
      for (const v of yt) {
        const yy = Math.round(Y(v)) + 0.5;
        ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(w - right, yy); ctx.stroke();
        ctx.fillStyle = T.muted;
        ctx.fillText(v.toFixed(dec), left - 5, yy);
      }
      ctx.strokeStyle = T.axis;
      ctx.beginPath(); ctx.moveTo(left + 0.5, y0); ctx.lineTo(left + 0.5, y1); ctx.moveTo(left, y1 + 0.5); ctx.lineTo(w - right, y1 + 0.5); ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.rect(left, y0, w - left - right, rowH); ctx.clip();
      for (const ref of row.refs || []) {
        if (ref.v < lo || ref.v > hi) continue;
        ctx.strokeStyle = ref.color || T.axis; ctx.lineWidth = 1;
        const yy = Math.round(Y(ref.v)) + 0.5;
        ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(w - right, yy); ctx.stroke();
      }
      for (const s of row.series) {
        if (s.dots) {
          for (const p of s.pts) {
            if (p[0] < xr[0] || p[0] > xr[1]) continue;
            ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 4, 0, 7);
            ctx.fillStyle = s.color; ctx.fill();
            ctx.strokeStyle = T.panel; ctx.lineWidth = 2; ctx.stroke();
          }
          if (s.joined) line(ctx, s.pts.map((p) => [X(p[0]), Y(p[1])]), s.color, 1);
        } else {
          line(ctx, s.pts.map((p) => [X(p[0]), Y(p[1])]), s.color, s.width || 2);
        }
      }
      ctx.restore();
      // the title sits inside the plot, top left, in text ink
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.font = `600 12px ${T.sans}`;
      ctx.fillStyle = T.ink2;
      ctx.fillText(row.title, left + 7, y0 + 4);
      ctx.font = `11px ${T.mono}`;
      if (row.note) {
        const tw = ctx.measureText(row.note).width;
        ctx.fillStyle = T.panel; ctx.fillRect(w - right - 10 - tw, y0 + 2, tw + 8, 15);
        ctx.textAlign = "right"; ctx.fillStyle = T.ink2;
        ctx.fillText(row.note, w - right - 6, y0 + 4);
      }
    });
    // shared frequency axis
    const xt = ticks(xr[0], xr[1], Math.max(3, Math.floor((w - left - right) / 70)));
    const xd = decimalsFor(xt.length > 1 ? xt[1] - xt[0] : 1);
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = T.muted;
    const axisY = layout[n - 1].y1 + 5;
    ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
    xt.forEach((f, i) => {
      const xx = Math.round(X(f)) + 0.5;
      for (const L of layout) { ctx.beginPath(); ctx.moveTo(xx, L.y0); ctx.lineTo(xx, L.y1); ctx.stroke(); }
      if (i === xt.length - 1) { ctx.textAlign = "right"; ctx.fillText(f.toFixed(xd) + " MHz", Math.min(xx + 12, w - 1), axisY); } else ctx.fillText(f.toFixed(xd), xx, axisY);
    });
    // target frequency, thin ink line; cursor, marker colour
    if (plot.target >= xr[0] && plot.target <= xr[1]) {
      ctx.strokeStyle = T.ink2; ctx.lineWidth = 1;
      const xx = Math.round(X(plot.target)) + 0.5;
      for (const L of layout) { ctx.beginPath(); ctx.moveTo(xx, L.y0); ctx.lineTo(xx, L.y1); ctx.stroke(); }
      if (plot.targetLabel) {
        ctx.font = `11px ${T.sans}`; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = T.ink2;
        ctx.fillText(plot.targetLabel, xx + 4, layout[0].y0 + 4);
        ctx.font = `11px ${T.mono}`;
      }
    }
    if (plot.cursor >= xr[0] && plot.cursor <= xr[1]) {
      const xx = X(plot.cursor);
      ctx.strokeStyle = T.marker; ctx.lineWidth = 1.5;
      for (const L of layout) { ctx.beginPath(); ctx.moveTo(xx, L.y0); ctx.lineTo(xx, L.y1); ctx.stroke(); }
      ctx.fillStyle = T.marker;
      ctx.beginPath(); ctx.moveTo(xx - 5, top - 2); ctx.lineTo(xx + 5, top - 2); ctx.lineTo(xx, top + 5); ctx.fill();
    }
    canvas._invX = (px) => xr[0] + (px - left) / (w - left - right) * (xr[1] - xr[0]);
    canvas._layout = { layout, X, left, right };
  }

  /* ---------- Smith chart ---------- */
  /** traces: [{ name, color, pts: [[re, im] of reflection], width?, marks: [{ g, label? }] }] */
  function drawSmith(canvas, traces, cursor) {
    const { ctx, w, h } = prepare(canvas);
    const T = tokens();
    const pad = 16, R = Math.min(w, h) / 2 - pad, cx = w / 2, cy = h / 2;
    if (R <= 4) return;      // hidden or not laid out yet
    const P = (g) => [cx + g[0] * R, cy - g[1] * R];
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
    ctx.lineWidth = 1; ctx.strokeStyle = T.grid;
    for (const r of [0.2, 0.5, 1, 2, 5]) {   // constant resistance
      const c = r / (1 + r), rad = 1 / (1 + r);
      ctx.beginPath(); ctx.arc(cx + c * R, cy, rad * R, 0, 7); ctx.stroke();
    }
    for (const x of [0.2, 0.5, 1, 2, 5]) {   // constant reactance
      for (const s of [1, -1]) {
        ctx.beginPath(); ctx.arc(cx + R, cy - s * R / x, R / x, 0, 7); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.strokeStyle = T.axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
    ctx.fillStyle = T.muted; ctx.font = `11px ${T.mono}`; ctx.textBaseline = "middle"; ctx.textAlign = "center";
    for (const r of [0.2, 0.5, 1, 2, 5]) {
      const gx = (r - 1) / (r + 1);
      ctx.fillStyle = T.panel; ctx.fillRect(cx + gx * R - 12, cy + 3, 24, 12);
      ctx.fillStyle = T.muted; ctx.fillText(String(Math.round(r * 50)), cx + gx * R, cy + 9);
    }
    for (const t of traces) {
      line(ctx, t.pts.map(P), t.color, t.width || 2);
      for (const m of t.marks || []) {
        const p = P(m.g);
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, 7); ctx.fillStyle = t.color; ctx.fill();
        ctx.strokeStyle = T.panel; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    if (cursor) {
      const p = P(cursor);
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, 7); ctx.fillStyle = T.marker; ctx.fill();
      ctx.strokeStyle = T.panel; ctx.lineWidth = 2; ctx.stroke();
    }
    canvas._smith = { cx, cy, R };
  }

  /* ---------- polar cuts ---------- */
  /**
   * opts: { title, series: [{ name, color, angles (deg), db, peak? }], range (dB shown), ref (dB at the rim),
   * half: true for an elevation quadrant over ground }
   */
  function drawPolar(canvas, opts) {
    const { ctx, w, h } = prepare(canvas);
    const T = tokens();
    const cx = w / 2, range = opts.range || 30;
    const top = 22, pad = 18;
    const half = !!opts.half;
    const R = half ? Math.min(w / 2 - pad, h - top - pad - 8) : Math.min(w / 2 - pad, (h - top - pad) / 2);
    if (R <= 4) return;      // hidden or not laid out yet
    const cy = half ? h - pad : top + (h - top - pad) / 2;
    const ref = opts.ref;
    ctx.fillStyle = T.ink2; ctx.font = `600 12px ${T.sans}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(opts.title, 2, 2);
    ctx.lineWidth = 1; ctx.font = `11px ${T.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let k = 0; k <= 3; k++) {
      const rr = R * (1 - k / 3);
      ctx.strokeStyle = k === 0 ? T.axis : T.grid;
      ctx.beginPath();
      if (half) ctx.arc(cx, cy, rr, Math.PI, 2 * Math.PI); else ctx.arc(cx, cy, rr, 0, 7);
      ctx.stroke();
    }
    ctx.strokeStyle = T.grid;
    const spokes = half ? [0, 30, 60, 90, 120, 150, 180] : [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    for (const a of spokes) {
      const t = a * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(t), cy - R * Math.sin(t)); ctx.stroke();
    }
    ctx.fillStyle = T.muted;
    for (let k = 1; k <= 2; k++) {
      const rr = R * (1 - k / 3), lab = (ref - k * range / 3).toFixed(0);
      ctx.fillStyle = T.panel; ctx.fillRect(cx - 12, cy - rr - 6, 24, 12);
      ctx.fillStyle = T.muted; ctx.fillText(lab, cx, cy - rr);
    }
    ctx.fillStyle = T.panel; ctx.fillRect(cx - 18, cy - R - 6, 36, 12);
    ctx.fillStyle = T.muted; ctx.fillText(ref.toFixed(1), cx, cy - R);
    for (const s of opts.series) {
      const pts = [];
      for (let i = 0; i < s.db.length; i++) {
        const rr = Math.max(0, 1 - (ref - s.db[i]) / range) * R, t = s.angles[i] * Math.PI / 180;
        pts.push([cx + rr * Math.cos(t), cy - rr * Math.sin(t)]);
      }
      if (!half) pts.push(pts[0]);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.globalAlpha = 0.09; ctx.fillStyle = s.color; ctx.fill(); ctx.globalAlpha = 1;
      line(ctx, pts, s.color, s.width || 2);
    }
    if (!half) {
      ctx.fillStyle = T.muted; ctx.font = `11px ${T.sans}`; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText("forward", cx + R, cy - 2);
    }
  }

  /* ---------- histogram ---------- */
  function drawHistogram(canvas, values, opts) {
    const { ctx, w, h } = prepare(canvas);
    const T = tokens();
    const left = 8, right = 8, top = 4, bottom = 20;
    if (!values.length || w < 40 || h < 40) return;
    let lo = opts.lo !== undefined ? opts.lo : Math.min.apply(null, values), hi = Math.max.apply(null, values);
    if (hi - lo < 1e-6) { hi = lo + 1; }
    const bins = opts.bins || 24, count = new Array(bins).fill(0);
    for (const v of values) count[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / (hi - lo) * bins)))]++;
    const mx = Math.max.apply(null, count), bw = (w - left - right) / bins;
    const X = (v) => left + (v - lo) / (hi - lo) * (w - left - right), base = h - bottom;
    ctx.fillStyle = T.s1;
    count.forEach((c, i) => {
      if (!c) return;
      const bh = Math.max(1, c / mx * (base - top));
      const x = left + i * bw + 1, wd = Math.max(1, bw - 2), rad = Math.min(3, wd / 2, bh);
      ctx.beginPath();
      ctx.moveTo(x, base); ctx.lineTo(x, base - bh + rad);
      ctx.quadraticCurveTo(x, base - bh, x + rad, base - bh);
      ctx.lineTo(x + wd - rad, base - bh);
      ctx.quadraticCurveTo(x + wd, base - bh, x + wd, base - bh + rad);
      ctx.lineTo(x + wd, base);
      ctx.fill();
    });
    ctx.strokeStyle = T.axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, base + 0.5); ctx.lineTo(w - right, base + 0.5); ctx.stroke();
    ctx.fillStyle = T.muted; ctx.font = `11px ${T.mono}`; ctx.textBaseline = "top"; ctx.textAlign = "center";
    const xt = ticks(lo, hi, Math.max(2, Math.floor(w / 80)));
    const dec = decimalsFor(xt.length > 1 ? xt[1] - xt[0] : 1);
    for (const v of xt) ctx.fillText(v.toFixed(dec), X(v), base + 5);
    for (const m of opts.marks || []) {
      if (m.v < lo || m.v > hi) continue;
      ctx.strokeStyle = m.color || T.marker; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(m.v), top); ctx.lineTo(X(m.v), base); ctx.stroke();
    }
  }

  /* ---------- ranked bars, for what each rod does ---------- */
  function drawRanked(canvas, rows, opts) {
    const { ctx, w, h } = prepare(canvas);
    const T = tokens();
    const left = 96, right = 52, n = rows.length;
    const barH = Math.max(10, Math.min(18, (h - 4) / Math.max(n, 1) - 4)), gap = 4;
    const mx = Math.max(1e-9, Math.max.apply(null, rows.map((r) => Math.abs(r.v))));
    const mid = left + (w - left - right) / 2, scale = (w - left - right) / 2 / mx;
    ctx.font = `12px ${T.sans}`; ctx.textBaseline = "middle";
    rows.forEach((r, i) => {
      const y = 2 + i * (barH + gap), bw = Math.max(1, Math.abs(r.v) * scale);
      ctx.fillStyle = T.ink2; ctx.textAlign = "right"; ctx.font = `12px ${T.sans}`;
      ctx.fillText(r.label, left - 8, y + barH / 2);
      ctx.fillStyle = r.v >= 0 ? T.s1 : T.s2;
      const x = r.v >= 0 ? mid : mid - bw, rad = Math.min(3, bw / 2);
      ctx.beginPath();
      if (r.v >= 0) {
        ctx.moveTo(x, y); ctx.lineTo(x + bw - rad, y); ctx.quadraticCurveTo(x + bw, y, x + bw, y + rad);
        ctx.lineTo(x + bw, y + barH - rad); ctx.quadraticCurveTo(x + bw, y + barH, x + bw - rad, y + barH); ctx.lineTo(x, y + barH);
      } else {
        ctx.moveTo(x + bw, y); ctx.lineTo(x + rad, y); ctx.quadraticCurveTo(x, y, x, y + rad);
        ctx.lineTo(x, y + barH - rad); ctx.quadraticCurveTo(x, y + barH, x + rad, y + barH); ctx.lineTo(x + bw, y + barH);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = T.ink; ctx.font = `11px ${T.mono}`; ctx.textAlign = "left";
      ctx.fillText((r.v >= 0 ? "+" : "") + r.v.toFixed(opts.decimals === undefined ? 2 : opts.decimals), w - right + 6, y + barH / 2);
    });
    ctx.strokeStyle = T.axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mid + 0.5, 0); ctx.lineTo(mid + 0.5, 2 + n * (barH + gap)); ctx.stroke();
  }

  /* ---------- a plain line plot: optimiser progress, boom explorer ---------- */
  /** opts: { xLabel, yLabel, series: [{ name, color, pts, dots? }], xr?, yr?, mark? } */
  function drawLines(canvas, opts) {
    const { ctx, w, h } = prepare(canvas);
    const T = tokens();
    const left = 44, right = 12, top = 8, bottom = 30;
    if (w < 40 || h < 40) return;      // hidden or not laid out yet
    let xs = [], ys = [];
    for (const s of opts.series) for (const p of s.pts) { xs.push(p[0]); ys.push(p[1]); }
    if (!xs.length) {
      ctx.fillStyle = T.muted; ctx.font = `13px ${T.sans}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(opts.empty || "No data yet", w / 2, h / 2);
      return;
    }
    let xr = opts.xr || [Math.min.apply(null, xs), Math.max.apply(null, xs)];
    let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    const pad = Math.max((hi - lo) * 0.1, 0.05);
    lo -= pad; hi += pad;
    if (xr[1] - xr[0] < 1e-9) xr = [xr[0] - 1, xr[0] + 1];
    const X = (v) => left + (v - xr[0]) / (xr[1] - xr[0]) * (w - left - right), Y = (v) => h - bottom - (v - lo) / (hi - lo) * (h - top - bottom);
    ctx.font = `11px ${T.mono}`; ctx.textBaseline = "middle"; ctx.textAlign = "right"; ctx.lineWidth = 1;
    const yt = ticks(lo, hi, Math.max(3, Math.floor((h - top - bottom) / 50))), yd = decimalsFor(yt.length > 1 ? yt[1] - yt[0] : 1);
    for (const v of yt) {
      const yy = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(w - right, yy); ctx.stroke();
      ctx.fillStyle = T.muted; ctx.fillText(v.toFixed(yd), left - 5, yy);
    }
    ctx.strokeStyle = T.axis; ctx.beginPath(); ctx.moveTo(left, h - bottom + 0.5); ctx.lineTo(w - right, h - bottom + 0.5); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const xt = ticks(xr[0], xr[1], Math.max(3, Math.floor((w - left - right) / 80))), xd = decimalsFor(xt.length > 1 ? xt[1] - xt[0] : 1);
    for (const v of xt) { ctx.fillStyle = T.muted; ctx.fillText(v.toFixed(xd), X(v), h - bottom + 5); }
    ctx.fillStyle = T.muted; ctx.font = `12px ${T.sans}`; ctx.textAlign = "right";
    ctx.fillText(opts.xLabel || "", w - right, h - bottom + 16);
    ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = T.ink2; ctx.font = `600 12px ${T.sans}`;
    ctx.fillText(opts.yLabel || "", left + 6, top);
    const hits = [];
    for (const s of opts.series) {
      line(ctx, s.pts.map((p) => [X(p[0]), Y(p[1])]), s.color, 2);
      if (s.dots) {
        s.pts.forEach((p) => {
          ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 4, 0, 7); ctx.fillStyle = s.color; ctx.fill();
          ctx.strokeStyle = T.panel; ctx.lineWidth = 2; ctx.stroke();
          hits.push({ x: X(p[0]), y: Y(p[1]), p, s });
        });
      }
    }
    canvas._hits = hits;
  }

  Object.assign(YS, { tokens, prepare, drawSweep, drawSmith, drawPolar, drawHistogram, drawRanked, drawLines, ticks });
})(typeof globalThis !== "undefined" ? globalThis : this);
