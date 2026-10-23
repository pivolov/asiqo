/* ASIQO HOTEL — progressive effects; off-main-thread ASCII and fallback renderer. */
(()=>{'use strict';window.ASQ_EFFECTS_STARTED=true;const rm=matchMedia('(prefers-reduced-motion: reduce)'),live=[];let frame=0;const scramble='@#%&*+=<>/\\|01{}[]:;!?$ixcLfo';const hash=(a,b)=>{const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v)};function wake(){if(!frame&&!document.hidden&&!rm.matches)frame=requestAnimationFrame(tick)}function tick(now){frame=0;let running=false;if(document.hidden||rm.matches)return;for(const o of live){if(o.visible){o.draw(now);running=true}}if(running)frame=requestAnimationFrame(tick)}document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0}else{live.forEach(o=>o.last=0);wake()}});const observe=(el,o)=>{new IntersectionObserver(es=>{o.visible=es[0].isIntersecting;if(o.visible){o.last=0;wake()}},{rootMargin:'30px',threshold:0}).observe(el)};
// The hero is a monochrome living glyph field based on the supplied mockup. Keep the same cursor-red-trail
// interactions in Worker and fallback via shared ASQAscii.Field.
const workerFields = new Map();
const fallbackFields = [];
let worker = null, failed = false, nextId = 0;
const canOffscreen = location.protocol !== 'file:' && typeof Worker !== 'undefined'
  && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';

function attachEvents(el, move, leave, down) {
  const controller = new AbortController();
  const options = { passive: true, signal: controller.signal };
  const point = event => {
    const rect = el.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  el.addEventListener('pointermove', event => {
    if (rm.matches || event.pointerType === 'touch') return;
    move(point(event));
  }, options);
  el.addEventListener('pointerleave', leave, options);
  el.addEventListener('pointercancel', leave, options);
  el.addEventListener('pointerdown', event => {
    if (!rm.matches) down(point(event));
  }, options);
  return () => controller.abort();
}

function startFallback(el, variant) {
  const field = new ASQAscii.Field(el.querySelector('canvas'), variant);
  field.visible = false;
  field.last = 0;
  field.build = () => {
    const rect = el.getBoundingClientRect();
    field.resize(rect.width, rect.height, devicePixelRatio || 1);
    if (rm.matches) field.draw(performance.now(), true);
    el.classList.add('is-ascii-ready');
  };
  live.push(field);
  fallbackFields.push(field);
  observe(el, field);
  new ResizeObserver(field.build).observe(el);
  field.build();
  if (rm.matches) field.draw(performance.now(), true);
  attachEvents(el, p => { field.move(p.x, p.y); wake(); },
    () => field.leave(), p => { field.down(p.x, p.y); wake(); });
}

function fallbackAll() {
  if (failed) return;
  failed = true;
  if (worker) { worker.terminate(); worker = null; }
  for (const item of workerFields.values()) {
    item.observer.disconnect(); item.resize.disconnect();
    item.cleanup?.();
    const canvas = item.el.querySelector('canvas');
    canvas.replaceWith(document.createElement('canvas'));
    item.el.classList.remove('is-ascii-ready');
    startFallback(item.el, item.variant);
  }
  workerFields.clear();
}

if (canOffscreen && !rm.matches) {
  try {
    worker = new Worker(new URL('js/live-worker.js', document.baseURI));
    worker.onerror = fallbackAll;
    worker.onmessage = ({ data }) => {
      if (data.type === 'render-error') { fallbackAll(); return; }
      if (data.type === 'ready') workerFields.get(data.id)?.el.classList.add('is-ascii-ready');
    };
  } catch { worker = null; failed = true; }
}

function startHero(el, variant) {
  if (!worker || failed) { startFallback(el, variant); return; }
  const canvas = el.querySelector('canvas');
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) { startFallback(el, variant); return; }
  const id = ++nextId;
  const observer = new IntersectionObserver(entries => {
    if (worker) worker.postMessage({ type: 'visible', id, visible: entries[0].isIntersecting });
  }, { rootMargin: '30px', threshold: 0 });
  const resize = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    if (worker && width && height) worker.postMessage({ type: 'resize', id, width, height, dpr: devicePixelRatio || 1 });
  });
  workerFields.set(id, { el, variant, observer, resize });
  try {
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ type: 'init', id, canvas: offscreen, variant,
      width: rect.width, height: rect.height, dpr: devicePixelRatio || 1, visible: false }, [offscreen]);
    observer.observe(el);
    resize.observe(el);
    workerFields.get(id).cleanup = attachEvents(el, p => worker?.postMessage({ type: 'move', id, ...p }),
      () => worker?.postMessage({ type: 'leave', id }),
      p => worker?.postMessage({ type: 'down', id, ...p }));
  } catch {
    observer.disconnect(); resize.disconnect(); fallbackAll();
  }
}

