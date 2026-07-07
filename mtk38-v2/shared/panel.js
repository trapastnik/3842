/* МТК 38 v2 · shared/panel.js — единая панель настроек (выезжает справа, оверлей).
   Классический скрипт (window.Panel), без зависимостей, работает по file://.
   Одна панель на все страницы: общие параметры + каждая композиция. Стили — shared/panel.css
   (подхватываются автоматически рядом со скриптом; можно и вручную <link>).

   API:
     const P = Panel.create({
       title,                 // заголовок
       groups:   [{title, when?(state)->bool, params:[ <control>, … ]}],
       toggles:  [{key,label,value}],                 // верхний блок тумблеров (необязательно)
       segments: [{key,label,when?,options:[[value,label],…],value}],  // верхний блок сегментов
       onChange(key, value, state),
       open=false, hotkey='h', copy=true, reset=true, handleLabel='Настройки'
     });

   <control> внутри group.params — можно смешивать в одной группе (и у каждого свой when):
     слайдер (по умолчанию): {key,label,min,max,step,value,unit?, when?}
     тумблер:               {key,label,value, type:'toggle', when?}
     сегмент:               {key,label,options:[[value,label],…],value, type:'segment', when?}
   Это позволяет собрать связанные настройки (напр. все про цитаты) в ОДИН блок.

   // P.state, P.get(key), P.set(key,value), P.refresh(), P.open(), P.close(), P.toggle(), P.el
*/
(function () {
  (function ensureCss() {
    if (document.getElementById('mtk-panel-css')) return;
    var self = document.currentScript && document.currentScript.src;
    if (!self) return;
    var href = self.replace(/panel\.js(\?.*)?$/, 'panel.css');
    if (href === self) return;
    var link = document.createElement('link');
    link.id = 'mtk-panel-css'; link.rel = 'stylesheet'; link.href = href;
    document.head.appendChild(link);
  })();

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function fmt(v) { return (typeof v === 'number' && !Number.isInteger(v)) ? Math.round(v * 1000) / 1000 : v; }

  function create(opts) {
    opts = opts || {};
    var groups = opts.groups || [], toggles = opts.toggles || [], segments = opts.segments || [];
    var state = {}, defaults = {};
    var valEls = {}, inputEls = {}, togEls = {}, segEls = {}, grpDefs = [], segDefs = [], whenDefs = [];

    function initState(item, isToggle) { state[item.key] = isToggle ? !!item.value : item.value; defaults[item.key] = state[item.key]; }
    groups.forEach(function (g) { (g.params || []).forEach(function (p) { initState(p, p.type === 'toggle'); }); });
    toggles.forEach(function (t) { initState(t, true); });
    segments.forEach(function (s) { initState(s, false); });

    var panel = el('div', 'mtk-panel');
    var head = el('div', 'mtk-panel__head');
    head.appendChild(el('span', 'mtk-panel__title', opts.title || 'Настройки'));
    var closeBtn = el('button', 'mtk-panel__close', '×'); closeBtn.title = 'Свернуть'; head.appendChild(closeBtn);
    panel.appendChild(head);
    var body = el('div', 'mtk-panel__body'); panel.appendChild(body);

    // — конструкторы контролов (переиспользуются и в группах, и в верхних блоках) —
    function buildRange(p) {
      var unit = p.unit || '';
      var row = el('div', 'mtk-row');
      var lab = el('label'); lab.appendChild(el('span', null, p.label));
      var b = el('b', null, fmt(p.value) + unit); lab.appendChild(b); valEls[p.key] = b; b._u = unit;
      row.appendChild(lab);
      var inp = el('input'); inp.type = 'range'; inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.value = p.value;
      inputEls[p.key] = inp;
      inp.addEventListener('input', function () { var v = parseFloat(inp.value); state[p.key] = v; b.textContent = fmt(v) + unit; fire(p.key, v); });
      row.appendChild(inp);
      return row;
    }
    function buildToggle(t) {
      var row = el('div', 'mtk-tog' + (state[t.key] ? ' on' : ''));
      row.appendChild(el('span', null, t.label));
      row.appendChild(el('span', 'mtk-tog__sw'));
      togEls[t.key] = row;
      row.addEventListener('click', function () { var v = !state[t.key]; state[t.key] = v; row.classList.toggle('on', v); fire(t.key, v); });
      return row;
    }
    function buildSegment(s) {
      var wrap = el('div', 'mtk-seg');
      if (s.label) wrap.appendChild(el('span', 'mtk-seg__lab', s.label));
      var btns = el('div', 'mtk-seg__btns');
      s.options.forEach(function (o) {
        var v = o[0], btn = el('button', String(state[s.key]) === String(v) ? 'on' : null, o[1]);
        btn.addEventListener('click', function () {
          state[s.key] = v;
          [].forEach.call(btns.children, function (k) { k.classList.toggle('on', k === btn); });
          fire(s.key, v);
        });
        btns.appendChild(btn);
      });
      wrap.appendChild(btns);
      segEls[s.key] = { wrap: wrap, btns: btns, options: s.options };
      return wrap;
    }
    function buildControl(c) { return c.type === 'toggle' ? buildToggle(c) : c.type === 'segment' ? buildSegment(c) : buildRange(c); }

    // верхние сегменты (композиция/режим)
    segments.forEach(function (s) {
      var wrap = buildSegment(s);
      body.appendChild(wrap);
      segDefs.push({ def: s, el: wrap });
    });

    // группы (смешанные контролы; у каждого может быть свой when)
    groups.forEach(function (g, gi) {
      var ge = el('div', 'mtk-grp' + (gi === 0 && segments.length === 0 ? ' first' : ''));
      if (g.title) ge.appendChild(el('div', 'mtk-grp__t', g.title));
      (g.params || []).forEach(function (p) {
        var ctl = buildControl(p);
        ge.appendChild(ctl);
        if (typeof p.when === 'function') whenDefs.push({ when: p.when, el: ctl });
      });
      body.appendChild(ge); grpDefs.push({ def: g, el: ge });
    });

    // верхние тумблеры
    toggles.forEach(function (t) { body.appendChild(buildToggle(t)); });

    // низ
    if (opts.copy !== false || opts.reset !== false) {
      var foot = el('div', 'mtk-foot');
      if (opts.copy !== false) {
        var cp = el('button', 'copy', 'Скопировать');
        cp.addEventListener('click', function () {
          if (navigator.clipboard) navigator.clipboard.writeText(JSON.stringify(state));
          cp.textContent = 'Скопировано ✓'; setTimeout(function () { cp.textContent = 'Скопировать'; }, 1200);
        });
        foot.appendChild(cp);
      }
      if (opts.reset !== false) {
        var rs = el('button', 'reset', 'Сброс');
        rs.addEventListener('click', function () { Object.keys(defaults).forEach(function (k) { setVal(k, defaults[k]); }); });
        foot.appendChild(rs);
      }
      body.appendChild(foot);
    }

    (opts.mount || document.body).appendChild(panel);

    // язычок-ручка
    var handle = el('button', 'mtk-handle', '<span class="g">⚙</span><span>' + (opts.handleLabel || 'Настройки') + '</span>');
    handle.title = 'Настройки (' + (opts.hotkey || 'H').toUpperCase() + ')';
    document.body.appendChild(handle);

    function open() { panel.classList.add('open'); handle.classList.add('hidden'); }
    function close() { panel.classList.remove('open'); handle.classList.remove('hidden'); }
    function toggle() { panel.classList.contains('open') ? close() : open(); }
    closeBtn.addEventListener('click', close);
    handle.addEventListener('click', open);
    if (opts.open) open();

    var hk = (opts.hotkey || 'h').toLowerCase();
    addEventListener('keydown', function (e) {
      if (/^(input|textarea|select)$/i.test((e.target && e.target.tagName) || '')) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key.toLowerCase() === hk) toggle();
    });

    function refresh() {
      grpDefs.forEach(function (o) { if (typeof o.def.when === 'function') o.el.style.display = o.def.when(state) ? '' : 'none'; });
      segDefs.forEach(function (o) { if (typeof o.def.when === 'function') o.el.style.display = o.def.when(state) ? '' : 'none'; });
      whenDefs.forEach(function (o) { o.el.style.display = o.when(state) ? '' : 'none'; });
    }
    function fire(key, val) { if (opts.onChange) opts.onChange(key, val, state); refresh(); }
    function setVal(key, val) {
      state[key] = val;
      if (valEls[key]) valEls[key].textContent = fmt(val) + (valEls[key]._u || '');
      if (inputEls[key]) inputEls[key].value = val;
      if (togEls[key]) togEls[key].classList.toggle('on', !!val);
      if (segEls[key]) [].forEach.call(segEls[key].btns.children, function (b, i) { b.classList.toggle('on', String(segEls[key].options[i][0]) === String(val)); });
      fire(key, val);
    }

    refresh();
    return { state: state, get: function (k) { return state[k]; }, set: setVal, refresh: refresh, open: open, close: close, toggle: toggle, el: panel };
  }

  window.Panel = { create: create };
})();
