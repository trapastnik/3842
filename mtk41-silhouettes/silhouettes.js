(function () {
  const parade = document.getElementById("parade");
  let monuments = [];
  let silhouettes = {};
  let heights = {};
  let selectedIndex = -1;

  function showMonument(idx) {
    selectedIndex = idx;
    if (window.MtkCard) window.MtkCard.show(monuments[idx]);
  }
  document.addEventListener("mtk-card-hidden", () => { selectedIndex = -1; });

  function effectiveYear(m) {
    if (typeof m.year === "number") return m.year;
    if (m.id && m.id.includes("1920s")) return 1925;
    if (m.id === "gorki-pinchuk-taurit") return 1949;
    return 1930;
  }

  function buildOrder() {
    return monuments
      .map((m, i) => ({ i, year: effectiveYear(m), m }))
      .sort((a, b) => a.year - b.year || (a.m.city || "").localeCompare(b.m.city || ""));
  }

  function render() {
    parade.innerHTML = "";
    const order = buildOrder();
    for (const item of order) {
      const m = item.m;
      const fig = document.createElement("button");
      fig.type = "button";
      fig.className = "fig";
      fig.setAttribute("data-status", m.status || "unknown");
      fig.setAttribute("aria-label", `${m.title || ""} ${m.year || ""}`);

      // Status pip (top-right)
      const pip = document.createElement("span");
      pip.className = "fig-pip";
      pip.setAttribute("data-status", m.status || "unknown");
      fig.appendChild(pip);

      // Silhouette image area
      const imgWrap = document.createElement("div");
      imgWrap.className = "fig-image";
      const silPath = silhouettes[m.id];
      if (silPath) {
        const img = document.createElement("img");
        img.src = `../assets/mtk41/${m.id}/${encodeURI(silPath)}`;
        img.alt = m.title || "";
        img.loading = "lazy";
        imgWrap.appendChild(img);
      } else {
        imgWrap.classList.add("no-sil");
        imgWrap.textContent = "Л";
      }
      fig.appendChild(imgWrap);

      // Caption
      const cap = document.createElement("div");
      cap.className = "fig-cap";

      const city = document.createElement("div");
      city.className = "fig-city";
      city.textContent = m.city || m.country || "—";
      cap.appendChild(city);

      const yr = document.createElement("div");
      yr.className = "fig-year";
      yr.textContent = m.year ? String(m.year) :
        (m.id && m.id.includes("1920s")) ? "1920-е" :
        (m.id === "gorki-pinchuk-taurit") ? "≈1949" : "—";
      cap.appendChild(yr);

      const h = heights[m.id];
      if (h && (h.statue + h.pedestal) > 0.1) {
        const totalH = h.statue + h.pedestal;
        const hl = document.createElement("div");
        hl.className = "fig-height";
        hl.textContent = `${totalH < 10 ? totalH.toFixed(1) : Math.round(totalH)} м`;
        cap.appendChild(hl);
      }

      fig.appendChild(cap);
      fig.addEventListener("click", () => showMonument(item.i));
      parade.appendChild(fig);
    }
  }

  // Close card on outside tap
  document.addEventListener("pointerdown", e => {
    const cardEl = document.getElementById("card");
    if (!cardEl || cardEl.hidden) return;
    if (cardEl.contains(e.target)) return;
    if (e.target.closest(".fig")) return;
    if (window.MtkCard) window.MtkCard.hide();
  });

  Promise.all([
    fetch("../data/mtk41.json").then(r => r.json()),
    fetch("../assets/mtk41/silhouettes.json").then(r => r.json()).catch(() => ({})),
    fetch("../assets/mtk41/heights.json").then(r => r.json()).catch(() => ({})),
  ]).then(([mtk, sil, hgts]) => {
    monuments = mtk.items || [];
    silhouettes = sil || {};
    heights = hgts || {};
    render();
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.warn("Load failed:", err);
  });
})();
