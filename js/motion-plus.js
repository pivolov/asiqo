/* ASIQO motion: one on-demand clock, stable text geometry, SVG-clipped logo.
   All content is already present in HTML; this module is optional. */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const glyphs = '@#%&*+=<>/\\|01{}[]:;!?$ixcLfo';
  const mono = '"ASIQO Mono",monospace';
  const jobs = new Set();
  const cleanups = new Set();
  let raf = 0, previous = 0;

  // All optional motion shares a 30 fps clock; no RAF remains when idle.
  function tick(now) {
    raf = 0;
    if (document.hidden || reduce.matches) return;
    if (now - previous >= 1000 / 30) {
      const dt = previous ? Math.min(.25, (now - previous) / 1000) : 1 / 30;
      previous = now;
      for (const job of jobs) if (!job(now, dt)) jobs.delete(job);
    }
    if (jobs.size) raf = requestAnimationFrame(tick);
    else previous = 0;
  }
  function run(job) {
    if (reduce.matches || document.hidden) return;
    jobs.add(job);
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function settle() {
    cancelAnimationFrame(raf); raf = 0; previous = 0;
    for (const cleanup of cleanups) cleanup();
    jobs.clear();
    document.documentElement.classList.remove('js-dc');
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
  reduce.addEventListener('change', e => { if (e.matches) settle(); });
  addEventListener('beforeprint', settle);
  if (reduce.matches) { settle(); return; }

  function headings() {
    const active = new Map(), metrics = new WeakMap();
    const nodes = [...document.querySelectorAll('[data-decode]')];
    function finish(h) {
      const state = active.get(h);
      if (!state) return;
      jobs.delete(state.frame); state.layer.remove();
      h.classList.remove('decode-running'); active.delete(h);
    }
    function measure(h) {
      if (metrics.has(h)) return metrics.get(h);
      const bounds = h.getBoundingClientRect(), styles = new Map(), cells = [];
      const walker = document.createTreeWalker(h.querySelector('.decode-source'), NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        let style = styles.get(node.parentElement);
        if (!style) {
          const cs = getComputedStyle(node.parentElement);
          style = {family:cs.fontFamily,size:cs.fontSize,weight:cs.fontWeight,italic:cs.fontStyle,color:cs.color};
          styles.set(node.parentElement, style);
        }
        for (let i = 0; i < node.length; i++) {
          const char = node.nodeValue[i];
          if (/\s/.test(char)) continue;
          const range = document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
          const rect = range.getBoundingClientRect();
          if (rect.width) cells.push({char,...style,x:rect.left-bounds.left,y:rect.top-bounds.top,w:rect.width,h:rect.height});
        }
      }
      metrics.set(h,cells); return cells;
    }
    function play(h, replay = false) {
      h.classList.add('decode-seen');
      if (reduce.matches || document.hidden) return;
      if (active.has(h)) {
        if (!replay) return;
        finish(h);
      }
      const geometry = measure(h);
      if (!geometry.length) return;
      const layer = document.createElement('span');layer.className='decode-layer';layer.setAttribute('aria-hidden','true');
      // The real contact section is .reach-out; its symbols must stay white.
      const noise = h.closest('.hero-info,.reach-out') ? '#fff' : 'var(--red)';
      const duration=1000, sharpen=400;
      const cells = geometry.map((cell,i) => {
        const span=document.createElement('span');span.className='decode-char';
        const at=i/Math.max(1,geometry.length-1)*(duration-sharpen);
        Object.assign(span.style,{
          left:cell.x+'px',top:cell.y+'px',width:cell.w+'px',height:cell.h+'px',
          fontFamily:mono,fontSize:cell.size,fontWeight:cell.weight,fontStyle:cell.italic,
          lineHeight:cell.h+'px',letterSpacing:'0',color:noise
        });
        span.style.setProperty('--decode-at',at+'ms');
        span.textContent=glyphs[Math.floor(Math.random()*glyphs.length)];layer.append(span);
        return {...cell,span,at,done:false};
      });
      const start=performance.now(), end=duration;
      let lastSwap=-1;
      function frame(now) {
        const t=now-start, swap=Math.floor(t/58);
        for (const cell of cells) {
          if(cell.done) continue;
          if(t>=cell.at+120){
            cell.done=true;cell.span.textContent=cell.char;
            cell.span.style.fontFamily=cell.family;cell.span.style.color=cell.color;
          }else if(swap!==lastSwap){cell.span.textContent=glyphs[Math.floor(Math.random()*glyphs.length)];}
        }
        lastSwap=swap;
        if(t>=end){finish(h);return false;}
        return true;
      }
      h.append(layer);h.classList.add('decode-running');active.set(h,{layer,frame});run(frame);
    }
    const onScreen=new Set();
    const io=new IntersectionObserver(entries=>{
      for(const e of entries){
        if(!e.isIntersecting||e.intersectionRatio===0){onScreen.delete(e.target);finish(e.target);}
        else if(e.intersectionRatio>=.2&&!onScreen.has(e.target)){onScreen.add(e.target);play(e.target);}
      }
    },{threshold:[0,.2]});
    for(const h of nodes){
      const source=document.createElement('span');source.className='decode-source';
      while(h.firstChild)source.append(h.firstChild);h.append(source);io.observe(h);
      // Only the two hero labels can replay their decode animation on hover.
      // Other headings keep the existing reveal-on-scroll behavior.
      if (h.matches('.hero .hotel, .hero #hero-heading')) {
        h.addEventListener('pointerenter', event => {
          if (event.pointerType !== 'touch') play(h, true);
        }, {passive: true});
      }
    }
    const finishAll=()=>{for(const h of [...active.keys()])finish(h);};
    const invalidate=()=>{finishAll();for(const h of nodes)metrics.delete(h);};
    cleanups.add(finishAll);
    addEventListener('resize',invalidate,{passive:true});
    document.fonts?.addEventListener('loadingdone',invalidate);
    const sizes=new WeakMap();
    const resize=new ResizeObserver(entries=>{
      for(const {target:h,contentRect:r} of entries){
        const prior=sizes.get(h);
        sizes.set(h,[r.width,r.height]);
        if(prior&&(Math.abs(prior[0]-r.width)>1||Math.abs(prior[1]-r.height)>1)){
          metrics.delete(h);finish(h);
        }
      }
    });
    nodes.forEach(h=>resize.observe(h));
  }

  function headerLogo() {
    const link=document.querySelector('.header .mark'), bolt=link?.querySelector('.mark-bolt');
    if(!bolt) return;
    let animation=null;
    function strike() {
      if(reduce.matches || document.hidden || animation?.playState==='running') return;
      animation=bolt.animate([
        {transform:'translateY(0) scaleY(1)',opacity:1,offset:0,easing:'cubic-bezier(.2,.7,.2,1)'},
        {transform:'translateY(-3px) scaleY(.97)',opacity:1,offset:.14,easing:'cubic-bezier(.55,.05,.85,.25)'},
        {transform:'translateY(36px) scaleY(1.16)',opacity:1,offset:.36},
        {transform:'translateY(36px) scaleY(1.16)',opacity:0,offset:.37},
        {transform:'translateY(-36px) scaleY(1.16)',opacity:0,offset:.39},
        {transform:'translateY(-36px) scaleY(1.16)',opacity:1,offset:.4,easing:'cubic-bezier(.16,1,.3,1)'},
        {transform:'translateY(3px) scaleY(.94)',opacity:1,offset:.78,easing:'ease-out'},
        {transform:'translateY(-1px) scaleY(1.02)',opacity:1,offset:.91,easing:'ease-out'},
        {transform:'translateY(0) scaleY(1)',opacity:1,offset:1}
      ],{duration:1050,easing:'linear'});
    }
    link.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')strike();},{passive:true});
    link.addEventListener('focus',strike);
    cleanups.add(()=>{animation?.cancel();animation=null;});
  }

  // Keep the existing number entrances, using the same clock and cleanup path.
  headerLogo();
  // Measure / reveal text only after the bundled faces have settled. Otherwise
  // a slow first font load could interrupt an already running decode animation.
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => { if (!reduce.matches) { headings(); } });
})();
