#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
МТК 38 v2 · Данные и приёмка → mtk38-v2/editor.html.

ЕДИНЫЙ инструмент (объединяет бывший редактор + валидатор) с двумя вкладками, обе пишут в ОДИН
файл data/mtk38.json (один писатель → конфликтов нет):

  • «Данные»  — авторская правка: все поля, выпадающие списки (script с автозаполнением + проверка
                шрифта / writing_source / verifier / weight), поле un, add/remove, независимый скролл.
  • «Приёмка» — сверка с листом музея: кроп specimen ↔ моя Unicode-расшифровка + коды U+, ✓/✗,
                правка написания, комментарий, проверяющий. Пишет в блок review каждого языка;
                кнопка «применить → написание» копирует correction в writing.

Хеш-стоп: при пересборке (изменился источник) устаревший localStorage-черновик сбрасывается сам.
На выходе — «Экспорт mtk38.json» (drop-in в data/). Браузер по file:// в файл не пишет.
review-блок уходит в тот же mtk38.json; прод-варианты (globe/map/studio) его игнорируют.

Читает:  data/mtk38.json, mtk38-v2/fonts/noto/manifest.json, assets/mtk38/specimen/*.png
Пишет:   mtk38-v2/editor.html

Запуск:  python3 mtk38-handoff/build_editor.py
"""
import json, os, hashlib

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SRC = os.path.join(ROOT, "data", "mtk38.json")
OUT = os.path.join(ROOT, "mtk38-v2", "editor.html")
FM = os.path.join(ROOT, "mtk38-v2", "fonts", "noto", "manifest.json")
SPEC_DIR = os.path.join(ROOT, "assets", "mtk38", "specimen")

data = json.load(open(SRC, encoding="utf-8"))
embed = set(json.load(open(FM, encoding="utf-8")).get("scripts", [])) if os.path.exists(FM) else set()
have_spec = sorted({f[:-4] for f in os.listdir(SPEC_DIR) if f.endswith(".png")}) if os.path.isdir(SPEC_DIR) else []

script_map = {}
for l in data["languages"]:
    script_map.setdefault(l["script"]["iso15924"], l["script"]["name_ru"])
for s in embed:
    script_map.setdefault(s, "")
families = sorted({l.get("family", "") for l in data["languages"] if l.get("family")})
countries = sorted({c for l in data["languages"]
                    for c in (([l["geo"]["primary"]["country_iso"]] if l["geo"].get("primary") else [])
                              + [a["country_iso"] for a in l["geo"].get("also", [])]) if c})

faces = "\n".join(
    f'@font-face{{font-family:"noto-{s}";src:url("./fonts/noto/{s}.woff2") format("woff2");font-display:swap}}'
    for s in sorted(embed))
data_json = json.dumps(data, ensure_ascii=False)
data_hash = hashlib.md5(data_json.encode("utf-8")).hexdigest()[:12]

TEMPLATE = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>МТК 38 · данные и приёмка</title>
<style>
__FACE__
  @font-face{font-family:"20 Kopeek";font-weight:400;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-book.otf") format("opentype");font-display:swap}
  @font-face{font-family:"20 Kopeek";font-weight:700;src:url("../mtk38-globe/fonts/kopeek/20-kopeek-demibold.otf") format("opentype");font-display:swap}
  :root{--brass:#D2B773;--red:#A02128;--green:#5D8970;--window:#9DA3A8;--graphite:#435059;--telegrey:#CFD0CF;--paper:#F7F9EF;--white:#fff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--graphite);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;height:100vh;overflow:hidden;display:flex;flex-direction:column}
  header{flex:0 0 auto;z-index:5;background:var(--graphite);color:var(--paper);padding:12px 22px 13px;box-shadow:0 2px 14px rgba(0,0,0,.25)}
  header nav{display:flex;gap:6px;margin-bottom:9px}
  header nav a{font-size:13px;color:var(--telegrey);text-decoration:none;padding:5px 12px;border-radius:8px 8px 0 0;background:rgba(255,255,255,.06)}
  header nav a.active{background:var(--paper);color:var(--graphite);font-weight:600}
  header h1{margin:0 0 5px;font-size:19px}header h1 b{color:var(--brass)}
  .intro{font-size:12.5px;max-width:1100px;color:var(--telegrey);margin:0 0 10px}.intro b{color:var(--brass)}
  .toolbar{display:flex;flex-wrap:wrap;gap:9px;align-items:center}
  .toolbar input[type=text]{padding:6px 10px;border-radius:6px;border:1px solid var(--window);background:var(--paper);color:var(--graphite);font-size:13px}
  .modesw{display:flex;background:rgba(255,255,255,.07);border-radius:8px;padding:3px;margin-right:4px}
  .modesw button{background:transparent;border:0;color:var(--telegrey);font:600 13px "20 Kopeek",sans-serif;padding:6px 16px;border-radius:6px;cursor:pointer}
  .modesw button.on{background:var(--brass);color:#1a1f23}
  .act{padding:7px 15px;border-radius:6px;border:1px solid var(--brass);background:var(--brass);color:#000;font-weight:700;cursor:pointer;font-size:13px}
  .ghost{padding:7px 13px;border-radius:6px;border:1px solid var(--window);background:transparent;color:var(--paper);cursor:pointer;font-size:13px}
  .filters button{padding:6px 11px;border-radius:6px;border:1px solid var(--window);background:transparent;color:var(--paper);cursor:pointer;font-size:13px}
  .filters button.on{background:var(--brass);color:#000;border-color:var(--brass)}
  .prog{margin-left:auto;font-size:13px;color:var(--telegrey)}.prog b{color:var(--brass)}
  .draft{font-size:12px;color:var(--brass)}
  /* === вкладка Данные === */
  #mode-data{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
  .wrap{display:flex;gap:0;align-items:stretch;flex:1 1 auto;min-height:0;overflow:hidden}
  .list{width:320px;flex:0 0 320px;border-right:1px solid var(--telegrey);overflow:auto;background:var(--white)}
  .litem{display:flex;align-items:center;gap:7px;padding:9px 14px;border-bottom:1px solid #eef0ee;cursor:pointer;border-left:4px solid transparent}
  .litem:hover{background:#f3f5f3}
  .litem.sel{background:#eef3ef;border-left-color:var(--brass)}
  .litem.flag{border-left-color:var(--red)}
  .litem b{font-size:13px;font-weight:600;flex:0 0 auto;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .litem .w{font-size:18px;color:var(--graphite);margin-left:auto;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .litem .wt{font-size:11px;color:var(--window);flex:0 0 auto}
  .litem .un{background:var(--green);color:#fff;border-radius:4px;padding:1px 5px;font-size:10px;flex:0 0 auto}
  .litem .rv{font-size:12px;flex:0 0 auto}
  .detail{flex:1;overflow:auto;padding:18px 24px 40px}
  .preview{background:var(--white);border:1px solid var(--telegrey);border-radius:12px;padding:14px 18px;margin-bottom:16px;text-align:center}
  .preview .pw{font-size:clamp(34px,5vw,58px);line-height:1.15;color:var(--graphite);min-height:54px;display:flex;align-items:center;justify-content:center}
  .preview .cp{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--window);word-break:break-all;user-select:all;margin-top:4px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:11px}
  .fld{display:flex;flex-direction:column;gap:3px}
  .fld.wide{grid-column:1 / -1}
  .fld>span{font-size:11px;letter-spacing:.03em;text-transform:uppercase;color:var(--window);font-weight:600}
  .fld input,.fld select,.fld textarea{padding:7px 9px;border-radius:6px;border:1px solid var(--telegrey);background:var(--white);color:var(--graphite);font-size:14px;font-family:inherit}
  .fld input.big{font-size:22px}
  .fld input:focus,.fld select:focus,.fld textarea:focus{outline:2px solid var(--brass);border-color:var(--brass)}
  .fld .chk{display:inline-flex;align-items:center;gap:7px;font-size:14px;color:var(--graphite);padding:6px 0}
  .warn{display:block;font-size:11px;color:var(--red);margin-top:3px}
  .rvbox{margin-top:6px;font-size:12px;padding:7px 10px;border-radius:8px;background:#eef2ec}
  .rvbox.bad{background:#fbf3f3}
  .rvbox b{color:var(--graphite)}
  fieldset.geo{margin:16px 0 0;border:1px solid var(--telegrey);border-radius:10px;padding:12px 14px}
  fieldset.geo legend{font-size:12px;font-weight:700;color:var(--graphite);padding:0 6px}
  .chkrow{margin-bottom:6px}
  .chkrow label{display:inline-flex;align-items:center;gap:6px;margin-right:18px;font-size:13px}
  .primary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:10px}
  .primary.hide{display:none}
  .also{margin-top:12px}
  .also-h{font-size:12px;font-weight:700;color:var(--graphite);display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .also-h button{font-size:12px;padding:3px 9px;border-radius:5px;border:1px solid var(--window);background:var(--paper);cursor:pointer}
  .also-row{display:flex;gap:7px;margin:5px 0}
  .also-row input{padding:5px 8px;border:1px solid var(--telegrey);border-radius:5px;font-size:13px;flex:1}
  .also-row .rm{border:1px solid var(--window);background:var(--paper);border-radius:5px;cursor:pointer;padding:0 9px}
  .detail-actions{margin-top:20px}
  .danger{padding:8px 14px;border-radius:6px;border:1px solid var(--red);background:var(--white);color:var(--red);font-weight:600;cursor:pointer}
  .empty{color:var(--window);padding:30px;text-align:center}
  /* === вкладка Приёмка === */
  #mode-review{flex:1 1 auto;min-height:0;overflow:auto;padding:18px 22px 40px}
  .rgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
  .rcard{background:var(--white);border:1px solid var(--telegrey);border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:6px;border-left:5px solid var(--telegrey)}
  .rcard.flag{border-left-color:var(--red)}
  .rcard.v-ok{border-left-color:var(--green);background:#f3f7f3}
  .rcard.v-bad{border-left-color:var(--red);background:#fbf3f3}
  .rlbl{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--window);text-align:center}
  .rlbl.canon{color:var(--graphite);font-weight:700}
  .specimen{background:#fff;border:1px solid var(--telegrey);border-radius:8px;min-height:72px;display:flex;align-items:center;justify-content:center;padding:6px}
  .specimen img{max-width:100%;max-height:78px;object-fit:contain;display:block}
  .specimen .nofile{font-size:12px;color:var(--window)}
  .mine{font-size:clamp(28px,3.6vw,42px);line-height:1.15;text-align:center;color:var(--graphite);min-height:46px;display:flex;align-items:center;justify-content:center}
  .rcp{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--window);text-align:center;word-break:break-all;user-select:all}
  .rname{font-size:15px;font-weight:700;margin-top:2px}.rendo{font-size:13px;color:var(--green);font-weight:400}
  .rrows{font-size:12px;color:var(--graphite);display:grid;gap:1px}.rrows b{color:var(--window);font-weight:600}
  .review-ctl{margin-top:auto;display:flex;flex-direction:column;gap:6px;border-top:1px dashed var(--telegrey);padding-top:8px}
  .vbtns{display:flex;gap:8px}
  .vbtns button{flex:1;padding:7px;border-radius:6px;border:1px solid var(--window);background:var(--paper);cursor:pointer;font-size:14px;font-weight:600}
  .vbtns button.sel-ok{background:var(--green);color:#fff;border-color:var(--green)}
  .vbtns button.sel-bad{background:var(--red);color:#fff;border-color:var(--red)}
  .corrwrap{display:none;gap:6px}.rcard.v-bad .corrwrap{display:flex}
  .corrwrap input{flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--window);font-size:16px}
  .corrwrap .apply{flex:0 0 auto;border:1px solid var(--brass);background:var(--brass);color:#000;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;padding:0 9px}
  .review-ctl .cmt{padding:6px 8px;border-radius:6px;border:1px solid var(--window);font-size:13px}
  .vw{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:var(--paper)}
  .vw button{padding:6px 11px;border-radius:6px;border:1px solid var(--window);background:transparent;color:var(--paper);cursor:pointer;font-size:13px}
  .vw button.on{background:var(--brass);color:#000;border-color:var(--brass)}
  .r2{background:rgba(20,25,28,.96);border:1px solid rgba(210,183,115,.4);border-radius:14px;padding:15px 17px;color:var(--telegrey)}
  .r2w{font-size:clamp(28px,3.6vw,44px);color:var(--paper);line-height:1.1;text-shadow:0 0 18px rgba(247,249,239,.2)}
  .r2n{font-size:16px;color:var(--paper);font-weight:600;margin-top:3px}
  .r2e{font-size:13px;color:var(--brass)}
  .r2rows{margin-top:9px;font-size:12.5px;display:grid;grid-template-columns:auto 1fr;gap:2px 12px}
  .r2rows b{color:var(--window);font-weight:600}
  .r2ver{margin-top:9px;display:inline-block;font-size:11px;padding:2px 9px;border-radius:10px}
  .r2ver.ok{background:var(--brass);color:#1a1f23}.r2ver.warn{background:var(--red);color:#fff}
  .rcard.rcard-clean{background:transparent;border:0;padding:0;gap:0}
  .hidec{display:none}
</style>
</head>
<body>
<header>
  <nav>
    <a href="./index.html">Главная</a>
    <a href="./studio.html">Студия</a>
    <a href="./editor.html" class="active">Данные и приёмка</a>
    <a href="./analysis.html">Аналитика</a>
  </nav>
  <h1>Данные и приёмка «<b>Ленин</b> на языках мира»</h1>
  <p class="intro">Единый источник <b>data/mtk38.json</b>. Вкладка <b>Данные</b> — авторская правка полей;
    <b>Приёмка</b> — сверка написаний с листом музея (✓/✗, правка, коммент). Оба пишут в один файл —
    кнопка <b>«Экспорт mtk38.json»</b> → в <b>data/</b> → пересборка вариантов.</p>
  <div class="toolbar">
    <div class="modesw"><button data-mode="data" class="on">Данные</button><button data-mode="review">Приёмка</button></div>
    <span class="t-data"><input type="text" id="search" placeholder="Поиск: название / id / написание"><button class="ghost" id="addLang">+ Добавить язык</button></span>
    <span class="t-review hidec"><input type="text" id="reviewer" placeholder="Проверяющий (имя / организация)">
      <span class="filters"><button data-f="all" class="on">Все</button><button data-f="flag">Спорные ⚠</button><button data-f="todo">Непроверенные</button><button data-f="bad">Отмеченные ✗</button></span><span class="vw">Вид <button data-vw="compare" class="on">техническая</button><button data-vw="card">чистовая</button></span></span>
    <button class="act" id="export">⬇ Экспорт mtk38.json</button>
    <button class="ghost" id="reset">↺ Сброс к файлу</button>
    <span class="draft" id="draft"></span>
    <span class="prog">Языков <b id="count">0</b> · ООН <b id="uncount">0</b> · принято <b id="okcount">0</b></span>
  </div>
</header>
<div id="mode-data"><div class="wrap"><div class="list" id="list"></div><div class="detail" id="detail"></div></div></div>
<div id="mode-review" style="display:none"><div class="rgrid" id="rgrid"></div></div>
<datalist id="dl_family"></datalist>
<datalist id="dl_country"></datalist>
<script type="application/json" id="data">__DATA__</script>
<script>
const DATA = JSON.parse(document.getElementById('data').textContent);
const SCRIPT_MAP = __SCRIPTMAP__;
const EMBED = new Set(__EMBED__);
const FAMILIES = __FAMILIES__;
const COUNTRIES = __COUNTRIES__;
const SPEC = new Set(__SPEC__);
const HASH = "__HASH__";
const SRC = ['idml-source','pdf-specimen','wiki-interwiki','wikidata-q1394','triangulated'];
const VER = ['idml-source','machine-triangulated','needs-verification','unverified','native'];
const WEIGHTS = [[1,'1 — прочий'],[2,'2 — крупный региональный'],[3,'3 — мировой / ООН']];
const KEY = 'mtk38-data-v1', RKEY='mtk38-reviewer';
const RTL = new Set(['Arab','Hebr','Thaa','Nkoo']);
const ff = iso => (iso==='Latn'||iso==='Cyrl') ? "'20 Kopeek','Arial Unicode MS',system-ui,sans-serif"
                                               : "'Arial Unicode MS','noto-"+iso+"',system-ui,sans-serif";
const cps = s => [...String(s||'')].map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ');
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
function setPath(o,path,val){const ks=path.split('.');let t=o;for(let i=0;i<ks.length-1;i++){if(t[ks[i]]==null)t[ks[i]]={};t=t[ks[i]];}t[ks[ks.length-1]]=val;}
function fillDL(id,arr){const e=document.getElementById(id);if(e)e.innerHTML=arr.map(v=>'<option value="'+esc(v)+'">').join('');}
fillDL('dl_family',FAMILIES); fillDL('dl_country',COUNTRIES);

// --- загрузка с хеш-стопом: устаревший черновик (другой источник) сбрасывается сам ---
let hadDraft=false, D;
try{const raw=localStorage.getItem(KEY); if(raw){const o=JSON.parse(raw); if(o&&o.__hash===HASH&&o.data){D=o.data;hadDraft=true;}}}catch(e){}
if(!D) D=clone(DATA);
let sel=0, mode='data', reviewFilter='all', reviewView='compare';
const listEl=document.getElementById('list'), detailEl=document.getElementById('detail'), searchEl=document.getElementById('search'), rgridEl=document.getElementById('rgrid');
const reviewerEl=document.getElementById('reviewer'); reviewerEl.value=localStorage.getItem(RKEY)||'';
document.getElementById('draft').textContent = hadDraft ? '● черновик из браузера' : '';
function save(){try{localStorage.setItem(KEY,JSON.stringify({__hash:HASH,data:D}));document.getElementById('draft').textContent='● черновик из браузера';}catch(e){}updateCounts();}
function updateCounts(){
  document.getElementById('count').textContent=D.languages.length;
  document.getElementById('uncount').textContent=D.languages.filter(l=>l.un).length;
  document.getElementById('okcount').textContent=D.languages.filter(l=>l.review&&l.review.verdict==='ok').length;
}

// ====================== ВКЛАДКА ДАННЫЕ ======================
function rvMark(l){const v=l.review&&l.review.verdict;return v==='ok'?'<span class="rv" title="приёмка: верно">✓</span>':v==='bad'?'<span class="rv" title="приёмка: неверно">✗</span>':'';}
function renderList(){
  const q=(searchEl.value||'').toLowerCase().trim();
  listEl.innerHTML='';
  D.languages.forEach((l,i)=>{
    if(q && !((l.name_ru||'').toLowerCase().includes(q)||(l.id||'').toLowerCase().includes(q)||(l.writing||'').toLowerCase().includes(q))) return;
    const it=document.createElement('div');
    it.className='litem'+(i===sel?' sel':'')+(l.verifier==='needs-verification'?' flag':'');
    it.innerHTML='<b>'+esc(l.name_ru||'—')+'</b><span class="w" style="font-family:'+ff(l.script&&l.script.iso15924)+'">'+esc(l.writing||'')+'</span>'+rvMark(l)+'<span class="wt">★'+(l.weight||1)+'</span>'+(l.un?'<span class="un">ООН</span>':'');
    it.onclick=()=>{sel=i;renderList();renderDetail();};
    listEl.appendChild(it);
  });
  updateCounts();
}
function renderDetail(){
  const l=D.languages[sel];
  if(!l){detailEl.innerHTML='<p class="empty">Нет языков. Нажмите «+ Добавить язык».</p>';return;}
  if(!l.script)l.script={iso15924:'Latn',name_ru:''}; if(!l.geo)l.geo={territorial:true,diaspora:false,primary:null,also:[]};
  const iso=l.script.iso15924, dir=RTL.has(iso)?'rtl':'ltr', p=l.geo.primary;
  let scriptOpts=Object.keys(SCRIPT_MAP).sort().map(c=>'<option value="'+c+'"'+(c===iso?' selected':'')+'>'+c+(SCRIPT_MAP[c]?' — '+esc(SCRIPT_MAP[c]):'')+'</option>').join('');
  if(!Object.prototype.hasOwnProperty.call(SCRIPT_MAP,iso)) scriptOpts='<option value="'+esc(iso)+'" selected>'+esc(iso)+' (?)</option>'+scriptOpts;
  const fontWarn=(iso==='Latn'||iso==='Cyrl'||EMBED.has(iso))?'':'<span class="warn">⚠ Noto-шрифт для '+esc(iso)+' не вшит — глиф может не отрисоваться</span>';
  const isNative=(l.verifier||'').indexOf('native:')===0, verPreset=isNative?'native':(l.verifier||''), nativeName=isNative?l.verifier.slice(7):'';
  let verOpts=VER.map(v=>'<option value="'+v+'"'+(v===verPreset?' selected':'')+'>'+v+'</option>').join('');
  if(VER.indexOf(verPreset)<0 && verPreset) verOpts='<option value="'+esc(verPreset)+'" selected>'+esc(verPreset)+'</option>'+verOpts;
  const wOpts=WEIGHTS.map(w=>'<option value="'+w[0]+'"'+(l.weight===w[0]?' selected':'')+'>'+esc(w[1])+'</option>').join('');
  let srcOpts=SRC.map(v=>'<option value="'+v+'"'+(v===l.writing_source?' selected':'')+'>'+v+'</option>').join('');
  if(SRC.indexOf(l.writing_source)<0 && l.writing_source) srcOpts='<option value="'+esc(l.writing_source)+'" selected>'+esc(l.writing_source)+'</option>'+srcOpts;
  const rv=l.review||{};
  const rvBox = rv.verdict ? '<div class="rvbox'+(rv.verdict==='bad'?' bad':'')+'"><b>приёмка:</b> '+(rv.verdict==='ok'?'✓ верно':'✗ неверно')
      +(rv.correction?' · предложено: <b style="font-family:'+ff(iso)+'">'+esc(rv.correction)+'</b> <button id="applyCorr">применить → написание</button>':'')
      +(rv.comment?' · «'+esc(rv.comment)+'»':'')+(rv.reviewer?' · '+esc(rv.reviewer):'')+'</div>' : '';

  detailEl.innerHTML=
   '<div class="preview"><div class="pw" dir="'+dir+'" style="font-family:'+ff(iso)+'">'+esc(l.writing)+'</div><div class="cp">'+cps(l.writing)+'</div></div>'
   +rvBox
   +'<div class="grid2">'
   +'<label class="fld"><span>id (ключ)</span><input data-k="id" value="'+esc(l.id)+'"></label>'
   +'<label class="fld"><span>Название (рус.)</span><input data-k="name_ru" value="'+esc(l.name_ru)+'"></label>'
   +'<label class="fld wide"><span>Написание «Ленин»</span><input data-k="writing" class="big" dir="'+dir+'" style="font-family:'+ff(iso)+'" value="'+esc(l.writing)+'"></label>'
   +'<label class="fld"><span>Эндоним</span><input data-k="endonym" dir="'+dir+'" style="font-family:'+ff(iso)+'" value="'+esc(l.endonym)+'"></label>'
   +'<label class="fld"><span>Письмо ISO 15924</span><select data-sciso>'+scriptOpts+'</select>'+fontWarn+'</label>'
   +'<label class="fld"><span>Письмо (рус.)</span><input data-k="script.name_ru" value="'+esc(l.script.name_ru)+'"></label>'
   +'<label class="fld"><span>Вес</span><select data-k="weight">'+wOpts+'</select></label>'
   +'<label class="fld wide"><span>Семья</span><input data-k="family" list="dl_family" value="'+esc(l.family)+'"></label>'
   +'<label class="fld"><span>Носителей, млн</span><input data-k="speakers_mln" type="number" step="0.1" value="'+esc(l.speakers_mln)+'"></label>'
   +'<div class="fld"><span>Категория</span><label class="chk"><input type="checkbox" data-k="un" '+(l.un?'checked':'')+'> официальный язык ООН</label></div>'
   +'<label class="fld"><span>Источник написания</span><select data-k="writing_source">'+srcOpts+'</select></label>'
   +'<label class="fld"><span>Верификатор</span><select data-vsel>'+verOpts+'</select></label>'
   +'<label class="fld" id="nativeFld" style="'+(verPreset==='native'?'':'display:none')+'"><span>Имя носителя (native:)</span><input id="nativeName" value="'+esc(nativeName)+'"></label>'
   +'<label class="fld wide"><span>Заметка</span><textarea data-k="note" rows="2">'+esc(l.note||'')+'</textarea></label>'
   +'</div>'
   +'<fieldset class="geo"><legend>География</legend>'
   +'<div class="chkrow">'
   +'<label><input type="checkbox" data-k="geo.territorial" '+(l.geo.territorial?'checked':'')+'> территориальный</label>'
   +'<label><input type="checkbox" data-k="geo.diaspora" '+(l.geo.diaspora?'checked':'')+'> диаспора</label>'
   +'<label><input type="checkbox" id="hasPrimary" '+(p?'checked':'')+'> точка на карте (primary)</label>'
   +'</div>'
   +'<div class="primary '+(p?'':'hide')+'" id="primaryBox">'
   +'<label class="fld"><span>Страна ISO</span><input data-k="geo.primary.country_iso" list="dl_country" value="'+esc(p?p.country_iso:'')+'"></label>'
   +'<label class="fld"><span>Регион (рус.)</span><input data-k="geo.primary.region_ru" value="'+esc(p?p.region_ru:'')+'"></label>'
   +'<label class="fld"><span>Широта</span><input data-k="geo.primary.lat" type="number" step="0.01" value="'+esc(p?p.lat:'')+'"></label>'
   +'<label class="fld"><span>Долгота</span><input data-k="geo.primary.lng" type="number" step="0.01" value="'+esc(p?p.lng:'')+'"></label>'
   +'</div>'
   +'<div class="also"><div class="also-h">Также (also[]) <button id="addAlso">+ добавить</button></div><div id="alsoList"></div></div>'
   +'</fieldset>'
   +'<div class="detail-actions"><button id="delLang" class="danger">🗑 Удалить язык</button></div>';
  bindDetail(); renderAlso();
  const ac=detailEl.querySelector('#applyCorr');
  if(ac)ac.addEventListener('click',()=>{ l.writing=l.review.correction; save(); renderList(); renderDetail(); });
}
function bindDetail(){
  const l=D.languages[sel];
  detailEl.querySelectorAll('[data-k]').forEach(el=>{
    const k=el.dataset.k;
    const handler=()=>{
      let v;
      if(el.type==='checkbox')v=el.checked;
      else if(el.type==='number')v=(el.value===''?null:parseFloat(el.value));
      else v=el.value;
      if(k==='weight')v=parseInt(el.value,10);
      setPath(l,k,v);
      if(k==='un' && !v) delete l.un;
      if(k==='writing'){const pw=detailEl.querySelector('.pw');pw.textContent=l.writing||'';detailEl.querySelector('.cp').textContent=cps(l.writing);}
      if(['name_ru','writing','weight','un'].includes(k))renderList();
      save();
    };
    el.addEventListener('input',handler); el.addEventListener('change',handler);
  });
  const ss=detailEl.querySelector('[data-sciso]');
  if(ss)ss.addEventListener('change',()=>{ l.script.iso15924=ss.value; if(SCRIPT_MAP[ss.value])l.script.name_ru=SCRIPT_MAP[ss.value]; save(); renderList(); renderDetail(); });
  const vs=detailEl.querySelector('[data-vsel]');
  if(vs)vs.addEventListener('change',()=>{ const v=vs.value; if(v==='native'){const nn=detailEl.querySelector('#nativeName'); l.verifier='native:'+(nn?nn.value:'');} else l.verifier=v; save(); renderList(); renderDetail(); });
  const nn=detailEl.querySelector('#nativeName');
  if(nn)nn.addEventListener('input',()=>{ l.verifier='native:'+nn.value; save(); renderList(); });
  detailEl.querySelector('#hasPrimary').addEventListener('change',e=>{
    if(e.target.checked){ if(!l.geo.primary)l.geo.primary={country_iso:'',region_ru:'',lat:0,lng:0}; } else l.geo.primary=null;
    save(); renderDetail();
  });
  detailEl.querySelector('#addAlso').addEventListener('click',()=>{ if(!l.geo.also)l.geo.also=[]; l.geo.also.push({country_iso:'',region_ru:''}); save(); renderAlso(); });
  detailEl.querySelector('#delLang').addEventListener('click',()=>{
    if(!confirm('Удалить язык «'+(l.name_ru||l.id)+'»?'))return;
    D.languages.splice(sel,1); if(sel>=D.languages.length)sel=Math.max(0,D.languages.length-1);
    save(); renderList(); renderDetail();
  });
}
function renderAlso(){
  const l=D.languages[sel], box=detailEl.querySelector('#alsoList'); if(!box)return; box.innerHTML='';
  (l.geo.also||[]).forEach((a,j)=>{
    const row=document.createElement('div'); row.className='also-row';
    row.innerHTML='<input placeholder="ISO" list="dl_country" value="'+esc(a.country_iso)+'" data-f="country_iso" style="max-width:90px">'
      +'<input placeholder="регион (рус.)" value="'+esc(a.region_ru)+'" data-f="region_ru"><button class="rm">✕</button>';
    row.querySelectorAll('input').forEach(inp=>inp.addEventListener('input',()=>{a[inp.dataset.f]=inp.value;save();}));
    row.querySelector('.rm').addEventListener('click',()=>{l.geo.also.splice(j,1);save();renderAlso();});
    box.appendChild(row);
  });
}

// ====================== ВКЛАДКА ПРИЁМКА ======================
function renderReview(){
  rgridEl.innerHTML='';
  const langs=D.languages.map((l,idx)=>({l,idx})).sort((a,b)=>b.l.weight-a.l.weight||a.l.name_ru.localeCompare(b.l.name_ru,'ru'));
  langs.forEach(({l,idx})=>{
    const rv=l.review||{};
    if(reviewFilter==='flag' && l.verifier!=='needs-verification') return;
    if(reviewFilter==='todo' && rv.verdict) return;
    if(reviewFilter==='bad' && rv.verdict!=='bad') return;
    const iso=l.script.iso15924, dir=RTL.has(iso)?'rtl':'ltr';
    const region=(l.geo&&l.geo.primary)?l.geo.primary.region_ru:((l.geo&&l.geo.diaspora)?'диаспора':'—');
    const warn=l.verifier==='needs-verification';
    const card=document.createElement('div');
    if(reviewView==='card'){
      // ЧИСТОВАЯ — ровно то, что в производственной карточке Р2; без контролов/вердиктов
      card.className='rcard rcard-clean';
      card.innerHTML=
        '<div class="r2"><div class="r2w" dir="'+dir+'" style="font-family:'+ff(iso)+'">'+esc(l.writing)+'</div>'
        +'<div class="r2n">'+esc(l.name_ru)+'</div>'
        +'<div class="r2e" dir="'+dir+'" style="font-family:'+ff(iso)+'">'+esc(l.endonym)+'</div>'
        +'<div class="r2rows"><b>письмо</b><span>'+esc(l.script.name_ru)+' ('+esc(iso)+')</span><b>семья</b><span>'+esc(l.family)+'</span><b>ареал</b><span>'+esc(region)+'</span><b>источник</b><span>'+esc(l.writing_source)+'</span></div>'
        +'<span class="r2ver '+(warn?'warn':'ok')+'">'+(warn?'⚠ требует проверки носителем':'✓ '+esc(l.verifier))+'</span></div>';
      rgridEl.appendChild(card);
      return;
    }
    // ТЕХНИЧЕСКАЯ — сверка с листом музея + вердикты/контролы
    const spec=SPEC.has(l.id)?'<img src="../assets/mtk38/specimen/'+l.id+'.png" alt="'+esc(l.name_ru)+'">':'<span class="nofile">нет вырезки с листа</span>';
    card.className='rcard'+(l.verifier==='needs-verification'?' flag':'')+(rv.verdict==='ok'?' v-ok':'')+(rv.verdict==='bad'?' v-bad':'');
    card.innerHTML=
      '<div class="rlbl canon">лист музея · контуры (канон)</div>'
      +'<div class="specimen">'+spec+'</div>'
      +'<div class="rlbl">моя расшифровка</div>'
      +'<div class="mine" dir="'+dir+'" style="font-family:'+ff(iso)+'">'+esc(l.writing)+'</div>'
      +'<div class="rcp">'+cps(l.writing)+'</div>'
      +'<div class="rname">'+esc(l.name_ru)+' <span class="rendo" dir="'+dir+'" style="font-family:'+ff(iso)+'">· '+esc(l.endonym)+'</span></div>'
      +'<div class="rrows"><span><b>письмо:</b> '+esc(iso)+' · '+esc(l.script.name_ru)+'</span><span><b>семья:</b> '+esc(l.family)+'</span></div>'
      +'<div class="review-ctl">'
      +'<div class="vbtns"><button class="vok'+(rv.verdict==='ok'?' sel-ok':'')+'">✓ верно</button><button class="vbad'+(rv.verdict==='bad'?' sel-bad':'')+'">✗ неверно</button></div>'
      +'<div class="corrwrap"><input class="corr" dir="'+dir+'" style="font-family:'+ff(iso)+'" placeholder="правильное написание" value="'+esc(rv.correction||'')+'"><button class="apply" title="скопировать в поле «Написание»">→ в написание</button></div>'
      +'<input class="cmt" placeholder="комментарий (необязательно)" value="'+esc(rv.comment||'')+'">'
      +'</div>';
    rgridEl.appendChild(card);
    const ok=card.querySelector('.vok'), bad=card.querySelector('.vbad'), corr=card.querySelector('.corr'), cmt=card.querySelector('.cmt'), apply=card.querySelector('.apply');
    function patch(o){ l.review=Object.assign({},l.review,o,{reviewer:reviewerEl.value||''}); save(); }
    function paint(){ const v=l.review&&l.review.verdict; card.classList.toggle('v-ok',v==='ok'); card.classList.toggle('v-bad',v==='bad');
      ok.classList.toggle('sel-ok',v==='ok'); bad.classList.toggle('sel-bad',v==='bad'); }
    ok.onclick=()=>{ patch({verdict:'ok'}); paint(); };
    bad.onclick=()=>{ patch({verdict:'bad'}); paint(); corr.focus(); };
    corr.oninput=()=>patch({correction:corr.value});
    cmt.oninput=()=>patch({comment:cmt.value});
    apply.onclick=()=>{ if(corr.value){ l.writing=corr.value; save(); renderReview(); } };
  });
}

// ====================== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК + ОБЩЕЕ ======================
function setMode(m){
  mode=m;
  document.getElementById('mode-data').style.display = m==='data'?'flex':'none';
  document.getElementById('mode-review').style.display = m==='review'?'block':'none';
  document.querySelector('.t-data').classList.toggle('hidec',m!=='data');
  document.querySelector('.t-review').classList.toggle('hidec',m!=='review');
  document.querySelectorAll('.modesw button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
  if(m==='data'){ renderList(); renderDetail(); } else renderReview();
}
document.querySelectorAll('.modesw button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
reviewerEl.oninput=()=>localStorage.setItem(RKEY,reviewerEl.value);
document.querySelectorAll('.filters button[data-f]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.filters button[data-f]').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  reviewFilter=b.dataset.f; renderReview();
});
document.querySelectorAll('.vw button[data-vw]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.vw button[data-vw]').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  reviewView=b.dataset.vw; renderReview();
});
document.getElementById('addLang').onclick=()=>{
  D.languages.push({id:'new-'+(D.languages.length+1),name_ru:'Новый язык',endonym:'',writing:'Ленин',
    script:{iso15924:'Latn',name_ru:'Латиница'},family:'',
    geo:{territorial:true,diaspora:false,primary:{country_iso:'',region_ru:'',lat:0,lng:0},also:[]},
    writing_source:'pdf-specimen',verifier:'needs-verification',speakers_mln:0,weight:1,note:''});
  sel=D.languages.length-1; searchEl.value=''; save(); renderList(); renderDetail(); detailEl.scrollTop=0;
};
document.getElementById('export').onclick=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(D,null,2)],{type:'application/json'}));
  a.download='mtk38.json'; a.click();
};
document.getElementById('reset').onclick=()=>{
  if(!confirm('Сбросить все правки (данные и приёмку) к версии из сборки?'))return;
  localStorage.removeItem(KEY); D=clone(DATA); sel=0; document.getElementById('draft').textContent='';
  setMode(mode);
};
searchEl.oninput=renderList;

setMode(location.hash==='#review'?'review':'data');
addEventListener('hashchange',()=>setMode(location.hash==='#review'?'review':'data'));
</script>
</body>
</html>
"""
html = (TEMPLATE.replace("__FACE__", faces)
                .replace("__SCRIPTMAP__", json.dumps(script_map, ensure_ascii=False))
                .replace("__EMBED__", json.dumps(sorted(embed), ensure_ascii=False))
                .replace("__FAMILIES__", json.dumps(families, ensure_ascii=False))
                .replace("__COUNTRIES__", json.dumps(countries, ensure_ascii=False))
                .replace("__SPEC__", json.dumps(have_spec, ensure_ascii=False))
                .replace("__HASH__", data_hash)
                .replace("__DATA__", data_json))
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
un = sum(1 for l in data["languages"] if l.get("un"))
print(f"written: {OUT}  ({len(data['languages'])} языков, UN={un}, specimen={len(have_spec)} · вкладки Данные/Приёмка, hash={data_hash})")
