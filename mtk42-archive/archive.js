// МТК 42 · Картотека — grid of people cards across 3 categories.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  epoch: "all",
  category: "all",
  items: [],
  epochs: [],
  byId: new Map(),
};

const CATEGORY_TAG = {
  politician: "Политик",
  researcher: "Исследователь",
  writers: "Литература",
};

(async function init() {
  const [content, portraits] = await Promise.all([
    fetch("../data/mtk42.json").then((r) => r.json()),
    fetch("../assets/mtk42/portraits/manifest.json").then((r) => r.json()).catch(() => ({})),
  ]);
  state.epochs = content.epochs;
  state.items = buildItems(content, portraits);
  for (const it of state.items) state.byId.set(it.id, it);
  render();
  bindUi();
})();

function buildItems(content, portraits) {
  const items = [];
  for (const p of content.people) {
    const portraitMeta = portraits[p.id] || {};
    items.push({
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
      portrait: portraitMeta.image ? `../assets/mtk42/portraits/${portraitMeta.image}` : null,
      initials: initials(p.short || p.name),
      tag: CATEGORY_TAG[p.category] || p.category,
    });
  }
  // sort: by year, then by absolute tone (more extreme first)
  items.sort((a, b) => a.year - b.year || Math.abs(b.tone) - Math.abs(a.tone));
  return items;
}

function initials(fullname) {
  const stripped = fullname.replace(/\(.*?\)/g, "").trim();
  const parts = stripped.split(/\s+/);
  const last = parts[parts.length - 1] || fullname;
  return last.charAt(0).toUpperCase();
}

function epochLabel(id) {
  const ep = state.epochs.find((e) => e.id === id);
  return ep ? ep.label : id;
}

function toneLabel(t) {
  if (t <= -0.7) return "Резкая критика";
  if (t <= -0.3) return "Критика";
  if (t < 0.3) return "Академически";
  if (t < 0.7) return "Симпатия";
  return "Почитание";
}

// ─── Render ─────────────────────────────────────────────────
function render() {
  const grid = $("#grid");
  grid.innerHTML = "";
  let shown = 0;
  for (const it of state.items) {
    if (state.epoch !== "all" && it.epoch !== state.epoch) continue;
    if (state.category !== "all" && it.category !== state.category) continue;
    grid.appendChild(renderCard(it));
    shown++;
  }
  $('[data-bind="counter-shown"]').textContent = shown;
  $('[data-bind="counter-total"]').textContent = state.items.length;
}

function renderCard(it) {
  const tpl = document.createElement("button");
  tpl.type = "button";
  tpl.className = `card is-${it.category}`;
  tpl.dataset.id = it.id;
  tpl.setAttribute("aria-label", `${it.name}, ${it.year}`);

  const tag = document.createElement("span");
  tag.className = "card__tag";
  tag.textContent = `${it.tag} · ${it.year}`;
  tpl.appendChild(tag);

  const portrait = document.createElement("div");
  portrait.className = "card__portrait";
  if (it.portrait) {
    const img = document.createElement("img");
    img.src = it.portrait;
    img.alt = "";
    img.loading = "lazy";
    portrait.appendChild(img);
  } else {
    const sp = document.createElement("span");
    sp.className = "card__initials";
    sp.textContent = it.initials;
    portrait.appendChild(sp);
  }
  tpl.appendChild(portrait);

  const heading = document.createElement("div");
  heading.className = "card__heading";
  const name = document.createElement("h3");
  name.className = "card__name";
  name.textContent = it.name;
  heading.appendChild(name);
  const meta = document.createElement("p");
  meta.className = "card__meta";
  meta.textContent = it.keyWork || it.role;
  heading.appendChild(meta);
  tpl.appendChild(heading);

  const tone = document.createElement("div");
  tone.className = "card__tone";
  const track = document.createElement("span");
  track.className = "card__tone-track";
  const marker = document.createElement("span");
  marker.className = "card__tone-marker";
  marker.style.left = (((it.tone + 1) / 2) * 100).toFixed(1) + "%";
  track.appendChild(marker);
  tone.appendChild(track);
  const val = document.createElement("span");
  val.className = "card__tone-value";
  val.textContent = (it.tone >= 0 ? "+" : "") + it.tone.toFixed(2);
  tone.appendChild(val);
  tpl.appendChild(tone);

  tpl.addEventListener("click", () => openDetail(it));
  return tpl;
}

// ─── Detail ─────────────────────────────────────────────────
function openDetail(it) {
  const d = $("#detail");
  d.hidden = false;

  const port = $('[data-bind="portrait"]', d);
  port.innerHTML = "";
  if (it.portrait) {
    const img = document.createElement("img");
    img.src = it.portrait;
    img.alt = "";
    port.appendChild(img);
  } else {
    const sp = document.createElement("span");
    sp.className = "initials";
    sp.textContent = it.initials;
    port.appendChild(sp);
  }
  $('[data-bind="kind"]', d).textContent = it.tag;
  $('[data-bind="name"]', d).textContent = it.name;
  $('[data-bind="meta"]', d).textContent = `${it.role} · ${it.yearsAlive}`;
  $('[data-bind="epoch"]', d).textContent = epochLabel(it.epoch);
  $('[data-bind="tone-label"]', d).textContent = toneLabel(it.tone);

  const workSection = $('[data-bind="work-section"]', d);
  if (it.keyWork) {
    workSection.hidden = false;
    $('[data-bind="work"]', d).textContent = `${it.keyWork} · ${it.year}`;
  } else {
    workSection.hidden = true;
  }
  $('[data-bind="text"]', d).textContent = it.summary || "";

  const quoteSection = $('[data-bind="quote-section"]', d);
  if (it.quote) {
    quoteSection.hidden = false;
    $('[data-bind="quote-text"]', d).textContent = `«${it.quote.text}»`;
    $('[data-bind="quote-source"]', d).textContent = it.quote.source;
  } else {
    quoteSection.hidden = true;
  }

  const marker = $('[data-bind="tone-marker"]', d);
  marker.style.left = (((it.tone + 1) / 2) * 100).toFixed(1) + "%";
  $('[data-bind="tone-value"]', d).textContent = (it.tone >= 0 ? "+" : "") + it.tone.toFixed(2);
}

function closeDetail() {
  $("#detail").hidden = true;
}

// ─── UI ─────────────────────────────────────────────────────
function bindUi() {
  $$('.filter[data-epoch]').forEach((btn) => {
    btn.addEventListener("click", () => {
      $$('.filter[data-epoch]').forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.epoch = btn.dataset.epoch;
      render();
    });
  });
  $$('.filter[data-category]').forEach((btn) => {
    btn.addEventListener("click", () => {
      $$('.filter[data-category]').forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.category = btn.dataset.category;
      render();
    });
  });

  const detail = $("#detail");
  $(".detail__close").addEventListener("click", closeDetail);
  detail.addEventListener("click", (e) => {
    if (e.target === detail) closeDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !detail.hidden) closeDetail();
  });
}
