#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Рендер-тест арт-качества (Р6, WebGL) для МТК 38 v2 → mtk38-v2/render-test.html.

Сигнатурный 3D-глобус: 52 написания «Ленин» как спрайты (canvas-текстуры реальными
шрифтами 20 Kopeek/Arial Unicode MS/Noto), распределены по сфере (Фибоначчи), авто-вращение
+ drag, настоящий UnrealBloom + графитовый фон, бренд-палитра. Three.js r137 вендорен
локально (UMD, examples/js — работает и с file://, и на офлайн-киоске; без CDN в рантайме).

Запуск:  python3 mtk38-handoff/build_render.py
"""
import json, os

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SRC = os.path.join(ROOT, "data", "mtk38.json")
OUT = os.path.join(ROOT, "mtk38-v2", "render-test.html")
FM = os.path.join(ROOT, "mtk38-v2", "fonts", "noto", "manifest.json")

d = json.load(open(SRC, encoding="utf-8"))
embed = set(json.load(open(FM, encoding="utf-8")).get("scripts", [])) if os.path.exists(FM) else set()
words = [{"w": l["writing"], "sc": l["script"]["iso15924"], "wt": l["weight"]} for l in d["languages"]]
words_json = json.dumps(words, ensure_ascii=False)
faces = "\n".join(
    f'@font-face{{font-family:"noto-{s}";src:url("./fonts/noto/{s}.woff2") format("woff2");font-display:swap}}'
    for s in sorted(embed))

TEMPLATE = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МТК 38 v2 · рендер-тест (WebGL)</title>
<style>
__FACES__
  @font-face{font-family:"20 Kopeek";font-weight:400;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-book.otf") format("opentype")}
  @font-face{font-family:"20 Kopeek";font-weight:700;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-demibold.otf") format("opentype")}
  html,body{margin:0;height:100%;background:#333d44;overflow:hidden}
  #c{display:block;width:100vw;height:100vh;cursor:grab}
  #c:active{cursor:grabbing}
  .hint{position:absolute;left:16px;bottom:12px;font:12px system-ui,sans-serif;color:#9DA3A8;
    letter-spacing:.04em;opacity:.6;z-index:2;pointer-events:none}
  .hint b{color:#D2B773;font-weight:600}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div class="hint">МТК 38 v2 · WebGL рендер-тест — глобус из 52 написаний · <b>UnrealBloom</b> · потяни мышью</div>
<script src="./vendor/three/three.min.js"></script>
<script src="./vendor/three/js/shaders/CopyShader.js"></script>
<script src="./vendor/three/js/shaders/LuminosityHighPassShader.js"></script>
<script src="./vendor/three/js/postprocessing/EffectComposer.js"></script>
<script src="./vendor/three/js/postprocessing/MaskPass.js"></script>
<script src="./vendor/three/js/postprocessing/ShaderPass.js"></script>
<script src="./vendor/three/js/postprocessing/RenderPass.js"></script>
<script src="./vendor/three/js/postprocessing/UnrealBloomPass.js"></script>
<script>
const WORDS = __WORDS__;
const PAPER='#F7F9EF', TELE='#CFD0CF', BRASS='#D2B773', RED='#A02128';
const FF = iso => (iso==='Latn'||iso==='Cyrl') ? "'20 Kopeek','Arial Unicode MS',sans-serif"
                : "'Arial Unicode MS','noto-"+iso+"',sans-serif";
const cv=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.setClearColor(0x333d44,1);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(45,1,0.1,100);
camera.position.z=15;
const group=new THREE.Group(); scene.add(group);

function tex(text,iso,color){
  const fs=130,pad=22,m=document.createElement('canvas'),x=m.getContext('2d');
  x.font='700 '+fs+'px '+FF(iso);
  const tw=Math.max(24,x.measureText(text).width);
  m.width=Math.ceil(tw)+pad*2; m.height=fs+pad*2;
  x.font='700 '+fs+'px '+FF(iso); x.textAlign='center'; x.textBaseline='middle';
  x.fillStyle=color; x.fillText(text,m.width/2,m.height/2);
  const t=new THREE.CanvasTexture(m); t.minFilter=THREE.LinearFilter; t.needsUpdate=true;
  return {t,aspect:m.width/m.height};
}
function build(){
  const N=WORDS.length, R=6.2, gold=Math.PI*(3-Math.sqrt(5));
  WORDS.forEach((d,i)=>{
    const col = Math.random()<0.05?RED : Math.random()<0.32?BRASS : Math.random()<0.5?PAPER:TELE;
    const {t,aspect}=tex(d.w,d.sc,col);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,
      opacity:0.55+ (d.wt-1)*0.22}));
    const s=(0.9+d.wt*0.5); sp.scale.set(s*aspect,s,1);
    const y=1-(i/(N-1))*2, r=Math.sqrt(1-y*y), th=gold*i;
    sp.position.set(Math.cos(th)*r*R, y*R, Math.sin(th)*r*R);
    group.add(sp);
  });
}

let composer,bloom;
function setup(){
  const W=innerWidth,H=innerHeight,dpr=Math.min(2,devicePixelRatio||1);
  renderer.setPixelRatio(dpr); renderer.setSize(W,H);
  camera.aspect=W/H; camera.updateProjectionMatrix();
  composer=new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene,camera));
  bloom=new THREE.UnrealBloomPass(new THREE.Vector2(W,H),0.75,0.55,0.72); // strength,radius,threshold
  composer.addPass(bloom);
  composer.setPixelRatio(dpr); composer.setSize(W,H);
}
addEventListener('resize',setup);

let drag=false,lx=0,ly=0,vy=0.0016,vx=0;
cv.addEventListener('pointerdown',e=>{drag=true;lx=e.clientX;ly=e.clientY;});
addEventListener('pointerup',()=>drag=false);
addEventListener('pointermove',e=>{ if(!drag)return;
  const dx=e.clientX-lx,dy=e.clientY-ly; lx=e.clientX;ly=e.clientY;
  group.rotation.y+=dx*0.005; group.rotation.x+=dy*0.005;
  vy=dx*0.0004||vy; });
function animate(){
  requestAnimationFrame(animate);
  if(!drag){ group.rotation.y+=vy; }
  composer.render();
}
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{ build(); setup(); animate(); });
</script>
</body>
</html>
"""

html = TEMPLATE.replace("__FACES__", faces).replace("__WORDS__", words_json)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written: {OUT}  ({len(words)} спрайтов, {len(embed)} noto-faces, WebGL/Three.js r137)")
