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
    '.mtkpub{margin-top:16px;padding-top:14px;border-top:1px solid rgba(210,183,115,.26);display:none}' +
    '.mtkpub.on{display:block}' +
    '.mtkpub-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;min-height:34px}' +
    '.mtkpub-head>span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--window,#9DA3A8)}' +
    '.mtkpub-nav{display:flex;align-items:center;gap:4px}' +
    '.mtkpub-nav button{width:36px;height:36px;border:1px solid rgba(210,183,115,.4);background:transparent;' +
      'color:var(--brass,#D2B773);border-radius:8px;font-size:16px;cursor:pointer;font-family:inherit;padding:0}' +
    '.mtkpub-nav button:disabled{opacity:.3}' +
    '.mtkpub-nav i{font-style:normal;font-size:12px;color:var(--window,#9DA3A8);min-width:46px;text-align:center}' +
    '.mtkpub-body{display:flex;gap:14px;align-items:flex-start}' +
    '.mtkpub-cover{width:104px;flex:0 0 104px;border-radius:5px;display:none}' +
    '.mtkpub-cover.on{display:block}' +
    '.mtkpub-txt{flex:1 1 auto;min-width:0}' +
    '.mtkpub-nat{font-size:15px;color:var(--paper,#F7F9EF);line-height:1.35}' +
    '.mtkpub-ru{font-size:13px;color:#CFD0CF;margin-top:5px;line-height:1.35}' +
    '.mtkpub-imp{font-size:12px;color:var(--window,#9DA3A8);margin-top:7px}' +
    '.mtkpub-none{font-size:12px;color:var(--window,#9DA3A8);font-style:italic}';

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
        q('.mtkpub-nat').textContent = p.titleNative || '';
        q('.mtkpub-ru').textContent = p.titleRu ? (p.titleNative ? '— ' + p.titleRu : p.titleRu) : '';
      } else {
        q('.mtkpub-nat').innerHTML = '<span class="mtkpub-none">описания издания в источнике нет</span>';
        q('.mtkpub-ru').textContent = '';
      }
      var imp = [p.cityRu || p.cityNative, p.publisherRu || p.publisherNative, p.year]
        .filter(Boolean).join(', ');
      q('.mtkpub-imp').textContent = imp + (p.area ? (imp ? ' · ' : '') + p.area : '');
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
