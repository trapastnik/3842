#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор инструмента валидации написаний «Ленин» для заказчика (музея).

Честная подача: КАНОН — это контуры с листа музея (PDF переведён в кривые, символов
в нём нет). Сверху в карточке — вырезка слова из листа музея (assets/mtk38/specimen/),
снизу — МОЯ расшифровка в Unicode, нарисованная subset-Noto, + юникод-коды.
Заказчик сравнивает верх (музей) и низ (моя расшифровка): совпали — верно, нет — правит.

Читает:  data/mtk38.json,  mtk38-v2/fonts/noto/manifest.json
Пишет:   mtk38-v2/validate.html  (ссылается на ../assets/mtk38/specimen/*.png и ./fonts/noto/*.woff2)

Запуск:  python3 mtk38-handoff/build_validate.py   (после правок данных/кропов/шрифтов)
"""
import json, os

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SRC = os.path.join(ROOT, "data", "mtk38.json")
OUT = os.path.join(ROOT, "mtk38-v2", "validate.html")
FONT_MANIFEST = os.path.join(ROOT, "mtk38-v2", "fonts", "noto", "manifest.json")
SPEC_DIR = os.path.join(ROOT, "assets", "mtk38", "specimen")

data = json.load(open(SRC, encoding="utf-8"))
embed = set(json.load(open(FONT_MANIFEST, encoding="utf-8"))["scripts"]) if os.path.exists(FONT_MANIFEST) else set()
have_spec = {f[:-4] for f in os.listdir(SPEC_DIR) if f.endswith(".png")} if os.path.isdir(SPEC_DIR) else set()

n = len(data["languages"])
n_flag = sum(1 for l in data["languages"] if l["verifier"] == "needs-verification")
data_json = json.dumps(data, ensure_ascii=False)
face = "\n".join(
    f'@font-face{{font-family:"noto-{s}";src:url("./fonts/noto/{s}.woff2") format("woff2");font-display:swap}}'
    for s in sorted(embed))
cfg_json = json.dumps({"embed": sorted(embed), "spec": sorted(have_spec)}, ensure_ascii=False)

TEMPLATE = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МТК 38 · валидация написаний «Ленин»</title>
<style>
__FACE__
  :root{--brass:#D2B773;--red:#A02128;--blue-grey:#5D8970;--window:#9DA3A8;
    --graphite:#435059;--telegrey:#CFD0CF;--paper:#F7F9EF;--white:#fff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--graphite);
    font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  header{position:sticky;top:0;z-index:5;background:var(--graphite);color:var(--paper);
    padding:16px 24px;box-shadow:0 2px 14px rgba(0,0,0,.25)}
  header h1{margin:0 0 6px;font-size:21px}
  header h1 b{color:var(--brass)}
  .intro{font-size:13px;max-width:1180px;color:var(--telegrey);margin:0 0 12px}
  .intro b{color:var(--brass)}
  .toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  .toolbar input[type=text]{padding:6px 10px;border-radius:6px;border:1px solid var(--window);
    background:var(--paper);color:var(--graphite);font-size:13px}
  .filters button{padding:6px 12px;border-radius:6px;border:1px solid var(--window);
    background:transparent;color:var(--paper);cursor:pointer;font-size:13px}
  .filters button.on{background:var(--brass);color:#000;border-color:var(--brass)}
  .act{padding:6px 14px;border-radius:6px;border:1px solid var(--brass);background:var(--brass);
    color:#000;font-weight:600;cursor:pointer;font-size:13px}
  .prog{margin-left:auto;font-size:13px;color:var(--telegrey)}
  .prog b{color:var(--brass)}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;padding:20px 24px}
  .card{background:var(--white);border:1px solid var(--telegrey);border-radius:12px;
    padding:12px 16px 12px;display:flex;flex-direction:column;gap:6px;border-left:5px solid var(--telegrey)}
  .card.flag{border-left-color:var(--red)}
  .card.v-ok{border-left-color:var(--blue-grey);background:#f3f7f3}
  .card.v-bad{border-left-color:var(--red);background:#fbf3f3}
  .lbl{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--window);text-align:center}
  .lbl.canon{color:var(--graphite);font-weight:700}
  .specimen{background:#fff;border:1px solid var(--telegrey);border-radius:8px;
    min-height:74px;display:flex;align-items:center;justify-content:center;padding:6px}
  .specimen img{max-width:100%;max-height:80px;object-fit:contain;display:block}
  .specimen .nofile{font-size:12px;color:var(--window)}
  .mine{font-size:clamp(30px,4vw,46px);line-height:1.15;text-align:center;color:var(--graphite);
    min-height:50px;display:flex;align-items:center;justify-content:center;gap:.2em;flex-wrap:wrap}
  .cp{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:var(--window);
    text-align:center;word-break:break-all;user-select:all}
  .name{font-size:16px;font-weight:700;color:var(--graphite);margin-top:2px}
  .endo{font-size:13px;color:var(--blue-grey)}
  .rows{font-size:12px;color:var(--graphite);display:grid;gap:1px}
  .rows b{color:var(--window);font-weight:600}
  .badges{display:flex;gap:6px;flex-wrap:wrap}
  .b{font-size:11px;padding:2px 7px;border-radius:10px;border:1px solid var(--window);color:var(--graphite)}
  .b.w3{background:var(--brass);border-color:var(--brass)}
  .b.flagb{background:var(--red);color:#fff;border-color:var(--red)}
  .b.dia{background:var(--window);color:#fff;border-color:var(--window)}
  .review{margin-top:auto;display:flex;flex-direction:column;gap:6px;
    border-top:1px dashed var(--telegrey);padding-top:8px}
  .vbtns{display:flex;gap:8px}
  .vbtns button{flex:1;padding:7px;border-radius:6px;border:1px solid var(--window);
    background:var(--paper);cursor:pointer;font-size:14px;font-weight:600}
  .vbtns button.sel-ok{background:var(--blue-grey);color:#fff;border-color:var(--blue-grey)}
  .vbtns button.sel-bad{background:var(--red);color:#fff;border-color:var(--red)}
  .review input{padding:6px 8px;border-radius:6px;border:1px solid var(--window);font-size:13px;
    background:var(--paper);color:var(--graphite)}
  .review input.corr{display:none;font-size:18px}
  .card.v-bad .review input.corr{display:block}
  .hide{display:none}
  footer{padding:16px 24px;color:var(--window);font-size:12px;text-align:center}
</style>
</head>
<body>
<header>
  <h1>«<b>Ленин</b>» на языках мира — валидация написаний</h1>
  <p class="intro">
    Лист музея — это <b>векторные контуры</b> (символов Unicode внутри нет). В каждой карточке
    <b>сверху — слово с листа музея</b> (канон), <b>снизу — моя расшифровка</b> в Unicode шрифтом
    Noto + коды <b>U+</b>. Контуры, скорее всего, рисовались из Noto, поэтому при верной расшифровке
    верх и низ должны совпасть. <b>Сравните их:</b> совпали — «✓ верно»; отличаются — «✗ неверно»,
    впишите правильное написание/комментарий. Прогресс сохраняется; в конце — «Экспорт».
  </p>
  <div class="toolbar">
    <input type="text" id="reviewer" placeholder="Ваше имя / организация (для отчёта)">
    <span class="filters">
      <button data-f="all" class="on">Все</button>
      <button data-f="flag">Спорные ⚠</button>
      <button data-f="todo">Непроверенные</button>
      <button data-f="bad">Отмеченные ✗</button>
    </span>
    <span class="prog">Проверено: <b id="done">0</b> / <span id="total">0</span></span>
    <button class="act" id="export">⬇ Экспорт результатов</button>
  </div>
</header>
<main id="grid"></main>
<footer>МТК 38 «Ленин на языках мира» · валидация v2 · канон: лист музея (контуры) · данные: data/mtk38.json</footer>

<script type="application/json" id="mtk38-data">__DATA__</script>
<script type="application/json" id="mtk38-cfg">__CFG__</script>
<script>
const DATA = JSON.parse(document.getElementById('mtk38-data').textContent);
const CFG  = JSON.parse(document.getElementById('mtk38-cfg').textContent);
const EMBED = new Set(CFG.embed), SPEC = new Set(CFG.spec);
const RTL = new Set(['Arab','Hebr','Thaa','Nkoo']);
const KEY = 'mtk38-review-v3';
let state = {}; try{ state = JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
const grid = document.getElementById('grid');
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cps = s => [...String(s)].map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ');
const ff  = iso => EMBED.has(iso) ? `'noto-${iso}', system-ui, sans-serif` : `system-ui, 'Noto Sans', sans-serif`;

const langs = DATA.languages.slice().sort((a,b)=> b.weight-a.weight || a.name_ru.localeCompare(b.name_ru,'ru'));
document.getElementById('total').textContent = langs.length;
document.getElementById('reviewer').value = state._reviewer||'';
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); upd(); }
function upd(){ document.getElementById('done').textContent = langs.filter(l=>state[l.id]&&state[l.id].verdict).length; }

langs.forEach(l=>{
  const flag = l.verifier==='needs-verification';
  const dir = RTL.has(l.script.iso15924)?'rtl':'ltr';
  const geo = l.geo.diaspora ? 'диаспора (без территории)' : (l.geo.primary ? esc(l.geo.primary.region_ru) : '—');
  const spec = SPEC.has(l.id)
     ? `<img src="../assets/mtk38/specimen/${l.id}.png" alt="лист музея: ${esc(l.name_ru)}">`
     : `<span class="nofile">нет вырезки</span>`;
  const card = document.createElement('article');
  card.className = 'card'+(flag?' flag':''); card.dataset.id=l.id; card.dataset.flag=flag?'1':'0';
  card.innerHTML = `
    <div class="lbl canon">лист музея · контуры (канон)</div>
    <div class="specimen">${spec}</div>
    <div class="lbl">моя расшифровка · Unicode → Noto</div>
    <div class="mine" style="font-family:${ff(l.script.iso15924)}" dir="${dir}">${esc(l.writing)}</div>
    <div class="cp">${cps(l.writing)}</div>
    <div class="name">${esc(l.name_ru)} <span class="endo" style="font-family:${ff(l.script.iso15924)}" dir="${dir}">· ${esc(l.endonym)}</span></div>
    <div class="rows">
      <span><b>письмо:</b> ${esc(l.script.iso15924)} · ${esc(l.script.name_ru)}</span>
      <span><b>семья:</b> ${esc(l.family)}</span>
      <span><b>ареал:</b> ${geo}</span>
    </div>
    <div class="badges">
      <span class="b ${l.weight===3?'w3':''}">★ ${l.weight}</span>
      ${l.geo.diaspora?'<span class="b dia">диаспора</span>':''}
      ${flag?'<span class="b flagb">⚠ требует проверки</span>':''}
    </div>
    <div class="review">
      <div class="vbtns"><button class="vok">✓ верно</button><button class="vbad">✗ неверно</button></div>
      <input class="corr" dir="${dir}" placeholder="правильное написание (если ✗)" style="font-family:${ff(l.script.iso15924)}">
      <input class="cmt" placeholder="комментарий (необязательно)">
    </div>`;
  grid.appendChild(card);

  const st = state[l.id]||{};
  const ok=card.querySelector('.vok'), bad=card.querySelector('.vbad');
  const corr=card.querySelector('.corr'), cmt=card.querySelector('.cmt');
  corr.value=st.correction||''; cmt.value=st.comment||'';
  function paint(){ card.classList.toggle('v-ok',st.verdict==='ok'); card.classList.toggle('v-bad',st.verdict==='bad');
    ok.classList.toggle('sel-ok',st.verdict==='ok'); bad.classList.toggle('sel-bad',st.verdict==='bad'); }
  function commit(){ state[l.id]={verdict:st.verdict,correction:corr.value.trim(),comment:cmt.value.trim(),
    name_ru:l.name_ru,my_writing:l.writing}; save(); }
  paint();
  ok.onclick=()=>{st.verdict='ok';paint();commit();};
  bad.onclick=()=>{st.verdict='bad';paint();commit();};
  corr.oninput=commit; cmt.oninput=commit;
});
upd();
document.getElementById('reviewer').oninput=e=>{ state._reviewer=e.target.value; save(); };
document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.filters button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  const f=b.dataset.f;
  document.querySelectorAll('.card').forEach(c=>{ const s=state[c.dataset.id]||{}; let show=true;
    if(f==='flag') show=c.dataset.flag==='1'; else if(f==='todo') show=!s.verdict; else if(f==='bad') show=s.verdict==='bad';
    c.classList.toggle('hide',!show); });
});
document.getElementById('export').onclick=()=>{
  const v={}; langs.forEach(l=>{const s=state[l.id]; if(s&&s.verdict) v[l.id]=s;});
  const out={mtk:38,tool:'mtk38-validate',canon:'museum-outlines',source:'data/mtk38.json',
    reviewer:state._reviewer||'',total:langs.length,reviewed:Object.keys(v).length,verdicts:v};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));
  a.download='mtk38-review'+(state._reviewer?('-'+state._reviewer.replace(/\W+/g,'_')):'')+'.json'; a.click();
};
</script>
</body>
</html>
"""

html = (TEMPLATE.replace("__FACE__", face)
                .replace("__DATA__", data_json)
                .replace("__CFG__", cfg_json))
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"written: {OUT}")
print(f"languages: {n} (flagged: {n_flag}) · embedded fonts: {len(embed)} · specimen crops: {len(have_spec)}")
print(f"size: {len(html)//1024} KB")
