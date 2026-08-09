/* МТК 39 · сцена «Картотека имени».
 * Раздел без географии: тот же свод, но разложенный не по координатам, а по
 * тому, чем объект был. Логика рубрик — от штучного к массовому: сначала то,
 * что существует в единственном экземпляре (астероид, геоглиф, ледокол,
 * канал), потом адреса, поселения, работа, знание и культура.
 *
 * Внутри рубрики карточки сгруппированы по странам, страны — по числу
 * записей: видно и состав рубрики, и её географию, без карты. */

import {
  DATA, STATUS_CLASS, nf, esc, plural, statusLabel,
  objectCardHtml, corpusPicture,
} from "./shared.js?v=3";

// единственное в своём роде — по названию, а не по категории
const ONE_OFF = /геоглиф|мавзолей|ленинланд|leninland|послание|сверхтяжёл|пик ленина|ледокол|астероид|владилена|ульянов \(|комсомол|пионер/i;

const RUBRICS = [
  {
    key: "oneOff",
    test: (r) => ["космос", "судно", "природа", "вода", "награда"].includes(r.kind)
      || ONE_OFF.test(r.name),
  },
  { key: "address", test: (r) => ["улица", "площадь", "проспект", "переулок"].includes(r.kind) },
  { key: "settlement", test: (r) => ["город", "район"].includes(r.kind) },
  { key: "work", test: (r) => ["завод", "электростанция", "колхоз", "транспорт"].includes(r.kind) },
  { key: "mind", test: (r) => ["вуз", "культура", "спорт", "медицина", "парк", "памятник"].includes(r.kind) },
  { key: "rest", test: () => true },
];

const DEFAULTS = { cardW: 420, thumbs: true };

export const catalogScene = {
  id: "catalog",
  title: { ru: "Картотека", en: "Card index", zh: "卡片目录" },
  keepAlive: true,

  preload: {
    data: { corpus: DATA.corpus },
    // Канва не запускает загрузку шрифта сама (находка 40 ядра), а рисует
    // подписи начертанием 600 — просим его явно. Ядро грузит список один раз
    // на приложение, так что дубли в сценах ничего не стоят.
    fonts: ["1em '20 Kopeek'", "600 1em '20 Kopeek'", "1em 'Nolde'", "1em '21 Cent'"],
  },

  settings: [
    { key: "cardW", label: { ru: "Ширина карточки", en: "Card width", zh: "卡片宽度" },
      type: "range", min: 240, max: 720, step: 20, unit: " px", default: 420 },
    { key: "thumbs", label: { ru: "Снимки на карточках", en: "Thumbnails on cards", zh: "卡片缩略图" },
      type: "toggle", default: true },
  ],

  opt: Object.assign({}, DEFAULTS),

  applySettings(values) {
    this.opt = Object.assign({}, DEFAULTS, values || {});
    if (this.api) this.api.rerender();
  },

  mount(el, ctx) {
    const scene = this;
    const app = ctx.app;
    const records = ctx.data.corpus.records;

    const buckets = new Map(RUBRICS.map((r) => [r.key, []]));
    for (const rec of records) {
      buckets.get(RUBRICS.find((r) => r.test(rec)).key).push(rec);
    }

    el.classList.add("m39-scene", "m39-catalog");
    el.innerHTML =
      '<aside class="m39-rail">' +
        '<header class="m39-rail__head"><h1 class="m39-rail__title"></h1>' +
        '<p class="m39-sub"></p></header>' +
        '<nav class="m39-rubrics kiosk-scroll" aria-label="Разделы картотеки"></nav>' +
        '<p class="m39-rail__foot"></p>' +
      "</aside>" +
      '<section class="m39-wallbox">' +
        '<header class="m39-wall__head"><h2 class="m39-wall__title"></h2>' +
        '<p class="m39-wall__note"></p></header>' +
        '<div class="m39-cards kiosk-scroll"></div>' +
      "</section>" +
      '<div class="m39-sheet" hidden><div class="m39-sheet__box kiosk-scroll">' +
        '<button class="m39-sheet__close kiosk-target" type="button">✕</button>' +
        '<div class="m39-card__body"></div></div></div>';

    const railTitle = el.querySelector(".m39-rail__title");
    const sub = el.querySelector(".m39-sub");
    const rubricsHost = el.querySelector(".m39-rubrics");
    const railFoot = el.querySelector(".m39-rail__foot");
    const wallTitle = el.querySelector(".m39-wall__title");
    const wallNote = el.querySelector(".m39-wall__note");
    const cardsHost = el.querySelector(".m39-cards");
    const sheet = el.querySelector(".m39-sheet");
    const sheetBox = el.querySelector(".m39-sheet__box");
    const sheetClose = el.querySelector(".m39-sheet__close");
    const sheetBody = el.querySelector(".m39-card__body");

    let active = RUBRICS[0].key;
    let sheetOpen = false;

    function closeSheet() {
      if (!sheetOpen) return;
      sheetOpen = false;
      sheet.hidden = true;
      sheetBody.innerHTML = "";
    }

    function openSheet(rec) {
      sheetBody.innerHTML = objectCardHtml(app, ctx, rec);
      sheet.hidden = false;
      sheetBox.scrollTop = 0;
      sheetOpen = true;
    }

    function byCountry(items) {
      const map = new Map();
      for (const it of items) {
        const key = it.country || "—";
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(it);
      }
      // страны — по числу записей; внутри страны первыми те, у кого есть рассказ
      const weight = (r) => (r.desc ? r.desc.length : 0) + (r.year_named ? 200 : 0);
      return [...map.entries()]
        .map(([country, list]) => [country, list.sort((a, b) => weight(b) - weight(a))])
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ru"));
    }

    function cardEl(rec) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "m39-card2 kiosk-target " + (STATUS_CLASS.get(rec.status) || "");

      // Снимок берём из преролла (data-URL): loading="lazy" внутри слоя сцены
      // не срабатывает никогда — слой монтируется прозрачным, и браузер
      // откладывает такие картинки навсегда (kiosk README, «подводные камни»).
      const pic = scene.opt.thumbs === false ? null : corpusPicture(ctx, rec.id);
      if (pic) {
        b.classList.add("has-fig");
        const fig = document.createElement("div");
        fig.className = "m39-card2__fig";
        const img = document.createElement("img");
        img.src = pic;
        img.alt = "";
        fig.appendChild(img);
        b.appendChild(fig);
      }

      const year = rec.year_named && rec.year_renamed
        ? `${rec.year_named} — ${rec.year_renamed}`
        : rec.year_named ? `с ${rec.year_named}`
          : rec.year_renamed ? `${app.t("card.renamed")}: ${rec.year_renamed}`
            : statusLabel(app, rec.status);

      const rest = document.createElement("div");
      rest.className = "m39-card2__text";
      rest.innerHTML =
        '<div class="m39-card2__orig">' +
          esc(rec.name_orig && rec.name_orig !== rec.name ? rec.name_orig : "") + "</div>" +
        '<div class="m39-card2__name">' + esc(rec.name) + "</div>" +
        '<div class="m39-card2__where">' +
          esc([rec.city.split(",")[0], rec.country].filter(Boolean).join(" · ")) + "</div>" +
        '<div class="m39-card2__year">' + esc(year) + "</div>";
      b.appendChild(rest);

      b.addEventListener("click", () => openSheet(rec));
      return b;
    }

    function renderRubric(key) {
      active = key;
      const items = buckets.get(key) || [];
      wallTitle.textContent = app.t("rubric." + key);
      wallNote.textContent = app.t("rubric." + key + ".note") + " · " +
        nf.format(items.length) + " " + plural(items.length, "запись", "записи", "записей");

      for (const b of rubricsHost.querySelectorAll("[data-rubric]")) {
        b.setAttribute("aria-pressed", String(b.dataset.rubric === key));
      }

      cardsHost.style.setProperty("--card-w", (scene.opt.cardW || DEFAULTS.cardW) + "px");
      const frag = document.createDocumentFragment();
      for (const [country, list] of byCountry(items)) {
        const group = document.createElement("section");
        group.className = "m39-group";
        const head = document.createElement("div");
        head.className = "m39-group__head";
        head.innerHTML = '<span class="m39-group__name">' + esc(country) + "</span>" +
          '<span class="m39-group__n">' + nf.format(list.length) + "</span>" +
          '<span class="m39-group__line"></span>';
        group.appendChild(head);
        const cards = document.createElement("div");
        cards.className = "m39-cards__grid";
        for (const rec of list) cards.appendChild(cardEl(rec));
        group.appendChild(cards);
        frag.appendChild(group);
      }
      cardsHost.replaceChildren(frag);
      cardsHost.scrollTop = 0;
    }

    function buildRail() {
      rubricsHost.replaceChildren();
      for (const rubric of RUBRICS) {
        const n = (buckets.get(rubric.key) || []).length;
        if (!n) continue;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "m39-rubric kiosk-target";
        b.dataset.rubric = rubric.key;
        b.innerHTML = "<span>" + esc(app.t("rubric." + rubric.key)) + "</span>" +
          '<span class="m39-rubric__n">' + nf.format(n) + "</span>";
        b.addEventListener("click", () => renderRubric(rubric.key));
        rubricsHost.appendChild(b);
      }
    }

    function retext() {
      railTitle.textContent = app.t("catalog.title");
      sub.textContent = app.t("catalog.sub");
      const nCountries = new Set(records.map((r) => r.country)).size;
      railFoot.textContent = app.t("catalog.total", {
        records: nf.format(records.length), countries: nCountries,
      });
      sheetClose.setAttribute("aria-label", app.t("card.close"));
      buildRail();
      renderRubric(active);
    }

    const onClose = () => closeSheet();
    const onBackdrop = (e) => { if (e.target === sheet) closeSheet(); };
    sheetClose.addEventListener("click", onClose);
    sheet.addEventListener("click", onBackdrop);

    this.api = {
      retext,
      rerender: () => renderRubric(active),
      reset() {
        closeSheet();
        renderRubric(RUBRICS[0].key);
      },
      health() {
        const rubrics = rubricsHost.querySelectorAll("[data-rubric]").length;
        const cards = cardsHost.querySelectorAll(".m39-card2").length;
        if (!records.length) return { ok: false, detail: "корпус пуст" };
        if (!rubrics) return { ok: false, detail: "рубрикатор не собран" };
        if (!cards) return { ok: false, detail: "в открытой рубрике ни одной карточки" };
        return { ok: true, detail: "рубрик " + rubrics + ", карточек в рубрике " + cards };
      },
      destroy() {
        closeSheet();
        sheetClose.removeEventListener("click", onClose);
        sheet.removeEventListener("click", onBackdrop);
      },
    };

    retext();
  },

  reset() { if (this.api) this.api.reset(); },
  setLang() { if (this.api) this.api.retext(); },
  setA11y() { if (this.api) this.api.rerender(); },

  healthcheck() {
    return this.api ? this.api.health() : { ok: false, detail: "сцена не смонтирована" };
  },

  unmount() {
    if (this.api) this.api.destroy();
    this.api = null;
  },
};
