// МТК 42 · Институции · Таймлайн

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const STATUS_LABEL = {
  active: "Работает",
  transformed: "Трансформирован",
  private: "Частный / восстановленный",
  closed: "Ликвидирован",
};

const state = {
  data: null,
  yearMin: 1923,
  yearMax: 2026,
  status: "all",
};

(async function init() {
  state.data = await fetch("../data/mtk42-museums.json").then((r) => r.json());
  state.yearMin = state.data.year_min || 1923;
  state.yearMax = state.data.year_max || 2026;
  render();
  bindUi();
})();

// px per year — depends on container width; recompute on layout
function pxPerYear(barWidth) {
  return barWidth / (state.yearMax - state.yearMin);
}

function yearToPx(year, barWidth) {
  return (year - state.yearMin) * pxPerYear(barWidth);
}

function render() {
  const inner = $("#timeline-inner");
  inner.innerHTML = "";

  // Bar-area width is (container width - label column width) — read from CSS var.
  const rootStyle = getComputedStyle(document.documentElement);
  const labelCol = parseFloat(rootStyle.getPropertyValue("--label-col")) || 240;
  const containerW = inner.clientWidth;
  const barW = containerW - 4; // small buffer

  drawYearAxis(barW);

  // Group items by region
  const items = state.data.items.slice();
  const regions = state.data.regions.slice().sort((a, b) => a.sort - b.sort);
  const regionMap = new Map(regions.map((r) => [r.id, r]));

  const byRegion = new Map();
  for (const r of regions) byRegion.set(r.id, []);
  for (const it of items) {
    if (state.status !== "all" && it.status !== state.status) continue;
    if (!byRegion.has(it.region)) byRegion.set(it.region, []);
    byRegion.get(it.region).push(it);
  }
  // Sort each region by opened year
  for (const arr of byRegion.values()) arr.sort((a, b) => a.opened - b.opened);

  // Draw collapse band 1991-1993 (spans the whole scroller area)
  const collapse = document.createElement("div");
  collapse.className = "collapse-band";
  const left = yearToPx(1991, barW);
  const right = yearToPx(1993, barW);
  collapse.style.left = left + "px";
  collapse.style.width = (right - left) + "px";
  inner.appendChild(collapse);

  let shown = 0;
  for (const region of regions) {
    const arr = byRegion.get(region.id) || [];
    if (arr.length === 0) continue;

    const header = document.createElement("div");
    header.className = "region-header";
    header.textContent = region.label;
    inner.appendChild(header);

    for (const it of arr) {
      inner.appendChild(renderRow(it, barW));
      shown++;
    }
  }

  $('[data-bind="counter-shown"]').textContent = shown;
  $('[data-bind="counter-total"]').textContent = state.data.items.length;
}

function drawYearAxis(barW) {
  const ticks = $("#year-ticks");
  ticks.innerHTML = "";
  for (let y = state.yearMin; y <= state.yearMax; y += 10) {
    const tick = document.createElement("div");
    tick.className = "year-axis__tick";
    tick.textContent = String(y);
    tick.style.left = yearToPx(y, barW) + "px";
    ticks.appendChild(tick);
  }
}

function renderRow(item, barW) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.id = item.id;

  const label = document.createElement("div");
  label.className = "row__label";
  const shortEl = document.createElement("div");
  shortEl.className = "row__short";
  shortEl.textContent = item.short;
  const city = document.createElement("div");
  city.className = "row__city";
  city.textContent = item.city;
  label.append(shortEl, city);
  label.addEventListener("click", () => openDetail(item));
  row.appendChild(label);

  const bar = document.createElement("button");
  bar.type = "button";
  bar.className = `bar bar--${item.status}${item.notable ? " notable" : ""}`;
  bar.setAttribute("aria-label", `${item.short}, ${item.opened}—${item.closed || "сегодня"}`);
  const opened = Math.max(state.yearMin, item.opened);
  const closed = item.closed !== null && item.closed !== undefined ? Math.min(state.yearMax, item.closed) : state.yearMax;
  const leftPx = yearToPx(opened, barW);
  const rightPx = yearToPx(closed, barW);
  const width = Math.max(4, rightPx - leftPx);
  bar.style.left = leftPx + "px";
  bar.style.width = width + "px";
  // put opened year as label if wide enough
  if (width > 90) {
    const l = document.createElement("span");
    l.className = "bar__label";
    l.textContent = String(item.opened);
    bar.appendChild(l);
  }
  bar.append(document.createElement("span")); // start cap
  bar.querySelector("span").className = "bar__cap bar__cap--start";
  const endCap = document.createElement("span");
  endCap.className = "bar__cap bar__cap--end";
  bar.appendChild(endCap);
  bar.addEventListener("click", () => openDetail(item));
  row.appendChild(bar);
  return row;
}

// ─── Detail ─────────────────────────────────────────────────
function regionLabel(id) {
  const r = state.data.regions.find((rr) => rr.id === id);
  return r ? r.label : id;
}

function openDetail(item) {
  const d = $("#detail");
  d.hidden = false;
  $('[data-bind="region"]', d).textContent = regionLabel(item.region);
  $('[data-bind="name"]', d).textContent = item.full_name || item.short;
  $('[data-bind="place"]', d).textContent = `${item.city}${item.country ? " · " + item.country : ""}`;
  $('[data-bind="status"]', d).textContent = STATUS_LABEL[item.status] || item.status;
  const period = item.closed === null || item.closed === undefined
    ? `${item.opened} — сегодня`
    : `${item.opened} — ${item.closed}`;
  $('[data-bind="period"]', d).textContent = period;
  $('[data-bind="description"]', d).textContent = item.description || "";
  const aftermath = $('[data-bind="aftermath-section"]', d);
  if (item.aftermath) {
    aftermath.hidden = false;
    $('[data-bind="aftermath"]', d).textContent = item.aftermath;
  } else {
    aftermath.hidden = true;
  }
  $('[data-bind="opened-note"]', d).textContent = item.opened_note || "";
  $('[data-bind="closed-note"]', d).textContent = item.closed_note || "";
}

function closeDetail() { $("#detail").hidden = true; }

// ─── UI ─────────────────────────────────────────────────────
function bindUi() {
  $$('.filter[data-status]').forEach((btn) => {
    btn.addEventListener("click", () => {
      $$('.filter[data-status]').forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.status = btn.dataset.status;
      render();
    });
  });

  const detail = $("#detail");
  $(".detail__close").addEventListener("click", closeDetail);
  detail.addEventListener("click", (e) => { if (e.target === detail) closeDetail(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !detail.hidden) closeDetail();
  });

  const legend = $("#legend");
  $("#legend-toggle").addEventListener("click", () => (legend.hidden = !legend.hidden));
  $(".legend__close").addEventListener("click", () => (legend.hidden = true));

  // Re-render on resize (bars are px-positioned by container width)
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });
}
