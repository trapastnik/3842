// МТК 42 · Картотека — grid of researcher & quote cards.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  epoch: "all",
  kind: "all",
  items: [],
  epochs: [],
  byId: new Map(),
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
  for (const q of content.quotes) {
    const p = portraits[q.id] || {};
    items.push({
      id: q.id,
      kind: "quote",
      name: q.author,
      meta: `${q.role} · ${q.year}`,
      year: q.year,
      epoch: epochForYear(content.epochs, q.year),
      tone: q.tone,
      text: q.text,
      source: q.source,
      portrait: p.image ? `../assets/mtk42/portraits/${p.image}` : null,
      initials: initials(q.author),
      tag: "Цитата",
      work: null,
    });
  }
  for (const r of content.researchers) {
    const p = portraits[r.id] || {};
    items.push({
      id: r.id,
      kind: "research",
      name: r.name,
      meta: `${r.role} · ${r.years}`,
      year: r.key_year,
      epoch: r.epoch,
      tone: r.tone,
      text: r.summary,
      source: r.role,
      portrait: p.image ? `../assets/mtk42/portraits/${p.image}` : null,
      initials: initials(r.short || r.name),
      tag: "Исследователь",
      work: `«${r.key_work}» · ${r.key_year}`,
    });
  }
  // sort: by year, then by absolute tone (more extreme first)
  items.sort((a, b) => a.year - b.year || Math.abs(b.tone) - Math.abs(a.tone));
  return items;
}

function epochForYear(epochs, year) {
  for (const ep of epochs) {
    if (year >= ep.years[0] && year < ep.years[1]) return ep.id;
  }
  return epochs[epochs.length - 1].id;
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
    if (state.kind !== "all" && it.kind !== state.kind) continue;
    grid.appendChild(renderCard(it));
    shown++;
  }
  $('[data-bind="counter-shown"]').textContent = shown;
  $('[data-bind="counter-total"]').textContent = state.items.length;
}

function renderCard(it) {
  const tpl = document.createElement("button");
  tpl.type = "button";
  tpl.className = `card ${it.kind === "quote" ? "is-quote" : "is-research"}`;
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
  meta.textContent = it.kind === "research" ? (it.work || it.meta) : it.meta;
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
  $('[data-bind="meta"]', d).textContent = it.meta;
  $('[data-bind="epoch"]', d).textContent = epochLabel(it.epoch);
  $('[data-bind="tone-label"]', d).textContent = toneLabel(it.tone);

  const workSection = $('[data-bind="work-section"]', d);
  if (it.work) {
    workSection.hidden = false;
    $('[data-bind="work"]', d).textContent = it.work;
  } else {
    workSection.hidden = true;
  }
  $('[data-bind="text"]', d).textContent = it.text;
  $('[data-bind="source"]', d).textContent = it.source;

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
  $$('.filter[data-kind]').forEach((btn) => {
    btn.addEventListener("click", () => {
      $$('.filter[data-kind]').forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.kind = btn.dataset.kind;
      render();
    });
  });

  const detail = $("#detail");
  $(".detail__close").addEventListener("click", closeDetail);
  detail.addEventListener("click", (e) => {
    // close on click on backdrop (outside the inner dialog area)
    if (e.target === detail) closeDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !detail.hidden) closeDetail();
  });
}
