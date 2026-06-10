#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Исследователь размещения + рендера цитат МТК 38 v2 → mtk38-v2/quotes-test.html.

Вращающийся WebGL-глобус (фон) + цитата поверх с МАКС. КАЧЕСТВОМ: настраиваемое свечение
(как bloom глобуса), РАЗБЛЮР фона под надписью (frosted, backdrop-filter), затемнение, размер.
Режимы размещения (Центр/Нижняя треть/Сбоку/Сцена/Уголок) + панель параметров как у глобуса
(«Скопировать» настройки). Только show:true (Р5). Three.js r137 вендорен (без CDN).

Запуск:  python3 mtk38-handoff/build_quotes_viz.py
"""
import json, os, re

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
Q = json.load(open(os.path.join(ROOT, "data", "mtk38-quotes.json"), encoding="utf-8"))
D = json.load(open(os.path.join(ROOT, "data", "mtk38.json"), encoding="utf-8"))
FM = os.path.join(ROOT, "mtk38-v2", "fonts", "noto", "manifest.json")
embed = set(json.load(open(FM, encoding="utf-8")).get("scripts", [])) if os.path.exists(FM) else set()
OUT = os.path.join(ROOT, "mtk38-v2", "quotes-test.html")

quotes = []
for q in Q["quotes"]:
    if not q.get("show"): continue
    m = re.search(r"\((\d{4})\)", q.get("work", ""))
    quotes.append({"ru": q["ru"], "en": q.get("en", ""),
                   "work": re.sub(r"\s*\(.*$", "", q.get("work", "")).strip(),
                   "year": m.group(1) if m else ""})
words = [{"w": l["writing"], "sc": l["script"]["iso15924"], "wt": l["weight"]} for l in D["languages"]]
faces = "\n".join(
    f'@font-face{{font-family:"noto-{s}";src:url("./fonts/noto/{s}.woff2") format("woff2");font-display:swap}}'
    for s in sorted(embed))
data_json = json.dumps({"q": quotes, "words": words}, ensure_ascii=False)

TEMPLATE = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МТК 38 v2 · размещение + рендер цитат</title>
<style>
__FACES__
  @font-face{font-family:"21 Cent";src:url("../mtk38-globe/fonts/cent/21Cent.woff") format("woff");font-display:swap}
  @font-face{font-family:"20 Kopeek";src:url("../mtk38-globe/fonts/kopeek/20-kopeek-book.otf") format("opentype");font-display:swap}
  :root{--brass:#D2B773;--paper:#F7F9EF;--telegrey:#CFD0CF;--window:#9DA3A8;
    --glow:1;--blur:16;--scrim:1;--qscale:1}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:#2d363d;font-family:"20 Kopeek",system-ui,sans-serif}
  #c{position:fixed;inset:0;width:100vw;height:100vh;z-index:0}
  .scrim{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:var(--scrim);transition:opacity .5s,background .5s}
  .qbox{position:fixed;z-index:2;opacity:0;transition:opacity 1s ease, transform 1s ease;
    backdrop-filter:blur(calc(var(--blur)*1px));-webkit-backdrop-filter:blur(calc(var(--blur)*1px))}
  .qbox.show{opacity:1}
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
    max-width:62vw;text-align:center;padding:5vh 5vw;border-radius:22px;background:rgba(18,22,25,.18)}
  body.m-center .qbox.show{transform:translate(-50%,-50%)}
  body.m-lower .scrim{background:linear-gradient(to top, rgba(18,22,25,.85) 0%, rgba(18,22,25,.32) 24%, rgba(0,0,0,0) 44%)}
  body.m-lower .qbox{--rubase:clamp(22px,2.6vw,40px);left:0;right:0;bottom:0;padding:5vh 8vw 7vh;text-align:center;
    border-radius:0}
  body.m-side .scrim{background:linear-gradient(to right, rgba(0,0,0,0) 38%, rgba(18,22,25,.88) 64%)}
  body.m-side .qbox{--rubase:clamp(22px,2.4vw,38px);right:0;top:0;bottom:0;width:46vw;padding:0 5vw;
    display:flex;flex-direction:column;justify-content:center;text-align:left;border-radius:0}
  body.m-scene .scrim{background:rgba(20,24,27,.6)}
  body.m-scene .qbox{--rubase:clamp(30px,4.4vw,72px);left:50%;top:50%;transform:translate(-50%,-50%);
    max-width:72vw;text-align:center;padding:6vh 5vw;border-radius:24px;background:rgba(18,22,25,.16)}
  body.m-scene .qbox.show{transform:translate(-50%,-50%)}
  body.m-corner .scrim{background:linear-gradient(to top right, rgba(18,22,25,.6), rgba(0,0,0,0) 36%)}
  body.m-corner .qbox{--rubase:clamp(17px,1.7vw,26px);left:3vw;bottom:5vh;max-width:40vw;text-align:left;
    padding:18px 22px;border-radius:14px;background:rgba(18,22,25,.2)}
  body.m-corner .en{display:none}
  .bar{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:5;display:flex;gap:6px;
    background:rgba(28,34,39,.8);backdrop-filter:blur(8px);border:1px solid rgba(210,183,115,.3);border-radius:11px;padding:6px}
  .bar button{background:transparent;border:0;color:var(--telegrey);font-size:13px;padding:7px 13px;border-radius:7px;cursor:pointer;font-family:"20 Kopeek",sans-serif}
  .bar button.on{background:var(--brass);color:#1a1f23;font-weight:600}
  #panel{position:fixed;top:14px;right:14px;width:230px;z-index:5;background:rgba(28,34,39,.84);
    backdrop-filter:blur(8px);border:1px solid rgba(210,183,115,.3);border-radius:12px;padding:12px 14px;color:#CFD0CF;font-size:12px}
  #panel h3{margin:0 0 8px;font-size:13px;color:#D2B773;font-weight:600}
  .pr{margin:8px 0}.pr label{display:flex;justify-content:space-between;margin-bottom:3px}.pr label b{color:#F7F9EF}
  input[type=range]{width:100%;accent-color:#D2B773;height:16px}
  #copy{width:100%;margin-top:9px;background:#D2B773;color:#1a1f23;border:0;border-radius:7px;padding:7px;font-weight:600;cursor:pointer;font-family:"20 Kopeek",sans-serif}
  .hint{position:fixed;left:16px;bottom:10px;z-index:5;font-size:11px;color:var(--window);opacity:.5;pointer-events:none}
</style>
</head>
<body class="m-center">
<canvas id="c"></canvas>
<div class="scrim"></div>
<div class="qbox" id="qbox"><p class="ru" id="ru"></p>
  <div class="attr"><span class="nm">В. И. Ленин</span> · <span id="src"></span></div>
  <div class="en" id="en"></div></div>
<div class="bar" id="bar"></div>
<div id="panel"><h3>Рендер цитаты</h3><div id="ctrls"></div><button id="copy">Скопировать</button></div>
<div class="hint">режим размещения — сверху · параметры рендера цитаты — справа</div>
<script src="./vendor/three/three.min.js"></script>
<script src="./vendor/three/js/shaders/CopyShader.js"></script>
<script src="./vendor/three/js/shaders/LuminosityHighPassShader.js"></script>
<script src="./vendor/three/js/postprocessing/EffectComposer.js"></script>
<script src="./vendor/three/js/postprocessing/MaskPass.js"></script>
<script src="./vendor/three/js/postprocessing/ShaderPass.js"></script>
<script src="./vendor/three/js/postprocessing/RenderPass.js"></script>
<script src="./vendor/three/js/postprocessing/UnrealBloomPass.js"></script>
<script>
const DATA=__DATA__, Q=DATA.q, WORDS=DATA.words;
const PAPER='#F7F9EF',TELE='#CFD0CF',BRASS='#D2B773',RED='#A02128';
const FF=iso=>(iso==='Latn'||iso==='Cyrl')?"'20 Kopeek','Arial Unicode MS',sans-serif":"'Arial Unicode MS','noto-"+iso+"',sans-serif";
const cv=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.setClearColor(0x2d363d,1);
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x2d363d,0.035);
const camera=new THREE.PerspectiveCamera(45,1,0.1,100);camera.position.z=15;
const group=new THREE.Group();scene.add(group);
function tex(t,iso,c){const fs=128,pad=20,m=document.createElement('canvas'),x=m.getContext('2d');
  x.font='700 '+fs+'px '+FF(iso);const tw=Math.max(24,x.measureText(t).width);m.width=Math.ceil(tw)+pad*2;m.height=fs+pad*2;
  x.font='700 '+fs+'px '+FF(iso);x.textAlign='center';x.textBaseline='middle';x.fillStyle=c;x.fillText(t,m.width/2,m.height/2);
  const tx=new THREE.CanvasTexture(m);tx.minFilter=THREE.LinearFilter;return{t:tx,aspect:m.width/m.height};}
(function(){const N=WORDS.length,R=6.2,gold=Math.PI*(3-Math.sqrt(5));
  WORDS.forEach((d,i)=>{const h=(i*131)%100;const col=h<5?RED:h<37?BRASS:(i%2?PAPER:TELE);
    const {t,aspect}=tex(d.w,d.sc,col);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,fog:true,opacity:0.5+(d.wt-1)*0.22}));
    const s=0.9+d.wt*0.5;sp.scale.set(s*aspect,s,1);const y=1-(i/(N-1))*2,r=Math.sqrt(1-y*y),th=gold*i;
    sp.position.set(Math.cos(th)*r*R,y*R,Math.sin(th)*r*R);group.add(sp);});})();
let composer,bloom;
function setup(){const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  renderer.setPixelRatio(dpr);renderer.setSize(W,H);camera.aspect=W/H;camera.updateProjectionMatrix();
  composer=new THREE.EffectComposer(renderer);composer.addPass(new THREE.RenderPass(scene,camera));
  bloom=new THREE.UnrealBloomPass(new THREE.Vector2(W,H),0.82,0.55,0.72);composer.addPass(bloom);
  composer.setPixelRatio(dpr);composer.setSize(W,H);}
addEventListener('resize',setup);
function animate(){requestAnimationFrame(animate);group.rotation.y+=0.0014;composer.render();}
// цитаты
const ru=document.getElementById('ru'),src=document.getElementById('src'),en=document.getElementById('en'),qbox=document.getElementById('qbox');
let qi=-1;function show(n){const q=Q[n];ru.textContent=q.ru;src.textContent=q.work+(q.year?(', '+q.year):'');en.textContent=q.en;}
function cycle(){qbox.classList.remove('show');setTimeout(()=>{qi=(qi+1)%Q.length;show(qi);qbox.classList.add('show');},700);}
// режимы
const MODES=[['m-center','Центр'],['m-lower','Нижняя треть'],['m-side','Сбоку'],['m-scene','Сцена'],['m-corner','Уголок']];
const bar=document.getElementById('bar');bar.innerHTML=MODES.map(([m,l],i)=>`<button data-m="${m}"${i===0?' class="on"':''}>${l}</button>`).join('');
bar.onclick=e=>{const b=e.target.closest('button');if(!b)return;const sh=qbox.classList.contains('show');
  document.body.className=b.dataset.m;if(sh)qbox.classList.add('show');[...bar.children].forEach(x=>x.classList.toggle('on',x===b));};
// панель рендера цитаты
const P={glow:1,blur:16,scrim:1,qscale:1};
const SPEC=[['glow','Свечение',0,2.5,0.05],['blur','Разблюр фона',0,40,1],['scrim','Затемнение',0,1,0.02],['qscale','Размер',0.6,1.8,0.02]];
const ctrls=document.getElementById('ctrls');
function applyP(){for(const k in P)document.documentElement.style.setProperty('--'+k,P[k]);}
ctrls.innerHTML=SPEC.map(([k,l,mn,mx,st])=>`<div class="pr"><label>${l}<b id="v_${k}">${P[k]}</b></label><input type="range" id="r_${k}" min="${mn}" max="${mx}" step="${st}" value="${P[k]}"></div>`).join('');
SPEC.forEach(([k])=>{const r=document.getElementById('r_'+k);r.oninput=()=>{P[k]=parseFloat(r.value);document.getElementById('v_'+k).textContent=P[k];applyP();};});
document.getElementById('copy').onclick=()=>{const s=JSON.stringify({mode:document.body.className.replace('m-',''),...P});
  navigator.clipboard&&navigator.clipboard.writeText(s);const b=document.getElementById('copy');b.textContent='Скопировано ✓';setTimeout(()=>b.textContent='Скопировать',1200);};
applyP();
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{setup();animate();qi=0;show(0);qbox.classList.add('show');setInterval(cycle,8000);});
</script>
</body>
</html>
"""
html = TEMPLATE.replace("__FACES__", faces).replace("__DATA__", data_json)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written: {OUT}  (цитат {len(quotes)}, 5 режимов + панель рендера: свечение/разблюр/затемнение/размер)")
