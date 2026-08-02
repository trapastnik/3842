#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
МТК 38 v2 · Студия → mtk38-v2/studio.html.

Слияние render-test (WebGL-сфера + параметры рендера) + quotes-test (слой цитаты, 5 режимов)
+ карточка языка Р2 (тап по слову → Three.Raycaster). Единая панель собрана на переиспользуемом
tuner.js (слайдеры/тумблеры/сегменты, сворачивается). Цитаты включаются/выключаются тумблером.

Текущий стек: Three.js r137 UMD (вендорен, без CDN; file:// и офлайн). Кино-пост — UnrealBloom +
ACES + FogExp2 + DOM-оверлеи виньетки и зерна. Данные — из data/mtk38.json (52 языка, карточки Р2)
и data/mtk38-quotes.json (show:true). JSON — источник истины; html — артефакт сборки.

Запуск:  python3 mtk38-handoff/build_studio.py
"""
import json, os, re

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
D = json.load(open(os.path.join(ROOT, "data", "mtk38.json"), encoding="utf-8"))
Q = json.load(open(os.path.join(ROOT, "data", "mtk38-quotes.json"), encoding="utf-8"))
FM = os.path.join(ROOT, "mtk38-v2", "fonts", "noto", "manifest.json")
embed = set(json.load(open(FM, encoding="utf-8")).get("scripts", [])) if os.path.exists(FM) else set()
OUT = os.path.join(ROOT, "mtk38-v2", "studio.html")

# богатые слова (для рендера И для карточки Р2) — как в build_globe.py
words = []
for l in D["languages"]:
    p = l["geo"].get("primary")
    words.append({"w": l["writing"], "sc": l["script"]["iso15924"], "n": l["name_ru"], "e": l["endonym"],
                  "scn": l["script"]["name_ru"], "f": l["family"], "r": (p["region_ru"] if p else "диаспора"),
                  "src": l["writing_source"], "ver": l["verifier"], "wt": l["weight"], "pr": l["weight"] >= 3})

# цитаты show:true — как в build_quotes_viz.py
quotes = []
for q in Q["quotes"]:
    if not q.get("show"): continue
    m = re.search(r"\((\d{4})\)", q.get("work", ""))
    quotes.append({"ru": q["ru"], "en": q.get("en", ""),
                   "work": re.sub(r"\s*\(.*$", "", q.get("work", "")).strip(),
                   "year": m.group(1) if m else ""})

faces = "\n".join(
    f'@font-face{{font-family:"noto-{s}";src:url("./fonts/noto/{s}.woff2") format("woff2");font-display:swap}}'
    for s in sorted(embed))
DATA = json.dumps({"words": words, "q": quotes}, ensure_ascii=False)

TEMPLATE = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>МТК 38 v2 · Студия</title>
<style>
__FACES__
  @font-face{font-family:"20 Kopeek";font-weight:400;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-book.otf") format("opentype")}
  @font-face{font-family:"20 Kopeek";font-weight:700;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-demibold.otf") format("opentype")}
  @font-face{font-family:"21 Cent";src:url("../mtk38-globe/fonts/cent/21Cent.woff") format("woff");font-display:swap}
  :root{--brass:#D2B773;--paper:#F7F9EF;--telegrey:#CFD0CF;--window:#9DA3A8;--red:#A02128;
    --glow:1;--blur:16;--scrim:1;--qscale:1}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:#222a30;font-family:"20 Kopeek",system-ui,sans-serif}
  #c{position:fixed;inset:0;width:100vw;height:100vh;z-index:0;cursor:grab}#c:active{cursor:grabbing}
  #grain{position:fixed;inset:0;z-index:1;pointer-events:none;background-size:128px 128px;mix-blend-mode:overlay;opacity:.05}
  #vign{position:fixed;inset:0;z-index:1;pointer-events:none;
    background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 42%,rgba(12,16,19,.92) 100%)}
  .scrim{position:fixed;inset:0;z-index:2;pointer-events:none;opacity:var(--scrim);transition:opacity .5s,background .5s}
  .q-off .scrim{opacity:0!important}
  .qbox{position:fixed;z-index:3;pointer-events:none;opacity:0;transition:opacity 1s ease,transform 1s ease}
  .qbox.show{opacity:1}
  .qbox::before{content:"";position:absolute;inset:-16% -9%;z-index:-1;
    backdrop-filter:blur(calc(var(--blur)*1px));-webkit-backdrop-filter:blur(calc(var(--blur)*1px));
    background:rgba(18,22,25,.15);
    -webkit-mask-image:radial-gradient(ellipse at center,#000 42%,rgba(0,0,0,0) 100%);
            mask-image:radial-gradient(ellipse at center,#000 42%,rgba(0,0,0,0) 100%)}
  .ru{font-family:"21 Cent",Georgia,serif;color:var(--paper);line-height:1.24;margin:0;
    font-size:calc(var(--rubase,32px)*var(--qscale));
    text-shadow:0 0 calc(var(--glow)*24px) rgba(247,249,239,.55),
                0 0 calc(var(--glow)*60px) rgba(210,183,115,.30),
                0 0 calc(var(--glow)*110px) rgba(210,183,115,.12)}
  .attr{margin-top:22px;font-size:clamp(13px,1.4vw,18px);color:var(--brass);letter-spacing:.04em}
  .attr .nm{color:var(--paper)}
  .en{margin-top:12px;font-family:"21 Cent",Georgia,serif;font-style:italic;color:var(--window);
    font-size:clamp(12px,1.2vw,16px);opacity:.85}
  body.m-center .scrim{background:radial-gradient(ellipse at 50% 50%, rgba(20,25,28,.5) 0%, rgba(20,25,28,.1) 62%)}
  body.m-center .qbox{--rubase:clamp(26px,3.4vw,52px);left:50%;top:50%;transform:translate(-50%,-50%);
    max-width:62vw;text-align:center;padding:5vh 5vw}
  body.m-center .qbox.show{transform:translate(-50%,-50%)}
  body.m-lower .scrim{background:linear-gradient(to top, rgba(18,22,25,.85) 0%, rgba(18,22,25,.32) 24%, rgba(0,0,0,0) 44%)}
  body.m-lower .qbox{--rubase:clamp(22px,2.6vw,40px);left:0;right:0;bottom:0;padding:5vh 8vw 7vh;text-align:center;border-radius:0}
  body.m-side .scrim{background:linear-gradient(to right, rgba(0,0,0,0) 38%, rgba(18,22,25,.88) 64%)}
  body.m-side .qbox{--rubase:clamp(22px,2.4vw,38px);right:0;top:0;bottom:0;width:46vw;padding:0 5vw;
    display:flex;flex-direction:column;justify-content:center;text-align:left;border-radius:0}
  body.m-scene .scrim{background:rgba(20,24,27,.6)}
  body.m-scene .qbox{--rubase:clamp(30px,4.4vw,72px);left:50%;top:50%;transform:translate(-50%,-50%);
    max-width:72vw;text-align:center;padding:6vh 5vw}
  body.m-scene .qbox.show{transform:translate(-50%,-50%)}
  body.m-corner .scrim{background:linear-gradient(to top right, rgba(18,22,25,.6), rgba(0,0,0,0) 36%)}
  body.m-corner .qbox{--rubase:clamp(17px,1.7vw,26px);left:3vw;bottom:5vh;max-width:40vw;text-align:left;padding:18px 22px}
  body.m-corner .en{display:none}
  #card{position:fixed;left:50%;bottom:-360px;transform:translateX(-50%);z-index:6;width:min(540px,90vw);
    background:rgba(20,25,28,.93);backdrop-filter:blur(14px);border:1px solid rgba(210,183,115,.4);border-radius:16px;
    padding:18px 22px;color:var(--telegrey);transition:bottom .5s cubic-bezier(.2,.7,.2,1)}
  #card.show{bottom:24px}
  #card .x{position:absolute;top:12px;right:15px;cursor:pointer;color:var(--window);font-size:18px}
  #card .w{font-size:clamp(34px,5vw,60px);color:var(--paper);line-height:1.1;text-shadow:0 0 24px rgba(247,249,239,.25)}
  #card .n{font-size:19px;color:var(--paper);font-weight:600;margin-top:3px}#card .e{font-size:15px;color:var(--brass)}
  #card .rows{margin-top:10px;font-size:13px;display:grid;grid-template-columns:auto 1fr;gap:3px 14px}#card .rows b{color:var(--window);font-weight:600}
  #card .ver{margin-top:9px;display:inline-block;font-size:11px;padding:2px 9px;border-radius:10px}
  .ver-ok{background:var(--brass);color:#1a1f23}.ver-warn{background:var(--red);color:#fff}
  .hint{position:fixed;left:16px;bottom:11px;z-index:4;font-size:11px;color:var(--window);opacity:.55;pointer-events:none}
  .hint b{color:var(--brass)}
</style>
</head>
<body class="m-center">
<canvas id="c"></canvas>
<div id="grain"></div>
<div id="vign"></div>
<div class="scrim"></div>
<div class="qbox" id="qbox"><p class="ru" id="ru"></p>
  <div class="attr"><span class="nm">В. И. Ленин</span> · <span id="src"></span></div>
  <div class="en" id="en"></div></div>
<div id="card"><span class="x" id="cx">✕</span><div class="w" id="c_w"></div><div class="n" id="c_n"></div><div class="e" id="c_e"></div>
  <div class="rows" id="c_rows"></div><span class="ver" id="c_ver"></span></div>
<div id="tuner"></div>
<div class="hint">Студия · тяни — поворот · <b>тап по слову</b> → карточка · панель справа, скрыть — <b>H</b></div>
<script src="./vendor/three/three.min.js"></script>
<script src="./vendor/three/js/shaders/CopyShader.js"></script>
<script src="./vendor/three/js/shaders/LuminosityHighPassShader.js"></script>
<script src="./vendor/three/js/postprocessing/EffectComposer.js"></script>
<script src="./vendor/three/js/postprocessing/MaskPass.js"></script>
<script src="./vendor/three/js/postprocessing/ShaderPass.js"></script>
<script src="./vendor/three/js/postprocessing/RenderPass.js"></script>
<script src="./vendor/three/js/postprocessing/UnrealBloomPass.js"></script>
<script src="./tuner.js"></script>
<script>
const DATA=__DATA__, WORDS=DATA.words, Q=DATA.q;
const PAPER='#F7F9EF',TELE='#CFD0CF',BRASS='#D2B773',RED='#A02128';
const FF=iso=>(iso==='Latn'||iso==='Cyrl')?"'20 Kopeek','Arial Unicode MS',sans-serif":"'Arial Unicode MS','noto-"+iso+"',sans-serif";

// ——— WebGL-сфера (структура render-test) ———
const cv=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.toneMapping=THREE.ACESFilmicToneMapping;
const MAXANISO=renderer.capabilities.getMaxAnisotropy();
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(45,1,0.1,100); camera.position.z=15;
const group=new THREE.Group(); scene.add(group);
const RDEF={spin:1.6,R:6.2,size:1.0,depth:0.55,brass:32,red:5,bloom:0.85,bloomR:0.55,thresh:0.70,expo:1.10,fog:0.30,vign:0.5,grain:0.4,bg:46};
const P=Object.assign({},RDEF);
let quotesOn=true, mode='center';
const texCache={};
function tex(text,iso,color){
  // Текстуру слова сайзим по РЕАЛЬНОМУ bounding box глифа (actualBoundingBox…), не по кеглю —
  // иначе сложные письменности (тибетское/деванагари/арабское с огласовками) вылезают за коробку и режутся.
  const k=text+'|'+color; if(texCache[k])return texCache[k];
  const fs=220,padX=Math.round(fs*0.20),padY=Math.round(fs*0.20);
  const m=document.createElement('canvas'),x=m.getContext('2d');
  x.font='700 '+fs+'px '+FF(iso);
  const tm=x.measureText(text);
  const left =Math.ceil(Math.max(0,tm.actualBoundingBoxLeft||0));
  const right=Math.ceil(Math.max(tm.width||24,(tm.actualBoundingBoxRight!=null?tm.actualBoundingBoxRight:tm.width)));
  const asc  =Math.ceil(tm.actualBoundingBoxAscent ||fs*0.9);
  const desc =Math.ceil(tm.actualBoundingBoxDescent||fs*0.35);
  m.width=left+right+padX*2; m.height=asc+desc+padY*2;
  x.font='700 '+fs+'px '+FF(iso); x.textAlign='left'; x.textBaseline='alphabetic'; x.fillStyle=color;
  x.fillText(text,padX+left,padY+asc);
  const t=new THREE.CanvasTexture(m); t.minFilter=THREE.LinearFilter; t.anisotropy=MAXANISO; const r={t,aspect:m.width/m.height}; texCache[k]=r; return r;
}
function build(){
  for(let i=group.children.length-1;i>=0;i--)group.remove(group.children[i]);
  const N=WORDS.length,gold=Math.PI*(3-Math.sqrt(5));
  WORDS.forEach((d,i)=>{
    const h=(i*131)%100, col=h<P.red?RED:h<P.red+P.brass?BRASS:(i%2?PAPER:TELE);
    const {t,aspect}=tex(d.w,d.sc,col);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,fog:true}));
    sp.userData={li:i}; const s=(0.9+d.wt*0.5)*P.size; sp.scale.set(s*aspect,s,1);
    const y=1-(i/(N-1))*2,rr=Math.sqrt(1-y*y),th=gold*i;
    sp.position.set(Math.cos(th)*rr*P.R, y*P.R, Math.sin(th)*rr*P.R); group.add(sp);
  });
}
let composer,bloom;
function setup(){
  const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  renderer.setPixelRatio(dpr); renderer.setSize(W,H); camera.aspect=W/H; camera.updateProjectionMatrix();
  composer=new THREE.EffectComposer(renderer); composer.addPass(new THREE.RenderPass(scene,camera));
  bloom=new THREE.UnrealBloomPass(new THREE.Vector2(W,H),P.bloom,P.bloomR,P.thresh); composer.addPass(bloom);
  composer.setPixelRatio(dpr); composer.setSize(W,H);
}
addEventListener('resize',setup);
function apply(){
  const sh=Math.round(P.bg); scene.background=new THREE.Color(`rgb(${sh-5},${sh+7},${sh+14})`);
  scene.fog=new THREE.FogExp2(scene.background.getHex(),P.fog*0.07); renderer.toneMappingExposure=P.expo;
  if(bloom){bloom.strength=P.bloom;bloom.radius=P.bloomR;bloom.threshold=P.thresh;}
}

// ——— drag + tap → карточка ———
let drag=false,lx=0,ly=0,pdx=0,pdy=0,pdt=0,moved=false,velY=0,velX=0,spinDir=1;
cv.addEventListener('pointerdown',e=>{drag=true;moved=false;lx=pdx=e.clientX;ly=pdy=e.clientY;pdt=performance.now();velY=velX=0;});
addEventListener('pointerup',e=>{if(drag&&!moved&&performance.now()-pdt<450)pick(e.clientX,e.clientY);drag=false;});
addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;
  if(Math.hypot(e.clientX-pdx,e.clientY-pdy)>10)moved=true;
  velY=dx*0.005;velX=dy*0.005;if(dx)spinDir=dx<0?-1:1;group.rotation.y+=velY;group.rotation.x+=velX;});
const ray=new THREE.Raycaster();
function pick(cx,cy){
  const r=cv.getBoundingClientRect();
  const v=new THREE.Vector2(((cx-r.left)/r.width)*2-1,-((cy-r.top)/r.height)*2+1);
  scene.updateMatrixWorld(); ray.setFromCamera(v,camera);
  const h=ray.intersectObjects(group.children,false);
  if(h.length){const li=h[0].object.userData.li;if(li!=null&&WORDS[li])openCard(WORDS[li]);}
}
const _e=new THREE.Vector3();
function updateDepth(){const R2=2*P.R,fade=P.depth;for(const sp of group.children){
  _e.copy(sp.position).applyEuler(group.rotation);const t=Math.max(0,Math.min(1,(_e.z+P.R)/R2));
  sp.material.opacity=(1-fade)+fade*Math.pow(t,1.4);}}
function animate(){requestAnimationFrame(animate);
  if(!drag){
    group.rotation.y+=velY;velY*=0.95;
    const base=P.spin*0.0016;                       // пол скорости → вращение бесконечное
    if(velY>-base&&velY<base)velY=base*spinDir;
    group.rotation.x+=velX;velX*=0.92;if(Math.abs(velX)<1e-4)velX=0;
  }
  updateDepth();
  composer.render();
}

// ——— оверлеи виньетки/зерна ———
const vignEl=document.getElementById('vign'),grainEl=document.getElementById('grain');
function mkGrain(){
  const g=document.createElement('canvas');g.width=g.height=128;const gx=g.getContext('2d');const im=gx.createImageData(128,128);
  for(let i=0;i<im.data.length;i+=4){const v=Math.random()*255|0;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}
  gx.putImageData(im,0,0);grainEl.style.backgroundImage='url('+g.toDataURL()+')';
}

// ——— карточка языка Р2 (структура globe.html) ———
const card=document.getElementById('card'),cW=document.getElementById('c_w'),cN=document.getElementById('c_n'),
      cE=document.getElementById('c_e'),cRows=document.getElementById('c_rows'),cVer=document.getElementById('c_ver');
function openCard(it){
  cW.textContent=it.w; cW.style.fontFamily=FF(it.sc); cN.textContent=it.n; cE.textContent=it.e; cE.style.fontFamily=FF(it.sc);
  cRows.innerHTML='<b>письмо</b><span>'+it.scn+' ('+it.sc+')</span><b>семья</b><span>'+it.f+'</span><b>ареал</b><span>'+it.r+'</span><b>источник</b><span>'+it.src+'</span>';
  const warn=it.ver==='needs-verification';
  cVer.textContent=warn?'⚠ требует проверки носителем':'✓ '+it.ver; cVer.className='ver '+(warn?'ver-warn':'ver-ok');
  card.classList.add('show');
}
document.getElementById('cx').onclick=()=>card.classList.remove('show');

// ——— слой цитат (структура quotes-test) ———
const ru=document.getElementById('ru'),src=document.getElementById('src'),en=document.getElementById('en'),qbox=document.getElementById('qbox');
let qi=-1,cyc=null;
function show(n){const q=Q[n];ru.textContent=q.ru;src.textContent=q.work+(q.year?(', '+q.year):'');en.textContent=q.en;}
function cycle(){qbox.classList.remove('show');setTimeout(()=>{qi=(qi+1)%Q.length;show(qi);qbox.classList.add('show');},700);}
function startCycle(){stopCycle();cyc=setInterval(cycle,8000);}
function stopCycle(){if(cyc){clearInterval(cyc);cyc=null;}}
function applyBody(){document.body.className='m-'+mode+(quotesOn?'':' q-off');}
function setQuotes(on){if(on){if(qi<0)qi=0;show(qi);qbox.classList.add('show');startCycle();}else{stopCycle();qbox.classList.remove('show');}}

// ——— единая панель на tuner.js ———
Tuner.create({
  mount:document.getElementById('tuner'), title:'Студия · параметры', collapsed:true,
  groups:[
    {title:'Сфера', params:[
      {key:'spin',label:'Вращение',min:0,max:6,step:0.1,value:P.spin},
      {key:'R',label:'Радиус сферы',min:3.5,max:9,step:0.1,value:P.R},
      {key:'size',label:'Размер слов',min:0.4,max:2.4,step:0.05,value:P.size},
      {key:'depth',label:'Затухание дальних',min:0,max:1,step:0.02,value:P.depth},
      {key:'brass',label:'Доля латуни',min:0,max:80,step:1,value:P.brass,unit:'%'},
      {key:'red',label:'Доля красного',min:0,max:25,step:1,value:P.red,unit:'%'}]},
    {title:'Пост-обработка', params:[
      {key:'bloom',label:'Bloom — сила',min:0,max:2.5,step:0.01,value:P.bloom},
      {key:'bloomR',label:'Bloom — радиус',min:0,max:1,step:0.01,value:P.bloomR},
      {key:'thresh',label:'Bloom — порог',min:0,max:1,step:0.01,value:P.thresh},
      {key:'expo',label:'Экспозиция',min:0.4,max:2,step:0.01,value:P.expo},
      {key:'fog',label:'Глубина/туман',min:0,max:1,step:0.01,value:P.fog},
      {key:'vign',label:'Виньетка',min:0,max:1,step:0.02,value:P.vign},
      {key:'grain',label:'Зерно',min:0,max:1,step:0.02,value:P.grain},
      {key:'bg',label:'Фон (светлота)',min:24,max:64,step:1,value:P.bg}]},
    {title:'Цитата', when:s=>s.quotesOn, params:[
      {key:'glow',label:'Свечение',min:0,max:2.5,step:0.05,value:1},
      {key:'blur',label:'Разблюр фона',min:0,max:40,step:1,value:16},
      {key:'scrim',label:'Затемнение',min:0,max:1,step:0.02,value:1},
      {key:'qscale',label:'Размер',min:0.6,max:1.8,step:0.02,value:1}]}
  ],
  toggles:[{key:'quotesOn',label:'Цитаты',value:true}],
  segments:[{key:'mode',label:'Размещение цитаты',when:s=>s.quotesOn,
    options:[['center','Центр'],['lower','Низ'],['side','Сбоку'],['scene','Сцена'],['corner','Уголок']],value:'center'}],
  onChange(key,val){
    if(key in P){
      P[key]=val;
      if(['R','size','brass','red'].includes(key))build();
      else if(['bloom','bloomR','thresh','expo','fog','bg'].includes(key))apply();
      else if(key==='vign')vignEl.style.opacity=val;
      else if(key==='grain')grainEl.style.opacity=(0.12*val).toFixed(3);
      return;
    }
    if(['glow','blur','scrim','qscale'].includes(key)){document.documentElement.style.setProperty('--'+key,val);return;}
    if(key==='quotesOn'){quotesOn=val;applyBody();setQuotes(val);return;}
    if(key==='mode'){mode=val;applyBody();return;}
  }
});

// ——— старт ———
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{
  mkGrain(); build(); setup(); apply();
  vignEl.style.opacity=P.vign; grainEl.style.opacity=(0.12*P.grain).toFixed(3);
  applyBody(); setQuotes(quotesOn); animate();
});
</script>
</body>
</html>
"""
html = TEMPLATE.replace("__FACES__", faces).replace("__DATA__", DATA)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written: {OUT}  ({len(words)} слов + {len(quotes)} цитат · сфера+цитаты+карточки Р2 · панель на tuner.js)")
