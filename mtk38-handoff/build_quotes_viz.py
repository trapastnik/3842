#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Прототип визуализации цитат МТК 38 v2 → mtk38-v2/quotes-test.html.

Идея-сцена: крупная цитата самого Ленина по-русски (бренд-шрифт, мягкое свечение),
атрибуция «В. И. Ленин · работа», на фоне — гигантское полупрозрачное «Ленин» в разных
письменностях (эхо глобуса), плавная смена раз в ~8 с. Бренд-палитра, виньетка.
Только цитаты show:true (Р5). Может работать и как наложение поверх глобуса.

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
    if not q.get("show"):
        continue
    m = re.search(r"\((\d{4})\)", q.get("work", ""))
    work = re.sub(r"\s*\(.*$", "", q.get("work", "")).strip()
    quotes.append({"ru": q["ru"], "en": q.get("en", ""), "work": work, "year": m.group(1) if m else ""})

# фоновые написания (эхо глобуса) — разные письменности
bg = [{"w": l["writing"], "sc": l["script"]["iso15924"]} for l in D["languages"]]
faces = "\n".join(
    f'@font-face{{font-family:"noto-{s}";src:url("./fonts/noto/{s}.woff2") format("woff2");font-display:swap}}'
    for s in sorted(embed))
data_json = json.dumps({"q": quotes, "bg": bg}, ensure_ascii=False)

TEMPLATE = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МТК 38 v2 · визуализация цитат</title>
<style>
__FACES__
  @font-face{font-family:"21 Cent";src:url("../mtk38-globe/fonts/cent/21Cent.woff") format("woff");font-display:swap}
  @font-face{font-family:"Nolde";src:url("../mtk38-globe/fonts/nolde/nolde.otf") format("opentype");font-display:swap}
  @font-face{font-family:"20 Kopeek";src:url("../mtk38-globe/fonts/kopeek/20-kopeek-book.otf") format("opentype");font-display:swap}
  :root{--brass:#D2B773;--paper:#F7F9EF;--telegrey:#CFD0CF;--window:#9DA3A8}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:#333d44}
  #stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
  .vign{position:fixed;inset:0;pointer-events:none;z-index:3;
    background:radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 40%, rgba(18,22,25,.62) 100%)}
  .grain{position:fixed;inset:0;pointer-events:none;z-index:4;opacity:.05;mix-blend-mode:overlay}
  #back{position:fixed;z-index:1;left:50%;top:48%;transform:translate(-50%,-50%);
    font-weight:700;color:#fff;opacity:.05;white-space:nowrap;
    transition:opacity 1.6s ease, letter-spacing 12s linear;letter-spacing:.02em}
  .wrap{position:relative;z-index:2;max-width:1180px;padding:0 6vw;text-align:center;
    transition:opacity 1.1s ease, transform 1.1s ease}
  .ru{font-family:"21 Cent",Georgia,serif;color:var(--paper);line-height:1.22;
    text-shadow:0 0 26px rgba(247,249,239,.28),0 0 60px rgba(210,183,115,.12);margin:0}
  .attr{margin-top:30px;font-family:"20 Kopeek",system-ui,sans-serif;font-size:clamp(14px,1.5vw,19px);
    color:var(--brass);letter-spacing:.04em}
  .attr .nm{color:var(--paper)}
  .en{margin-top:14px;font-family:"21 Cent",Georgia,serif;font-size:clamp(13px,1.3vw,17px);
    color:var(--window);font-style:italic;opacity:.85}
  .dots{position:fixed;z-index:5;left:0;right:0;bottom:26px;display:flex;gap:7px;justify-content:center}
  .dots i{width:6px;height:6px;border-radius:50%;background:#5d6b74;transition:.4s}
  .dots i.on{background:var(--brass);width:18px;border-radius:3px}
  .hint{position:fixed;left:16px;bottom:12px;z-index:5;font:12px system-ui,sans-serif;color:var(--window);opacity:.5}
</style>
</head>
<body>
<div id="back"></div>
<div id="stage"><div class="wrap" id="wrap">
  <p class="ru" id="ru"></p>
  <div class="attr"><span class="nm">В. И. Ленин</span> · <span id="src"></span></div>
  <div class="en" id="en"></div>
</div></div>
<div class="vign"></div>
<canvas class="grain" id="grain"></canvas>
<div class="dots" id="dots"></div>
<div class="hint">МТК 38 v2 · визуализация цитат — идея сцены (можно как слой поверх глобуса)</div>
<script>
const DATA = __DATA__;
const Q = DATA.q, BG = DATA.bg;
const FF = iso => (iso==='Latn'||iso==='Cyrl') ? "'20 Kopeek','Arial Unicode MS',sans-serif"
                : "'Arial Unicode MS','noto-"+iso+"',sans-serif";
const ru=document.getElementById('ru'), src=document.getElementById('src'), en=document.getElementById('en');
const wrap=document.getElementById('wrap'), back=document.getElementById('back');
const dots=document.getElementById('dots');
Q.forEach((_,i)=>{const d=document.createElement('i');dots.appendChild(d);});
const dn=[...dots.children];
let i=-1;
function size(t){ const n=t.length; return n<28?'clamp(34px,5.2vw,76px)':n<60?'clamp(28px,3.8vw,54px)':'clamp(22px,2.9vw,40px)'; }
function show(n){
  const q=Q[n];
  ru.textContent=q.ru; ru.style.fontSize=size(q.ru);
  src.textContent=q.work+(q.year?(', '+q.year):'');
  en.textContent=q.en;
  const b=BG[Math.floor(Math.random()*BG.length)];
  back.style.fontFamily=FF(b.sc); back.textContent=b.w;
  back.style.fontSize=Math.min(innerWidth*0.62,innerHeight*0.7)+'px';
  dn.forEach((d,k)=>d.classList.toggle('on',k===n));
}
function fade(){
  wrap.style.opacity=0; wrap.style.transform='translateY(10px)';
  back.style.opacity=0;
  setTimeout(()=>{ i=(i+1)%Q.length; show(i);
    wrap.style.opacity=1; wrap.style.transform='translateY(0)'; back.style.opacity=.06;
  },1100);
}
// плёночное зерно
const gc=document.getElementById('grain'),gx=gc.getContext('2d');
function grain(){gc.width=160;gc.height=160;const im=gx.createImageData(160,160);
  for(let k=0;k<im.data.length;k+=4){const v=Math.random()*255|0;im.data[k]=im.data[k+1]=im.data[k+2]=v;im.data[k+3]=255;}
  gx.putImageData(im,0,0);}
grain();gc.style.width=gc.style.height='100%';

(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{
  i=0; show(0); wrap.style.opacity=1; back.style.opacity=.06;
  setInterval(fade, 8000);
});
</script>
</body>
</html>
"""
html = TEMPLATE.replace("__FACES__", faces).replace("__DATA__", data_json)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written: {OUT}  (цитат show:true {len(quotes)}, фоновых написаний {len(bg)})")