if (worker) worker.postMessage({ type: 'visibility', hidden: document.hidden });

// Canvas atlases must be created after the bundled typeface is available.
// CSS uses the same face, so footer, headings and fallback share its metrics.
const monoReady = document.fonts
  ? document.fonts.load('600 14px "ASIQO Mono"').catch(() => []) : Promise.resolve();
monoReady.then(() => {
  for (const [index, el] of [...document.querySelectorAll('[data-live]')].entries()) startHero(el, index);
});
document.addEventListener('visibilitychange', () => {
  if (worker) worker.postMessage({ type: 'visibility', hidden: document.hidden });
});

// Moving the window between monitors can change DPR without resizing a panel.
// Watch resolution as well as ResizeObserver; no polling or extra render loop.
function watchResolution() {
  const query = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
  query.addEventListener('change', () => {
    for (const field of fallbackFields) field.build();
    for (const [id, item] of workerFields) {
      const rect = item.el.getBoundingClientRect();
      worker?.postMessage({ type: 'resize', id, width: rect.width, height: rect.height, dpr: devicePixelRatio || 1 });
    }
    watchResolution();
  }, { once: true });
}
watchResolution();

// Preserve every cell of the supplied artwork; animate only its surface.
class FooterArtwork {
  constructor(el, art) {
    this.el=el; this.art=art; this.cv=el.querySelector('canvas');
    this.c=this.cv.getContext('2d',{alpha:false});
    this.tones=Uint8Array.from(atob(art.tones),c=>c.charCodeAt(0));
    this.heat=new Float32Array(art.chars.length);
    this.pointer={x:-999,y:-999,on:false};
    this.last=0; this.time=0; this.visible=false;
    live.push(this); observe(el,this);
    this.resize=new ResizeObserver(()=>this.build()); this.resize.observe(el);
    this.build();
    el.addEventListener('pointermove',e=>{
      if(rm.matches||e.pointerType==='touch')return;
      const r=el.getBoundingClientRect();
      this.pointer={x:e.clientX-r.left,y:e.clientY-r.top+240*this.scale,on:true}; wake();
    },{passive:true});
    el.addEventListener('pointerleave',()=>this.pointer.on=false,{passive:true});
    el.addEventListener('pointerdown',e=>{
      if(rm.matches)return;
      const r=el.getBoundingClientRect();
      this.touch(e.clientX-r.left,e.clientY-r.top+240*this.scale,110); wake();
    },{passive:true});
  }
  build() {
    const w=Math.round(this.el.getBoundingClientRect().width);
    if(!w||w===this.w)return;
    this.w=w; this.h=w*this.art.height/this.art.width;
    this.scale=w/this.art.width; this.d=Math.min(devicePixelRatio||1,1.5);
    this.cv.width=Math.round(w*this.d); this.cv.height=Math.round(this.h*this.d);
    this.c.setTransform(this.d,0,0,this.d,0,0);
    this.base=document.createElement('canvas');
    this.base.width=this.cv.width; this.base.height=this.cv.height;
    const c=this.base.getContext('2d',{alpha:false});
    c.setTransform(this.d,0,0,this.d,0,0);
    c.fillStyle='#0a0b0d'; c.fillRect(0,0,w,this.h);
    c.font=`700 ${16.7*this.scale}px "ASIQO Mono",monospace`;
    c.textAlign='center'; c.textBaseline='middle';
    for(let i=0;i<this.art.chars.length;i++) {
      const tone=this.tones[i]; c.fillStyle=`rgb(${tone},${tone},${tone})`;
      c.fillText(this.art.chars[i],(5+i%120*10)*this.scale,(10+Math.floor(i/120)*20)*this.scale);
    }
    this.draw(performance.now(),true);
    this.el.classList.add('is-footer-ready'); wake();
  }
  touch(x,y,radius=85) {
    const s=this.scale,cx=x/(10*s),cy=y/(20*s);
    const rx=radius/(10*s),ry=radius/(20*s);
    for(let row=Math.max(0,Math.floor(cy-ry));row<Math.min(26,cy+ry+1);row++) {
      for(let col=Math.max(0,Math.floor(cx-rx));col<Math.min(120,cx+rx+1);col++) {
        const distance=Math.hypot((col-cx)/rx,(row-cy)/ry);
        if(distance<1){const i=row*120+col;this.heat[i]=Math.max(this.heat[i],(1-distance)**2)}
      }
    }
  }
  draw(now,still=false) {
    if(!this.base||(!still&&(rm.matches||now-this.last<(this.pointer.on?40:65))))return;
    const dt=this.last?Math.min(.15,(now-this.last)/1000):.1;
    this.last=now; if(!still&&!rm.matches)this.time+=dt*.9;
    const c=this.c,s=this.scale,quiet=still||rm.matches;
    c.fillStyle='#0a0b0d'; c.fillRect(0,0,this.w,this.h);
    // Twenty-six cached strips avoid redrawing thousands of glyphs every frame.
    for(let row=0;row<26;row++) {
      const y0=Math.round(row*20*s*this.d),y1=Math.round((row+1)*20*s*this.d);
      const drift=quiet?0:Math.sin(this.time*.4+row*.3)*1.1*s;
      c.globalAlpha=quiet?1:.98+.02*Math.sin(this.time*.65+row*.21);
      c.drawImage(this.base,0,y0,this.base.width,y1-y0,drift,y0/this.d,this.w,(y1-y0)/this.d);
    }
    c.globalAlpha=1; if(quiet)return;
    if(this.pointer.on)this.touch(this.pointer.x,this.pointer.y);
    c.font=`700 ${16.7*s}px "ASIQO Mono",monospace`;
    c.textAlign='center'; c.textBaseline='middle';
    const decay=Math.exp(-dt*3.8),step=Math.floor(this.time*10);
    for(let i=0;i<this.heat.length;i++) {
      const heat=this.heat[i]*=decay;
      const row=Math.floor(i/120),col=i%120;
      const wave=.5+.5*Math.sin(col*.11-row*.31-this.time*.8);
      const sparkle=this.tones[i]>16&&hash(i,step)>.93&&wave>.4;
      if(heat<.025&&!sparkle)continue;
      const x=(5+i%120*10)*s,y=(10+Math.floor(i/120)*20)*s;
      c.fillStyle='#0a0b0d'; c.fillRect(x-5*s,y-10*s,10*s,20*s);
      const changing=this.tones[i]>170?'@%#&':'o:+=*x';
      const glyph=heat>.15?scramble[Math.floor(hash(i,step)*scramble.length)]:sparkle?changing[Math.floor(hash(i+7,step)*changing.length)]:this.art.chars[i];
      const tone=Math.min(255,this.tones[i]+(sparkle?22:heat*70));
      c.fillStyle=heat>.18?`rgb(${Math.round(201+heat*40)},${Math.round(65+heat*20)},${Math.round(53+heat*20)})`:`rgb(${tone},${tone},${tone})`;
      c.fillText(glyph,x,y);
    }
  }
}
const footerLogoEl=document.querySelector('[data-footer-logo]');
if(footerLogoEl&&window.ASQ_FOOTER_ART) {
  const footerObserver=new IntersectionObserver(entries=>{
    if(!entries.some(e=>e.isIntersecting))return;
    footerObserver.disconnect(); monoReady.then(() => new FooterArtwork(footerLogoEl,window.ASQ_FOOTER_ART));
  },{rootMargin:'250px 0px',threshold:0});
  footerObserver.observe(footerLogoEl);
}

rm.addEventListener('change',()=>{if(worker)worker.postMessage({type:'reduced',value:rm.matches});if(rm.matches){cancelAnimationFrame(frame);frame=0;live.forEach(o=>o.draw(performance.now(),true))}else wake()});
})();
