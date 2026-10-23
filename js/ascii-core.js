/* ASIQO motion v19 — living typographic fields, shared by Worker and fallback.
   Tonal guides come from the supplied mockup; the canvas only paints glyphs.
   No screenshot, photo layer, pixel readback, timed random swaps or WebGL. */
(function (root) {
  'use strict';
  const SETTINGS = Object.freeze({
    speed: 1, morph: 1, flow: 1, contrast: 1, density: 1,
    gridDeform: .85, interactionStrength: 1, frameInterval: 32, meshSize: 26,
    introDuration: 1.45
  });
  const GLYPHS = ' .,:;!ivxcnLfo%#';
  const INK = '#101010', PAPER = '#d4d4d4', RED = '#df3e36';
  const COLORS = Array.from({ length: 12 }, (_, i) => i === 0 ? INK : i === 11 ? RED
    : `rgb(${[16,16,16].map((v,k) => Math.round(v + ([223,62,54][k] - v) * i / 11)).join(',')})`);
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };
  const atlases = new Map();
  const guides = root.ASQ_HERO_MAPS;
  const maps = guides ? guides.fields.map(data => Uint8Array.from(atob(data), c => c.charCodeAt(0))) : [];
  // Reflect outside coordinates instead of clamping to a frozen edge strip.
  const reflect = n => 1 - Math.abs(((n % 2 + 2) % 2) - 1);
  function sample(map, u, v) {
    const x = reflect(u) * (guides.width - 1), y = reflect(v) * (guides.height - 1);
    const ix = Math.min(guides.width - 2, Math.floor(x)), iy = Math.min(guides.height - 2, Math.floor(y));
    const fx = x - ix, fy = y - iy, i = iy * guides.width + ix;
    return lerp(lerp(map[i], map[i + 1], fx), lerp(map[i + guides.width], map[i + guides.width + 1], fx), fy) / 255;
  }
  function hash(x, y) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  class Field {
    constructor(canvas, variant = 0, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.variant = variant;
      this.settings = { ...SETTINGS, ...options };
      this.time = 0; this.last = 0;
      this.pointer = { x: -1000, y: -1000, tx: -1000, ty: -1000, on: false };
      this.ripple = null;
    }
    resize(width, height, pixelRatio = 1) {
      const w = Math.round(width), h = Math.round(height), dpr = clamp(pixelRatio, 1, 1.5);
      if (!w || !h || (w === this.w && h === this.h && dpr === this.dpr)) return;
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.fontSize = (w < 400 ? 12 : 14) / clamp(this.settings.density, .7, 1.3);
      this.cellW = this.fontSize * .60; this.cellH = this.fontSize * 1.18;
      this.cols = Math.ceil(w / this.cellW); this.rows = Math.ceil(h / this.cellH);
      this.heat = new Float32Array(this.cols * this.rows);
      this.mx = Math.max(3, Math.ceil(w / this.settings.meshSize) + 1);
      this.my = Math.max(3, Math.ceil(h / this.settings.meshSize) + 1);
      this.mesh = new Float32Array(this.mx * this.my);
      this.gridY = new Float32Array(this.cols);
      this.seed = new Float32Array(this.cols * this.rows);
      // All addressing / reveal ranks are fixed until a genuine resize.
      this.colBase = new Uint32Array(this.cols); this.colMix = new Float32Array(this.cols);
      this.rowBase = new Uint32Array(this.rows); this.rowMix = new Float32Array(this.rows);
      for (let col = 0; col < this.cols; col++) {
        const gx = col / Math.max(1, this.cols - 1) * (this.mx - 1);
        this.colBase[col] = Math.min(this.mx - 2, Math.floor(gx)); this.colMix[col] = gx - this.colBase[col];
      }
      for (let row = 0; row < this.rows; row++) {
        const gy = row / Math.max(1, this.rows - 1) * (this.my - 1);
        const iy = Math.min(this.my - 2, Math.floor(gy));
        this.rowBase[row] = iy * this.mx; this.rowMix[row] = gy - iy;
      }
      for (let i = 0; i < this.seed.length; i++) this.seed[i] = hash(i + 17, this.variant + 71);
      this.buildAtlas();
      this.ctx.fillStyle = PAPER; this.ctx.fillRect(0, 0, w, h);
    }
    buildAtlas() {
      const key = `${this.fontSize}:${this.dpr}`;
      if (atlases.has(key)) { Object.assign(this, atlases.get(key)); return; }
      const sw = Math.ceil(this.cellW * this.dpr) + 2;
      const sh = Math.ceil(this.cellH * this.dpr) + 2;
      const atlas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(sw * GLYPHS.length, sh * COLORS.length) : document.createElement('canvas');
      atlas.width = sw * GLYPHS.length; atlas.height = sh * COLORS.length;
      const c = atlas.getContext('2d');
      c.font = `600 ${this.fontSize * this.dpr}px "ASIQO Mono",monospace`;
      c.textBaseline = 'middle'; c.textAlign = 'center';
      COLORS.forEach((color, row) => {
        c.fillStyle = color;
        for (let g = 1; g < GLYPHS.length; g++) c.fillText(GLYPHS[g], (g + .5) * sw, (row + .5) * sh);
      });
      Object.assign(this, { atlas, sw, sh });
      if (atlases.size >= 4) atlases.delete(atlases.keys().next().value);
      atlases.set(key, { atlas, sw, sh });
    }
    valueAt(x, y, time) {
      const t = time * this.settings.speed, flow = this.settings.flow, morph = this.settings.morph;
      // An autonomous changing field, rather than a subtly bent static guide.
      // Frequencies differ between panels; density crosses the whole surface.
      let u, v, fluid;
      if (this.variant % 2 === 0) {
        u = x + flow * (.38 * Math.sin(t * .19)
          + .15 * (Math.sin(y * 4.7 - t * .31) - Math.sin(y * 4.7)));
        v = y + morph * (.17 * (Math.sin(x * 4.3 + t * .23) - Math.sin(x * 4.3))
          + .08 * Math.sin(t * .17));
        const a = u + .19 * Math.sin(v * 4.1 + t * .27);
        const b = v + .17 * Math.sin(u * 3.8 - t * .21);
        fluid = .47 + .25 * Math.sin(a * 4.6 + b * 2.7 - t * .34)
          + .19 * Math.cos(a * 5.7 - b * 3.4 + t * .25)
          + .12 * Math.sin(b * 6.1 + a * 1.7 + t * .19);
      } else {
        u = x + flow * (-.42 * Math.sin(t * .16)
          + .12 * (Math.sin(y * 4.8 + t * .29) - Math.sin(y * 4.8)));
        v = y + morph * (.23 * (Math.sin(x * 4.1 - t * .24) - Math.sin(x * 4.1))
          + .07 * Math.sin(x * 2.7 + t * .18) - .07 * Math.sin(x * 2.7));
        const a = u + .18 * Math.sin(v * 4.8 - t * .24);
        const b = v + .16 * Math.cos(u * 4.1 + t * .18);
        fluid = .47 + .27 * Math.sin(b * 4.7 - a * 2.9 + t * .32)
          + .18 * Math.sin(a * 4.3 + b * 2.4 - t * .23)
          + .12 * Math.cos(b * 7.4 + a * 1.6 + t * .17);
      }
      fluid = clamp((fluid - .26) * 1.72);
      const guide = maps.length ? sample(maps[this.variant % maps.length], u, v) : fluid;
      // The supplied composition opens the page, then yields to actual morphing
      // masses. A small advected guide contribution preserves its texture.
      const evolution = .82 * ease((t - .35) / 5.8) * clamp(morph);
      const value = lerp(guide, fluid, evolution);
      return clamp((value - .34) * this.settings.contrast + .34);
    }
    updateMesh(t) {
      for (let y = 0; y < this.my; y++) for (let x = 0; x < this.mx; x++) {
        this.mesh[y * this.mx + x] = this.valueAt(x / (this.mx - 1), y / (this.my - 1), t);
      }
    }
    touch(x, y, radius = 95, power = 1) {
      if (!this.heat) return;
      const cx = x / this.cellW, cy = y / this.cellH, rx = radius / this.cellW, ry = radius / this.cellH;
      for (let row = Math.max(0, Math.floor(cy - ry)); row < Math.min(this.rows, cy + ry + 1); row++) {
        for (let col = Math.max(0, Math.floor(cx - rx)); col < Math.min(this.cols, cx + rx + 1); col++) {
          const d = Math.hypot((col - cx) / rx, (row - cy) / ry);
          if (d < 1) {
            const i = row * this.cols + col;
            this.heat[i] = Math.max(this.heat[i], ease(1 - d) * power * this.settings.interactionStrength);
          }
        }
      }
    }
    move(x, y) {
      const p = this.pointer; p.tx = x; p.ty = y;
      if (!p.on) { p.x = x; p.y = y; } p.on = true;
    }
    leave() { this.pointer.on = false; }
    down(x, y) { this.ripple = { x, y, time: this.time }; this.touch(x, y, 145, 1); }
    draw(now, still = false) {
      if (!this.heat || (!still && now - this.last < this.settings.frameInterval)) return;
      const dt = this.last ? Math.min(.08, (now - this.last) / 1000) : .045;
      this.last = now; if (!still) this.time += dt;
      const t = this.time, p = this.pointer;
      if (!still) {
        const oldX = p.x, oldY = p.y, follow = 1 - Math.exp(-dt * 18);
        p.x = lerp(p.x, p.tx, follow); p.y = lerp(p.y, p.ty, follow);
        if (p.on) {
          const steps = Math.min(32, Math.max(1, Math.ceil(Math.hypot(p.x - oldX, p.y - oldY) / 18)));
          for (let s = 1; s <= steps; s++) this.touch(lerp(oldX, p.x, s / steps), lerp(oldY, p.y, s / steps), 95, .82);
        }
      }
      this.updateMesh(t);
      const c = this.ctx, cw = this.cellW, ch = this.cellH;
      c.fillStyle = PAPER; c.fillRect(0, 0, this.w, this.h);
      const decay = Math.exp(-dt * 2.7);
      const intro = !still && t < this.settings.introDuration;
      const duration = this.settings.introDuration;
      const phase = t * this.settings.speed;
      const stretchWave = Math.sin(phase * .39) * this.settings.gridDeform * .07;
      const ripple = this.ripple;
      if (ripple && t - ripple.time > 2) this.ripple = null;
      // Deform the glyph grid with one sine per row / column, not per glyph.
      for (let col = 0; col < this.cols; col++) this.gridY[col] = this.settings.gridDeform * 1.9 * Math.sin(col / this.cols * 5.1 + phase * .37);
      for (let row = 0; row < this.rows; row++) {
        const y = row / Math.max(1, this.rows - 1), fy = this.rowMix[row];
        const dx = this.settings.gridDeform * 2.4 * Math.sin(y * 6.2 - phase * .43);
        for (let col = 0; col < this.cols; col++) {
          const fx = this.colMix[col];
          const q = this.rowBase[row] + this.colBase[col], q2 = q + this.mx;
          let value = lerp(lerp(this.mesh[q], this.mesh[q + 1], fx), lerp(this.mesh[q2], this.mesh[q2 + 1], fx), fy);
          const i = row * this.cols + col;
          const heat = still ? this.heat[i] : (this.heat[i] *= decay);
          if (ripple && t - ripple.time < 2) {
            const age = t - ripple.time, d = (Math.hypot(col * cw - ripple.x, row * ch - ripple.y) - age * 155) / 42;
            value = clamp(value + Math.exp(-d * d) * .09 * (1 - age / 2));
          }
          let glyph = Math.min(GLYPHS.length - 1, Math.floor(value * (GLYPHS.length - 1) + .18));
          if (!glyph && heat < .04) continue;
          let reveal = 1, formation = 1;
          if (intro) {
            const x = col / Math.max(1, this.cols - 1);
            const sweep = this.variant % 2 ? 1 - x : x;
            const rank = .43 * sweep + .19 * y + .12 * this.seed[i];
            formation = clamp((t / duration - rank) / .26);
            if (!formation) continue;
            reveal = ease(formation);
            if (formation < .82) {
              // Only the finite opening sequence assembles transient fragments.
              // Idle glyphs remain driven by density, never a random timer.
              const fragments = 1 + Math.floor((this.seed[i] * 11 + Math.floor(formation * 12)) % (GLYPHS.length - 1));
              glyph = formation < .55 ? fragments : glyph;
            }
          }
          if (heat > .06) {
            // Local structural changes follow pointer heat; the idle field never
            // uses a timer to randomize cells.
            const step = Math.floor(t * 14);
            if (hash(i + 11, step) < Math.min(1, heat * 2.2)) glyph = 1 + Math.floor(hash(i + 43, step) * (GLYPHS.length - 1));
          }
          if (!glyph) continue;
          const dy = this.gridY[col];
          const stretch = 1 + (value - .5) * stretchWave;
          c.globalAlpha = reveal;
          c.drawImage(this.atlas, glyph * this.sw, Math.round(ease((heat - .04) / .56) * (COLORS.length - 1)) * this.sh, this.sw, this.sh,
            col * cw + dx - 1, row * ch + dy - 1, (cw + 2 / this.dpr) * stretch, ch + 2 / this.dpr);
        }
      }
      c.globalAlpha = 1;
    }
  }
  root.ASQAscii = { Field, settings: SETTINGS };
})(typeof self !== 'undefined' ? self : window);
