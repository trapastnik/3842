#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Рендер-тест арт-качества (Р6) для МТК 38 v2 → mtk38-v2/render-test.html.

Глубинное типографическое поле из 52 написаний «Ленин» в реальных шрифтах
(20 Kopeek / Arial Unicode MS / Noto), с пост-обработкой: bloom + плёночное зерно +
виньетка, бренд-палитра, медленный дрейф/параллакс, hero-слово циклом. Canvas-2D,
горизонталь, тянется под вьюпорт (превью 3840×2160). Без CDN.

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
<title>МТК 38 v2 · рендер-тест</title>
<style>
__FACES__
  @font-face{font-family:"20 Kopeek";font-weight:400;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-book.otf") format("opentype");font-display:swap}
  @font-face{font-family:"20 Kopeek";font-weight:700;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-demibold.otf") format("opentype");font-display:swap}
  @font-face{font-family:"Nolde";src:url("../mtk38-globe/fonts/nolde/nolde.otf") format("opentype");font-display:swap}
  html,body{margin:0;height:100%;background:#384249;overflow:hidden}
  #c{display:block;width:100vw;height:100vh}
  .hint{position:absolute;left:16px;bottom:12px;font:12px system-ui,sans-serif;color:#9DA3A8;
    letter-spacing:.04em;opacity:.6;z-index:2}
  .hint b{color:#D2B773;font-weight:600}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div class="hint">МТК 38 v2 · рендер-тест арт-качества — <b>bloom + зерно + виньетка</b>, 52 написания, бренд-шрифты</div>
<script>
const WORDS = __WORDS__;
const RTL = new Set(['Arab','Hebr','Thaa','Nkoo']);
const ff = iso => (iso==='Latn'||iso==='Cyrl') ? "'20 Kopeek','Arial Unicode MS',sans-serif"
                : "'Arial Unicode MS','noto-"+iso+"',sans-serif";
const PAPER='#F7F9EF', TELE='#CFD0CF', BRASS='#D2B773', RED='#A02128';
const cv=document.getElementById('c'), cx=cv.getContext('2d');
const off=document.createElement('canvas'), ox=off.getContext('2d');
let W=0,H=0,DPR=Math.min(2,window.devicePixelRatio||1);
function resize(){W=innerWidth;H=innerHeight;[cv,off].forEach(c=>{c.width=W*DPR;c.height=H*DPR;});
  cx.setTransform(DPR,0,0,DPR,0,0);ox.setTransform(DPR,0,0,DPR,0,0);}
addEventListener('resize',resize);resize();

const rnd=(a,b)=>a+Math.random()*(b-a);
let field=[];
function build(){
  field=WORDS.map((d,i)=>{
    const z=rnd(0.18,1);                 // глубина
    const col = Math.random()<0.06?RED : Math.random()<0.28?BRASS : Math.random()<0.5?PAPER:TELE;
    return {...d, z, x:rnd(-0.1,1.1), y:rnd(0.06,0.94),
      vx:rnd(-0.6,0.6)*(0.2+z), col, base:(14+d.wt*7)};
  }).sort((a,b)=>a.z-b.z);
}
build();

// зерно (статичный тайл)
const gn=document.createElement('canvas');gn.width=gn.height=140;const gc=gn.getContext('2d');
{const im=gc.createImageData(140,140);for(let i=0;i<im.data.length;i+=4){const v=200+Math.random()*55|0;
  im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=Math.random()*22;}gc.putImageData(im,0,0);}
const grain=cx.createPattern(gn,'repeat');

let hero=0, heroT=0;
function draw(t){
  // фон: радиальный графит (светлее в центре → виньетка встроена)
  ox.setTransform(DPR,0,0,DPR,0,0);
  const g=ox.createRadialGradient(W*0.5,H*0.45,0,W*0.5,H*0.5,Math.max(W,H)*0.75);
  g.addColorStop(0,'#4b5b66');g.addColorStop(0.6,'#42505a');g.addColorStop(1,'#333d44');
  ox.fillStyle=g;ox.fillRect(0,0,W,H);
  ox.textAlign='center';ox.textBaseline='middle';
  // поле слов (дальние → ближние)
  for(const w of field){
    w.x+=(w.vx*0.00018*t?0:0); // (заполнено ниже через dt)
  }
  for(const w of field){
    const size=w.base*(0.5+w.z*1.7)*(H/780);
    ox.font=(w.z>0.7?'700 ':'')+size+"px "+ff(w.sc);
    ox.globalAlpha=0.10+w.z*0.72;
    ox.fillStyle=w.col;
    const px=((w.x%1.2+1.2)%1.2-0.1)*W, py=w.y*H;
    ox.fillText(w.w, px, py);
  }
  ox.globalAlpha=1;
  // hero — крупное слово циклом
  const hw=WORDS[hero];
  const hs=Math.min(W*0.36, H*0.34)* (0.85+0.15*Math.sin(t*0.0011));
  const fade=Math.min(1,heroT/900)*Math.min(1,(3600-heroT)/700);
  ox.globalAlpha=Math.max(0,fade)*0.92;
  ox.font="700 "+hs+"px "+ff(hw.sc);
  ox.fillStyle=PAPER;
  ox.fillText(hw.w, W*0.5, H*0.47);
  ox.globalAlpha=1;

  // на основной канвас: сцена + bloom (размытая «светлая» копия)
  cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,cv.width,cv.height);
  cx.drawImage(off,0,0);
  cx.globalCompositeOperation='lighter';cx.globalAlpha=0.55;
  cx.filter='blur('+(7*DPR)+'px)';cx.drawImage(off,0,0);
  cx.filter='none';cx.globalAlpha=1;cx.globalCompositeOperation='source-over';
  // зерно
  cx.setTransform(DPR,0,0,DPR,0,0);
  cx.globalAlpha=0.5;cx.fillStyle=grain;cx.fillRect(0,0,W,H);cx.globalAlpha=1;
  // виньетка
  const v=cx.createRadialGradient(W*0.5,H*0.5,Math.min(W,H)*0.3,W*0.5,H*0.5,Math.max(W,H)*0.62);
  v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(20,25,28,0.55)');
  cx.fillStyle=v;cx.fillRect(0,0,W,H);
}
let last=0;
function loop(t){
  const dt=Math.min(40,t-last);last=t;
  for(const w of field){ w.x+=w.vx*0.00006*dt; }
  heroT+=dt; if(heroT>3600){heroT=0;hero=(hero+1)%WORDS.length;}
  draw(t);requestAnimationFrame(loop);
}
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>requestAnimationFrame(loop));
</script>
</body>
</html>
"""

html = TEMPLATE.replace("__FACES__", faces).replace("__WORDS__", words_json)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written: {OUT}  ({len(words)} слов, {len(embed)} noto-faces, {len(html)//1024} KB)")
