/*
 * Yagi Studio 3D view: the antenna, coloured by the current on each rod, inside its radiation
 * pattern. Plain WebGL with no library, so the single-file build works offline. Rods point up the
 * screen (design z), the boom runs along x, and forward is +x.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  const YAW = 1.12, PITCH = 0.36;     // the view to start from: side on, a little from the front and above
  const PATTERN_ALPHA = 0.3, GRID_ALPHA = 0.42;

  const VERT = `
    attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
    uniform mat4 uMvp;
    varying vec3 vNor; varying vec3 vCol; varying vec3 vPos;
    void main(){ vNor = aNor; vCol = aCol; vPos = aPos; gl_Position = uMvp * vec4(aPos,1.); }`;
  const FRAG = `
    precision mediump float;
    varying vec3 vNor; varying vec3 vCol; varying vec3 vPos;
    uniform float uAlpha; uniform vec3 uEye; uniform float uLit;
    void main(){
      vec3 n = normalize(vNor); vec3 v = normalize(uEye - vPos);
      if (dot(n, v) < 0.) n = -n;
      float d = max(dot(n, normalize(vec3(.4,.8,.5))), 0.) * .55 + max(dot(n, normalize(vec3(-.6,.2,-.4))), 0.) * .18 + .42;
      float rim = pow(1. - max(dot(n, v), 0.), 2.);
      vec3 c = mix(vCol, vCol * d, uLit);
      gl_FragColor = vec4(c, uAlpha * (1. + rim * 1.2 * uLit));
    }`;

  /* minimal column-major matrices */
  const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; };
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  function lookAt(e, c, up) {
    const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = nrm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = nrm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  }

  function hexRgb(s) {
    s = s.trim();
    if (s[0] === "#") {
      const n = parseInt(s.slice(1), 16);
      return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
    }
    const m = s.match(/[\d.]+/g) || [128, 128, 128];
    return [m[0] / 255, m[1] / 255, m[2] / 255];
  }

  class View3D {
    constructor(canvas) {
      this.canvas = canvas;
      this.yaw = YAW; this.pitch = PITCH; this.zoom = 1;
      this.meshes = {};
      this.show = { pattern: true, rods: true };
      let gl = null;
      try { gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false }); } catch (e) { gl = null; }
      this.gl = gl;
      if (!gl) return;
      const shader = (t, src) => {
        const s = gl.createShader(t);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("3D shader: " + gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p);
      gl.useProgram(p);
      this.prog = p;
      this.loc = {
        aPos: gl.getAttribLocation(p, "aPos"), aNor: gl.getAttribLocation(p, "aNor"), aCol: gl.getAttribLocation(p, "aCol"),
        uMvp: gl.getUniformLocation(p, "uMvp"), uAlpha: gl.getUniformLocation(p, "uAlpha"),
        uEye: gl.getUniformLocation(p, "uEye"), uLit: gl.getUniformLocation(p, "uLit"),
      };
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.bindInput();
      this.ro = new ResizeObserver(() => this.draw());
      this.ro.observe(canvas);
    }

    bindInput() {
      const c = this.canvas;
      const pts = new Map();
      let last = null, lastPinch = 0;
      c.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, e); c.setPointerCapture(e.pointerId); last = [e.clientX, e.clientY]; });
      c.addEventListener("pointermove", (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, e);
        if (pts.size === 1 && last) {
          this.yaw += (e.clientX - last[0]) * 0.008;
          this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + (e.clientY - last[1]) * 0.008));
          last = [e.clientX, e.clientY];
          this.draw();
        } else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (lastPinch) { this.zoom = Math.max(0.4, Math.min(3, this.zoom * d / lastPinch)); this.draw(); }
          lastPinch = d;
        }
      });
      const up = (e) => { pts.delete(e.pointerId); lastPinch = 0; last = null; };
      c.addEventListener("pointerup", up);
      c.addEventListener("pointercancel", up);
      c.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom = Math.max(0.4, Math.min(3, this.zoom * Math.exp(-e.deltaY * 0.001))); this.draw(); }, { passive: false });
      c.addEventListener("dblclick", () => { this.yaw = YAW; this.pitch = PITCH; this.zoom = 1; this.draw(); });
    }

    /** Lines of constant angle over the pattern, so its shape reads without shading alone. */
    gridLines(nth, nph, pos, color) {
      const out = [];
      const add = (p, q) => { out.push(...p, 0, 1, 0, ...color, ...q, 0, 1, 0, ...color); };
      for (let i = 5; i < nth - 1; i += 5) for (let j = 0; j + 1 < nph; j++) add(pos[i * nph + j], pos[i * nph + j + 1]);
      for (let j = 0; j + 1 < nph; j += 10) for (let i = 0; i + 1 < nth; i++) add(pos[i * nph + j], pos[(i + 1) * nph + j]);
      return out;
    }

    buffer(name, verts) {
      const gl = this.gl;
      const old = this.meshes[name];
      if (old) gl.deleteBuffer(old.buf);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
      this.meshes[name] = { buf, count: verts.length / 9 };
    }

    /** Rebuilds the geometry. design: the rods; currents from the solver; pattern grid in dBi. */
    update(design, metrics, pattern, colors) {
      if (!this.gl) return;
      this.colors = colors;
      const el = design.elements.slice().sort((a, b) => a.x - b.x);
      const x0 = el[0].x, x1 = el[el.length - 1].x;
      const maxL = Math.max.apply(null, el.map((e) => e.L));
      const span = Math.max(x1 - x0, maxL, 1);
      const scale = 1 / span;
      const cx = (x0 + x1) / 2;
      const T = (x, z, y) => [(x - cx) * scale, z * scale, (y || 0) * scale];
      this.scale = scale;

      // rods as cylinders, thickened so they read at this scale, coloured by the current along them
      const lo = hexRgb(colors.rodLow), hi = hexRgb(colors.rodHigh);
      const rodVerts = [];
      const sides = 10;
      const radiusBoost = Math.max(1, 0.0035 * span / (el[0].d / 2));
      el.forEach((e, idx) => {
        const cur = metrics && metrics.currents && metrics.currents[idx];
        const r = e.d / 2 * radiusBoost;
        const hs = e.L / 2;
        const zs = [], mags = [];
        if (cur) {
          for (let i = cur.z.length - 1; i > 0; i--) { zs.push(-cur.z[i]); mags.push(cur.mag[i]); }
          for (let i = 0; i < cur.z.length; i++) { zs.push(cur.z[i]); mags.push(cur.mag[i]); }
        } else { zs.push(-hs, hs); mags.push(0.3, 0.3); }
        for (let i = 0; i + 1 < zs.length; i++) {
          const c0 = lo.map((v, k) => v + (hi[k] - v) * mags[i]), c1 = lo.map((v, k) => v + (hi[k] - v) * mags[i + 1]);
          for (let s = 0; s < sides; s++) {
            const a0 = s / sides * 2 * Math.PI, a1 = (s + 1) / sides * 2 * Math.PI;
            // a bent rod's tips, drawn where they really are, from where it leaves the boom
            const b = e.bend || {}, face = design.boomFace === undefined ? 10 : design.boomFace;
            const past = (z) => Math.max(0, Math.abs(z) - face) / Math.max(hs - face, 1);
            const q = (a, z) => T(e.x + (z > 0 ? b.topF || 0 : b.botF || 0) * past(z) + r * Math.cos(a), z + (b.shift || 0), (z > 0 ? b.topS || 0 : b.botS || 0) * past(z) + r * Math.sin(a));
            const n = (a) => [Math.cos(a), 0, Math.sin(a)];
            const tri = [[a0, zs[i], c0], [a1, zs[i], c0], [a1, zs[i + 1], c1], [a0, zs[i], c0], [a1, zs[i + 1], c1], [a0, zs[i + 1], c1]];
            for (const [a, z, col] of tri) rodVerts.push(...q(a, z), ...n(a), ...col);
          }
        }
      });
      // boom, a slim box, in neutral
      const bc = hexRgb(colors.boom), bw = Math.max(span * 0.012, 3), pad = span * 0.03;
      const box = (xa, xb, ya, yb, za, zb, col, out) => {
        const f = (p, n) => { for (const v of p) out.push(...T(v[0], v[2], v[1]), ...n, ...col); };
        const P = (x, y, z) => [x, y, z];
        f([P(xa, ya, za), P(xb, ya, za), P(xb, yb, za), P(xa, ya, za), P(xb, yb, za), P(xa, yb, za)], [0, -1, 0]);
        f([P(xa, ya, zb), P(xb, ya, zb), P(xb, yb, zb), P(xa, ya, zb), P(xb, yb, zb), P(xa, yb, zb)], [0, 1, 0]);
        f([P(xa, ya, za), P(xb, ya, za), P(xb, ya, zb), P(xa, ya, za), P(xb, ya, zb), P(xa, ya, zb)], [0, 0, -1]);
        f([P(xa, yb, za), P(xb, yb, za), P(xb, yb, zb), P(xa, yb, za), P(xb, yb, zb), P(xa, yb, zb)], [0, 0, 1]);
      };
      box(x0 - pad, x1 + pad, -bw, bw, -bw, bw, bc, rodVerts);
      if (design.mast && design.mast.on) {
        const mh = Math.min(design.mast.length / 2, span * 0.9), mr = design.mast.d / 2, mx = x0 - design.mast.behind;
        const mc = hexRgb(colors.pin);
        for (let s = 0; s < 16; s++) {
          const a0 = s / 16 * 2 * Math.PI, a1 = (s + 1) / 16 * 2 * Math.PI;
          const q = (a, z) => T(mx + mr * Math.cos(a), z, mr * Math.sin(a));
          for (const [a, z] of [[a0, -mh], [a1, -mh], [a1, mh], [a0, -mh], [a1, mh], [a0, mh]]) rodVerts.push(...q(a, z), Math.cos(a), 0, Math.sin(a), ...mc);
        }
      }
      this.buffer("rods", rodVerts);

      if (pattern) {
        const { nth, nph, g } = pattern;
        let peak = -Infinity;
        for (let i = 0; i < g.length; i++) if (g[i] > peak) peak = g[i];
        this.peak = peak;
        const floor = 30;           // dB below the peak at the centre of the plot
        const size = 0.85;          // lobe length, against the longest dimension of the antenna
        const highC = hexRgb(colors.patHigh), under = hexRgb(colors.surface);
        const lowC = highC.map((c, k) => under[k] + (c - under[k]) * 0.45);     // one hue, fading toward the surface
        const pos = new Array(nth * nph), col = new Array(nth * nph);
        for (let i = 0; i < nth; i++) {
          const th = Math.PI * i / (nth - 1);
          for (let j = 0; j < nph; j++) {
            const ph = 2 * Math.PI * j / (nph - 1), v = g[i * nph + j];
            const m = Math.max(0, 1 + (v - peak) / floor);
            const r = m * size;
            pos[i * nph + j] = [r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)];
            col[i * nph + j] = lowC.map((c, k) => c + (highC[k] - c) * m);
          }
        }
        const out = [];
        const nrm = (a, b, c) => {
          const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
          const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          const l = Math.hypot(n[0], n[1], n[2]) || 1;
          return [n[0] / l, n[1] / l, n[2] / l];
        };
        for (let i = 0; i + 1 < nth; i++) {
          for (let j = 0; j + 1 < nph; j++) {
            const a = i * nph + j, b = i * nph + j + 1, c = (i + 1) * nph + j + 1, d = (i + 1) * nph + j;
            const n1 = nrm(pos[a], pos[b], pos[c]);
            for (const q of [a, b, c, a, c, d]) out.push(...pos[q], ...n1, ...col[q]);
          }
        }
        this.buffer("pattern", out);
        this.buffer("grid", this.gridLines(nth, nph, pos, highC));
      }
      this.draw();
    }

    draw() {
      const gl = this.gl;
      if (!gl) return;
      const c = this.canvas, r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const dist = 2.6 / this.zoom;
      const eye = [dist * Math.cos(this.pitch) * Math.cos(this.yaw), dist * Math.sin(this.pitch), dist * Math.cos(this.pitch) * Math.sin(this.yaw)];
      const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
      const mvp = mul(persp(0.72, w / h, 0.02, 40), view);
      gl.uniformMatrix4fv(this.loc.uMvp, false, new Float32Array(mvp));
      gl.uniform3fv(this.loc.uEye, new Float32Array(eye));
      const bind = (m) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
        gl.enableVertexAttribArray(this.loc.aPos); gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, 36, 0);
        gl.enableVertexAttribArray(this.loc.aNor); gl.vertexAttribPointer(this.loc.aNor, 3, gl.FLOAT, false, 36, 12);
        gl.enableVertexAttribArray(this.loc.aCol); gl.vertexAttribPointer(this.loc.aCol, 3, gl.FLOAT, false, 36, 24);
      };
      if (this.meshes.rods) {
        gl.depthMask(true);
        gl.uniform1f(this.loc.uAlpha, 1);
        gl.uniform1f(this.loc.uLit, 1);
        bind(this.meshes.rods);
        gl.drawArrays(gl.TRIANGLES, 0, this.meshes.rods.count);
      }
      if (this.meshes.pattern && this.show.pattern) {
        gl.depthMask(false);
        gl.uniform1f(this.loc.uAlpha, PATTERN_ALPHA);
        gl.uniform1f(this.loc.uLit, 1);
        bind(this.meshes.pattern);
        gl.drawArrays(gl.TRIANGLES, 0, this.meshes.pattern.count);
        gl.uniform1f(this.loc.uAlpha, GRID_ALPHA);
        gl.uniform1f(this.loc.uLit, 0);
        bind(this.meshes.grid);
        gl.drawArrays(gl.LINES, 0, this.meshes.grid.count);
        gl.depthMask(true);
      }
    }
  }

  YS.View3D = View3D;
})(typeof globalThis !== "undefined" ? globalThis : this);
