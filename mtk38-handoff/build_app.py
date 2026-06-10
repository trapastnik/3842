#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v2 МТК 38 — единый кинематографичный движок → mtk38-v2/app.html.

Один WebGL-движок (Three.js r137, вендорен) с 52 написаниями-спрайтами (реальные шрифты
20 Kopeek/AUM/Noto) и переключаемыми КОМПОЗИЦИЯМИ (= варианты): глобус, облако, мандала,
дождь, лента, стена, карта (гео по lat/lng). Плавные переходы между раскладками, UnrealBloom +
туман + ACES — максимально кинематографично. Общая ПАНЕЛЬ параметров (всё настраиваемо) +
«Скопировать». Тап по слову → карточка языка (Р2). Слой цитат (вкл/выкл, размещение, разблюр).

Запуск:  python3 mtk38-handoff/build_app.py
"""
import json, os, re

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
D = json.load(open(os.path.join(ROOT, "data", "mtk38.json"), encoding="utf-8"))
Q = json.load(open(os.path.join(ROOT, "data", "mtk38-quotes.json"), encoding="utf-8"))
FM = os.path.join(ROOT, "mtk38-v2", "fonts", "noto", "manifest.json")
embed = set(json.load(open(FM, encoding="utf-8")).get("scripts", [])) if os.path.exists(FM) else set()
OUT = os.path.join(ROOT, "mtk38-v2", "app.html")

langs = []
for l in D["languages"]:
    g = l["geo"]; p = g.get("primary")
    langs.append({"id": l["id"], "n": l["name_ru"], "e": l["endonym"], "w": l["writing"],
                  "sc": l["script"]["iso15924"], "scn": l["script"]["name_ru"], "f": l["family"],
                  "r": (p["region_ru"] if p else "диаспора"),
                  "lat": (p["lat"] if p else None), "lng": (p["lng"] if p else None),
                  "src": l["writing_source"], "ver": l["verifier"], "wt": l["weight"],
                  "dia": g.get("diaspora", False)})
quotes = []
for q in Q["quotes"]:
    if not q.get("show"): continue
    m = re.search(r"\((\d{4})\)", q.get("work", ""))
    quotes.append({"ru": q["ru"], "work": re.sub(r"\s*\(.*$", "", q.get("work", "")).strip(),
                   "year": m.group(1) if m else ""})
faces = "\n".join(
    f'@font-face{{font-family:"noto-{s}";src:url("./fonts/noto/{s}.woff2") format("woff2");font-display:swap}}'
    for s in sorted(embed))
DATA = json.dumps({"langs": langs, "quotes": quotes}, ensure_ascii=False)

TEMPLATE = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МТК 38 v2 · Ленин на языках мира</title>
<style>
__FACES__
  @font-face{font-family:"20 Kopeek";font-weight:400;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-book.otf") format("opentype")}
  @font-face{font-family:"20 Kopeek";font-weight:700;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-demibold.otf") format("opentype")}
  @font-face{font-family:"21 Cent";src:url("../mtk38-globe/fonts/cent/21Cent.woff") format("woff")}
  @font-face{font-family:"Nolde";src:url("../mtk38-globe/fonts/nolde/nolde.otf") format("opentype")}
  :root{--brass:#D2B773;--paper:#F7F9EF;--telegrey:#CFD0CF;--window:#9DA3A8;--graphite:#333d44;
    --glow:1;--blur:18;--scrim:1;--qscale:1}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:#222a30;font-family:"20 Kopeek",system-ui,sans-serif;color:#CFD0CF}
  #c{position:fixed;inset:0;width:100vw;height:100vh;z-index:0;cursor:grab}#c:active{cursor:grabbing}
  .bar{position:fixed;top:14px;left:14px;z-index:5;display:flex;flex-wrap:wrap;gap:5px;max-width:62vw;
    background:rgba(24,29,33,.8);backdrop-filter:blur(8px);border:1px solid rgba(210,183,115,.28);border-radius:11px;padding:6px}
  .bar button{background:transparent;border:0;color:var(--telegrey);font-size:13px;padding:6px 12px;border-radius:7px;cursor:pointer;font-family:inherit}
  .bar button.on{background:var(--brass);color:#1a1f23;font-weight:700}
  #panel{position:fixed;top:14px;right:14px;width:232px;z-index:5;background:rgba(24,29,33,.85);backdrop-filter:blur(8px);
    border:1px solid rgba(210,183,115,.28);border-radius:12px;padding:11px 13px;font-size:12px;max-height:92vh;overflow:auto}
  #panel h3{margin:0 0 7px;font-size:12px;color:var(--brass);font-weight:700;letter-spacing:.05em;text-transform:uppercase}
  #panel h3:not(:first-child){margin-top:12px}
  .pr{margin:7px 0}.pr label{display:flex;justify-content:space-between;margin-bottom:2px}.pr label b{color:var(--paper)}
  input[type=range]{width:100%;accent-color:var(--brass);height:15px}
  .qmodes{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
  .qmodes button{flex:1;background:transparent;border:1px solid var(--window);color:var(--telegrey);border-radius:6px;padding:4px;font-size:11px;cursor:pointer;font-family:inherit}
  .qmodes button.on{background:var(--brass);color:#1a1f23;border-color:var(--brass)}
  .chk{display:flex;align-items:center;gap:7px;margin:8px 0}
  #copy{width:100%;margin-top:10px;background:var(--brass);color:#1a1f23;border:0;border-radius:7px;padding:7px;font-weight:700;cursor:pointer;font-family:inherit}
  /* карточка языка */
  #card{position:fixed;left:50%;bottom:-340px;transform:translateX(-50%);z-index:6;width:min(560px,90vw);
    background:rgba(20,25,28,.92);backdrop-filter:blur(14px);border:1px solid rgba(210,183,115,.4);
    border-radius:16px;padding:18px 22px;transition:bottom .5s cubic-bezier(.2,.7,.2,1)}
  #card.show{bottom:26px}
  #card .x{position:absolute;top:12px;right:14px;cursor:pointer;color:var(--window);font-size:18px}
  #card .cw{font-size:clamp(34px,5vw,60px);color:var(--paper);line-height:1.1;text-shadow:0 0 24px rgba(247,249,239,.25)}
  #card .cn{font-size:19px;color:var(--paper);font-weight:700;margin-top:4px}
  #card .ce{font-size:15px;color:var(--brass)}
  #card .rows{margin-top:10px;font-size:13px;display:grid;grid-template-columns:auto 1fr;gap:3px 14px}
  #card .rows b{color:var(--window);font-weight:600}
  #card .ver{margin-top:9px;display:inline-block;font-size:11px;padding:2px 9px;border-radius:10px}
  .ver-ok{background:var(--brass);color:#1a1f23}.ver-warn{background:#A02128;color:#fff}
  /* слой цитат */
  .scrim{position:fixed;inset:0;z-index:2;pointer-events:none;opacity:0;transition:opacity .6s}
  body.q-on .scrim{opacity:var(--scrim)}
  .qbox{position:fixed;z-index:3;opacity:0;transition:opacity 1s,transform 1s;pointer-events:none}
  body.q-on .qbox.show{opacity:1}
  .qbox::before{content:"";position:absolute;inset:-16% -9%;z-index:-1;
    backdrop-filter:blur(calc(var(--blur)*1px));-webkit-backdrop-filter:blur(calc(var(--blur)*1px));background:rgba(18,22,25,.14);
    -webkit-mask-image:radial-gradient(ellipse at center,#000 42%,transparent 100%);mask-image:radial-gradient(ellipse at center,#000 42%,transparent 100%)}
  .qru{font-family:"21 Cent",Georgia,serif;color:var(--paper);line-height:1.24;margin:0;font-size:calc(var(--qb,34px)*var(--qscale));
    text-shadow:0 0 calc(var(--glow)*24px) rgba(247,249,239,.5),0 0 calc(var(--glow)*64px) rgba(210,183,115,.28)}
  .qat{margin-top:18px;font-size:clamp(12px,1.3vw,17px);color:var(--brass)}.qat .nm{color:var(--paper)}
  body.qm-center .scrim{background:radial-gradient(ellipse at 50% 50%,rgba(18,22,25,.5),rgba(18,22,25,.08) 62%)}
  body.qm-center .qbox{--qb:clamp(26px,3.3vw,50px);left:50%;top:50%;transform:translate(-50%,-50%);max-width:62vw;text-align:center}
  body.qm-center .qbox.show{transform:translate(-50%,-50%)}
  body.qm-lower .scrim{background:linear-gradient(to top,rgba(18,22,25,.82),rgba(18,22,25,.3) 24%,transparent 44%)}
  body.qm-lower .qbox{--qb:clamp(22px,2.5vw,38px);left:0;right:0;bottom:5vh;padding:0 9vw;text-align:center}
  body.qm-scene .scrim{background:rgba(18,22,25,.6)}
  body.qm-scene .qbox{--qb:clamp(30px,4.2vw,70px);left:50%;top:50%;transform:translate(-50%,-50%);max-width:72vw;text-align:center}
  body.qm-scene .qbox.show{transform:translate(-50%,-50%)}
  .hint{position:fixed;left:16px;bottom:10px;z-index:4;font-size:11px;color:var(--window);opacity:.5;pointer-events:none}
  .hint b{color:var(--brass)}
</style>
</head>
<body class="qm-center">
<canvas id="c"></canvas>
<div class="scrim"></div>
<div class="qbox" id="qbox"><p class="qru" id="qru"></p><div class="qat"><span class="nm">В. И. Ленин</span> · <span id="qsrc"></span></div></div>
<div class="bar" id="bar"></div>
<div id="panel">
  <h3>Композиция</h3><div id="layouts" class="qmodes"></div>
  <h3>Рендер</h3><div id="ctrls"></div>
  <h3>Цитаты</h3>
  <div class="chk"><input type="checkbox" id="qon"><label for="qon">Показывать цитаты</label></div>
  <div class="qmodes" id="qmodes"></div>
  <div id="qctrls"></div>
  <button id="copy">Скопировать настройки</button>
</div>
<div id="card"><span class="x" id="cardx">✕</span>
  <div class="cw" id="c_w"></div><div class="cn" id="c_n"></div><div class="ce" id="c_e"></div>
  <div class="rows" id="c_rows"></div><span class="ver" id="c_ver"></span></div>
<div class="hint">МТК 38 v2 · переключай композиции слева, крути параметры справа, тяни мышью, <b>тапни слово</b> → карточка</div>
<script src="./vendor/three/three.min.js"></script>
<script src="./vendor/three/js/shaders/CopyShader.js"></script>
<script src="./vendor/three/js/shaders/LuminosityHighPassShader.js"></script>
<script src="./vendor/three/js/postprocessing/EffectComposer.js"></script>
<script src="./vendor/three/js/postprocessing/MaskPass.js"></script>
<script src="./vendor/three/js/postprocessing/ShaderPass.js"></script>
<script src="./vendor/three/js/postprocessing/RenderPass.js"></script>
<script src="./vendor/three/js/postprocessing/UnrealBloomPass.js"></script>
<script>
const DATA=__DATA__, L=DATA.langs, QUOTES=DATA.quotes, N=L.length;
const PAPER='#F7F9EF',TELE='#CFD0CF',BRASS='#D2B773',RED='#A02128';
const FF=iso=>(iso==='Latn'||iso==='Cyrl')?"'20 Kopeek','Arial Unicode MS',sans-serif":"'Arial Unicode MS','noto-"+iso+"',sans-serif";
let seed=1;const rng=()=>(seed=(seed*16807)%2147483647)/2147483647;
const RV=L.map(()=>({x:rng()*2-1,y:rng()*2-1,z:rng()*2-1,ph:rng()*Math.PI*2,sp:0.6+rng()*0.8}));

const cv=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(45,1,0.1,200);camera.position.z=16;
const group=new THREE.Group();scene.add(group);
const raycaster=new THREE.Raycaster();

function tex(t,iso,c){const fs=128,pad=20,m=document.createElement('canvas'),x=m.getContext('2d');
  x.font='700 '+fs+'px '+FF(iso);const tw=Math.max(24,x.measureText(t).width);m.width=Math.ceil(tw)+pad*2;m.height=fs+pad*2;
  x.font='700 '+fs+'px '+FF(iso);x.textAlign='center';x.textBaseline='middle';x.fillStyle=c;x.fillText(t,m.width/2,m.height/2);
  const tx=new THREE.CanvasTexture(m);tx.minFilter=THREE.LinearFilter;return{t:tx,aspect:m.width/m.height};}
const sprites=[], targets=[];
function buildSprites(){
  L.forEach((d,i)=>{const h=(i*131)%100;const col=h<5?RED:h<34?BRASS:(i%2?PAPER:TELE);
    const {t,aspect}=tex(d.w,d.sc,col);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,fog:true,opacity:0.55+(d.wt-1)*0.2}));
    sp.userData={i,aspect,baseOp:0.55+(d.wt-1)*0.2};group.add(sp);sprites.push(sp);targets.push(new THREE.Vector3());});
}
const P={layout:'globe',bloom:0.85,radius:0.55,thresh:0.7,expo:1.1,fog:0.22,speed:1.0,size:1.0,brass:34,red:5,bg:42,
         q:false,qmode:'center',glow:1,blur:18,scrim:1,qscale:1};

function setScale(){sprites.forEach((sp,i)=>{const s=(0.9+L[i].wt*0.5)*P.size;sp.scale.set(s*sp.userData.aspect,s,1);});}
function computeTargets(){
  const R=6.4,gold=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<N;i++){const t=targets[i],d=L[i],rv=RV[i];
    if(P.layout==='globe'){const y=1-(i/(N-1))*2,r=Math.sqrt(1-y*y),th=gold*i;t.set(Math.cos(th)*r*R,y*R,Math.sin(th)*r*R);}
    else if(P.layout==='cloud'){t.set(rv.x*8,rv.y*5.5,rv.z*8);}
    else if(P.layout==='mandala'){const ring=1+(i%5),a=gold*i;const rr=ring*1.5;t.set(Math.cos(a)*rr,Math.sin(a)*rr,(d.wt-2)*0.6);}
    else if(P.layout==='wall'){const cols=Math.ceil(Math.sqrt(N*1.7)),cx=i%cols,cy=Math.floor(i/cols),rows=Math.ceil(N/cols);
      t.set((cx-(cols-1)/2)*2.4,((rows-1)/2-cy)*1.5,rv.z*0.6);}
    else if(P.layout==='map'){if(d.lat==null){const a=gold*i;t.set(Math.cos(a)*8.5,5.2+Math.sin(a*3)*0.4,Math.sin(a)*8.5);}
      else{const la=d.lat*Math.PI/180,lo=d.lng*Math.PI/180;t.set(R*Math.cos(la)*Math.cos(lo),R*Math.sin(la),R*Math.cos(la)*Math.sin(lo));}}
    else if(P.layout==='rain'){t.set((rv.x)*9,(rv.y)*6,(rv.z)*5);}
    else if(P.layout==='ticker'){const rowN=7,row=i%rowN;t.set(rv.x*8.5,((rowN-1)/2-row)*1.6,(rv.z)*3);}
  }
}
let composer,bloom;
function setup(){const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  renderer.setPixelRatio(dpr);renderer.setSize(W,H);camera.aspect=W/H;camera.updateProjectionMatrix();
  composer=new THREE.EffectComposer(renderer);composer.addPass(new THREE.RenderPass(scene,camera));
  bloom=new THREE.UnrealBloomPass(new THREE.Vector2(W,H),P.bloom,P.radius,P.thresh);composer.addPass(bloom);
  composer.setPixelRatio(dpr);composer.setSize(W,H);}
addEventListener('resize',setup);
function applyRender(){const s=Math.round(P.bg);const bg=new THREE.Color(`rgb(${s-6},${s+6},${s+13})`);
  scene.background=bg;scene.fog=new THREE.FogExp2(bg.getHex(),P.fog*0.06);renderer.toneMappingExposure=P.expo;
  if(bloom){bloom.strength=P.bloom;bloom.radius=P.radius;bloom.threshold=P.thresh;}}
function applyColors(){sprites.forEach((sp,i)=>{const h=(i*131)%100;const col=h<P.red?RED:h<P.red+P.brass?BRASS:(i%2?PAPER:TELE);
  const {t,aspect}=tex(L[i].w,L[i].sc,col);sp.material.map=t;sp.userData.aspect=aspect;sp.material.needsUpdate=true;});setScale();}

let drag=false,lx,ly,flow=0;
cv.addEventListener('pointerdown',e=>{drag=true;lx=e.clientX;ly=e.clientY;cv.dataset.moved='0';});
addEventListener('pointerup',e=>{drag=false;if(cv.dataset.moved==='0')pick(e);});
addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-lx,dy=e.clientY-ly;
  if(Math.abs(dx)+Math.abs(dy)>4)cv.dataset.moved='1';lx=e.clientX;ly=e.clientY;
  group.rotation.y+=dx*0.005;group.rotation.x+=dy*0.005;});
function pick(e){const r=cv.getBoundingClientRect();
  const m=new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
  raycaster.setFromCamera(m,camera);const hit=raycaster.intersectObjects(sprites,false)[0];
  if(hit)openCard(hit.object.userData.i);}

const card=document.getElementById('card');
function openCard(i){const d=L[i];
  document.getElementById('c_w').textContent=d.w;document.getElementById('c_w').style.fontFamily=FF(d.sc);
  document.getElementById('c_n').textContent=d.n;
  document.getElementById('c_e').textContent=d.e;document.getElementById('c_e').style.fontFamily=FF(d.sc);
  document.getElementById('c_rows').innerHTML=
    `<b>письмо</b><span>${d.scn} (${d.sc})</span><b>семья</b><span>${d.f}</span>`+
    `<b>ареал</b><span>${d.r}</span><b>источник</b><span>${d.src}</span>`;
  const ver=document.getElementById('c_ver');const warn=d.ver==='needs-verification';
  ver.textContent=warn?'⚠ требует проверки носителем':'✓ '+d.ver;ver.className='ver '+(warn?'ver-warn':'ver-ok');
  card.classList.add('show');}
document.getElementById('cardx').onclick=()=>card.classList.remove('show');

// цитаты
const qru=document.getElementById('qru'),qsrc=document.getElementById('qsrc'),qbox=document.getElementById('qbox');
let qi=-1,qt;function qshow(n){const q=QUOTES[n];qru.textContent=q.ru;qsrc.textContent=q.work+(q.year?', '+q.year:'');}
function qcycle(){qbox.classList.remove('show');setTimeout(()=>{qi=(qi+1)%QUOTES.length;qshow(qi);qbox.classList.add('show');},700);}
function qStart(){qi=0;qshow(0);qbox.classList.add('show');clearInterval(qt);qt=setInterval(qcycle,8000);}
function qStop(){clearInterval(qt);qbox.classList.remove('show');}

let last=0;
function animate(t){requestAnimationFrame(animate);const dt=Math.min(40,t-(last||t));last=t;
  const spin=P.speed*0.0009;
  if(['globe','cloud','map'].includes(P.layout))group.rotation.y+=spin;
  else if(P.layout==='mandala')group.rotation.z+=spin*0.8;
  else group.rotation.set(group.rotation.x*0.95,0,0);
  if(P.layout==='rain'){flow+=dt;for(let i=0;i<N;i++){targets[i].y+=RV[i].sp*P.speed*0.012*dt;if(targets[i].y>6.5)targets[i].y=-6.5;}}
  else if(P.layout==='ticker'){for(let i=0;i<N;i++){const dir=(i%7)%2?1:-1;targets[i].x+=dir*RV[i].sp*P.speed*0.012*dt;if(targets[i].x>9)targets[i].x=-9;if(targets[i].x<-9)targets[i].x=9;}}
  for(let i=0;i<N;i++)sprites[i].position.lerp(targets[i],0.06);
  composer.render();}

// панель
const LAYOUTS=[['globe','Глобус'],['cloud','Облако'],['mandala','Мандала'],['rain','Дождь'],['ticker','Лента'],['wall','Стена'],['map','Карта']];
const bar=document.getElementById('bar'),layoutsEl=document.getElementById('layouts');
function setLayout(k){P.layout=k;computeTargets();group.rotation.set(0,0,0);
  [...bar.children].forEach(b=>b.classList.toggle('on',b.dataset.k===k));
  [...layoutsEl.children].forEach(b=>b.classList.toggle('on',b.dataset.k===k));}
bar.innerHTML=LAYOUTS.map(([k,l],i)=>`<button data-k="${k}"${i===0?' class="on"':''}>${l}</button>`).join('');
layoutsEl.innerHTML=LAYOUTS.map(([k,l],i)=>`<button data-k="${k}"${i===0?' class="on"':''}>${l}</button>`).join('');
bar.onclick=layoutsEl.onclick=e=>{const b=e.target.closest('button');if(b)setLayout(b.dataset.k);};

const RSPEC=[['bloom','Bloom',0,2.5,.01],['radius','Радиус bloom',0,1,.01],['thresh','Порог bloom',0,1,.01],
 ['expo','Экспозиция',.4,2,.01],['fog','Туман',0,1,.01],['speed','Скорость',0,4,.05],['size','Размер слов',.4,2.4,.05],
 ['brass','Латунь %',0,80,1],['red','Красный %',0,25,1],['bg','Фон',24,60,1]];
const ctrls=document.getElementById('ctrls');
ctrls.innerHTML=RSPEC.map(([k,l,mn,mx,st])=>`<div class="pr"><label>${l}<b id="v_${k}">${P[k]}</b></label><input type="range" id="r_${k}" min="${mn}" max="${mx}" step="${st}" value="${P[k]}"></div>`).join('');
RSPEC.forEach(([k])=>{document.getElementById('r_'+k).oninput=e=>{P[k]=parseFloat(e.target.value);document.getElementById('v_'+k).textContent=P[k];
  if(['brass','red'].includes(k))applyColors();else if(k==='size')setScale();else applyRender();};});

const QSPEC=[['glow','Свечение',0,2.5,.05],['blur','Разблюр',0,40,1],['scrim','Затемнение',0,1,.02],['qscale','Размер',.6,1.8,.02]];
const qctrls=document.getElementById('qctrls');
qctrls.innerHTML=QSPEC.map(([k,l,mn,mx,st])=>`<div class="pr"><label>${l}<b id="qv_${k}">${P[k]}</b></label><input type="range" id="qr_${k}" min="${mn}" max="${mx}" step="${st}" value="${P[k]}"></div>`).join('');
QSPEC.forEach(([k])=>{document.getElementById('qr_'+k).oninput=e=>{P[k]=parseFloat(e.target.value);document.getElementById('qv_'+k).textContent=P[k];
  document.documentElement.style.setProperty('--'+k,P[k]);};});
const QM=[['center','Центр'],['lower','Низ'],['scene','Сцена']];const qmEl=document.getElementById('qmodes');
qmEl.innerHTML=QM.map(([k,l],i)=>`<button data-q="${k}"${i===0?' class="on"':''}>${l}</button>`).join('');
qmEl.onclick=e=>{const b=e.target.closest('button');if(!b)return;P.qmode=b.dataset.q;
  document.body.classList.remove('qm-center','qm-lower','qm-scene');document.body.classList.add('qm-'+b.dataset.q);
  [...qmEl.children].forEach(x=>x.classList.toggle('on',x===b));};
document.getElementById('qon').onchange=e=>{P.q=e.target.checked;document.body.classList.toggle('q-on',P.q);P.q?qStart():qStop();};
document.getElementById('copy').onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(P));
  const b=document.getElementById('copy');b.textContent='Скопировано ✓';setTimeout(()=>b.textContent='Скопировать настройки',1200);};

['glow','blur','scrim','qscale'].forEach(k=>document.documentElement.style.setProperty('--'+k,P[k]));
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{buildSprites();setScale();computeTargets();
  sprites.forEach((s,i)=>s.position.copy(targets[i]));setup();applyRender();animate();
  const _sp=new URLSearchParams(location.search);
  if(_sp.get('layout'))setLayout(_sp.get('layout'));
  if(_sp.get('q')==='1'){const c=document.getElementById('qon');c.checked=true;P.q=true;document.body.classList.add('q-on');qStart();}});
</script>
</body>
</html>
"""
html = TEMPLATE.replace("__FACES__", faces).replace("__DATA__", DATA)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written: {OUT}  ({len(langs)} языков, {len(quotes)} цитат, 7 композиций, единый WebGL-движок)")
