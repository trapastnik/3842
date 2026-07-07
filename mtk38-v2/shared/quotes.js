/* МТК 38 v2 · shared/quotes.js — переиспользуемый слой цитат Ленина (window.Quotes).
   Классический скрипт, без зависимостей, работает по file://. Стили — shared/quotes.css
   (подхватываются автоматически рядом со скриптом). Включается и настраивается на любой странице
   МТК 38, интегрируется с единой панелью shared/panel.js.

   Использование (все настройки цитат — ОДНОЙ группой в панели):
     const q = Quotes.create({ quotes: [{ru,en,work,year}], on:false, mode:'center' });
     Panel.create({
       groups:   [ ...группы_страницы, q.panelGroup() ],   // блок «Цитаты»: тумблер+размещение+параметры
       onChange(key,val,state){ if (q.handle(key,val)) return;  // цитаты сами обрабатывают свои ключи
                                 ...остальное страницы... }
     });
   Ключи панели: quotesOn (тумблер), quoteMode (размещение), qGlow/qBlur/qScrim/qScale (параметры).
   API контроллера: setQuotes(list), setEnabled(bool), setMode(str), setParam(key,val),
                    panelGroup(), handle(key,val).
*/
(function () {
  (function ensureCss() {
    if (document.getElementById('mtk-quotes-css')) return;
    var self = document.currentScript && document.currentScript.src;
    if (!self) return;
    var href = self.replace(/quotes\.js(\?.*)?$/, 'quotes.css');
    if (href === self) return;
    var link = document.createElement('link');
    link.id = 'mtk-quotes-css'; link.rel = 'stylesheet'; link.href = href;
    document.head.appendChild(link);
  })();

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  var MODES = [['center', 'Центр'], ['lower', 'Низ'], ['side', 'Сбоку'], ['scene', 'Сцена'], ['corner', 'Уголок']];
  var PARAM = { qGlow: 'glow', qBlur: 'blur', qScrim: 'scrim', qScale: 'scale' };

  function create(opts) {
    opts = opts || {};
    var quotes = (opts.quotes && opts.quotes.length) ? opts.quotes.slice() : [];
    var enabled = !!opts.on;
    var mode = opts.mode || 'center';
    var interval = opts.interval || 8000;
    var label = opts.label || 'Цитаты Ленина';
    var params = { glow: 1, blur: 16, scrim: 1, scale: 1 };

    // — DOM (один раз на документ) —
    var scrim = document.querySelector('.q-scrim');
    if (!scrim) { scrim = el('div', 'q-scrim'); document.body.appendChild(scrim); }
    var box = document.querySelector('.q-box');
    if (!box) {
      box = el('div', 'q-box',
        '<p class="q-ru"></p>' +
        '<div class="q-attr"><span class="nm">В. И. Ленин</span> · <span class="q-src"></span></div>' +
        '<div class="q-en"></div>');
      document.body.appendChild(box);
    }
    var ru = box.querySelector('.q-ru'), src = box.querySelector('.q-src'), en = box.querySelector('.q-en');

    var qi = -1, cyc = null;
    function setVar(k) { document.documentElement.style.setProperty('--q-' + k, params[k]); }
    Object.keys(params).forEach(setVar);

    function show(n) { var q = quotes[n] || {}; ru.textContent = q.ru || ''; src.textContent = (q.work || '') + (q.year ? (', ' + q.year) : ''); en.textContent = q.en || ''; }
    function cycle() { box.classList.remove('show'); setTimeout(function () { qi = (qi + 1) % Math.max(1, quotes.length); show(qi); box.classList.add('show'); }, 700); }
    function startCycle() { stopCycle(); if (quotes.length > 1) cyc = setInterval(cycle, interval); }
    function stopCycle() { if (cyc) { clearInterval(cyc); cyc = null; } }
    function applyMode() { for (var i = 0; i < MODES.length; i++) document.body.classList.toggle('qm-' + MODES[i][0], MODES[i][0] === mode); }

    function setEnabled(on) {
      enabled = !!on;
      document.body.classList.toggle('q-on', enabled);
      if (enabled) { if (!quotes.length) return; if (qi < 0) qi = 0; show(qi); box.classList.add('show'); startCycle(); }
      else { stopCycle(); box.classList.remove('show'); }
    }
    function setMode(m) { mode = m; applyMode(); }
    function setParam(k, v) { params[k] = v; setVar(k); }

    applyMode();
    document.body.classList.toggle('q-on', enabled);
    if (enabled) setEnabled(true);

    // Весь блок цитат — ОДНОЙ группой панели (тумблер + размещение + параметры вместе).
    // Параметры и размещение показываются только когда цитаты включены (per-control when).
    var onWhen = function (s) { return s.quotesOn; };
    function panelGroup() {
      return { title: 'Цитаты', params: [
        { key: 'quotesOn', type: 'toggle', label: label, value: enabled },
        { key: 'quoteMode', type: 'segment', label: 'Размещение', when: onWhen, value: mode, options: MODES.map(function (m) { return [m[0], m[1]]; }) },
        { key: 'qGlow', label: 'Свечение', min: 0, max: 2.5, step: .05, value: params.glow, when: onWhen },
        { key: 'qBlur', label: 'Разблюр фона', min: 0, max: 40, step: 1, value: params.blur, when: onWhen },
        { key: 'qScrim', label: 'Затемнение', min: 0, max: 1, step: .02, value: params.scrim, when: onWhen },
        { key: 'qScale', label: 'Размер', min: .6, max: 1.8, step: .02, value: params.scale, when: onWhen },
      ] };
    }
    function handle(key, val) {
      if (key === 'quotesOn') { setEnabled(val); return true; }
      if (key === 'quoteMode') { setMode(val); return true; }
      if (PARAM[key]) { setParam(PARAM[key], val); return true; }
      return false;
    }

    return {
      setQuotes: function (list) { quotes = (list || []).slice(); qi = -1; if (enabled) setEnabled(true); },
      setEnabled: setEnabled, setMode: setMode, setParam: setParam,
      panelGroup: panelGroup, handle: handle,
    };
  }

  window.Quotes = { create: create };
})();
