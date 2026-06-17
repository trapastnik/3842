#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v2 вариант «Карта» → mtk38-v2/map.html — структурно по V1 (mtk38-map), апгрейд под v2.

V1-структура: equirectangular-проекция, контуры стран (geojson) в offscreen-кэш, точки по
реальным lat/lng, pan с инерцией (гориз. wrap, верт. лок к bbox), «идеологические маршруты»
от Москвы к weight>=2, тап по точке → модалка. Апгрейд: canonical 52 языка из data/mtk38.json
(гео/носители/регион/письмо/семья/источник/верификатор), горизонталь, кинематографик-пост
(bloom+зерно+виньетка), тюнинг-панель, бренд-шрифты (20 Kopeek/AUM/Noto), модалка Р2.
geojson ВШИТ (работает file:// и офлайн-киоск). Без CDN.

Запуск:  python3 mtk38-handoff/build_map.py
"""
import json, os

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
D = json.load(open(os.path.join(ROOT, "data", "mtk38.json"), encoding="utf-8"))
GEO = open(os.path.join(ROOT, "data", "ne_110m_countries.geojson"), encoding="utf-8").read()
FM = os.path.join(ROOT, "mtk38-v2", "fonts", "noto", "manifest.json")
embed = set(json.load(open(FM, encoding="utf-8")).get("scripts", [])) if os.path.exists(FM) else set()
OUT = os.path.join(ROOT, "mtk38-v2", "map.html")

pts = []
for l in D["languages"]:
    p = l["geo"].get("primary")
    if not p: continue   # диаспоральные (без территории) на карту не ставим
    pts.append({"w": l["writing"], "n": l["name_ru"], "e": l["endonym"], "sc": l["script"]["iso15924"],
                "scn": l["script"]["name_ru"], "f": l["family"], "lat": p["lat"], "lng": p["lng"],
                "wt": l["weight"], "sp": l["speakers_mln"], "r": p["region_ru"],
                "src": l["writing_source"], "ver": l["verifier"]})
faces = "\n".join(
    f'@font-face{{font-family:"noto-{s}";src:url("./fonts/noto/{s}.woff2") format("woff2");font-display:swap}}'
    for s in sorted(embed))
PTS = json.dumps(pts, ensure_ascii=False)
nlang = lambda n: f"{n} " + ("язык" if n%10==1 and n%100!=11 else "языка" if 2<=n%10<=4 and not 12<=n%100<=14 else "языков")
NL = nlang(len(pts))

TEMPLATE = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>МТК 38 v2 · Карта</title>
<style>
__FACES__
  @font-face{font-family:"20 Kopeek";src:url("../mtk38-globe/fonts/kopeek/20-kopeek-book.otf") format("opentype")}
  @font-face{font-family:"20 Kopeek";font-weight:600;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-demibold.otf") format("opentype")}
  @font-face{font-family:"21 Cent";src:url("../mtk38-globe/fonts/cent/21Cent.woff") format("woff")}
  :root{--brass:#D2B773;--paper:#F7F9EF;--telegrey:#CFD0CF;--window:#9DA3A8;--red:#A02128}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:#2b343b;font-family:"20 Kopeek",system-ui,sans-serif}
  #map{position:fixed;inset:0;width:100vw;height:100vh;cursor:grab}#map:active{cursor:grabbing}
  #panel{position:fixed;top:14px;right:14px;width:218px;z-index:5;background:rgba(24,29,33,.85);backdrop-filter:blur(8px);
    border:1px solid rgba(210,183,115,.28);border-radius:12px;padding:11px 13px;color:#CFD0CF;font-size:12px;max-height:92vh;overflow:auto}
  #panel h3{margin:0 0 7px;font-size:12px;color:var(--brass);font-weight:600;letter-spacing:.05em;text-transform:uppercase}
  .pr{margin:7px 0}.pr label{display:flex;justify-content:space-between;margin-bottom:2px}.pr label b{color:var(--paper)}
  input[type=range]{width:100%;accent-color:var(--brass);height:15px}
  .chk{display:flex;align-items:center;gap:7px;margin:6px 0}
  #copy{width:100%;margin-top:9px;background:var(--brass);color:#1a1f23;border:0;border-radius:7px;padding:7px;font-weight:600;cursor:pointer;font-family:inherit}
  #modal{position:fixed;inset:0;z-index:7;display:none;align-items:center;justify-content:center}
  #modal.is-open{display:flex}
  #backdrop{position:absolute;inset:0;background:rgba(10,13,15,.55);backdrop-filter:blur(3px)}
  .mcard{position:relative;width:min(540px,90vw);background:rgba(20,25,28,.94);border:1px solid rgba(210,183,115,.4);
    border-radius:16px;padding:20px 24px;color:var(--telegrey)}
  .mcard .x{position:absolute;top:12px;right:15px;cursor:pointer;color:var(--window);font-size:18px}
  .mcard .w{font-size:clamp(36px,5.5vw,64px);color:var(--paper);line-height:1.1;text-shadow:0 0 24px rgba(247,249,239,.25)}
  .mcard .n{font-size:20px;color:var(--paper);font-weight:600;margin-top:2px}
  .mcard .e{font-size:15px;color:var(--brass)}
  .mcard .rows{margin-top:12px;font-size:13px;display:grid;grid-template-columns:auto 1fr;gap:4px 14px}
  .mcard .rows b{color:var(--window);font-weight:600}
  .mcard .ver{margin-top:10px;display:inline-block;font-size:11px;padding:2px 9px;border-radius:10px}
  .ver-ok{background:var(--brass);color:#1a1f23}.ver-warn{background:var(--red);color:#fff}
  .hint{position:fixed;left:16px;bottom:11px;z-index:4;font-size:11px;color:var(--window);opacity:.55;pointer-events:none}
  .hint b{color:var(--brass)}
</style>
</head>
<body>
<canvas id="map"></canvas>
<div id="panel"><h3>Карта — параметры</h3><div id="ctrls"></div>
  <div class="chk"><input type="checkbox" id="conn" checked><label for="conn">Идеологические маршруты</label></div>
  <button id="copy">Скопировать настройки</button></div>
<div id="modal"><div id="backdrop"></div><div class="mcard"><span class="x" id="mx">✕</span>
  <div class="w" id="m_w"></div><div class="n" id="m_n"></div><div class="e" id="m_e"></div>
  <div class="rows" id="m_rows"></div><span class="ver" id="m_ver"></span></div></div>
<div class="hint">Карта мира · __NL__ · тяни — pan, <b>тап по точке</b> → карточка языка</div>
<script>
const GEO=__GEO__, POINTS=__PTS__;
const PAL={paper:'#F7F9EF',brass:'#D2B773',red:'#A02128',window:'#9DA3A8',black:'#000'};
const FF=(iso,sz,w)=>(iso==='Latn'||iso==='Cyrl')?`${w} ${sz}px "20 Kopeek","Arial Unicode MS",sans-serif`
  :`${w} ${sz}px "Arial Unicode MS","noto-${iso}",sans-serif`;
const cc=(hex,a)=>{const v=hex.replace('#','');return `rgba(${parseInt(v.slice(0,2),16)},${parseInt(v.slice(2,4),16)},${parseInt(v.slice(4,6),16)},${a})`;};
const cv=document.getElementById('map'),ctx=cv.getContext('2d');
const blurC=document.createElement('canvas'),blurX=blurC.getContext('2d');
let W=0,H=0,dpr=1,start=performance.now(),prev=0;
const P={point:1.0,glow:0.7,guides:0.5,grain:0.5,vign:0.55,bg:43,conn:true};
const map={worldW:0,worldH:0,camX:0,camY:0,camVX:0,camVY:0,camYAnchor:0,dragging:false,cached:null};
let hoverI=-1,lpx=0,lpy=0,lpt=0;
function project(lat,lng){return{x:((lng+180)/360)*map.worldW,y:((90-lat)/180)*map.worldH};}
function buildCache(){const off=document.createElement('canvas');off.width=Math.max(1,Math.floor(map.worldW));off.height=Math.max(1,Math.floor(map.worldH));
  const g=off.getContext('2d');g.fillStyle='rgba(247,249,239,0.015)';g.fillRect(0,0,off.width,off.height);
  g.strokeStyle=cc(PAL.window,0.3);g.lineWidth=0.8;g.fillStyle='rgba(157,163,168,0.06)';
  for(const f of (GEO.features||[])){const gm=f.geometry;if(!gm)continue;
    const polys=gm.type==='Polygon'?[gm.coordinates]:gm.type==='MultiPolygon'?gm.coordinates:null;if(!polys)continue;
    for(const poly of polys){const ring=poly[0];if(!ring||ring.length<2)continue;g.beginPath();
      for(let k=0;k<ring.length;k++){const[lng,lat]=ring[k];const x=((lng+180)/360)*map.worldW,y=((90-lat)/180)*map.worldH;k?g.lineTo(x,y):g.moveTo(x,y);}
      g.closePath();g.fill();g.stroke();}}
  g.strokeStyle=cc(PAL.brass,0.10*P.guides*2);g.lineWidth=0.6;g.setLineDash([2,14]);
  g.beginPath();g.moveTo(0,map.worldH*0.5);g.lineTo(map.worldW,map.worldH*0.5);g.stroke();
  for(let lng=-180;lng<=180;lng+=30){const x=((lng+180)/360)*map.worldW;g.beginPath();g.moveTo(x,0);g.lineTo(x,map.worldH);g.stroke();}
  g.setLineDash([]);map.cached=off;}
function resize(){const r=cv.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);W=Math.max(1,Math.floor(r.width));H=Math.max(1,Math.floor(r.height));
  cv.width=Math.floor(W*dpr);cv.height=Math.floor(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  blurC.width=cv.width;blurC.height=cv.height;
  const padLng=10,padLat=8;let mnLa=90,mxLa=-90,mnLo=180,mxLo=-180;
  for(const p of POINTS){mnLa=Math.min(mnLa,p.lat);mxLa=Math.max(mxLa,p.lat);mnLo=Math.min(mnLo,p.lng);mxLo=Math.max(mxLo,p.lng);}
  const lngSpan=(mxLo+padLng)-(mnLo-padLng);map.worldW=W*(360/lngSpan);map.worldH=map.worldW/2;
  const tl=project(mxLa+padLat,mnLo-padLng),br=project(mnLa-padLat,mxLo+padLng);
  map.camX=(tl.x+br.x)/2-W/2;map.camY=(tl.y+br.y)/2-H/2;map.camYAnchor=map.camY;buildCache();}
addEventListener('resize',resize);
function dynamics(dt){if(map.dragging)return;map.camX+=map.camVX*dt;map.camY+=map.camVY*dt;
  map.camVX*=Math.pow(0.91,dt*60);map.camVY*=Math.pow(0.91,dt*60);
  if(Math.abs(map.camVX)<0.5)map.camVX=0;if(Math.abs(map.camVY)<0.5)map.camVY=0;
  if(map.worldH<H){map.camY=map.camYAnchor;map.camVY=0;}else{const mx=map.worldH-H+map.worldH*0.04,mn=-map.worldH*0.04;if(map.camY>mx)map.camY=mx;if(map.camY<mn)map.camY=mn;}
  if(map.camX<0)map.camX+=map.worldW;if(map.camX>=map.worldW)map.camX-=map.worldW;}
function toScreen(lat,lng){const w=project(lat,lng);let x=w.x-map.camX;if(x<-map.worldW*0.5)x+=map.worldW;else if(x>map.worldW*0.5)x-=map.worldW;return{x,y:w.y-map.camY};}
function drawBase(){if(!map.cached)return;ctx.save();ctx.globalAlpha=0.85;
  ctx.drawImage(map.cached,-map.camX,-map.camY);ctx.drawImage(map.cached,-map.camX+map.worldW,-map.camY);ctx.drawImage(map.cached,-map.camX-map.worldW,-map.camY);ctx.restore();}
function drawConn(){if(!P.conn)return;ctx.save();ctx.strokeStyle=cc(PAL.brass,0.13);ctx.lineWidth=0.8;ctx.setLineDash([2,8]);
  const m=POINTS[0];for(const p of POINTS){if(p===m||p.wt<2)continue;const a=toScreen(m.lat,m.lng),b=toScreen(p.lat,p.lng);
    if(Math.abs(a.x-b.x)>W*1.2)continue;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.setLineDash([]);ctx.restore();}
function drawPoints(){const cx=W*0.5,cy=H*0.5,sh=Math.min(W,H);
  for(let i=0;i<POINTS.length;i++){const p=POINTS[i],s=toScreen(p.lat,p.lng);
    if(s.x<-200||s.x>W+200||s.y<-100||s.y>H+100)continue;
    const d=Math.hypot(s.x-cx,s.y-cy),prox=Math.max(0,1-d/(sh*0.55)),hov=i===hoverI;
    ctx.beginPath();ctx.arc(s.x,s.y,(2+p.wt*1.2+prox*2.5)*P.point,0,Math.PI*2);ctx.fillStyle=PAL.red;ctx.globalAlpha=0.86;ctx.fill();ctx.globalAlpha=1;
    const bs=(sh*(0.018+p.wt*0.008)+prox*sh*0.012)*P.point,wt=p.wt>=2?600:400;
    ctx.font=FF(p.sc,bs,wt);ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.shadowColor=cc(PAL.black,0.75);ctx.shadowBlur=8+prox*14;ctx.fillStyle=hov?PAL.brass:PAL.paper;ctx.globalAlpha=0.5+prox*0.5;
    const ox=bs*0.4,oy=-bs*0.15;ctx.fillText(p.w,s.x+ox,s.y+oy);
    if(prox>0.25||hov){ctx.font=`600 ${bs*0.42}px "20 Kopeek",monospace`;ctx.shadowBlur=4;ctx.fillStyle=cc(PAL.brass,0.6+prox*0.3);ctx.fillText(p.n,s.x+ox,s.y+oy+bs*0.62);}
    ctx.globalAlpha=1;ctx.shadowBlur=0;}}
function post(){ // bloom (lighter blurred) + зерно + виньетка
  if(P.glow>0){blurX.setTransform(1,0,0,1,0,0);blurX.clearRect(0,0,blurC.width,blurC.height);
    blurX.filter='blur('+(6*dpr)+'px)';blurX.drawImage(cv,0,0);blurX.filter='none';
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=0.5*P.glow;ctx.drawImage(blurC,0,0);ctx.restore();}
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
  if(P.vign>0){const v=ctx.createRadialGradient(W*0.5,H*0.5,Math.min(W,H)*0.32,W*0.5,H*0.5,Math.max(W,H)*0.62);
    v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,`rgba(16,20,23,${0.62*P.vign})`);ctx.fillStyle=v;ctx.fillRect(0,0,W,H);}
  ctx.restore();}
let grainPat;function mkGrain(){const g=document.createElement('canvas');g.width=g.height=130;const gx=g.getContext('2d');
  const im=gx.createImageData(130,130);for(let i=0;i<im.data.length;i+=4){const v=Math.random()*255|0;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}
  gx.putImageData(im,0,0);grainPat=ctx.createPattern(g,'repeat');}
function render(now){const t=(now-start)/1000,dt=Math.min(0.05,Math.max(0.001,t-prev));prev=t;dynamics(dt);
  ctx.setTransform(dpr,0,0,dpr,0,0);const s=Math.round(P.bg);ctx.fillStyle=`rgb(${s-6},${s+5},${s+12})`;ctx.fillRect(0,0,W,H);
  drawBase();drawConn();drawPoints();post();
  if(P.grain>0&&grainPat){ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=0.06*P.grain*2;ctx.fillStyle=grainPat;ctx.fillRect(0,0,W,H);ctx.restore();}
  requestAnimationFrame(render);}
function findPoint(x,y){const sh=Math.min(W,H);let best=-1,bd=sh*0.06;
  for(let i=0;i<POINTS.length;i++){const s=toScreen(POINTS[i].lat,POINTS[i].lng);const d=Math.hypot(x-s.x,y-s.y);if(d<bd){bd=d;best=i;}}return best;}
// модалка Р2
const modal=document.getElementById('modal');let mOpen=false;
function openModal(p){document.getElementById('m_w').textContent=p.w;document.getElementById('m_w').style.fontFamily=FF(p.sc,1,400).replace(/^\S+ 1px /,'');
  document.getElementById('m_n').textContent=p.n;document.getElementById('m_e').textContent=p.e;document.getElementById('m_e').style.fontFamily=document.getElementById('m_w').style.fontFamily;
  const sp=p.sp>=1000?`≈ ${(p.sp/1000).toFixed(1)} млрд носителей`:`≈ ${p.sp} млн носителей`;
  document.getElementById('m_rows').innerHTML=`<b>письмо</b><span>${p.scn} (${p.sc})</span><b>семья</b><span>${p.f}</span><b>ареал</b><span>${p.r}</span><b>носители</b><span>${sp}</span><b>источник</b><span>${p.src}</span>`;
  const ver=document.getElementById('m_ver'),warn=p.ver==='needs-verification';ver.textContent=warn?'⚠ требует проверки носителем':'✓ '+p.ver;ver.className='ver '+(warn?'ver-warn':'ver-ok');
  modal.classList.add('is-open');mOpen=true;}
function closeModal(){modal.classList.remove('is-open');mOpen=false;}
document.getElementById('mx').onclick=closeModal;document.getElementById('backdrop').onclick=closeModal;
addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
// pointer
let pdx=0,pdy=0,pdt=0,moved=false;
cv.addEventListener('pointerdown',e=>{if(mOpen)return;map.dragging=true;moved=false;pdx=e.clientX;pdy=e.clientY;pdt=performance.now();lpx=e.clientX;lpy=e.clientY;lpt=performance.now();hoverI=findPoint(e.clientX,e.clientY);cv.setPointerCapture&&cv.setPointerCapture(e.pointerId);});
cv.addEventListener('pointermove',e=>{if(map.dragging){if(Math.hypot(e.clientX-pdx,e.clientY-pdy)>12)moved=true;
    const now=performance.now(),dt=Math.max(16,now-lpt)/1000,dx=e.clientX-lpx,dy=e.clientY-lpy;
    map.camX-=dx;map.camY-=dy;map.camVX=-dx/dt;map.camVY=-dy/dt;lpx=e.clientX;lpy=e.clientY;lpt=now;}else hoverI=findPoint(e.clientX,e.clientY);},{passive:true});
cv.addEventListener('pointerup',e=>{if(cv.releasePointerCapture){try{cv.releasePointerCapture(e.pointerId);}catch(_){}}
  if(!moved&&(performance.now()-pdt)<500){const h=findPoint(e.clientX,e.clientY);if(h>=0){openModal(POINTS[h]);map.camVX=0;map.camVY=0;}}map.dragging=false;moved=false;});
cv.addEventListener('pointerleave',()=>{map.dragging=false;hoverI=-1;});
// панель
const SPEC=[['point','Размер точек',.4,2,.05],['glow','Свечение',0,2,.05],['guides','Сетка',0,1,.05],['grain','Зерно',0,1,.05],['vign','Виньетка',0,1,.05],['bg','Фон',26,58,1]];
const ctrls=document.getElementById('ctrls');
ctrls.innerHTML=SPEC.map(([k,l,mn,mx,st])=>`<div class="pr"><label>${l}<b id="v_${k}">${P[k]}</b></label><input type="range" id="r_${k}" min="${mn}" max="${mx}" step="${st}" value="${P[k]}"></div>`).join('');
SPEC.forEach(([k])=>{document.getElementById('r_'+k).oninput=e=>{P[k]=parseFloat(e.target.value);document.getElementById('v_'+k).textContent=P[k];if(k==='guides')buildCache();};});
document.getElementById('conn').onchange=e=>P.conn=e.target.checked;
document.getElementById('copy').onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(P));const b=document.getElementById('copy');b.textContent='Скопировано ✓';setTimeout(()=>b.textContent='Скопировать настройки',1200);};
mkGrain();resize();
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>requestAnimationFrame(render));
</script>
</body>
</html>
"""
html = (TEMPLATE.replace("__FACES__", faces).replace("__GEO__", GEO).replace("__PTS__", PTS).replace("__NL__", NL))
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written: {OUT}  (точек {len(pts)}, geojson вшит {len(GEO)//1024} КБ, кинематографик-пост + панель + модалка Р2)")
