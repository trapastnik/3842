/* МТК 39 · «Картотека имени».
   Раздел без географии: тот же свод, но разложенный не по координатам, а по тому,
   чем объект был. Логика рубрик — от штучного к массовому: сначала то, что
   существует в единственном экземпляре (астероид, геоглиф, ледокол, канал),
   потом адреса, поселения, работа, знание и культура.

   Внутри рубрики карточки сгруппированы по странам, страны — по числу записей:
   так видно и состав рубрики, и её географию, без карты. */

const SRC = "../data/mtk39-corpus.json";

const STATUS_CLASS = {
  "носит имя": "card--live",
  переименован: "card--gone",
  утрачен: "card--lost",
};
const STATUS_LABEL = {
  "носит имя": "носит имя сегодня",
  переименован: "переименовано",
  утрачен: "утрачено",
};

// единственное в своём роде — по названию, а не по категории
const ONE_OFF = /геоглиф|мавзолей|ленинланд|leninland|послание|сверхтяжёл|пик ленина|ледокол|астероид|владилена|ульянов \(|комсомол|пионер/i;

const RUBRICS = [
  {
    key: "one-off",
    name: "Штучное",
    note: "Объекты, существующие в единственном экземпляре: небесные тела, суда, "
      + "каналы, вершины, геоглиф в тайге и парк-музей в литовском лесу.",
    test: (r) => ["космос", "судно", "природа", "вода", "награда"].includes(r.kind)
      || ONE_OFF.test(r.name),
  },
  {
    key: "address",
    name: "Адреса",
    note: "Улицы, площади, проспекты и бульвары — то, чем имя становится, когда его "
      + "пишут на табличке. Основная масса зарубежной части свода.",
    test: (r) => ["улица", "площадь", "проспект", "переулок"].includes(r.kind),
  },
  {
    key: "settlement",
    name: "Поселения",
    note: "Города, посёлки, сёла, районы и области, названные именем Ленина. "
      + "Почти всё — бывший Советский Союз, и почти всё переименовано.",
    test: (r) => ["город", "район"].includes(r.kind),
  },
  {
    key: "work",
    name: "Работа",
    note: "Заводы, комбинаты, электростанции, шахты, колхозы, метро и железные "
      + "дороги. Имя как знак качества индустриального объекта.",
    test: (r) => ["завод", "электростанция", "колхоз", "транспорт"].includes(r.kind),
  },
  {
    key: "mind",
    name: "Знание и культура",
    note: "Институты, школы, библиотеки, музеи, театры, стадионы и больницы — "
      + "учреждения, которым имя давали как обязательство.",
    test: (r) => ["вуз", "культура", "спорт", "медицина", "парк", "памятник"].includes(r.kind),
  },
  {
    key: "rest",
    name: "Прочее",
    note: "Всё, что не уложилось в рубрики: дома культуры, газеты, тресты, "
      + "организации, объединения — и записи, которые ещё ждут разбора.",
    test: () => true,
  },
];

const nf = new Intl.NumberFormat("ru-RU");

let records = [];
let buckets = new Map();
let active = RUBRICS[0].key;

/* ------------------------------------------------------------------ раскладка */

function assign(all) {
  const map = new Map(RUBRICS.map((r) => [r.key, []]));
  for (const rec of all) {
    const rubric = RUBRICS.find((r) => r.test(rec));
    map.get(rubric.key).push(rec);
  }
  return map;
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

/* ------------------------------------------------------------------ отрисовка */

function cardEl(rec, openSheet) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `card ${STATUS_CLASS[rec.status] || ""}`;

  const orig = document.createElement("div");
  orig.className = "card__orig";
  orig.textContent = rec.name_orig && rec.name_orig !== rec.name ? rec.name_orig : "";
  b.appendChild(orig);

  const name = document.createElement("div");
  name.className = "card__name";
  name.textContent = rec.name;
  b.appendChild(name);

  const where = document.createElement("div");
  where.className = "card__where";
  where.textContent = [rec.city.split(",")[0], rec.country].filter(Boolean).join(" · ");
  b.appendChild(where);

  const year = document.createElement("div");
  year.className = "card__year";
  year.textContent = rec.year_named && rec.year_renamed
    ? `${rec.year_named} — ${rec.year_renamed}`
    : rec.year_named ? `с ${rec.year_named}`
      : rec.year_renamed ? `имя снято в ${rec.year_renamed}`
        : STATUS_LABEL[rec.status] || "";
  b.appendChild(year);

  b.addEventListener("click", () => openSheet(rec));
  return b;
}

function renderRubric(key, openSheet) {
  active = key;
  const rubric = RUBRICS.find((r) => r.key === key);
  const items = buckets.get(key) || [];

  document.querySelector("[data-rubric-title]").textContent = rubric.name;
  document.querySelector("[data-rubric-note]").textContent =
    `${rubric.note} · ${nf.format(items.length)} ${plural(items.length, "запись", "записи", "записей")}`;

  for (const b of document.querySelectorAll("[data-rubric]")) {
    b.setAttribute("aria-pressed", String(b.dataset.rubric === key));
  }

  const host = document.querySelector("[data-cards]");
  host.replaceChildren();
  const frag = document.createDocumentFragment();
  for (const [country, list] of byCountry(items)) {
    const group = document.createElement("section");
    group.className = "group";

    const head = document.createElement("div");
    head.className = "group__head";
    head.innerHTML = `<span class="group__name">${country}</span>`
      + `<span class="group__n">${nf.format(list.length)}</span>`
      + '<span class="group__line"></span>';
    group.appendChild(head);

    const cards = document.createElement("div");
    cards.className = "cards";
    for (const rec of list) cards.appendChild(cardEl(rec, openSheet));
    group.appendChild(cards);
    frag.appendChild(group);
  }
  host.appendChild(frag);
  host.scrollTop = 0;
}

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

/* ------------------------------------------------------------------ карточка */

function makeSheet() {
  const sheet = document.getElementById("sheet");
  const close = () => { sheet.hidden = true; };
  sheet.querySelector(".sheet__close").addEventListener("click", close);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  return (rec) => {
    sheet.querySelector("[data-orig]").textContent =
      rec.name_orig && rec.name_orig !== rec.name ? rec.name_orig : "";
    // длинные «цепочки переименований» набирать Nolde нельзя — нечитаемо;
    // на них переходим к основному шрифту и меньшему кеглю
    const nameEl = sheet.querySelector("[data-name]");
    nameEl.textContent = rec.name;
    nameEl.classList.toggle("sheet__name--long", rec.name.length > 62);
    nameEl.classList.toggle("sheet__name--xlong", rec.name.length > 110);
    sheet.querySelector("[data-where]").textContent =
      [rec.city, rec.country].filter(Boolean).join(" · ");
    sheet.querySelector("[data-desc]").textContent = rec.desc || "";

    const facts = sheet.querySelector("[data-facts]");
    facts.replaceChildren();
    const rows = [["судьба имени", STATUS_LABEL[rec.status] || rec.status]];
    if (rec.year_named) rows.push(["имя присвоено", rec.year_named]);
    if (rec.year_renamed) rows.push(["имя снято", rec.year_renamed]);
    rows.push(["часть света", rec.continent]);
    if (rec.lat === null) rows.push(["на карте", "координаты не найдены"]);
    for (const [k, v] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      facts.append(dt, dd);
    }
    sheet.hidden = false;
  };
}

/* ------------------------------------------------------------------ простой

   Музейный киоск: посетитель ушёл, оставив открытой рубрику и прокрутку, —
   следующий подходит к чужому состоянию. */

const IDLE_RESET_MS = 75000;
let idleTimer = null;

function armIdleReset(reset) {
  const rearm = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(reset, IDLE_RESET_MS);
  };
  for (const ev of ["pointerdown", "pointermove", "wheel", "touchstart", "keydown"]) {
    window.addEventListener(ev, rearm, { passive: true });
  }
  rearm();
}

