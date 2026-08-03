/* Общее для сцен МТК 42: разбор контента, портреты, карточка-оверлей.
 *
 * Правила, которые здесь зашиты и на которые опираются все четыре сцены:
 *  - строки UI берутся только через app.t() (Киоск-стандарт v2, п. 11);
 *  - контент (имена, цитаты, названия музеев) остаётся на русском — решение
 *    2026-08-02, перевод контента отдельной веткой с куратором;
 *  - портрет уже 220 px не показываем: на 4K он растягивается вдвое и мылит,
 *    честнее монограмма (порог заведён в прототипах, здесь тот же).
 */

export const DATA = {
  people: "../data/mtk42.json",
  museums: "../data/mtk42-museums.json",
  portraits: "../assets/mtk42/portraits/manifest.json",
  countries: "../data/ne_110m_countries.geojson",
};

const PORTRAIT_DIR = "../assets/mtk42/portraits/";
const MIN_PORTRAIT_PX = 220;

export const CATEGORY_TAG = {
  leaders: "cat.leaders",
  politician: "cat.politician",
  researcher: "cat.researcher",
  writers: "cat.writers",
};

export const STATUS_COLOR = {
  active: "#d2b773",
  transformed: "#9DA3A6",
  private: "rgba(210,183,115,0.55)",
  closed: "#a02128",
};

export function portraitUrl(meta) {
  if (!meta || !meta.image) return null;
  if (typeof meta.w === "number" && meta.w < MIN_PORTRAIT_PX) return null;
  return PORTRAIT_DIR + meta.image;
}

/* Все пригодные портреты — для преролла: в рантайме сеть не трогаем. */
export function portraitList(manifest) {
  const out = [];
  for (const id in manifest) {
    const u = portraitUrl(manifest[id]);
    if (u) out.push(u);
  }
  return out;
}

export function initials(fullname) {
  const parts = String(fullname).replace(/\(.*?\)/g, "").trim().split(/\s+/);
  const last = parts[parts.length - 1] || fullname;
  return (last.charAt(0) || "?").toUpperCase();
}

/* Ключ словаря для словесной оценки тона — не сама строка: сцены зовут t(). */
export function toneKey(t) {
  if (t <= -0.7) return "tone.harsh";
  if (t <= -0.3) return "tone.critical";
  if (t < 0.3) return "tone.neutral";
  if (t < 0.7) return "tone.sympathy";
  return "tone.positive";
}

export function buildPeople(content, manifest) {
  const items = (content.people || []).map((p) => ({
    id: p.id,
    category: p.category,
    name: p.name,
    short: p.short || p.name,
    role: p.role,
    yearsAlive: p.years,
    year: p.year,
    epoch: p.epoch,
    tone: p.tone,
    keyWork: p.key_work,
    summary: p.summary,
    quote: p.quote || null,
    portrait: portraitUrl(manifest[p.id]),
    initials: initials(p.short || p.name),
    tagKey: CATEGORY_TAG[p.category] || "cat.all",
  }));
  items.sort((a, b) => a.year - b.year || Math.abs(b.tone) - Math.abs(a.tone));
  return items;
}

/* Год дописываем, только если в самой библиографии его нет: у большинства
 * записей он уже в конце ссылки, иначе выходило «М., 2025 · 2025». */
