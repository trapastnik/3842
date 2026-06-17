/* МТК 38 v2 · tuner.js — переиспользуемая механика настройки.
   Классический скрипт (window.Tuner), без зависимостей, работает по file://. Тема — бренд-палитра.
   Задумано переиспользовать в других решениях МТК 38 и в других МТК: любой движок (WebGL/Canvas)
   даёт спецификацию параметров + onChange и получает ту же панель.

   API:
     const T = Tuner.create({
       mount,                  // куда монтировать панель (по умолчанию body)
       title,                  // заголовок панели
       groups:   [{title, when?(state)->bool, params:[{key,label,min,max,step,value,unit?}]}],
       toggles:  [{key,label,value}],
       segments: [{key,label,when?,options:[[value,label],...],value}],
       onChange(key, value, state),
       collapsible=true, hotkey='h', copy=true, reset=true
     });
     // T.state, T.get(key), T.set(key,value), T.refresh(), T.el
*/
(function () {
  var C = { brass: '#D2B773', paper: '#F7F9EF', tele: '#CFD0CF', win: '#9DA3A8', graph: '#435059', red: '#A02128' };
  var CSS = ''
    + '.tuner-panel{position:fixed;top:14px;right:14px;width:244px;z-index:20;background:rgba(24,29,33,.86);'
    + 'backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);border:1px solid rgba(210,183,115,.30);'
    + 'border-radius:13px;padding:11px 13px;color:' + C.tele + ';font:12px/1.35 "20 Kopeek",system-ui,sans-serif;'
    + 'max-height:94vh;overflow:auto}'
    + '.tuner-h{display:flex;align-items:center;justify-content:space-between;margin:0 0 4px}'
    + '.tuner-h .t{font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:' + C.brass + '}'
    + '.tuner-h .col{cursor:pointer;color:' + C.win + ';font-size:18px;line-height:1;padding:0 4px;background:none;border:0}'
    + '.tuner-grp{margin:9px 0 4px;border-top:1px solid rgba(210,183,115,.14);padding-top:7px}'
    + '.tuner-grp.first{border-top:0;padding-top:2px}'
    + '.tuner-grp-t{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:' + C.win + ';margin:0 0 5px}'
    + '.tuner-row{margin:6px 0}'
    + '.tuner-row label{display:flex;justify-content:space-between;margin-bottom:2px}'
    + '.tuner-row label b{color:' + C.paper + ';font-weight:600}'
    + '.tuner-panel input[type=range]{width:100%;accent-color:' + C.brass + ';height:15px;margin:0}'
    + '.tuner-tog{display:flex;align-items:center;justify-content:space-between;margin:9px 0;cursor:pointer;user-select:none}'
    + '.tuner-tog .sw{position:relative;width:38px;height:20px;border-radius:11px;background:rgba(157,163,168,.35);'
    + 'transition:background .2s;flex:0 0 auto}'
    + '.tuner-tog .sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;'
    + 'background:' + C.paper + ';transition:left .2s}'
    + '.tuner-tog.on .sw{background:' + C.brass + '}'
    + '.tuner-tog.on .sw::after{left:20px}'
    + '.tuner-seg{margin:9px 0}'
    + '.tuner-seg .lab{display:block;margin-bottom:5px;color:' + C.tele + '}'
    + '.tuner-seg .btns{display:flex;flex-wrap:wrap;gap:4px}'
    + '.tuner-seg button{flex:1 1 auto;background:transparent;border:1px solid rgba(210,183,115,.3);color:' + C.tele + ';'
    + 'font:11px "20 Kopeek",sans-serif;padding:5px 7px;border-radius:6px;cursor:pointer;white-space:nowrap}'
    + '.tuner-seg button.on{background:' + C.brass + ';color:#1a1f23;font-weight:600;border-color:' + C.brass + '}'
    + '.tuner-foot{display:flex;gap:6px;margin-top:11px}'
    + '.tuner-foot button{flex:1;border:0;border-radius:7px;padding:7px;font:600 12px "20 Kopeek",sans-serif;cursor:pointer}'
    + '.tuner-foot .copy{background:' + C.brass + ';color:#1a1f23}'
    + '.tuner-foot .reset{background:transparent;color:' + C.brass + ';border:1px solid ' + C.brass + '}'
    + '.tuner-fab{position:fixed;top:14px;right:14px;z-index:20;display:none;background:rgba(24,29,33,.86);'
    + 'backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);border:1px solid rgba(210,183,115,.3);'
    + 'border-radius:10px;color:' + C.brass + ';font-size:17px;line-height:1;padding:9px 11px;cursor:pointer}';

  var injected = false;
  function inject() { if (injected) return; injected = true; var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function fmt(v) { return (typeof v === 'number' && !Number.isInteger(v)) ? Math.round(v * 1000) / 1000 : v; }

  function create(opts) {
    inject();
    opts = opts || {};
    var mount = opts.mount || document.body;
    var groups = opts.groups || [], toggles = opts.toggles || [], segments = opts.segments || [];
    var state = {}, defaults = {};
    var valEls = {}, inputEls = {}, togEls = {}, segEls = {}, grpEls = [], segDefs = [];

    groups.forEach(function (g) { (g.params || []).forEach(function (p) { state[p.key] = p.value; defaults[p.key] = p.value; }); });
    toggles.forEach(function (t) { state[t.key] = !!t.value; defaults[t.key] = !!t.value; });
    segments.forEach(function (s) { state[s.key] = s.value; defaults[s.key] = s.value; });

    var panel = el('div', 'tuner-panel');
    var head = el('div', 'tuner-h');
    head.appendChild(el('span', 't', opts.title || 'Параметры'));
    var colBtn = el('button', 'col', '–'); colBtn.title = 'Свернуть'; head.appendChild(colBtn);
    panel.appendChild(head);

    groups.forEach(function (g, gi) {
      var ge = el('div', 'tuner-grp' + (gi === 0 ? ' first' : ''));
      if (g.title) ge.appendChild(el('div', 'tuner-grp-t', g.title));
      (g.params || []).forEach(function (p) {
        var unit = p.unit || '';
        var row = el('div', 'tuner-row');
        var lab = el('label');
        lab.appendChild(el('span', null, p.label));
        var b = el('b', null, fmt(p.value) + unit); lab.appendChild(b); valEls[p.key] = b;
        row.appendChild(lab);
        var inp = el('input'); inp.type = 'range'; inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.value = p.value;
        inputEls[p.key] = inp;
        inp.addEventListener('input', function () {
          var v = parseFloat(inp.value); state[p.key] = v; b.textContent = fmt(v) + unit; fire(p.key, v);
        });
        row.appendChild(inp);
        ge.appendChild(row);
      });
      panel.appendChild(ge);
      grpEls.push({ def: g, el: ge });
    });

    toggles.forEach(function (t) {
      var row = el('div', 'tuner-tog' + (state[t.key] ? ' on' : ''));
      row.appendChild(el('span', null, t.label));
      row.appendChild(el('span', 'sw'));
      togEls[t.key] = row;
      row.addEventListener('click', function () { var v = !state[t.key]; state[t.key] = v; row.classList.toggle('on', v); fire(t.key, v); });
      panel.appendChild(row);
    });

    segments.forEach(function (s) {
      var wrap = el('div', 'tuner-seg');
      if (s.label) wrap.appendChild(el('span', 'lab', s.label));
      var btns = el('div', 'btns');
      s.options.forEach(function (o) {
        var v = o[0], lbl = o[1];
        var btn = el('button', state[s.key] === v ? 'on' : null, lbl);
        btn.addEventListener('click', function () {
          state[s.key] = v;
          var kids = btns.children; for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('on', kids[i] === btn);
          fire(s.key, v);
        });
        btns.appendChild(btn);
      });
      wrap.appendChild(btns);
      panel.appendChild(wrap);
      segEls[s.key] = { wrap: wrap, btns: btns };
      segDefs.push({ def: s, el: wrap });
    });

    if (opts.copy !== false || opts.reset !== false) {
      var foot = el('div', 'tuner-foot');
      if (opts.copy !== false) {
        var cp = el('button', 'copy', 'Скопировать');
        cp.addEventListener('click', function () {
          var j = JSON.stringify(state); if (navigator.clipboard) navigator.clipboard.writeText(j);
          cp.textContent = 'Скопировано ✓'; setTimeout(function () { cp.textContent = 'Скопировать'; }, 1200);
        });
        foot.appendChild(cp);
      }
      if (opts.reset !== false) {
        var rs = el('button', 'reset', 'Сброс');
        rs.addEventListener('click', function () { Object.keys(defaults).forEach(function (k) { setVal(k, defaults[k]); }); });
        foot.appendChild(rs);
      }
      panel.appendChild(foot);
    }

    mount.appendChild(panel);

    var fab = el('button', 'tuner-fab', '⚙'); fab.title = 'Параметры'; document.body.appendChild(fab);
    function collapse(on) { panel.style.display = on ? 'none' : ''; fab.style.display = on ? 'block' : 'none'; }
    colBtn.addEventListener('click', function () { collapse(true); });
    fab.addEventListener('click', function () { collapse(false); });
    if (opts.collapsed) collapse(true);
    if (opts.collapsible !== false) {
      var hk = opts.hotkey || 'h';
      addEventListener('keydown', function (e) {
        if (e.key !== hk) return;
        if (/^(input|textarea|select)$/i.test((e.target && e.target.tagName) || '')) return;
        collapse(panel.style.display !== 'none');
      });
    }

    function refresh() {
      grpEls.forEach(function (o) { if (typeof o.def.when === 'function') o.el.style.display = o.def.when(state) ? '' : 'none'; });
      segDefs.forEach(function (o) { if (typeof o.def.when === 'function') o.el.style.display = o.def.when(state) ? '' : 'none'; });
    }
    function fire(key, val) { if (opts.onChange) opts.onChange(key, val, state); refresh(); }
    function setVal(key, val) {
      state[key] = val;
      if (valEls[key]) valEls[key].textContent = fmt(val) + ((valEls[key]._u) || '');
      if (inputEls[key]) inputEls[key].value = val;
      if (togEls[key]) togEls[key].classList.toggle('on', !!val);
      if (segEls[key]) { var kids = segEls[key].btns.children; for (var i = 0; i < kids.length; i++) { var bv = kids[i]; bv.classList.toggle('on', bv.textContent != null && segValueOf(key, bv) === val); } }
      fire(key, val);
    }
    // helper: match segment button to value via stored option order
    function segValueOf(key, btnEl) {
      var seg = null; segments.forEach(function (s) { if (s.key === key) seg = s; });
      if (!seg) return null;
      var idx = Array.prototype.indexOf.call(btnEl.parentNode.children, btnEl);
      return seg.options[idx] ? seg.options[idx][0] : null;
    }
    // remember unit for value labels (for setVal)
    groups.forEach(function (g) { (g.params || []).forEach(function (p) { if (valEls[p.key]) valEls[p.key]._u = p.unit || ''; }); });

    refresh();
    return { state: state, get: function (k) { return state[k]; }, set: setVal, refresh: refresh, el: panel };
  }

  window.Tuner = { create: create };
})();