/* ------------------------------------------------------------------ запуск */

async function main() {
  const data = await (await fetch(SRC)).json();
  records = data.records;
  buckets = assign(records);

  const openSheet = makeSheet();
  const rail = document.querySelector("[data-rubrics]");
  for (const rubric of RUBRICS) {
    const n = (buckets.get(rubric.key) || []).length;
    if (!n) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rubric";
    b.dataset.rubric = rubric.key;
    b.innerHTML = `<span>${rubric.name}</span><span class="rubric__n">${nf.format(n)}</span>`;
    b.addEventListener("click", () => renderRubric(rubric.key, openSheet));
    rail.appendChild(b);
  }

  document.querySelector("[data-total]").textContent =
    `${nf.format(records.length)} записей свода, ${new Set(records.map((r) => r.country)).size} стран. `
    + "Полосой слева на карточке отмечена судьба имени: латунь — носит сегодня, "
    + "красный — переименовано, серый — утрачено.";

  renderRubric(RUBRICS[0].key, openSheet);
  armIdleReset(() => {
    document.getElementById("sheet").hidden = true;
    renderRubric(RUBRICS[0].key, openSheet);
  });
}

main().catch((e) => {
  console.error(e);
  document.querySelector(".title").textContent = "Данные не загрузились";
});
