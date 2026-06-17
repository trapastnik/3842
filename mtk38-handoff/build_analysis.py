#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор аналитической вкладки mtk38-v2/analysis.html — репрезентативность списка
52 языков + что УЖЕ есть + предложения по дополнению (с контекстом «семья уже представлена»).

Метрики, состав по семьям и охват по регионам — из data/mtk38.json; мировой топ-25 по
носителям и предложения — встроенные константы (знание + оценки).

Запуск:  python3 mtk38-handoff/build_analysis.py
"""
import json, os, collections

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SRC = os.path.join(ROOT, "data", "mtk38.json")
OUT = os.path.join(ROOT, "mtk38-v2", "analysis.html")

CONT = {'RU':'Европа','BY':'Европа','KZ':'Центр. Азия','CN':'Вост. Азия','IN':'Южная Азия',
'BD':'Южная Азия','PK':'Южная Азия','LK':'Южная Азия','MV':'Южная Азия','BT':'Южная Азия',
'MM':'ЮВ. Азия','LA':'ЮВ. Азия','KH':'ЮВ. Азия','TH':'ЮВ. Азия','SG':'ЮВ. Азия','HK':'Вост. Азия',
'JP':'Вост. Азия','KR':'Вост. Азия','KP':'Вост. Азия','AF':'Центр. Азия','IR':'Зап. Азия',
'IL':'Зап. Азия','SA':'Зап. Азия','IQ':'Зап. Азия','EG':'Африка','ET':'Африка','KE':'Африка',
'SS':'Африка','GN':'Африка','ML':'Африка','CI':'Африка','MA':'Африка','DZ':'Африка','AO':'Африка',
'MZ':'Африка','AL':'Европа','XK':'Европа','GR':'Европа','CY':'Европа','BA':'Европа','RS':'Европа',
'ME':'Европа','GE':'Кавказ','AM':'Кавказ','LV':'Европа','LT':'Европа','FR':'Европа','BE':'Европа',
'CH':'Европа','PT':'Европа','GB':'Европа','US':'Сев. Америка','CA':'Сев. Америка','BR':'Юж. Америка',
'PY':'Юж. Америка','AR':'Юж. Америка','BO':'Юж. Америка','TO':'Океания'}

d = json.load(open(SRC, encoding="utf-8"))
L = d["languages"]
countries = set()
for l in L:
    g = l["geo"]
    if g.get("primary"): countries.add(g["primary"]["country_iso"])
    for a in g.get("also", []): countries.add(a["country_iso"])
scripts = {l["script"]["iso15924"] for l in L}
families = {l["family"].split("→")[0].strip() for l in L}
reg = collections.Counter(CONT.get(c, "пр.") for c in countries)
regions = [{"n": k, "v": v} for k, v in reg.most_common()]

ours = []
for l in L:
    g = l["geo"]; c = g["primary"]["country_iso"] if g.get("primary") else None
    ours.append({"n": l["name_ru"], "fam": l["family"], "ft": l["family"].split("→")[0].strip(),
                 "sp": l["speakers_mln"], "sc": l["script"]["iso15924"],
                 "reg": (CONT.get(c, "—") if c else "диаспора")})
ours.sort(key=lambda x: -x["sp"])

stats = {"langs": len(L), "scripts": len(scripts), "countries": len(countries), "families": len(families),
         "regions": regions}
stats_json = json.dumps(stats, ensure_ascii=False)
ours_json = json.dumps(ours, ensure_ascii=False)
nlang = lambda n: f"{n} " + ("язык" if n%10==1 and n%100!=11 else "языка" if 2<=n%10<=4 and not 12<=n%100<=14 else "языков")
NL = nlang(len(L))

HTML = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МТК 38 · аналитика языков и предложения</title>
<style>
  @font-face{font-family:"Nolde";src:url("../mtk38-globe/fonts/nolde/nolde.otf") format("opentype");font-display:swap}
  :root{--brass:#D2B773;--red:#A02128;--blue-grey:#5D8970;--window:#9DA3A8;
    --graphite:#435059;--telegrey:#CFD0CF;--paper:#F7F9EF;--white:#fff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--graphite);
    font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  header{background:var(--graphite);color:var(--paper);padding:14px 24px 0}
  nav{display:flex;gap:6px;margin-bottom:14px}
  nav a{font-size:13px;color:var(--telegrey);text-decoration:none;padding:7px 14px;
    border-radius:8px 8px 0 0;background:rgba(255,255,255,.06)}
  nav a.active{background:var(--paper);color:var(--graphite);font-weight:600}
  header h1{font-family:"Nolde",Georgia,serif;font-weight:400;margin:0 0 14px;font-size:26px}
  header h1 b{color:var(--brass)}
  main{padding:22px 24px 40px;max-width:1100px}
  h2{font-size:18px;font-weight:600;margin:1.8rem 0 4px}
  .sub{color:var(--blue-grey);font-size:13px;margin:0 0 14px}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:8px}
  .card{background:var(--white);border:1px solid var(--telegrey);border-radius:10px;padding:12px 14px}
  .card .lab{font-size:13px;color:var(--window)}
  .card .num{font-size:26px;font-weight:700;color:var(--graphite)}
  .legend{display:flex;gap:16px;font-size:12px;color:var(--graphite);margin:6px 0 12px}
  .legend span{display:flex;align-items:center;gap:5px}
  .sw{width:11px;height:11px;border-radius:2px;display:inline-block}
  .bar{display:flex;align-items:center;gap:8px;margin:3px 0;font-size:13px}
  .bar .nm{width:180px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar .tk{flex:1;background:var(--white);border:1px solid var(--telegrey);border-radius:3px;height:16px}
  .bar .fl{height:100%;border-radius:3px}
  .bar .vl{width:64px;text-align:right;flex-shrink:0;color:var(--window);font-size:12px}
  .famrow{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--telegrey);font-size:13px}
  .famn{width:230px;flex-shrink:0;color:var(--graphite)}
  .famn b{color:var(--brass)}
  .famls{color:var(--blue-grey)}
  .prop{background:var(--white);border:1px solid var(--telegrey);border-left:4px solid var(--brass);
    border-radius:0 10px 10px 0;padding:12px 16px;margin:8px 0}
  .prop.star{border-left-color:var(--red)}
  .prop .h{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
  .prop .nm{font-size:17px;font-weight:700}
  .prop .sp{color:var(--red);font-weight:600;font-size:13px;text-align:right}
  .prop .why{font-size:13px;margin-top:5px}
  .prop .have{font-size:12px;margin-top:7px;padding:6px 9px;border-radius:7px;background:#eef2ec;color:var(--graphite)}
  .prop .have b{color:var(--blue-grey)}
  .verdict{background:#eef2ec;border:1px solid var(--telegrey);border-radius:10px;padding:14px 18px;margin-top:14px}
  .verdict b{color:var(--graphite)}
  footer{padding:18px 24px;color:var(--window);font-size:12px;border-top:1px solid var(--telegrey)}
</style>
</head>
<body>
<header>
  <nav>
    <a href="./index.html">Главная</a>
    <a href="./app.html">Арт-объект</a>
    <a href="./validate.html">Валидация написаний</a>
    <a href="./analysis.html" class="active">Аналитика и предложения</a>
  </nav>
  <h1>Репрезентативность списка: <b>__NL__</b> и мир</h1>
</header>
<main>
  <div class="cards" id="cards"></div>

  <h2>Мировой топ‑25 по носителям — что покрыто</h2>
  <p class="sub">__NL__ списка против самых распространённых языков мира (носители, млн; оценки).</p>
  <div class="legend">
    <span><i class="sw" style="background:#5D8970"></i> в списке</span>
    <span><i class="sw" style="background:#D2B773"></i> частично</span>
    <span><i class="sw" style="background:#A02128"></i> отсутствует</span>
  </div>
  <div id="top25"></div>

  <h2>Уже в списке — __NL__ по семьям</h2>
  <p class="sub">Что у нас уже есть — чтобы сравнить с предложениями ниже.</p>
  <div id="byfam"></div>

  <h2>Территориальный охват — страны по регионам</h2>
  <div id="regions"></div>

  <h2>Пробелы и предложения по дополнению</h2>
  <p class="sub">Крупные языки, которых нет. Но смотрите строку «семья уже в списке»: чаще всего
  ветвь/регион уже представлены родственниками — добавление даст узнаваемость и население,
  а не новую письменность или семью.</p>
  <div id="props"></div>

  <div class="verdict">
    <b>Вывод.</b> Список оптимизирован под <b>разнообразие письменностей</b>, а не под население.
    Почти у каждого крупного «пропуска» в списке уже есть родственник (германские — английский,
    тюркские — уйгурский, индоарийские — авадхи/урду/бенгальский и ещё несколько). Поэтому если
    цель — витрина письменностей и семей, список валиден как есть. Если важна узнаваемость по
    населению — <b>испанский уже добавлен</b> (6 рабочих языков ООН в сборе); при желании
    можно обсудить <b>хинди</b> (хотя индоарийские уже плотно покрыты).
    Числа носителей — оценки.
  </div>
</main>
<footer>Музей В.И. Ленина · МТК 38 «Ленин на языках мира» · аналитика v2 · данные: data/mtk38.json</footer>

<script>
const S = __STATS__;
const OURS = __OURS__;
const TOP=[
 {n:'Английский',sp:1500,s:'in'},{n:'Китайский (мандарин)',sp:1100,s:'in'},
 {n:'Хинди',sp:610,s:'part'},{n:'Испанский',sp:560,s:'in'},
 {n:'Арабский',sp:370,s:'in'},{n:'Французский',sp:310,s:'in'},
 {n:'Бенгальский',sp:270,s:'in'},{n:'Португальский',sp:260,s:'in'},
 {n:'Русский',sp:255,s:'in'},{n:'Урду',sp:230,s:'in'},
 {n:'Индонезийский',sp:200,s:'miss'},{n:'Немецкий',sp:135,s:'miss'},
 {n:'Японский',sp:125,s:'in'},{n:'Нигерийский пиджин',sp:120,s:'miss'},
 {n:'Панджаби',sp:113,s:'in'},{n:'Маратхи',sp:99,s:'miss'},
 {n:'Телугу',sp:95,s:'in'},{n:'Турецкий',sp:90,s:'miss'},
 {n:'Тамильский',sp:87,s:'in'},{n:'Кантонский (юэ)',sp:86,s:'in'},
 {n:'Вьетнамский',sp:85,s:'miss'},{n:'У (китайский)',sp:83,s:'miss'},
 {n:'Корейский',sp:82,s:'in'},{n:'Хауса',sp:80,s:'miss'},
 {n:'Персидский',sp:79,s:'part'}];
const PROPS=[
 {n:'Хинди',sp:610,sc:'деванагари (есть)',fam:'индоарийская',
  why:'Сейчас в списке только авадхи (региональный язык хинди‑пояса). Хинди как таковой — крупнейший язык Индии.'},
 {n:'Индонезийский',sp:200,sc:'латиница (есть)',fam:'австронезийская',
  why:'Лингва‑франка морской Юго‑Восточной Азии (Индонезия — 270 млн).'},
 {n:'Немецкий',sp:135,sc:'латиница (есть)',fam:'германская',
  why:'Крупнейший язык Евросоюза. Ядро Европы сейчас без него.'},
 {n:'Турецкий',sp:90,sc:'латиница (есть)',fam:'тюркская',
  why:'Турецкий — крупнейший тюркский язык.'},
 {n:'Вьетнамский',sp:86,sc:'латиница (есть)',fam:'австроазиатская',
  why:'Крупный язык Юго‑Восточной Азии вне охвата.'}];
const C={in:'#5D8970',part:'#D2B773',miss:'#A02128'};

document.getElementById('cards').innerHTML=[
  ['Языков',S.langs],['Письменностей',S.scripts],['Стран охвата',S.countries],['Языковых семей',S.families]
].map(([l,v])=>`<div class="card"><div class="lab">${l}</div><div class="num">${v}</div></div>`).join('');

function bars(el,rows,max,colorFn,valFn){
  el.innerHTML=rows.map(r=>{const w=Math.max(2,Math.round((r.sp!==undefined?r.sp:r.v)/max*100));
    return `<div class="bar"><div class="nm">${r.n}</div>
      <div class="tk"><div class="fl" style="width:${w}%;background:${colorFn(r)}"></div></div>
      <div class="vl">${valFn(r)}</div></div>`;}).join('');}
bars(document.getElementById('top25'),TOP,1500,r=>C[r.s],
     r=>r.sp>=1000?(r.sp/1000).toFixed(1)+' млрд':r.sp+' млн');
const rmax=Math.max(...S.regions.map(r=>r.v));
bars(document.getElementById('regions'),S.regions,rmax,()=>'#435059',r=>r.v+' стр.');

const fams={}; OURS.forEach(o=>{(fams[o.ft]=fams[o.ft]||[]).push(o.n);});
document.getElementById('byfam').innerHTML=Object.entries(fams).sort((a,b)=>b[1].length-a[1].length)
  .map(([f,ns])=>`<div class="famrow"><span class="famn">${f} <b>(${ns.length})</b></span><span class="famls">${ns.join(', ')}</span></div>`).join('');

const rel=sub=>OURS.filter(o=>o.fam.includes(sub)).map(o=>o.n);
document.getElementById('props').innerHTML=PROPS.map(p=>{
  const r=rel(p.fam);
  const have=r.length
    ? `<b>семья уже в списке (${r.length}):</b> ${r.join(', ')} — добавит население/узнаваемость, не новую ветвь`
    : `семья в списке ещё не представлена`;
  return `<div class="prop${p.star?' star':''}">
    <div class="h"><span class="nm">${p.n}</span><span class="sp">${p.sp} млн<br>${p.sc}</span></div>
    <div class="why">${p.why}</div>
    <div class="have">${have}</div></div>`;}).join('');
</script>
</body>
</html>
"""

html = (HTML.replace("__STATS__", stats_json).replace("__OURS__", ours_json).replace("__NL__", NL))
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written: {OUT}")
print(f"langs {stats['langs']} · scripts {stats['scripts']} · countries {stats['countries']} · families {stats['families']}")
# превью родственников по предложениям
import re
for nm, sub in [("Испанский","романская"),("Хинди","индоарийская"),("Немецкий","германская"),
                ("Индонезийский","австронезийская"),("Турецкий","тюркская"),("Вьетнамский","австроазиатская")]:
    r=[o["n"] for o in ours if sub in o["fam"]]
    print(f"  {nm:14} ← семья «{sub}» уже в списке: {r if r else '—'}")
