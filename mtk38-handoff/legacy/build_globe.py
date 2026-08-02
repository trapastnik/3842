#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v2 вариант «Глобус» → mtk38-v2/globe.html — структурно по V1 (mtk38-globe), апгрейд под v2.

V1-структура: Canvas-2D 3D-сфера с 19 кольцами-широтами (слова на параллелях), yaw/pitch-drag
+ инерция + авто-вращение, сетка (кольца+меридианы, анимированный пунктир), back-cull (z<-0.72),
светящийся лимб + атмосфера (латунный обод), зерно. Апгрейд: canonical 52 языка из
data/mtk38.json, горизонталь, кинематографик-пост (bloom+виньетка), тюнинг-панель, бренд-шрифты
(20 Kopeek/AUM/Noto), ТАП по слову → карточка языка (Р2). Без CDN.

Запуск:  python3 mtk38-handoff/build_globe.py
"""
import json, os

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
D = json.load(open(os.path.join(ROOT, "data", "mtk38.json"), encoding="utf-8"))
FM = os.path.join(ROOT, "mtk38-v2", "fonts", "noto", "manifest.json")
embed = set(json.load(open(FM, encoding="utf-8")).get("scripts", [])) if os.path.exists(FM) else set()
OUT = os.path.join(ROOT, "mtk38-v2", "globe.html")

words = []
for l in D["languages"]:
    p = l["geo"].get("primary")
    words.append({"w": l["writing"], "sc": l["script"]["iso15924"], "n": l["name_ru"], "e": l["endonym"],
                  "scn": l["script"]["name_ru"], "f": l["family"], "r": (p["region_ru"] if p else "диаспора"),
                  "src": l["writing_source"], "ver": l["verifier"], "wt": l["weight"], "pr": l["weight"] >= 3})
faces = "\n".join(
    f'@font-face{{font-family:"noto-{s}";src:url("./fonts/noto/{s}.woff2") format("woff2");font-display:swap}}'
    for s in sorted(embed))
WORDS = json.dumps(words, ensure_ascii=False)
nlang = lambda n: f"{n} " + ("язык" if n%10==1 and n%100!=11 else "языка" if 2<=n%10<=4 and not 12<=n%100<=14 else "языков")
NL = nlang(len(words))

TEMPLATE = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>МТК 38 v2 · Глобус</title>
<style>
__FACES__
  @font-face{font-family:"20 Kopeek";src:url("../mtk38-globe/fonts/kopeek/20-kopeek-book.otf") format("opentype")}
  @font-face{font-family:"20 Kopeek";font-weight:600;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-demibold.otf") format("opentype")}
  @font-face{font-family:"Nolde";src:url("../mtk38-globe/fonts/nolde/nolde.otf") format("opentype")}
  :root{--brass:#D2B773;--paper:#F7F9EF;--telegrey:#CFD0CF;--window:#9DA3A8;--red:#A02128}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:#222a30;font-family:"20 Kopeek",system-ui,sans-serif}
  #globe{position:fixed;inset:0;width:100vw;height:100vh;cursor:grab}#globe:active{cursor:grabbing}
  #panel{position:fixed;top:14px;right:14px;width:218px;z-index:5;background:rgba(24,29,33,.85);backdrop-filter:blur(8px);
    border:1px solid rgba(210,183,115,.28);border-radius:12px;padding:11px 13px;color:#CFD0CF;font-size:12px;max-height:92vh;overflow:auto}
  #panel h3{margin:0 0 7px;font-size:12px;color:var(--brass);font-weight:600;letter-spacing:.05em;text-transform:uppercase}
  .pr{margin:7px 0}.pr label{display:flex;justify-content:space-between;margin-bottom:2px}.pr label b{color:var(--paper)}
  input[type=range]{width:100%;accent-color:var(--brass);height:15px}
  #copy{width:100%;margin-top:9px;background:var(--brass);color:#1a1f23;border:0;border-radius:7px;padding:7px;font-weight:600;cursor:pointer;font-family:inherit}
  #card{position:fixed;left:50%;bottom:-340px;transform:translateX(-50%);z-index:6;width:min(540px,90vw);
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
<body>
<canvas id="globe"></canvas>
<div id="panel"><h3>Глобус — параметры</h3><div id="ctrls"></div><button id="copy">Скопировать настройки</button></div>
<div id="card"><span class="x" id="cx">✕</span><div class="w" id="c_w"></div><div class="n" id="c_n"></div><div class="e" id="c_e"></div>
  <div class="rows" id="c_rows"></div><span class="ver" id="c_ver"></span></div>
<div class="hint">Вращаемая сфера слов · __NL__ · тяни — поворот с инерцией, <b>тап по слову</b> → карточка</div>
<script>
const WORDS=__WORDS__;
const PAL={paper:'#F7F9EF',brass:'#D2B773',red:'#A02128',window:'#9DA3A8',black:'#000'};
const FF=(iso,sz,w)=>(iso==='Latn'||iso==='Cyrl')?`${w} ${sz}px "20 Kopeek","Arial Unicode MS",sans-serif`:`${w} ${sz}px "Arial Unicode MS","noto-${iso}",sans-serif`;
const cc=(hex,a)=>{const v=hex.replace('#','');return `rgba(${parseInt(v.slice(0,2),16)},${parseInt(v.slice(2,4),16)},${parseInt(v.slice(4,6),16)},${a})`;};
const cv=document.getElementById('globe'),ctx=cv.getContext('2d');
const blurC=document.createElement('canvas'),blurX=blurC.getContext('2d');
const P={spin:1.0,size:1.0,density:1.0,bloom:0.6,atmo:1.0,grain:0.5,vign:0.5,bg:40,brass:1.0,red:1.0};
const ringLats=[-74,-66,-58,-50,-42,-34,-26,-18,-10,-2,6,14,22,30,38,46,54,62,70];
const rings=ringLats.map((lat,i)=>{const eq=Math.cos(Math.abs(lat)*Math.PI/180);return{lat,speed:(i%2?-1:1)*(0.09+eq*0.16),offset:i*0.69,size:0.46+eq*0.4};});
let W=0,H=0,dpr=1,start=performance.now(),prev=0,drag=false,lpx=0,lpy=0,lpt=0;
const sph={yaw:-0.18,pitch:-0.18,yawV:0.035,pitchV:0,cy:1,sy:0,cp:1,sp:0};
const twCache=new Map();let hits=[];
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function resize(){const r=cv.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);W=Math.max(1,Math.floor(r.width));H=Math.max(1,Math.floor(r.height));
  cv.width=Math.floor(W*dpr);cv.height=Math.floor(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);blurC.width=cv.width;blurC.height=cv.height;}
addEventListener('resize',resize);
function measure(it,sz,w){const k=it.w+'|'+Math.round(sz)+'|'+w;if(twCache.has(k))return twCache.get(k);ctx.font=FF(it.sc,Math.round(sz),w);const v=ctx.measureText(it.w).width;twCache.set(k,v);return v;}
function slots(ring,ri,r,phase){const phi=Math.abs(ring.lat)*Math.PI/180,rr=Math.max(1,Math.cos(phi)*r),mfs=20*ring.size*1.22*P.size,
  gap=Math.max(10,mfs*0.72)/P.density,circ=Math.PI*2*rr,out=[];let arc=0,step=0;
  while(arc<circ&&step<96){const li=(step*11+ri*7)%WORDS.length,it=WORDS[li],w=it.pr?600:400,mw=measure(it,mfs,w),sw=mw*1.16+gap;
    if(arc+sw>circ)break;out.push({it,li,theta:phase+(arc+sw*0.5)/rr});arc+=sw;step++;}return out;}
function trig(){sph.cy=Math.cos(sph.yaw);sph.sy=Math.sin(sph.yaw);sph.cp=Math.cos(sph.pitch);sph.sp=Math.sin(sph.pitch);}
function rot(x,y,z){const x1=x*sph.cy+z*sph.sy,z1=-x*sph.sy+z*sph.cy;return{x:x1,y:y*sph.cp-z1*sph.sp,z:y*sph.sp+z1*sph.cp};}
function proj(lat,th,r,cx,cy){const phi=lat*Math.PI/180,cp=Math.cos(phi),ro=rot(cp*Math.cos(th),Math.sin(phi),cp*Math.sin(th));return{x:cx+ro.x*r,y:cy-ro.y*r,z:ro.z};}
function tangent(lat,th,r,cx,cy){const a=proj(lat,th,r,cx,cy),b=proj(lat,th+0.012,r,cx,cy);let an=Math.atan2(b.y-a.y,b.x-a.x);if(Math.cos(an)<0)an+=Math.PI;return an;}
function base(cx,cy,r){ctx.save();const g=ctx.createRadialGradient(cx-r*0.38,cy-r*0.45,r*0.08,cx,cy,r*1.05);
  g.addColorStop(0,'rgba(247,249,239,0.13)');g.addColorStop(0.18,'rgba(210,183,115,0.10)');g.addColorStop(0.52,'rgba(67,80,89,0.42)');g.addColorStop(0.82,'rgba(0,0,0,0.72)');g.addColorStop(1,'rgba(0,0,0,0.94)');
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
  ctx.strokeStyle=cc(PAL.brass,0.5);ctx.lineWidth=1.4;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r*1.025,0,Math.PI*2);ctx.strokeStyle=cc(PAL.paper,0.08*P.atmo);ctx.lineWidth=18;ctx.stroke();ctx.restore();}
function guides(cx,cy,r,t){ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();ctx.setLineDash([3,18]);
  rings.forEach((ring,ri)=>{ctx.beginPath();let st=false;for(let i=0;i<=96;i++){const th=(i/96)*Math.PI*2,pt=proj(ring.lat,th,r,cx,cy);
    if(pt.z<-0.62){st=false;continue;}st?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y);st=true;}
    ctx.strokeStyle=cc(PAL.window,0.1);ctx.lineWidth=0.8;ctx.lineDashOffset=-(t*ring.speed)*38+ri*3;ctx.stroke();});
  ctx.setLineDash([]);for(let m=0;m<12;m++){const th=m/12*Math.PI*2;ctx.beginPath();let st=false;
    for(let i=0;i<=80;i++){const lat=-80+(i/80)*160,pt=proj(lat,th,r,cx,cy);if(pt.z<-0.45){st=false;continue;}st?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y);st=true;}
    ctx.strokeStyle=cc(PAL.window,0.07);ctx.lineWidth=1;ctx.stroke();}ctx.restore();}
function drawWord(it,x,y,z,an,rs,tone){const depth=(z+1)/2,front=z>-0.18,size=(front?20:14)*rs*(0.7+depth*0.5)*P.size,w=tone==='red'||tone==='brass'?600:400,
  alpha=front?0.2+depth*0.68:0.035+depth*0.16,color=tone==='red'?PAL.red:tone==='brass'?PAL.brass:front?PAL.paper:PAL.window;
  ctx.save();ctx.translate(x,y);ctx.rotate(an);ctx.scale(1+depth*0.12,0.92+depth*0.18);ctx.font=FF(it.sc,size,w);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor=cc(PAL.black,front?0.75:0.2);ctx.shadowBlur=front?14:4;ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.fillText(it.w,0,0);ctx.restore();
  if(front)hits.push({x,y,r:size*0.6,li:it._li});}
function drawWords(cx,cy,r,t){const jobs=[];hits=[];
  rings.forEach((ring,ri)=>{const phase=ring.offset+t*ring.speed;slots(ring,ri,r,phase).forEach(s=>{const pt=proj(ring.lat,s.theta,r,cx,cy);if(pt.z<-0.72)return;
    const seed=(s.li+ri*3)%19;const it=Object.assign({_li:s.li},s.it);
    jobs.push({it,x:pt.x,y:pt.y,z:pt.z,an:tangent(ring.lat,s.theta,r,cx,cy),rs:ring.size*0.92,
      tone:it.pr&&seed%Math.max(1,Math.round(2/P.red))===0?'red':seed%Math.max(1,Math.round(5/P.brass))===0?'brass':'paper'});});});
  jobs.sort((a,b)=>a.z-b.z);ctx.save();ctx.beginPath();ctx.arc(cx,cy,r*1.01,0,Math.PI*2);ctx.clip();
  jobs.forEach(j=>drawWord(j.it,j.x,j.y,j.z,j.an,j.rs,j.tone));ctx.restore();}
function atmo(cx,cy,r,t){ctx.save();ctx.beginPath();ctx.arc(cx,cy,r*1.008,0,Math.PI*2);ctx.strokeStyle=cc(PAL.brass,(0.23+Math.sin(t*1.7)*0.04)*P.atmo);ctx.lineWidth=5;ctx.shadowColor=cc(PAL.brass,0.55*P.atmo);ctx.shadowBlur=26;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r*0.998,0,Math.PI*2);ctx.strokeStyle=cc(PAL.red,0.18);ctx.lineWidth=1.5;ctx.stroke();ctx.restore();}
function post(){if(P.bloom>0){blurX.setTransform(1,0,0,1,0,0);blurX.clearRect(0,0,blurC.width,blurC.height);blurX.filter='blur('+(7*dpr)+'px)';blurX.drawImage(cv,0,0);blurX.filter='none';
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=0.5*P.bloom;ctx.drawImage(blurC,0,0);ctx.restore();}
  if(P.vign>0){ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);const v=ctx.createRadialGradient(W*.5,H*.5,Math.min(W,H)*.34,W*.5,H*.5,Math.max(W,H)*.62);
    v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,`rgba(14,18,21,${0.6*P.vign})`);ctx.fillStyle=v;ctx.fillRect(0,0,W,H);ctx.restore();}}
let gp;function mkGrain(){const g=document.createElement('canvas');g.width=g.height=130;const gx=g.getContext('2d');const im=gx.createImageData(130,130);
  for(let i=0;i<im.data.length;i+=4){const v=Math.random()*255|0;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}gx.putImageData(im,0,0);gp=ctx.createPattern(g,'repeat');}
function inertia(dt){if(drag)return;sph.yaw+=sph.yawV*dt*P.spin;sph.pitch=clamp(sph.pitch+sph.pitchV*dt,-0.95,0.95);
  sph.yawV*=Math.pow(0.965,dt*60);sph.pitchV*=Math.pow(0.92,dt*60);if(Math.abs(sph.yawV)<0.018)sph.yawV=sph.yawV<0?-0.018:0.018;if(Math.abs(sph.pitchV)<0.0005)sph.pitchV=0;}
function metrics(){const sh=Math.min(W,H);return{r:Math.min(sh*0.48,H*0.4),cx:W*0.5,cy:H*0.5};}
function render(now){const t=(now-start)/1000,dt=Math.min(0.05,Math.max(0.001,t-prev));prev=t;inertia(dt);trig();
  ctx.setTransform(dpr,0,0,dpr,0,0);const s=Math.round(P.bg);ctx.fillStyle=`rgb(${s-7},${s+5},${s+12})`;ctx.fillRect(0,0,W,H);
  if(P.grain>0&&gp){ctx.save();ctx.globalAlpha=0.05*P.grain*2;ctx.fillStyle=gp;ctx.fillRect(0,0,W,H);ctx.restore();}
  const{r,cx,cy}=metrics();base(cx,cy,r);guides(cx,cy,r,t);drawWords(cx,cy,r,t);atmo(cx,cy,r,t);post();
  requestAnimationFrame(render);}
// карточка Р2
const card=document.getElementById('card');
function openCard(it){document.getElementById('c_w').textContent=it.w;document.getElementById('c_w').style.fontFamily=FF(it.sc,16,400).replace(/^\S+ 16px /,'');
  document.getElementById('c_n').textContent=it.n;document.getElementById('c_e').textContent=it.e;document.getElementById('c_e').style.fontFamily=document.getElementById('c_w').style.fontFamily;
  document.getElementById('c_rows').innerHTML=`<b>письмо</b><span>${it.scn} (${it.sc})</span><b>семья</b><span>${it.f}</span><b>ареал</b><span>${it.r}</span><b>источник</b><span>${it.src}</span>`;
  const ver=document.getElementById('c_ver'),warn=it.ver==='needs-verification';ver.textContent=warn?'⚠ требует проверки носителем':'✓ '+it.ver;ver.className='ver '+(warn?'ver-warn':'ver-ok');card.classList.add('show');}
document.getElementById('cx').onclick=()=>card.classList.remove('show');
// drag + tap
let pdx,pdy,pdt,moved=false;
cv.addEventListener('pointerdown',e=>{drag=true;moved=false;pdx=lpx=e.clientX;pdy=lpy=e.clientY;pdt=lpt=performance.now();cv.setPointerCapture&&cv.setPointerCapture(e.pointerId);});
cv.addEventListener('pointermove',e=>{if(!drag)return;if(Math.hypot(e.clientX-pdx,e.clientY-pdy)>10)moved=true;
  const now=performance.now(),dt=Math.max(16,now-lpt),dx=e.clientX-lpx,dy=e.clientY-lpy,{r}=metrics();
  const yd=dx/Math.max(1,r*0.72),pd=dy/Math.max(1,r*0.88);sph.yaw+=yd;sph.pitch=clamp(sph.pitch+pd,-0.95,0.95);sph.yawV=yd/(dt/1000);sph.pitchV=pd/(dt/1000);lpx=e.clientX;lpy=e.clientY;lpt=now;},{passive:true});
cv.addEventListener('pointerup',e=>{if(cv.releasePointerCapture){try{cv.releasePointerCapture(e.pointerId);}catch(_){}}
  if(!moved&&(performance.now()-pdt)<450){const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;let best=-1,bd=1e9;
    for(const h of hits){const d=Math.hypot(mx-h.x,my-h.y);if(d<h.r+14&&d<bd){bd=d;best=h.li;}}if(best>=0)openCard(WORDS[best]);}
  drag=false;moved=false;});
cv.addEventListener('pointercancel',()=>drag=false);
// панель
const SPEC=[['spin','Вращение',0,3,.05],['size','Размер слов',.5,1.8,.05],['density','Плотность',.6,1.8,.05],['bloom','Свечение',0,2,.05],['atmo','Атмосфера',0,2,.05],['grain','Зерно',0,1,.05],['vign','Виньетка',0,1,.05],['bg','Фон',24,56,1]];
const ctrls=document.getElementById('ctrls');
ctrls.innerHTML=SPEC.map(([k,l,mn,mx,st])=>`<div class="pr"><label>${l}<b id="v_${k}">${P[k]}</b></label><input type="range" id="r_${k}" min="${mn}" max="${mx}" step="${st}" value="${P[k]}"></div>`).join('');
SPEC.forEach(([k])=>{document.getElementById('r_'+k).oninput=e=>{P[k]=parseFloat(e.target.value);document.getElementById('v_'+k).textContent=P[k];};});
document.getElementById('copy').onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(P));const b=document.getElementById('copy');b.textContent='Скопировано ✓';setTimeout(()=>b.textContent='Скопировать настройки',1200);};
mkGrain();resize();
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>requestAnimationFrame(render));
</script>
</body>
</html>
"""
html = TEMPLATE.replace("__FACES__", faces).replace("__WORDS__", WORDS).replace("__NL__", NL)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written: {OUT}  ({NL}, 19 колец-широт, инерция, тап→карточка Р2, кинематографик-пост + панель)")
