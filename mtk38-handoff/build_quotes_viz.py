#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Исследователь РАЗМЕЩЕНИЯ цитат МТК 38 v2 → mtk38-v2/quotes-test.html.

Вращающийся WebGL-глобус написаний (на фоне) + цитата Ленина поверх (циклится),
с переключателем режимов РАЗМЕЩЕНИЯ: Центр · Нижняя треть · Сбоку · Сцена · Уголок.
Чтобы вживую сравнить, как цитата совмещается с визуалом. Бренд-палитра, шрифты, bloom.
Только show:true (Р5). Three.js r137 вендорен (без CDN).

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
<title>МТК 38 v2 · размещение цитат</title>
<style>
__FACES__
  @font-face{font-family:"21 Cent";src:url("../mtk38-globe/fonts/cent/21Cent.woff") format("woff");font-display:swap}
  @font-face{font-family:"20 Kopeek";src:url("../mtk38-globe/fonts/kopeek/20-kopeek-book.otf") format("opentype");font-display:swap}
  :root{--brass:#D2B773;--paper:#F7F9EF;--telegrey:#CFD0CF;--window:#9DA3A8;--graphite:#333d44}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:#2d363d;font-family:"20 Kopeek",system-ui,sans-serif}
  #c{position:fixed;inset:0;width:100vw;height:100vh;z-index:0}
  .scrim{position:fixed;inset:0;z-index:1;pointer-events:none;transition:opacity .6s, background .6s}
  .qbox{position:fixed;z-index:2;transition:all .6s ease;opacity:0}
  .qbox.show{opacity:1}
  .ru{font-family:"21 Cent",Georgia,serif;color:var(--paper);line-height:1.24;margin:0;
    text-shadow:0 0 22px rgba(247,249,239,.30),0 0 54px rgba(210,183,115,.14)}
  .attr{margin-top:22px;font-size:clamp(13px,1.4vw,18px);color:var(--brass);letter-spacing:.04em}
  .attr .nm{color:var(--paper)}
  .en{margin-top:12px;font-family:"21 Cent",Georgia,serif;font-style:italic;color:var(--window);
    font-size:clamp(12px,1.2vw,16px);opacity:.85}
  /* === режимы размещения === */
  body.m-center .scrim{background:radial-gradient(ellipse at 50% 50%, rgba(20,25,28,.55) 0%, rgba(20,25,28,.15) 60%)}
  body.m-center .qbox{left:50%;top:50%;transform:translate(-50%,-50%);max-width:60vw;text-align:center}
  body.m-center .ru{font-size:clamp(26px,3.4vw,52px)}
  body.m-lower .scrim{background:linear-gradient(to top, rgba(18,22,25,.82) 0%, rgba(18,22,25,.35) 22%, rgba(0,0,0,0) 42%)}
  body.m-lower .qbox{left:0;right:0;bottom:6vh;padding:0 8vw;text-align:center}
  body.m-lower .ru{font-size:clamp(22px,2.6vw,40px)}
  body.m-side .scrim{background:linear-gradient(to right, rgba(0,0,0,0) 40%, rgba(18,22,25,.86) 64%)}
  body.m-side .qbox{right:0;top:0;bottom:0;width:44vw;padding:0 5vw;display:flex;flex-direction:column;
    justify-content:center;text-align:left}
  body.m-side .ru{font-size:clamp(22px,2.4vw,38px)}
  body.m-scene .scrim{background:rgba(20,24,27,.62)}
  body.m-scene .qbox{left:50%;top:50%;transform:translate(-50%,-50%);max-width:70vw;text-align:center}
  body.m-scene .ru{font-size:clamp(30px,4.4vw,72px)}
  body.m-corner .scrim{background:linear-gradient(to top right, rgba(18,22,25,.6), rgba(0,0,0,0) 36%)}
  body.m-corner .qbox{left:3vw;bottom:5vh;max-width:38vw;text-align:left}
  body.m-corner .ru{font-size:clamp(17px,1.7vw,26px)}
  body.m-corner .en{display:none}
  .bar{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:5;display:flex;gap:6px;
    background:rgba(28,34,39,.8);backdrop-filter:blur(8px);border:1px solid rgba(210,183,115,.3);
    border-radius:11px;padding:6px}
  .bar button{background:transparent;border:0;color:var(--telegrey);font-size:13px;padding:7px 13px;
    border-radius:7px;cursor:pointer;font-family:"20 Kopeek",sans-serif}
  .bar button.on{background:var(--brass);color:#1a1f23;font-weight:600}
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
<div class="hint">режимы размещения цитаты над глобусом — переключай сверху</div>
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
// --- глобус ---
const cv=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.setClearColor(0x2d363d,1);
const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(0x2d363d,0.035);
const camera=new THREE.PerspectiveCamera(45,1,0.1,100); camera.position.z=15;
const group=new THREE.Group(); scene.add(group);
function tex(text,iso,color){const fs=128,pad=20,m=document.createElement('canvas'),x=m.getContext('2d');
  x.font='700 '+fs+'px '+FF(iso);const tw=Math.max(24,x.measureText(text).width);
  m.width=Math.ceil(tw)+pad*2;m.height=fs+pad*2;x.font='700 '+fs+'px '+FF(iso);
  x.textAlign='center';x.textBaseline='middle';x.fillStyle=color;x.fillText(text,m.width/2,m.height/2);
  const t=new THREE.CanvasTexture(m);t.minFilter=THREE.LinearFilter;return{t,aspect:m.width/m.height};}
(function build(){const N=WORDS.length,R=6.2,gold=Math.PI*(3-Math.sqrt(5));
  WORDS.forEach((d,i)=>{const h=(i*131)%100;const col=h<5?RED:h<37?BRASS:(i%2?PAPER:TELE);
    const {t,aspect}=tex(d.w,d.sc,col);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,fog:true,opacity:0.5+(d.wt-1)*0.22}));
    const s=0.9+d.wt*0.5;sp.scale.set(s*aspect,s,1);
    const y=1-(i/(N-1))*2,r=Math.sqrt(1-y*y),th=gold*i;
    sp.position.set(Math.cos(th)*r*R,y*R,Math.sin(th)*r*R);group.add(sp);});})();