export function workLine(it) {
  if (!it.keyWork) return "";
  const has = new RegExp("\\b" + it.year + "\\b").test(it.keyWork);
  return has ? it.keyWork : it.keyWork + " · " + it.year;
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ─── Оверлей карточки ──────────────────────────────────────────────────
 * Один компонент на все сцены: одинаковый вид и одинаковое поведение —
 * требование «унификация управления» тач-стандарта (п. 7).
 * Idle НЕ замораживаем: посетитель может уйти с открытой карточкой, и
 * idle-сброс обязан её закрыть. */
export function createOverlay(el, app) {
  const root = document.createElement("div");
  root.className = "m42-detail";
  root.hidden = true;
  root.innerHTML =
    '<div class="m42-detail__panel kiosk-scroll" role="dialog" aria-modal="true">' +
    '<button type="button" class="m42-detail__close kiosk-target" aria-label="' +
    esc(app.t("card.close")) + '">✕</button>' +
    '<div class="m42-detail__body"></div>' +
    "</div>";
  el.appendChild(root);

  const panel = root.querySelector(".m42-detail__panel");
  const body = root.querySelector(".m42-detail__body");
  const closeBtn = root.querySelector(".m42-detail__close");

  function close() {
    root.hidden = true;
    body.innerHTML = "";
  }
  function onBackdrop(e) { if (e.target === root) close(); }

  closeBtn.addEventListener("click", close);
  root.addEventListener("click", onBackdrop);

  return {
    el: root,
    isOpen() { return !root.hidden; },
    open(html) {
      body.innerHTML = html;
      root.hidden = false;
      panel.scrollTop = 0;
      closeBtn.setAttribute("aria-label", app.t("card.close"));
    },
    close,
    destroy() {
      closeBtn.removeEventListener("click", close);
      root.removeEventListener("click", onBackdrop);
      root.remove();
    },
  };
}

/* Разметка карточки персоны — общая для картотеки и маятника. */
export function personCardHtml(app, it) {
  const t = (k, v) => app.t(k, v);
  const pct = Math.round(it.tone * 100);
  const pos = (((it.tone + 1) / 2) * 100).toFixed(1);

  const portrait = it.portrait
    ? '<img src="' + esc(it.portrait) + '" alt="" />'
    : '<span class="m42-card__initials">' + esc(it.initials) + "</span>";

  const work = it.keyWork
    ? '<div class="m42-card__work"><div class="m42-card__work-title">' +
      esc(t("card.work")) + '</div><div class="m42-card__work-text">' +
      esc(workLine(it)) + "</div></div>"
    : "";

  const quote = it.quote
    ? '<blockquote class="m42-card__quote"><p class="m42-card__quote-text">«' +
      esc(it.quote.text) + '»</p><div class="m42-card__quote-source">' +
      esc(it.quote.source) + "</div></blockquote>"
    : "";

  return (
    '<div class="m42-card__head">' +
    '<div class="m42-card__portrait">' + portrait + "</div>" +
    '<div class="m42-card__ident">' +
    '<div class="m42-card__kind">' + esc(t(it.tagKey)) + "</div>" +
    '<h2 class="m42-card__name">' + esc(it.name) + "</h2>" +
    '<p class="m42-card__meta">' +
      esc(it.yearsAlive ? it.role + " · " + it.yearsAlive : it.role) + "</p>" +
    '<div class="m42-card__chips">' +
    '<span class="m42-chip">' + esc(t("epoch." + it.epoch)) + "</span>" +
    '<span class="m42-chip">' + esc(t(toneKey(it.tone))) + "</span>" +
    "</div></div></div>" +
    work +
    '<p class="m42-card__text">' + esc(it.summary || "") + "</p>" +
    quote +
    '<div class="m42-card__tone">' +
    '<span class="m42-card__tone-label">' + esc(t("tone.label")) + "</span>" +
    '<span class="m42-card__tone-track"><span class="m42-card__tone-marker" style="left:' +
    pos + '%"></span></span>' +
    '<span class="m42-card__tone-value">' + (pct >= 0 ? "+" : "") + pct + "%</span>" +
    "</div>"
  );
}

/* Разметка карточки музея — общая для таймлайна и карты. */
export function museumCardHtml(app, item, regions) {
  const t = (k, v) => app.t(k, v);
  const region = (regions || []).find((r) => r.id === item.region);
  const period = item.closed == null
    ? item.opened + " — " + t("museums.today")
    : item.opened + " — " + item.closed;

  const aftermath = item.aftermath
    ? '<div class="m42-card__work"><div class="m42-card__work-title">' +
      esc(t("museums.aftermath")) + '</div><div class="m42-card__work-text">' +
      esc(item.aftermath) + "</div></div>"
    : "";

  const notes = [item.opened_note, item.closed_note].filter(Boolean)
    .map((n) => '<p class="m42-card__note">' + esc(n) + "</p>").join("");

  const photos = (item.photos || []).map((ph) =>
    '<figure class="m42-card__photo"><img src="../assets/mtk42/museums/' +
    esc(ph.file) + '" alt="' + esc(ph.caption || "") + '" />' +
    (ph.caption ? "<figcaption>" + esc(ph.caption) + "</figcaption>" : "") +
    "</figure>").join("");

  return (
    '<div class="m42-card__kind">' +
      esc(region ? t("region." + region.id) : "") + "</div>" +
    '<h2 class="m42-card__name">' + esc(item.full_name || item.short) + "</h2>" +
    '<p class="m42-card__meta">' +
      esc(item.city + (item.country ? " · " + item.country : "")) + "</p>" +
    '<div class="m42-card__chips">' +
    '<span class="m42-chip">' + esc(t("status.one." + item.status)) + "</span>" +
    '<span class="m42-chip">' + esc(period) + "</span>" +
    "</div>" +
    '<p class="m42-card__text">' + esc(item.description || "") + "</p>" +
    aftermath +
    (notes ? '<div class="m42-card__notes">' + notes + "</div>" : "") +
    (photos ? '<div class="m42-card__photos">' + photos + "</div>" : "")
  );
}
