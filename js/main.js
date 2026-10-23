(()=>{
  'use strict';
  const header=document.querySelector('.header');
  const menu=document.querySelector('#mobile-menu');
  const toggle=document.querySelector('.menu-toggle');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let opener,scrollQueued=false,compact=scrollY>80,headerAnimation,menuAnimation,closing=false;
  header.classList.toggle('is-scrolled',compact);

  // Keep one layout in both positions; animate only its rendered translation.
  function positionHeader(animate=false){
    const width=document.documentElement.clientWidth;
    const current=header.getBoundingClientRect().left;
    const target=width<=650||compact?(width-header.offsetWidth)/2:width<=1100?10:16;
    headerAnimation?.cancel();
    header.style.transform=`translate3d(${target}px,0,0)`;
    if(animate&&!motion.matches&&Math.abs(current-target)>.5){
      headerAnimation=header.animate([
        {transform:`translate3d(${current}px,0,0)`},
        {transform:`translate3d(${target}px,0,0)`}
      ],{duration:520,easing:'cubic-bezier(.2,.75,.2,1)'});
    }
  }
  positionHeader();
  function updateHeader(){
    // Separate thresholds prevent state flicker around one scroll pixel.
    const next=compact?scrollY>48:scrollY>88;
    if(next!==compact){compact=next;header.classList.toggle('is-scrolled',next);positionHeader(true)}
  }
  new ResizeObserver(()=>positionHeader()).observe(header);

  function openMenu(){
    if(menu.open||closing)return;
    opener=toggle;
    menu.classList.remove('is-closing');
    menu.showModal();
    document.body.classList.add('dialog-open');
    toggle.setAttribute('aria-expanded','true');
    if(!motion.matches){
      menuAnimation=menu.animate([{opacity:0,transform:'translateX(28px)'},{opacity:1,transform:'translateX(0)'}],{duration:300,easing:'cubic-bezier(.2,.75,.2,1)'});
      menu.querySelectorAll('nav a').forEach((a,i)=>a.animate([{opacity:0,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],{duration:300,delay:45+i*28,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'}));
    }
  }
  async function closeMenu(){
    if(!menu.open||closing)return;
    closing=true;
    menuAnimation?.cancel();
    if(!motion.matches){
      menu.classList.add('is-closing');
      menuAnimation=menu.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(20px)'}],{duration:180,easing:'ease-in'});
      try{await menuAnimation.finished}catch{}
    }
    menu.close();
    menu.classList.remove('is-closing');
    closing=false;
  }
  toggle.addEventListener('click',openMenu);
  menu.querySelector('[data-close]').addEventListener('click',closeMenu);
  menu.addEventListener('cancel',event=>{event.preventDefault();closeMenu()});
  menu.addEventListener('close',()=>{
    document.body.classList.remove('dialog-open');
    toggle.setAttribute('aria-expanded','false');
    opener?.focus();opener=null;
    positionHeader();
  });
  menu.addEventListener('click',event=>{if(event.target===menu){const r=menu.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right)closeMenu()}});
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{opener=null;closeMenu()}));
  addEventListener('resize',()=>{positionHeader();if(innerWidth>1024&&menu.open)closeMenu()},{passive:true});

  const links=[...header.querySelectorAll('nav a')];
  const sections=[...document.querySelectorAll('main>section[id]')];
  let sectionStarts=[],activeSection;
  function measureSections(){sectionStarts=sections.map(el=>({id:el.id,top:el.getBoundingClientRect().top+scrollY}));updateActive()}
  function updateActive(){
    const line=scrollY+Math.min(innerHeight*.5,400);
    let current;
    for(const section of sectionStarts){if(section.top>line)break;current=section.id}
    if(current===activeSection)return;
    activeSection=current;
    for(const a of links){if(a.hash==='#'+current)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')}
  }
  new ResizeObserver(measureSections).observe(document.querySelector('main'));
  addEventListener('resize',measureSections,{passive:true});
  measureSections();

  // Arm only content below the viewport, before it can be seen. A one-shot
  // opacity reveal keeps text geometry and sticky descendants completely stable.
  if(!motion.matches){
    const pending=new Set();
    const finish=el=>{el.classList.remove('reveal-pending','reveal-item');pending.delete(el)};
    const entrance=new IntersectionObserver(entries=>{
      for(const e of entries){
        if(!e.isIntersecting)continue;
        const el=e.target;
        entrance.unobserve(el);
        if(motion.matches){finish(el);continue}
        el.classList.remove('reveal-pending');
        const onEnd=event=>{
          if(event.target!==el||event.propertyName!=='opacity')return;
          el.removeEventListener('transitionend',onEnd);
          finish(el);
        };
        el.addEventListener('transitionend',onEnd);
      }
    },{threshold:0,rootMargin:'0px 0px -24px 0px'});
    const targets=document.querySelectorAll('.overview-facts>div,.plant-passport,.operation,.price-block,.price-includes,.calc-intro,.calc-field,.calc-result,.faq-item,.start-guide li');
    // Read all positions before changing styles to avoid repeated layout passes.
    const offscreen=[...targets].filter(el=>el.getBoundingClientRect().top>=innerHeight);
    for(const el of offscreen){
      el.style.setProperty('--rd',Math.min([...el.parentElement.children].indexOf(el),4)*70+'ms');
      pending.add(el);
      el.classList.add('reveal-item','reveal-pending');
      entrance.observe(el);
    }
    document.addEventListener('focusin',event=>{
      const el=event.target.closest('.reveal-pending');
      if(el){entrance.unobserve(el);finish(el)}
    });
    motion.addEventListener('change',()=>{
      if(motion.matches){entrance.disconnect();for(const el of pending)finish(el)}
    });
    addEventListener('beforeprint',()=>{entrance.disconnect();for(const el of pending)finish(el)});
  }
  // One scheduled scroll pass; document dimensions are measured on resize only.
  const bar=document.querySelector('.progress');let scrollRange=0;
  function updateProgress(){bar.style.transform='scaleX('+(scrollRange>0?Math.min(1,Math.max(0,scrollY/scrollRange)):0).toFixed(4)+')'}
  function measureProgress(){scrollRange=document.documentElement.scrollHeight-innerHeight;updateProgress()}
  function onScroll(){scrollQueued=false;updateHeader();updateActive();updateProgress()}
  addEventListener('scroll',()=>{if(!scrollQueued){scrollQueued=true;requestAnimationFrame(onScroll)}},{passive:true});
  addEventListener('resize',measureProgress,{passive:true});
  new ResizeObserver(measureProgress).observe(document.body);
  measureProgress();
  // Calculator only: local arithmetic, no form submission, email or network calls.
  const calculator=document.querySelector('#calc');
  if(calculator){
    const find=s=>calculator.querySelector(s);
    const kw=find('[name="kw"]'),qty=find('[name="qty"]');
    const sum=find('[data-sum]'),kwh=find('[data-kwh]'),output=find('#calc-total');
    const minus=find('[data-step="-1"]'),plus=find('[data-step="1"]');
    const capacityWarning=find('[data-capacity-warning]');
    const rate=Number(calculator.dataset.rate),days=Number(calculator.dataset.days);
    const format=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
    const touched={kw:false,qty:false};
    const fields=[['kw',kw,find('#kw-error')],['qty',qty,find('#qty-error')]];
    function read(){
      const raw=kw.value.trim();
      const power=/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw)?Number(raw.replace(',','.')):NaN;
      const units=qty.value.trim()===''?NaN:Number(qty.value);
      const errors={
        kw:!raw?'Укажите мощность устройства.':!Number.isFinite(power)?'Введите число, например 3,5.':power<.1||power>20?'Допустимая мощность: 0,1–20 кВт.':'',
        qty:!Number.isFinite(units)?'Укажите количество устройств.':!Number.isInteger(units)?'Количество должно быть целым числом.':units<1||units>500?'Укажите от 1 до 500 устройств.':''
      };
      const valid=!errors.kw&&!errors.qty&&Number.isFinite(rate)&&rate>0&&Number.isFinite(days)&&days>0;
      const consumption=valid?power*units*24*days:0;
      return {power,units,valid,errors,consumption,cost:consumption*rate};
    }
    function render(){
      const result=read();
      for(const [name,input,error] of fields){
        input.setAttribute('aria-invalid',touched[name]&&result.errors[name]?'true':'false');
        error.textContent=touched[name]?result.errors[name]:'';
      }
      minus.disabled=!result.errors.qty&&result.units<=1;
      plus.disabled=!result.errors.qty&&result.units>=500;
      sum.textContent=result.valid?format.format(result.cost):'—';
      kwh.textContent=result.valid?format.format(result.consumption):'—';
      output.classList.toggle('is-long',result.valid&&result.cost>=1_000_000);
      capacityWarning.hidden=!(result.valid&&result.power*result.units>1200);
      return result;
    }
    for(const input of [kw,qty]){
      input.addEventListener('input',()=>render());
      input.addEventListener('blur',()=>{touched[input.name]=true;render()});
    }
    for(const button of [minus,plus])button.addEventListener('click',()=>{
      const result=read(),direction=Number(button.dataset.step);
      const base=result.errors.qty?(direction>0?0:2):result.units;
      qty.value=String(Math.max(1,Math.min(500,base+direction)));
      touched.qty=true;render();
    });
    find('[data-rate-label]').textContent=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(rate);
    addEventListener('pageshow',render);
    render();
  }
  motion.addEventListener('change',()=>{if(motion.matches){document.getAnimations().forEach(a=>a.finish());positionHeader()}});
  document.querySelector('#year').textContent=new Date().getFullYear();
})();
