/*
 * Yagi Studio layout view: the antenna as a true-scale drawing, seen from the side. Drag a rod to
 * move it, or a tip to change its length; the current on each rod is drawn as an envelope.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  class Layout2D {
    /** opts: { onChange(id, patch, final), onHover(id), readOnly } */
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.opts = opts || {};
      this.design = null;
      this.metrics = null;
      this.hot = null;
      this.drag = null;
      if (!this.opts.readOnly) this.bind();
      this.ro = new ResizeObserver(() => this.draw());
      this.ro.observe(canvas);
    }

    set(design, metrics) { this.design = design; this.metrics = metrics; this.draw(); }
    setHot(id) { if (this.hot !== id) { this.hot = id; this.draw(); } }

    geometry() {
      const r = this.canvas.getBoundingClientRect(), d = this.design;
      const els = d.elements.slice().sort((a, b) => a.x - b.x);
      const x0 = els[0].x, x1 = els[els.length - 1].x;
      const maxL = Math.max.apply(null, els.map((e) => e.L));
      const mastX = d.mast && d.mast.on && d.polarization === "vertical" ? x0 - d.mast.behind : x0;
      const left = 34, right = 34, top = 26, bottom = 44;
      const wx = Math.max(x1 - Math.min(x0, mastX), 1), wz = Math.max(maxL, 1);
      const s = Math.min((r.width - left - right) / wx, (r.height - top - bottom) / wz);
      const fromLeft = (r.width - wx * s) / 2;
      const X = (x) => fromLeft + (x - Math.min(x0, mastX)) * s;
      const cy = top + (r.height - top - bottom) / 2;
      return { s, X, cy, els, w: r.width, h: r.height, bottom, mastX, x0, x1 };
    }

    bind() {
      const c = this.canvas;
      const locate = (e) => {
        const r = c.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };
      const hit = (px, py) => {
        const g = this.geometry();
        let best = null, bestD = 16;
        for (const e of g.els) {
          const x = g.X(e.x), hz = e.L / 2 * g.s;
          for (const sign of [1, -1]) {
            const d = Math.hypot(px - x, py - (g.cy - sign * hz));
            if (d < bestD) { bestD = d; best = { id: e.id, kind: "L", sign }; }
          }
        }
        if (best) return best;
        bestD = 14;
        for (const e of g.els) {
          const x = g.X(e.x), hz = e.L / 2 * g.s;
          if (Math.abs(py - g.cy) <= hz + 4 && Math.abs(px - x) < bestD) { bestD = Math.abs(px - x); best = { id: e.id, kind: "x" }; }
        }
        return best;
      };
      c.addEventListener("pointerdown", (e) => {
        const [px, py] = locate(e), h = hit(px, py);
        if (!h) return;
        const el = this.design.elements.find((q) => q.id === h.id);
        this.drag = { h, px, py, x: el.x, L: el.L, moved: false };
        c.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      c.addEventListener("pointermove", (e) => {
        const [px, py] = locate(e);
        if (!this.drag) {
          const h = hit(px, py);
          c.style.cursor = !h ? "default" : h.kind === "L" ? "ns-resize" : "ew-resize";
          const id = h ? h.id : null;
          if (id !== this.hot) { this.hot = id; this.draw(); if (this.opts.onHover) this.opts.onHover(id); }
          return;
        }
        const g = this.geometry(), D = this.drag, snap = e.shiftKey ? 1 : 0.1;
        const round = (v) => Math.round(v / snap) * snap;
        D.moved = true;
        if (D.h.kind === "L") {
          const dz = -(py - D.py) / g.s * D.h.sign;
          this.opts.onChange(D.h.id, { L: +Math.max(5, round(D.L + 2 * dz)).toFixed(2) }, false);
        } else {
          const idx = g.els.findIndex((q) => q.id === D.h.id);
          if (idx === 0) return;     // the first rod is the datum: positions count from it
          const lo = g.els[idx - 1].x + 3, hi = idx + 1 < g.els.length ? g.els[idx + 1].x - 3 : Infinity;
          const nx = Math.min(hi, Math.max(lo, round(D.x + (px - D.px) / g.s)));
          this.opts.onChange(D.h.id, { x: +nx.toFixed(2) }, false);
        }
      });
      const end = () => {
        if (this.drag && this.drag.moved) this.opts.onChange(this.drag.h.id, {}, true);
        this.drag = null;
      };
      c.addEventListener("pointerup", end);
      c.addEventListener("pointercancel", end);
      c.addEventListener("pointerleave", () => { if (!this.drag && this.hot) { this.hot = null; this.draw(); if (this.opts.onHover) this.opts.onHover(null); } });
    }

    draw() {
      if (!this.design) return;
      const { ctx } = YS.prepare(this.canvas);
      const T = YS.tokens(), g = this.geometry();
      const { s, X, cy, els, w, h, bottom, x0, x1 } = g;
      // the ruler, along the bottom, from the first rod
      const baseY = h - bottom + 22;
      ctx.lineWidth = 1; ctx.strokeStyle = T.axis; ctx.font = `11px ${T.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.beginPath(); ctx.moveTo(X(x0), baseY + 0.5); ctx.lineTo(X(x1), baseY + 0.5); ctx.stroke();
      const step = (() => { const raw = 70 / s, m = Math.pow(10, Math.floor(Math.log10(raw))), k = raw / m; return (k < 2 ? 2 : k < 5 ? 5 : 10) * m; })();
      for (let v = 0; v <= x1 - x0 + 1e-6; v += step) {
        const xx = Math.round(X(x0 + v)) + 0.5;
        ctx.beginPath(); ctx.moveTo(xx, baseY); ctx.lineTo(xx, baseY + 4); ctx.stroke();
        ctx.fillStyle = T.muted; ctx.fillText(String(Math.round(v)), xx, baseY + 6);
      }
      ctx.textAlign = "right"; ctx.fillStyle = T.muted;
      ctx.fillText("mm", w - 2, baseY + 6);
      // the boom
      ctx.strokeStyle = T.axis; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(X(x0) - 8, cy); ctx.lineTo(X(x1) + 8, cy); ctx.stroke();
      ctx.lineCap = "butt";
      // a mast behind the reflector
      const d = this.design;
      if (d.mast && d.mast.on && d.polarization === "vertical") {
        const mx = X(g.mastX), mw = Math.max(3, d.mast.d * s);
        ctx.fillStyle = T.grid; ctx.fillRect(mx - mw / 2, 8, mw, h - bottom - 8);
        ctx.fillStyle = T.muted; ctx.font = `11px ${T.sans}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText("mast", mx, 2);
      }
      // spacing between neighbouring rods, in a row under the boom, where it fits
      ctx.font = `11px ${T.mono}`; ctx.textBaseline = "bottom"; ctx.textAlign = "center";
      for (let i = 0; i + 1 < els.length; i++) {
        const a = X(els[i].x), b = X(els[i + 1].x), lab = (els[i + 1].x - els[i].x).toFixed(1);
        const yy = baseY - 3;
        if (b - a > ctx.measureText(lab).width + 8) { ctx.fillStyle = T.muted; ctx.fillText(lab, (a + b) / 2, yy); }
      }
      // rods
      els.forEach((e, idx) => {
        const x = X(e.x), hz = e.L / 2 * s, hot = this.hot === e.id;
        const cur = this.metrics && this.metrics.currents && this.metrics.currents[idx];
        if (cur) {
          ctx.beginPath();
          const maxW = Math.max(6, Math.min(14, 0.5 * (x1 - x0) * s / Math.max(els.length, 1)));
          for (let k = 0; k < cur.z.length; k++) { const y = cy - cur.z[k] * s, m = cur.mag[k] * maxW; if (k) ctx.lineTo(x + m, y); else ctx.moveTo(x + m, y); }
          for (let k = cur.z.length - 1; k >= 0; k--) { ctx.lineTo(x + cur.mag[k] * maxW, cy + cur.z[k] * s); }
          for (let k = 0; k < cur.z.length; k++) { ctx.lineTo(x - cur.mag[k] * maxW, cy + cur.z[k] * s); }
          for (let k = cur.z.length - 1; k >= 0; k--) { ctx.lineTo(x - cur.mag[k] * maxW, cy - cur.z[k] * s); }
          ctx.closePath();
          ctx.globalAlpha = hot ? 0.28 : 0.17; ctx.fillStyle = T.s1; ctx.fill(); ctx.globalAlpha = 1;
        }
        const col = hot ? T.accent : e.type === "driven" ? T.s2 : T.ink;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(hot ? 3 : 2, e.d * s);
        ctx.lineCap = "round";
        if (e.type === "driven") {
          const b2 = e.bend || {}, fc2 = (d.boomFace === undefined ? 10 : d.boomFace) * s;
          ctx.beginPath(); ctx.moveTo(x + (b2.topF || 0) * s, cy - hz); ctx.lineTo(x, cy - fc2); ctx.lineTo(x, cy - 4); ctx.moveTo(x, cy + 4); ctx.lineTo(x, cy + fc2); ctx.lineTo(x + (b2.botF || 0) * s, cy + hz); ctx.stroke();
        } else {
          const b2 = e.bend || {}, fc2 = (d.boomFace === undefined ? 10 : d.boomFace) * s;
          ctx.beginPath(); ctx.moveTo(x + (b2.topF || 0) * s, cy - hz); ctx.lineTo(x, cy - fc2); ctx.lineTo(x, cy + fc2); ctx.lineTo(x + (b2.botF || 0) * s, cy + hz); ctx.stroke();
        }
        ctx.lineCap = "butt";
        if (!this.opts.readOnly) {
          for (const sign of [1, -1]) {
            ctx.beginPath(); ctx.arc(x + ((e.bend && e.bend[sign > 0 ? "topF" : "botF"]) || 0) * s, cy - sign * hz, hot ? 5 : 3.5, 0, 7);
            ctx.fillStyle = T.panel; ctx.fill();
            ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
          }
        }
        ctx.fillStyle = hot ? T.accent : T.ink2; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        const short = e.type === "reflector" ? "R" : e.type === "driven" ? "DE" : e.name;
        ctx.fillText(short, x, cy - hz - 7);
        if (hot) {
          ctx.font = `11px ${T.mono}`; ctx.textBaseline = "top"; ctx.fillStyle = T.ink;
          ctx.fillText(e.L.toFixed(1) + " mm", x, cy + hz + 7);
        }
      });
      // which way it points
      ctx.fillStyle = T.muted; ctx.font = `11px ${T.sans}`; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      const ax = w - 6;
      ctx.fillText("forward", ax - 16, 12);
      ctx.strokeStyle = T.muted; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ax - 13, 12); ctx.lineTo(ax, 12); ctx.moveTo(ax - 4, 8); ctx.lineTo(ax, 12); ctx.lineTo(ax - 4, 16); ctx.stroke();
    }
  }

  YS.Layout2D = Layout2D;
})(typeof globalThis !== "undefined" ? globalThis : this);
