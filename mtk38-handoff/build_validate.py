#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор инструмента валидации написаний «Ленин» для заказчика (музея).

Читает data/mtk38.json → пишет самодостаточный mtk38-handoff/validate.html
(данные вшиты, открывается двойным кликом через file://, без сервера).
Можно отправить заказчику письмом. Прогресс сохраняется в браузере (localStorage),
в конце — кнопка «Экспорт» отдаёт JSON с вердиктами для обратной заливки в данные.

Запуск:  python3 mtk38-handoff/build_validate.py
Перегенерировать после правок data/mtk38.json.
"""
import json, os

HERE = os.path.dirname(__file__)
SRC = os.path.normpath(os.path.join(HERE, "..", "data", "mtk38.json"))
OUT = os.path.join(HERE, "validate.html")

with open(SRC, encoding="utf-8") as f:
    data = json.load(f)

n = len(data["languages"])
n_flag = sum(1 for l in data["languages"] if l["verifier"] == "needs-verification")
data_json = json.dumps(data, ensure_ascii=False)

TEMPLATE = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МТК 38 · валидация написаний «Ленин»</title>
<style>
  :root{
    --amber-black:#000;--white:#fff;--brass:#D2B773;--red:#A02128;
    --blue-grey:#5D8970;--window:#9DA3A8;--graphite:#435059;
    --telegrey:#CFD0CF;--paper:#F7F9EF;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--graphite);
    font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
  .writing-font{font-family:"Noto Sans","Noto Sans CJK SC","Noto Sans CJK TC",
    "Noto Sans CJK JP","Noto Sans CJK KR","Noto Sans Arabic","Noto Sans Hebrew",
    "Noto Sans Devanagari","Noto Sans Bengali","Noto Sans Tamil","Noto Sans Telugu",
    "Noto Sans Kannada","Noto Sans Malayalam","Noto Sans Sinhala","Noto Sans Thaana",
    "Noto Sans Tibetan","Noto Sans Myanmar","Noto Sans Khmer","Noto Sans Lao",
    "Noto Sans Gujarati","Noto Sans Gurmukhi","Noto Sans Oriya","Noto Sans Ol Chiki",
    "Noto Sans NKo","Noto Sans Tifinagh","Noto Sans Meetei Mayek","Noto Sans Ethiopic",
    "Noto Sans Armenian","Noto Sans Georgian",system-ui,sans-serif;}
  header{position:sticky;top:0;z-index:5;background:var(--graphite);color:var(--paper);
    padding:18px 24px;box-shadow:0 2px 14px rgba(0,0,0,.25)}
  header h1{margin:0 0 6px;font-size:22px;font-weight:700}
  header h1 b{color:var(--brass)}
  .intro{font-size:13px;max-width:1100px;color:var(--telegrey);margin:0 0 12px}
  .intro .warn{color:var(--brass)}
  .toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  .toolbar input[type=text]{padding:6px 10px;border-radius:6px;border:1px solid var(--window);
    background:var(--paper);color:var(--graphite);font-size:13px}
  .filters button,.act{padding:6px 12px;border-radius:6px;border:1px solid var(--window);
    background:transparent;color:var(--paper);cursor:pointer;font-size:13px}
  .filters button.on{background:var(--brass);color:var(--amber-black);border-color:var(--brass)}
  .act{background:var(--brass);color:var(--amber-black);border-color:var(--brass);font-weight:600}
  .prog{margin-left:auto;font-size:13px;color:var(--telegrey)}
  .prog b{color:var(--brass)}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
    gap:16px;padding:20px 24px}
  .card{background:var(--white);border:1px solid var(--telegrey);border-radius:12px;
    padding:14px 16px 12px;display:flex;flex-direction:column;gap:8px;
    border-left:5px solid var(--telegrey)}
  .card.flag{border-left-color:var(--red)}
  .card.v-ok{border-left-color:var(--blue-grey);background:#f3f7f3}
  .card.v-bad{border-left-color:var(--red);background:#fbf3f3}
  .writing{font-size:clamp(38px,5vw,56px);line-height:1.15;text-align:center;
    padding:6px 0 2px;color:var(--amber-black);min-height:64px;
    display:flex;align-items:center;justify-content:center;gap:.3em;flex-wrap:wrap}
  .name{font-size:17px;font-weight:700;color:var(--graphite)}
  .endo{font-size:14px;color:var(--blue-grey)}
  .rows{font-size:12px;color:var(--graphite);display:grid;gap:2px;margin-top:2px}
  .rows span b{color:var(--window);font-weight:600}
  .badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
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
  .review input{padding:6px 8px;border-radius:6px;border:1px solid var(--window);
    font-size:13px;background:var(--paper);color:var(--graphite)}
  .review input.corr{display:none}
  .card.v-bad .review input.corr{display:block}
  .corr.writing-font{font-size:20px}
  .canon{font-size:12px;color:var(--graphite);text-align:center;margin:-2px 0 0}
  .canon .canon-str{background:#eef0e6;padding:1px 7px;border-radius:4px;user-select:all}
  .cp{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:var(--window);
    text-align:center;word-break:break-all;margin-top:2px;user-select:all}
  footer{padding:16px 24px;color:var(--window);font-size:12px;text-align:center}
  .hide{display:none}
</style>
</head>
<body>
<header>
  <h1>«<b>Ленин</b>» на языках мира — валидация написаний</h1>
  <p class="intro">
    Проверьте, как пишется слово «Ленин» в каждом языке. Нажмите <b>✓ верно</b> или
    <b>✗ неверно</b>. Если неверно — впишите правильное написание и/или комментарий.
    <span class="warn">⚠ красная метка</span> — наш черновик считан с картинки и особенно
    нуждается в проверке. Если вместо буквы видите □ — на этом компьютере нет шрифта для
    этой письменности (это нормально, просто отметьте в комментарии). Прогресс сохраняется
    автоматически; в конце нажмите «Экспорт» и пришлите нам файл.
  </p>
  <div class="toolbar">
    <input type="text" id="reviewer" placeholder="Ваше имя / организация (для отчёта)">
    <span class="filters">
      <button data-f="all" class="on">Все</button>
      <button data-f="flag">Только спорные ⚠</button>
      <button data-f="todo">Непроверенные</button>
      <button data-f="bad">Отмеченные ✗</button>
    </span>
    <span class="prog">Проверено: <b id="done">0</b> / <span id="total">0</span></span>
    <button class="act" id="export">⬇ Экспорт результатов</button>
  </div>
</header>
<main id="grid"></main>
<footer>МТК 38 «Ленин на языках мира» · инструмент валидации v2 · данные: data/mtk38.json</footer>

<script type="application/json" id="mtk38-data">__DATA__</script>
<script>
const DATA = JSON.parse(document.getElementById('mtk38-data').textContent);
const RTL = new Set(['Arab','Hebr','Thaa','Nkoo']);
const KEY = 'mtk38-review-v2';
let state = {};
try{ state = JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
const grid = document.getElementById('grid');
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cps = s => [...String(s)].map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ');

const langs = DATA.languages.slice().sort((a,b)=> b.weight-a.weight || a.name_ru.localeCompare(b.name_ru,'ru'));
document.getElementById('total').textContent = langs.length;
document.getElementById('reviewer').value = state._reviewer||'';

function save(){ localStorage.setItem(KEY, JSON.stringify(state)); updateProg(); }
function updateProg(){
  const d = langs.filter(l=>state[l.id] && state[l.id].verdict).length;
  document.getElementById('done').textContent = d;
}

langs.forEach(l=>{
  const flag = l.verifier==='needs-verification';
  const dir = RTL.has(l.script.iso15924)?'rtl':'ltr';
  const geo = l.geo.diaspora ? 'диаспора (без территории)'
            : (l.geo.primary ? esc(l.geo.primary.region_ru) : '—');
  const card = document.createElement('article');
  card.className = 'card'+(flag?' flag':'');
  card.dataset.id = l.id; card.dataset.flag = flag?'1':'0';
  card.innerHTML = `
    <div class="writing writing-font" dir="${dir}">${esc(l.writing)}</div>
    <div class="canon">канон из файла: <span class="canon-str writing-font" dir="${dir}">${esc(l.writing)}</span></div>
    <div class="cp">${cps(l.writing)}</div>
    <div><span class="name">${esc(l.name_ru)}</span>
      <span class="endo writing-font" dir="${dir}"> · ${esc(l.endonym)}</span></div>
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
      <div class="vbtns">
        <button class="vok">✓ верно</button>
        <button class="vbad">✗ неверно</button>
      </div>
      <input class="corr writing-font" dir="${dir}" placeholder="правильное написание">
      <div class="corr-cp cp"></div>
      <input class="cmt" placeholder="комментарий (необязательно)">
    </div>`;
  grid.appendChild(card);

  const st = state[l.id]||{};
  const ok = card.querySelector('.vok'), bad = card.querySelector('.vbad');
  const corr = card.querySelector('.corr'), cmt = card.querySelector('.cmt');
  corr.value = st.correction||''; cmt.value = st.comment||'';
  function paint(){
    card.classList.toggle('v-ok', st.verdict==='ok');
    card.classList.toggle('v-bad', st.verdict==='bad');
    ok.classList.toggle('sel-ok', st.verdict==='ok');
    bad.classList.toggle('sel-bad', st.verdict==='bad');
  }
  paint();
  function commit(){ state[l.id] = {verdict:st.verdict, correction:corr.value.trim(), comment:cmt.value.trim(),
    name_ru:l.name_ru, original_writing:l.writing}; save(); }
  const corrcp = card.querySelector('.corr-cp');
  function echoCorr(){ corrcp.textContent = corr.value ? cps(corr.value) : ''; }
  echoCorr();
  ok.onclick = ()=>{ st.verdict='ok'; paint(); commit(); };
  bad.onclick = ()=>{ st.verdict='bad'; paint(); commit(); };
  corr.oninput = ()=>{ echoCorr(); commit(); }; cmt.oninput = commit;
});
updateProg();

// reviewer name
document.getElementById('reviewer').oninput = e=>{ state._reviewer = e.target.value; save(); };

// filters
document.querySelectorAll('.filters button').forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll('.filters button').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    const f = btn.dataset.f;
    document.querySelectorAll('.card').forEach(c=>{
      const id=c.dataset.id, s=state[id]||{};
      let show=true;
      if(f==='flag') show = c.dataset.flag==='1';
      else if(f==='todo') show = !s.verdict;
      else if(f==='bad') show = s.verdict==='bad';
      c.classList.toggle('hide', !show);
    });
  };
});

// export
document.getElementById('export').onclick = ()=>{
  const verdicts={};
  langs.forEach(l=>{ const s=state[l.id]; if(s&&s.verdict) verdicts[l.id]=s; });
  const out = { mtk:38, tool:'mtk38-validate', source:'data/mtk38.json',
    reviewer: state._reviewer||'', total: langs.length,
    reviewed: Object.keys(verdicts).length, verdicts };
  const blob = new Blob([JSON.stringify(out,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mtk38-review'+(state._reviewer?('-'+state._reviewer.replace(/\W+/g,'_')):'')+'.json';
  a.click();
};
</script>
</body>
</html>
"""

html = TEMPLATE.replace("__DATA__", data_json)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"written: {OUT}")
print(f"languages: {n}  (flagged needs-verification: {n_flag})")
print(f"size: {len(html)} bytes")
