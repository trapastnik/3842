/* МТК 38 · assets/mtk38/lib/card.js — карточка языка для прототипов V1.

   Классический скрипт (V1 живёт без модулей). Разметка и вид — те же, что были
   в карточке mtk38-map: центр экрана, затемнение позади, написание крупно,
   название языка латунным моноширинным, факты строками, подсказка внизу.
   Тот же макет теперь и в V3 (mtk38-v3/engine/card.js), поэтому карточка
   выглядит одинаково во всех поколениях.

   Издание подтягивается из data/mtk38-publications.json по `id` записи
   (ISO 639-3). У записей V1 своего id не было — он проставлен таблицей
   в каждом прототипе; без id карточка просто покажет язык без издания.

   Использование:
     var card = MTK38Card.create();      // один раз
     card.open({ text, lang, langRu, script, region, speakers, id });
*/
(function () {
  var CSS = ''
    + '.v1card-back{position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.55);'
    +   'backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);'
    +   'opacity:0;visibility:hidden;transition:opacity .28s ease,visibility .28s;cursor:pointer}'
    + '.v1card-back.is-open{opacity:1;visibility:visible}'
    + '.v1card{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(.96);z-index:901;'
    +   'width:min(720px,86vw);max-height:88vh;overflow-y:auto;-webkit-overflow-scrolling:touch;'
    +   'padding:clamp(24px,3vw,44px) clamp(28px,4vw,56px);'
    +   'background:rgba(18,22,26,.94);border:1.5px solid var(--brass,#D2B773);border-radius:18px;'
    +   'color:var(--paper,#F7F9EF);font-family:"21 Cent",Georgia,serif;text-align:center;'
    +   'box-shadow:0 24px 80px rgba(0,0,0,.75);isolation:isolate;overflow-x:hidden;'
    +   'opacity:0;visibility:hidden;transition:opacity .28s ease,transform .28s ease,visibility .28s}'
    + '.v1card.is-open{opacity:1;visibility:visible;transform:translate(-50%,-50%) scale(1)}'
    /* фирменные диагонали: латунный волосок и красная полоса */
    + '.v1card::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:-1;opacity:.55;'
    +   'background:linear-gradient(105deg,transparent 0,transparent 86%,var(--red,#A02128) 86%,'
    +   'var(--red,#A02128) 92%,transparent 92.2%),'
    +   'linear-gradient(105deg,transparent 0,transparent 64%,var(--brass,#D2B773) 64%,'
    +   'var(--brass,#D2B773) 64.16%,transparent 64.32%)}'
    + '.v1card .x{position:absolute;top:10px;right:12px;width:44px;height:44px;line-height:44px;'
    +   'text-align:center;cursor:pointer;color:var(--window,#9DA3A8);font-size:20px;border-radius:10px}'
    + '.v1card .w{font-family:"Nolde",Georgia,serif;font-weight:600;font-size:clamp(52px,7vw,108px);'
    +   'line-height:1;color:var(--paper,#F7F9EF);text-shadow:0 6px 28px rgba(0,0,0,.75);word-break:break-word}'
    + '.v1card .head{margin:12px 0 20px;display:flex;flex-direction:column;gap:6px;align-items:center}'
    + '.v1card .n{font-family:"20 Kopeek",ui-monospace,monospace;font-size:clamp(18px,2vw,28px);'
    +   'letter-spacing:.22em;text-transform:uppercase;color:var(--brass,#D2B773)}'
    + '.v1card .e{font-size:clamp(14px,1.3vw,18px);color:rgba(247,249,239,.5)}'
    + '.v1card .rows{display:grid;gap:10px;margin-bottom:18px;text-align:left}'
    + '.v1card .rows>div{display:grid;grid-template-columns:clamp(130px,26%,210px) 1fr;gap:18px;'
    +   'align-items:baseline;font-size:clamp(14px,1.2vw,18px);padding-bottom:8px;'
    +   'border-bottom:1px solid rgba(210,183,115,.18)}'
    + '.v1card .rows>div:last-child{border-bottom:none}'
    + '.v1card .rows b{font-family:"20 Kopeek",ui-monospace,monospace;font-weight:400;font-size:.78em;'
    +   'letter-spacing:.16em;text-transform:uppercase;color:rgba(247,249,239,.55)}'
    + '.v1card .pub{margin-top:4px;padding-top:18px;border-top:1px solid rgba(210,183,115,.22);'
    +   'display:none;text-align:left}'
    + '.v1card .pub.on{display:block}'
    + '.v1card .pub-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;'
    +   'min-height:38px}'
    + '.v1card .pub-head>span{font-family:"20 Kopeek",ui-monospace,monospace;font-size:11px;'
    +   'letter-spacing:.18em;text-transform:uppercase;color:rgba(247,249,239,.45)}'
    + '.v1card .nav{display:flex;align-items:center;gap:6px}'
    + '.v1card .nav button{width:38px;height:38px;border:1px solid rgba(210,183,115,.34);background:transparent;'
    +   'color:var(--brass,#D2B773);border-radius:999px;font-size:17px;cursor:pointer;font-family:inherit;padding:0}'
    + '.v1card .nav button:disabled{opacity:.28}'
    + '.v1card .nav i{font-style:normal;font-family:"20 Kopeek",ui-monospace,monospace;font-size:12px;'
    +   'color:rgba(247,249,239,.45);min-width:48px;text-align:center}'
    + '.v1card .pub-body{display:flex;gap:22px;align-items:flex-start}'
    + '.v1card .cover{width:132px;flex:0 0 132px;border-radius:3px;display:none;'
    +   'border:1px solid rgba(210,183,115,.22);box-shadow:0 8px 26px rgba(0,0,0,.5)}'
    + '.v1card .cover.on{display:block}'
    + '.v1card .pub-txt{flex:1 1 auto;min-width:0}'
    + '.v1card .t-nat{font-size:clamp(17px,1.5vw,21px);line-height:1.35;color:var(--paper,#F7F9EF)}'
    + '.v1card .t-ru{font-size:15px;line-height:1.4;color:rgba(247,249,239,.62);margin-top:8px}'
    + '.v1card .imp{font-family:"20 Kopeek",ui-monospace,monospace;font-size:12px;letter-spacing:.06em;'
    +   'color:var(--brass,#D2B773);margin-top:14px}'
    + '.v1card .imp em{font-style:normal;color:rgba(247,249,239,.42)}'
    + '.v1card .hint{margin-top:18px;font-family:"20 Kopeek",ui-monospace,monospace;'
    +   'font-size:clamp(11px,1.1vw,13px);letter-spacing:.18em;text-transform:uppercase;'
    +   'color:rgba(247,249,239,.42)}'
    + '@media (max-width:560px){.v1card{padding:24px 20px}.v1card .cover{width:96px;flex:0 0 96px}'
    +   '.v1card .rows>div{grid-template-columns:1fr;gap:4px}}';

  // русские названия письменностей V1 (в записях лежат латинские ключи)
  var SCRIPTS = {
    latin: 'Латиница', cyrillic: 'Кириллица', arabic: 'Арабица', hebrew: 'Еврейская',
    greek: 'Греческая', armenian: 'Армянская', georgian: 'Грузинская', devanagari: 'Деванагари',
    bengali: 'Бенгальская', tamil: 'Тамильская', telugu: 'Телугу', kannada: 'Каннада',
    malayalam: 'Малаялам', gurmukhi: 'Гурмукхи', sinhala: 'Сингальская', ethiopic: 'Эфиопская',
    lao: 'Лаосская', khmer: 'Кхмерская', myanmar: 'Бирманская', thai: 'Тайская',
    han: 'Китайская', kana: 'Японская', hangul: 'Корейская', tibetan: 'Тибетская'
  };

  // data/mtk38-publications.json лежит на два-три уровня выше — пробуем варианты
  var PUB_URLS = ['../data/mtk38-publications.json', '../../data/mtk38-publications.json',
                  '/data/mtk38-publications.json'];
  var PUB_BASE = ['../', '../../', '/'];

  function loadPublications() {
    var i = 0;
    function next() {
      if (i >= PUB_URLS.length) return Promise.resolve({});
      var base = PUB_BASE[i];
      return fetch(PUB_URLS[i++]).then(function (r) {
        if (!r.ok) throw 0;
        return r.json();
      }).then(function (d) {
        var by = {};
        (d.publications || []).forEach(function (p) {
          if (!p.lang_id) return;
          (by[p.lang_id] = by[p.lang_id] || []).push({
            titleNative: p.title_native || '', titleRu: p.title_ru || '',
            city: p.city_ru || p.city_native || '', publisher: p.publisher_ru || p.publisher_native || '',
            year: p.year || '', area: p.area || '',
            covers: (p.covers || []).map(function (c) { return base + c; })
          });
        });
        return by;
      }).catch(next);
    }
    return next();
  }

  function fmtSpeakers(m) {
    if (typeof m !== 'number' || !isFinite(m)) return '';
    if (m >= 1000) { var b = m / 1000; return '≈ ' + (b >= 10 ? b.toFixed(0) : b.toFixed(1)).replace('.', ',') + ' млрд носителей'; }
    return '≈ ' + m + ' млн носителей';
  }

  function create() {
    if (!document.getElementById('v1card-css')) {
      var st = document.createElement('style');
      st.id = 'v1card-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    var back = document.createElement('div');
    back.className = 'v1card-back';
    var el = document.createElement('div');
    el.className = 'v1card';
    el.setAttribute('role', 'dialog');
    el.innerHTML =
      '<span class="x">✕</span><div class="w"></div>' +
      '<div class="head"><span class="n"></span><span class="e"></span></div>' +
      '<div class="rows"></div>' +
      '<div class="pub"><div class="pub-head"><span>издание</span>' +
        '<div class="nav"><button class="p" aria-label="предыдущее издание">‹</button><i></i>' +
        '<button class="nx" aria-label="следующее издание">›</button></div></div>' +
        '<div class="pub-body"><img class="cover" alt="">' +
        '<div class="pub-txt"><div class="t-nat"></div><div class="t-ru"></div><div class="imp"></div></div>' +
      '</div></div>' +
      '<div class="hint">коснитесь снаружи, чтобы закрыть</div>';
    document.body.appendChild(back);
    document.body.appendChild(el);

    var q = function (s) { return el.querySelector(s); };
    var byLang = {}, list = [], idx = 0, open = false;
    loadPublications().then(function (m) { byLang = m || {}; });

    function close() { open = false; el.classList.remove('is-open'); back.classList.remove('is-open'); }
    back.addEventListener('click', close);
    q('.x').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    function renderPub() {
      var box = q('.pub');
      if (!list.length) { box.classList.remove('on'); return; }
      box.classList.add('on');
      var p = list[idx];
      q('.nav').style.visibility = list.length > 1 ? 'visible' : 'hidden';
      q('.nav i').textContent = (idx + 1) + ' / ' + list.length;
      q('.p').disabled = idx === 0;
      q('.nx').disabled = idx === list.length - 1;
      var img = q('.cover');
      if (p.covers && p.covers.length) {
        img.classList.add('on');
        img.onerror = function () { img.classList.remove('on'); };
        img.src = p.covers[0];
      } else { img.classList.remove('on'); img.removeAttribute('src'); }
      q('.t-nat').textContent = p.titleNative || p.titleRu || '';
      q('.t-ru').textContent = (p.titleNative && p.titleRu) ? p.titleRu : '';
      var imp = [p.city, p.publisher, p.year].filter(Boolean).join(' · ');
      q('.imp').innerHTML = imp + (p.area ? (imp ? ' <em>· </em>' : '') + '<em>' + p.area + '</em>' : '');
    }
    q('.p').addEventListener('click', function () { if (idx > 0) { idx--; renderPub(); } });
    q('.nx').addEventListener('click', function () { if (idx < list.length - 1) { idx++; renderPub(); } });

    return {
      isOpen: function () { return open; },
      close: close,
      open: function (entry) {
        if (!entry) return;
        q('.w').textContent = entry.text;
        q('.n').textContent = entry.langRu || entry.lang || '';
        q('.e').textContent = (entry.langRu && entry.lang && entry.langRu !== entry.lang) ? entry.lang : '';
        var row = function (k, v) { return '<div><b>' + k + '</b><span>' + v + '</span></div>'; };
        var sp = fmtSpeakers(entry.speakers);
        q('.rows').innerHTML =
          (entry.region ? row('регион', entry.region) : '') +
          (sp ? row('носители', sp) : '') +
          row('письменность', SCRIPTS[entry.script] || entry.script || '—');
        list = (entry.id && byLang[entry.id]) || [];
        idx = 0;
        renderPub();
        el.scrollTop = 0;
        open = true;
        back.classList.add('is-open');
        el.classList.add('is-open');
      }
    };
  }

  window.MTK38Card = { create: create };
})();
