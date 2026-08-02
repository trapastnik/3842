/**
 * Общее для вариантов МТК 40: палитра, корпус, масштаб под киоск, карточка.
 * Классический <script> (не модуль) — кладёт в window.MTK40.
 */
(function (root) {
  // Базовая ширина, под которую подобраны все размеры в вариантах. Реальный
  // кадр — киоск 3840×2160 (49", dpr 1); превью в браузере обычно уже.
  const DESIGN_W = 1280;

  const COLORS = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    graphite: "#435059",
    slate: "#5D6970",
    ink: "#0C1012",
    blue: "#7BA3C0",
  };

  const BUCKET_META = {
    "by-lenin":    { label: "ИМ",    accent: "#A02128", note: "что писал сам Ленин" },
    "in-library":  { label: "ЧИТАЛ", accent: "#5D6970", note: "что читал из чужого" },
    "about-lenin": { label: "О НЁМ", accent: "#D2B773", note: "что писали о нём"    },
  };
  const BUCKETS = ["by-lenin", "in-library", "about-lenin"];

  const CONN_STYLE = {
    "title-borrowing": { color: "#D2B773", width: 2.5, dash: [],      label: "заглавие"  },
    "polemic":         { color: "#A02128", width: 2,   dash: [10, 6], label: "против"    },
    "source":          { color: "#F7F9EF", width: 1.6, dash: [],      label: "источник"  },
    "framework":       { color: "#7BA3C0", width: 1.6, dash: [],      label: "рамка"     },
    "conspectus":      { color: "#D2B773", width: 2,   dash: [2, 4],  label: "конспект"  },
    "wrote-about":     { color: "#7BA3C0", width: 1.6, dash: [10, 6], label: "статья о"  },
    "parallel":        { color: "#9DA3A6", width: 1.6, dash: [3, 3],  label: "параллель" },
  };

  const TYPE_LABEL = {
    brochure: "брошюра", monograph: "монография", philosophy: "философия",
    article: "статья", letters: "письма", letter: "письмо", decree: "декрет",
    "collected-works": "собрание сочинений", notebook: "тетради",
    "newspaper-cycle": "газетный цикл", memoir: "воспоминания",
    biography: "биография", reference: "справочник", poem: "поэма",
    tetralogy: "тетралогия", novel: "роман", essay: "эссе",
    economics: "экономика", manifesto: "манифест",
  };

  const LANG_LABEL = { ru: "русский", de: "немецкий", en: "английский" };

  function rgba(hex, a) {
    const v = hex.replace("#", "");
    return `rgba(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)}, ${a})`;
  }
  function adjustHex(hex, delta) {
    const n = parseInt(hex.replace("#", ""), 16);
    const c = (v) => Math.max(0, Math.min(255, v | 0));
    return `rgb(${c((n >> 16) + delta)},${c(((n >> 8) & 0xff) + delta)},${c((n & 0xff) + delta)})`;
  }

  /**
   * Разбивает строку по словам под заданную ширину.
   * Названия в корпусе длинные («Что такое „друзья народа“ и как они воюют
   * против социал-демократов?»), одной строкой они растягиваются на треть
   * кадра. Меряем по фактической ширине глифов: в корпусе кириллица
   * вперемешку с латиницей, посимвольный лимит врёт.
   * Шрифт должен быть выставлен в ctx до вызова.
   */
  function wrapLines(ctx, text, maxW, maxLines) {
    const fits = (t) => ctx.measureText(t).width <= maxW;
    // слово длиннее строки рубим по буквам, иначе оно вылезет за габарит
    const cut = (word) => {
      let lo = 1, hi = word.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (fits(word.slice(0, mid) + "…")) lo = mid; else hi = mid - 1;
      }
      return word.slice(0, lo) + "…";
    };
    const lines = [];
    let cur = "";
    for (const word of String(text).split(/\s+/)) {
      if (!word) continue;
      const probe = cur ? cur + " " + word : word;
      if (fits(probe)) { cur = probe; continue; }
      if (cur) lines.push(cur);
      if (lines.length >= maxLines) { cur = ""; break; }
      cur = fits(word) ? word : cut(word);
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (!lines.length) return [];
    // не поместившийся хвост обозначаем многоточием на последней строке
    const used = lines.join(" ");
    if (used.length < String(text).replace(/\s+/g, " ").length) {
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = fits(last + "…") ? last + "…" : cut(last);
    }
    return lines;
  }

  /**
   * Подгоняет бэкинг канвы под кадр и считает масштаб.
   * Возвращает { W, H, dpr, s } в пикселях канвы; `s` — одна дизайн-единица.
   * Тем же коэффициентом (--zoom) тянется HTML-обвязка.
   */
  function fitCanvas(canvas, dpr) {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / DESIGN_W;
    document.documentElement.style.setProperty("--zoom", scale);
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    canvas.width = W;
    canvas.height = H;
    return { W, H, dpr, s: dpr * scale, cssW: rect.width, cssH: rect.height };
  }
  function pickDpr() { return Math.min(window.devicePixelRatio || 1, 2); }

  async function loadCorpus() {
    const r = await fetch("../data/mtk40.json?v=" + Date.now());
    const data = await r.json();
    const byId = new Map(data.items.map((i) => [i.id, i]));
    const connsByItem = new Map();
    for (const c of data.connections || []) {
      for (const end of [c.from, c.to]) {
        if (!connsByItem.has(end)) connsByItem.set(end, []);
        connsByItem.get(end).push(c);
      }
    }
    return { data, items: data.items, connections: data.connections || [], byId, connsByItem };
  }

  /** Карточка книги: разметка одинакова во всех вариантах (см. base.css). */
  function Card(el, corpus) {
    const q = (sel) => el.querySelector(sel);
    const connsEl = q(".card__conns");
    const closeBtn = q(".card__close");
    let onClose = null;
    if (closeBtn) closeBtn.addEventListener("click", () => { hide(); if (onClose) onClose(); });

    function show(item) {
      const meta = BUCKET_META[item.bucket];
      q('[data-bind="cat"]').textContent = `${meta.label} · ${item.year_first ?? ""}`;
      q('[data-bind="name"]').textContent = item.title;
      q('[data-bind="author"]').textContent = item.author || "";
      q('[data-bind="where"]').textContent = [
        item.place_first,
        item.pages_approx ? `${item.pages_approx} стр.` : null,
        TYPE_LABEL[item.type] || item.type,
      ].filter(Boolean).join(" · ");
      q('[data-bind="short"]').textContent = item.short_text || "";
      if (connsEl) {
        const conns = corpus.connsByItem.get(item.id) || [];
        if (!conns.length) connsEl.hidden = true;
        else {
          connsEl.innerHTML = "";
          for (const c of conns) {
            const otherId = c.from === item.id ? c.to : c.from;
            const other = corpus.byId.get(otherId);
            const li = document.createElement("li");
            li.innerHTML = `<b>${(CONN_STYLE[c.type] || {}).label || c.type}</b> ` +
              `${c.from === item.id ? "→" : "←"} ${other ? other.title : otherId}`;
            connsEl.appendChild(li);
          }
          connsEl.hidden = false;
        }
      }
      el.hidden = false;
    }
    function hide() { el.hidden = true; }
    return { show, hide, set onClose(fn) { onClose = fn; } };
  }

  root.MTK40 = {
    DESIGN_W, COLORS, BUCKET_META, BUCKETS, CONN_STYLE, TYPE_LABEL, LANG_LABEL,
    rgba, adjustHex, wrapLines, fitCanvas, pickDpr, loadCorpus, Card,
  };
})(window);