let composer,bloom;
function setup(){const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  renderer.setPixelRatio(dpr);renderer.setSize(W,H);camera.aspect=W/H;camera.updateProjectionMatrix();
  composer=new THREE.EffectComposer(renderer);composer.addPass(new THREE.RenderPass(scene,camera));
  bloom=new THREE.UnrealBloomPass(new THREE.Vector2(W,H),0.82,0.55,0.72);composer.addPass(bloom);
  composer.setPixelRatio(dpr);composer.setSize(W,H);}
addEventListener('resize',setup);
function animate(){requestAnimationFrame(animate);group.rotation.y+=0.0014;composer.render();}
// --- цитаты ---
const ru=document.getElementById('ru'),src=document.getElementById('src'),en=document.getElementById('en'),qbox=document.getElementById('qbox');
let qi=-1;
function show(n){const q=Q[n];ru.textContent=q.ru;src.textContent=q.work+(q.year?(', '+q.year):'');en.textContent=q.en;}
function cycle(){qbox.classList.remove('show');
  setTimeout(()=>{qi=(qi+1)%Q.length;show(qi);qbox.classList.add('show');},650);}
// --- переключатель режимов ---
const MODES=[['m-center','Центр'],['m-lower','Нижняя треть'],['m-side','Сбоку'],['m-scene','Сцена'],['m-corner','Уголок']];
const bar=document.getElementById('bar');
bar.innerHTML=MODES.map(([m,l],i)=>`<button data-m="${m}"${i===0?' class="on"':''}>${l}</button>`).join('');
bar.onclick=e=>{const b=e.target.closest('button');if(!b)return;
  document.body.className=b.dataset.m;
  [...bar.children].forEach(x=>x.classList.toggle('on',x===b));};
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{
  setup();animate();qi=0;show(0);qbox.classList.add('show');setInterval(cycle,8000);});
</script>
</body>
</html>
"""
html = TEMPLATE.replace("__FACES__", faces).replace("__DATA__", data_json)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written: {OUT}  (цитат show:true {len(quotes)}, режимов размещения 5, глобус WebGL)")
