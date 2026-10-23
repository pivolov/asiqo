/* Off-main-thread rendering of the same procedural field used by the fallback. */
'use strict';
importScripts('hero-field-map.js', 'ascii-core.js');
if (typeof OffscreenCanvas === 'undefined' || typeof requestAnimationFrame !== 'function') {
  throw new Error('OffscreenCanvas animation not available');
}
const fields = new Map();
// OffscreenCanvas has its own FontFaceSet. Loading the same bundled bytes here
// prevents the Worker silently using a system monospace font.
const fontReady = (async () => {
  if (typeof FontFace === 'undefined' || !self.fonts) return false;
  try {
    const url = new URL('../assets/fonts/ASIQOMono.woff2', self.location.href);
    const font = new FontFace('ASIQO Mono', `url("${url.href}")`, { weight: '100 800' });
    await font.load(); self.fonts.add(font); return true;
  } catch { return false; }
})();
let messages = Promise.resolve();
let frame = 0, hidden = false, reduced = false;
function wake() {
  if (!frame && !hidden && !reduced && [...fields.values()].some(item => item.visible)) {
    frame = requestAnimationFrame(tick);
  }
}
function tick(now) {
  frame = 0;
  if (hidden || reduced) return;
  let visible = false;
  for (const item of fields.values()) {
    if (!item.visible) continue;
    item.field.draw(now);
    visible = true;
  }
  if (visible) frame = requestAnimationFrame(tick);
}
async function handle(m) {
  try {
    if (!(await fontReady)) throw new Error('Bundled font unavailable in Worker; use the DOM fallback');
    if (m.type === 'init') {
      const field = new ASQAscii.Field(m.canvas, m.variant);
      field.resize(m.width, m.height, m.dpr);
      fields.set(m.id, { field, visible: !!m.visible });
      postMessage({ type: 'ready', id: m.id });
      wake();
      return;
    }
    if (m.type === 'visibility') {
      hidden = !!m.hidden;
      if (hidden) { cancelAnimationFrame(frame); frame = 0; }
      else { for (const item of fields.values()) item.field.last = 0; wake(); }
      return;
    }
    if (m.type === 'reduced') {
      reduced = !!m.value;
      if (reduced) {
        cancelAnimationFrame(frame); frame = 0;
        for (const item of fields.values()) item.field.draw(performance.now(), true);
      } else {
        for (const item of fields.values()) item.field.last = 0;
        wake();
      }
      return;
    }
    const item = fields.get(m.id);
    if (!item) return;
    const field = item.field;
    if (m.type === 'resize') {
      field.resize(m.width, m.height, m.dpr);
      if (reduced) field.draw(performance.now(), true);
      else wake();
    }
    if (m.type === 'visible') { item.visible = !!m.visible; if (item.visible) { field.last = 0; wake(); } }
    if (m.type === 'move') { field.move(m.x, m.y); wake(); }
    if (m.type === 'leave') field.leave();
    if (m.type === 'down') { field.down(m.x, m.y); wake(); }
  } catch (error) {
    postMessage({ type: 'render-error', id: m.id, message: String(error) });
  }
}
self.onmessage = ({ data }) => {
  messages = messages.then(() => handle(data)).catch(error => {
    postMessage({ type: 'render-error', id: data.id, message: String(error) });
  });
};
