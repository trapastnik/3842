/* МТК 38 v2 · shared/publication.js — блок «Издание» для карточки языка.
   Обложка, заглавие на языке издания, русский перевод, город/издательство/год.
   Если изданий несколько (испанский — 10, английский — 5) — переключатель ‹ N/M ›.

   Почему отдельный файл, а не общий с v3: v2 намеренно живёт на классических
   скриптах (страницы должны открываться и с file://), v3 — на ES-модулях, где
   тот же блок встроен в engine/card.js. Контракт данных общий —
   MTK38Data.loadPublications() / engine/data.js → loadPublications().

   Использование:
     var pub = MTK38Pub.create();          // вернёт DOM-узел, вставить в карточку
     await pub.ready;                      // загрузка data/mtk38-publications.json
     pub.show(langId);                     // отрисовать (или скрыть, если изданий нет)
*/
(function () {
  var CSS = '' +
    '.mtkpub{margin-top:22px;padding-top:18px;border-top:1px solid rgba(210,183,115,.2);display:none}' +
    '.mtkpub.on{display:block}' +
    '.mtkpub-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;min-height:38px}' +
    '.mtkpub-head>span{font-family:\'20 Kopeek\',ui-monospace,monospace;font-size:11px;letter-spacing:.16em;' +
      'text-transform:uppercase;color:var(--window,#9DA3A8)}' +
    '.mtkpub-nav{display:flex;align-items:center;gap:6px}' +
    '.mtkpub-nav button{width:38px;height:38px;border:1px solid rgba(210,183,115,.34);background:transparent;' +
      'color:var(--brass,#D2B773);border-radius:9px;font-size:17px;cursor:pointer;font-family:inherit;padding:0;line-height:1}' +
    '.mtkpub-nav button:disabled{opacity:.28}' +
    '.mtkpub-nav i{font-style:normal;font-family:\'20 Kopeek\',ui-monospace,monospace;font-size:12px;' +
      'color:var(--window,#9DA3A8);min-width:48px;text-align:center}' +
    '.mtkpub-body{display:flex;gap:20px;align-items:flex-start}' +
    '.mtkpub-cover{width:132px;flex:0 0 132px;border-radius:3px;display:none;' +
      'border:1px solid rgba(210,183,115,.22);box-shadow:0 8px 26px rgba(0,0,0,.5)}' +
    '.mtkpub-cover.on{display:block}' +
    '.mtkpub-txt{flex:1 1 auto;min-width:0}' +
    '.mtkpub-nat{font-size:18px;line-height:1.35;color:var(--paper,#F7F9EF);white-space:pre-line}' +
    '.mtkpub-ru{font-size:15px;line-height:1.4;color:#CFD0CF;margin-top:8px}' +
    '.mtkpub-imp{font-family:\'20 Kopeek\',ui-monospace,monospace;font-size:12px;letter-spacing:.04em;' +
      'color:var(--brass,#D2B773);margin-top:12px}' +
    '.mtkpub-imp em{font-style:normal;color:var(--window,#9DA3A8)}' +
    '.mtkpub-none{font-size:14px;color:var(--window,#9DA3A8);font-style:italic}';

  function create() {
    if (!document.getElementById('mtkpub-css')) {
      var st = document.createElement('style');
      st.id = 'mtkpub-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    var el = document.createElement('div');
    el.className = 'mtkpub';
    el.innerHTML =
      '<div class="mtkpub-head"><span>издание</span>' +
        '<div class="mtkpub-nav"><button class="p" aria-label="предыдущее издание">‹</button>' +
        '<i></i><button class="n" aria-label="следующее издание">›</button></div></div>' +
      '<div class="mtkpub-body"><img class="mtkpub-cover" alt="">' +
        '<div class="mtkpub-txt"><div class="mtkpub-nat"></div>' +
        '<div class="mtkpub-ru"></div><div class="mtkpub-imp"></div></div></div>';

    var q = function (s) { return el.querySelector(s); };
    var byLang = {}, list = [], idx = 0;

    var ready = (window.MTK38Data && window.MTK38Data.loadPublications)
      ? window.MTK38Data.loadPublications().then(function (m) { byLang = m || {}; })
      : Promise.resolve();

    function render() {
      if (!list.length) { el.classList.remove('on'); return; }
      el.classList.add('on');
      var p = list[idx];
      q('.mtkpub-nav').style.visibility = list.length > 1 ? 'visible' : 'hidden';
      q('.mtkpub-nav i').textContent = (idx + 1) + ' / ' + list.length;
      q('.p').disabled = idx === 0;
      q('.n').disabled = idx === list.length - 1;

      var img = q('.mtkpub-cover');
      if (p.covers && p.covers.length) {
        img.classList.add('on');
        img.onerror = function () { img.classList.remove('on'); };
        img.src = p.covers[0];
      } else { img.classList.remove('on'); img.removeAttribute('src'); }

      if (p.titleNative || p.titleRu) {
        // если заглавия на языке издания нет — крупно ставим русское, а не пустую строку
        q('.mtkpub-nat').textContent = p.titleNative || p.titleRu;
        q('.mtkpub-ru').textContent = (p.titleNative && p.titleRu) ? p.titleRu : '';
      } else {
        q('.mtkpub-nat').innerHTML = '<span class="mtkpub-none">описания издания в источнике нет</span>';
        q('.mtkpub-ru').textContent = '';
      }
      var imp = [p.cityRu || p.cityNative, p.publisherRu || p.publisherNative, p.year]
        .filter(Boolean).join(' · ');
      q('.mtkpub-imp').innerHTML = imp
        + (p.area ? (imp ? ' <em>· </em>' : '') + '<em>' + p.area + '</em>' : '');
    }

    q('.p').onclick = function (e) { e.stopPropagation(); if (idx > 0) { idx--; render(); } };
    q('.n').onclick = function (e) { e.stopPropagation(); if (idx < list.length - 1) { idx++; render(); } };

    return {
      dom: el, ready: ready,
      show: function (langId) { list = byLang[langId] || []; idx = 0; render(); }
    };
  }

  window.MTK38Pub = { create: create };
})();
