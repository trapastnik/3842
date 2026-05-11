(function () {
  const grid = document.getElementById("grid");
  const cardEl = document.getElementById("card");
  const cardClose = document.getElementById("card-close");
  const cardPhoto = document.getElementById("card-photo");
  const cardYear = document.getElementById("card-year");
  const cardTitle = document.getElementById("card-title");
  const cardPlace = document.getElementById("card-place");
  const cardAuthor = document.getElementById("card-author");
  const cardText = document.getElementById("card-text");
  const cardStatus = document.getElementById("card-status");

  // Brief biographic context — only what's commonly known.
  const SCULPTOR_BIO = {
    "С.Д. Меркуров":      { years: "1881–1952", bio: "Снял посмертную маску Ленина. Главный монументалист 1930-40-х." },
    "Е.В. Вучетич":       { years: "1908–1974", bio: "Автор «Родины-матери» в Волгограде; в Леныиниане — последний по времени гигант, 1973." },
    "Г.Д. Алексеев":      { years: "1881–1951", bio: "Лепил Ленина с натуры в 1919. Первое прижизненное скульптурное изображение." },
    "В.Б. Пинчук":        { years: "1908–1987", bio: "Ленинградская монументалистика; пара с Тауритом — «Ленин и Сталин в Горках»." },
    "Р.К. Таурит":        { years: "1910–1969", bio: "Соавтор Пинчука по «Ленин и Сталин в Горках»." },
    "Хасбулат Аскар-Сарыджа": { years: "1900–1982", bio: "Дагестанский скульптор, автор памятника Ленину в Рыбинске." },
    "Д.Н. Ларионов":      { years: "—",          bio: "Локальный скульптор; памятник Ленину в Уфе, 1924." },
    "Г.В. Нерода":        { years: "1895–1983", bio: "Отец и сын Нерода вместе слепили самую большую голову Ленина в мире — Улан-Удэ." },
    "Ю.Г. Нерода":        { years: "1920–2006", bio: "Сын Г.В. Нероды; соавтор головы Ленина в Улан-Удэ." },
  };

  // Architects we want a thin row for (typically don't get their own card).
  const NOTABLE_ARCHITECTS = new Set([
    "Л.М. Поляков", "А.Н. Душкин", "П.Г. Зильберман",
  ]);

  let monuments = [];
  let photoManifest = {};
  let modelsManifest = {};

  function statusLabel(s) {
    return ({ extant: "Сохранился", demolished: "Снесён", relocated: "Перенесён", unknown: "Судьба неизвестна" }[s]) || "Статус не указан";
  }

  function buildAuthorBuckets() {
    // map: sculptor name → list of monument indices
    const map = new Map();
    const anonIndices = [];

    for (let i = 0; i < monuments.length; i += 1) {
      const m = monuments[i];
      const list = (m.sculptors || []).filter(Boolean);
      if (list.length === 0) {
        anonIndices.push(i);
        continue;
      }
      for (const name of list) {
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(i);
      }
    }

    const buckets = [];
    // Sort: more monuments first, then alphabetic
    const entries = Array.from(map.entries());
    entries.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    for (const [name, indices] of entries) {
      buckets.push({ name, indices, anon: false });
    }
    if (anonIndices.length) {
      buckets.push({ name: "Автор не установлен", indices: anonIndices, anon: true });
    }
    return buckets;
  }

  function render() {
    grid.innerHTML = "";
    const buckets = buildAuthorBuckets();
    for (const b of buckets) {
      const card = document.createElement("div");
      card.className = "author" + (b.anon ? " anon" : "") + (b.indices.length >= 2 ? " featured" : "");

      const nm = document.createElement("h2");
      nm.className = "author-name";
      nm.textContent = b.name;
      card.appendChild(nm);

      const bio = SCULPTOR_BIO[b.name];
      if (bio) {
        const yrs = document.createElement("div");
        yrs.className = "author-years";
        yrs.textContent = bio.years;
        card.appendChild(yrs);
        const bx = document.createElement("p");
        bx.className = "author-bio";
        bx.textContent = bio.bio;
        card.appendChild(bx);
      }

      const works = document.createElement("div");
      works.className = "author-works";
      // Sort works by year (nulls last)
      const sorted = b.indices.slice().sort((a, c) => {
        const ya = monuments[a].year || 9999;
        const yc = monuments[c].year || 9999;
        return ya - yc;
      });
      for (const idx of sorted) {
        const m = monuments[idx];
        const w = document.createElement("div");
        w.className = "work";
        w.setAttribute("data-status", m.status || "unknown");

        const thumb = document.createElement("div");
        thumb.className = "work-thumb";
        const photos = photoManifest[m.id];
        if (photos && photos.length) {
          thumb.style.backgroundImage = `url("${encodeURI("../assets/mtk41/" + m.id + "/" + photos[0])}")`;
        } else {
          thumb.classList.add("empty");
          thumb.textContent = "Л";
        }
        w.appendChild(thumb);

        const textCol = document.createElement("div");
        textCol.className = "work-text";
        const y = document.createElement("span");
        y.className = "work-year";
        y.textContent = m.year ? String(m.year) : "—";
        const t = document.createElement("span");
        t.className = "work-title";
        t.textContent = (m.city ? m.city + " · " : "") + (m.title || "").replace(/^Памятник Ленину /, "");
        textCol.appendChild(y);
        textCol.appendChild(t);
        w.appendChild(textCol);

        w.addEventListener("click", () => showCard(idx));
        works.appendChild(w);
      }
      card.appendChild(works);

      const cnt = document.createElement("div");
      cnt.className = "author-count";
      cnt.textContent = b.indices.length === 1 ? "1 памятник" :
                        b.indices.length < 5 ? `${b.indices.length} памятника` :
                        `${b.indices.length} памятников`;
      card.appendChild(cnt);

      grid.appendChild(card);
    }
  }

  // Test/fallback model for monuments that don't have their own 3D scan.
  // Uses the Dubna (Merkurov 1937) photogrammetry which is one of the better
  // public Sketchfab scans of a Soviet Lenin monument.
  const FALLBACK_MODEL = {
    name: "Памятник Ленину в Дубне (фотограмметрия)",
    url: "https://sketchfab.com/3d-models/none-a14d4ca0163b44829123780f3cfa121b",
    license: "—",
    author: "Alex",
    exact_match: false,
  };

  function extractModelUid(url) {
    const m = (url || "").match(/([a-f0-9]{32})/i);
    return m ? m[1] : null;
  }

  function buildEmbedUrl(uid) {
    const params = "autostart=0&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=1&dnt=1&preload=0";
    return `https://sketchfab.com/models/${uid}/embed?${params}`;
  }

  function setViewerModel(sortedModels, idx) {
    const viewer = document.getElementById("card-model-viewer");
    const controls = document.getElementById("card-model-controls");
    if (!viewer || !sortedModels[idx]) return;
    const uid = extractModelUid(sortedModels[idx].url);
    if (!uid) { viewer.innerHTML = ""; return; }
    const src = buildEmbedUrl(uid);
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allow", "autoplay; fullscreen; xr-spatial-tracking");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("mozallowfullscreen", "true");
    iframe.setAttribute("webkitallowfullscreen", "true");
    iframe.loading = "lazy";
    viewer.innerHTML = "";
    viewer.appendChild(iframe);
    if (controls) {
      controls.querySelectorAll(".card-model-tab").forEach((el, i) => {
        el.classList.toggle("active", i === idx);
      });
    }
  }

  function clearCardModelViewer() {
    const viewer = document.getElementById("card-model-viewer");
    if (viewer) viewer.innerHTML = "";
  }

  function populateCardModels(monumentId) {
    const cont = document.getElementById("card-models");
    const viewer = document.getElementById("card-model-viewer");
    const controls = document.getElementById("card-model-controls");
    if (!cont || !viewer) return;

    const own = modelsManifest[monumentId] || [];
    let list = own;
    let isTest = false;
    if (!list.length) { list = [FALLBACK_MODEL]; isTest = true; }

    // Sort: exact matches first
    const sorted = list.slice().sort(
      (a, b) => (b.exact_match ? 1 : 0) - (a.exact_match ? 1 : 0)
    );

    cont.hidden = false;
    viewer.hidden = false;
    viewer.classList.toggle("test", isTest);

    // Clear old extra entries / tabs / links
    cont.querySelectorAll(".card-model").forEach(el => el.remove());

    // Tabs (only if multiple)
    if (controls) {
      controls.innerHTML = "";
      if (sorted.length > 1) {
        controls.hidden = false;
        sorted.forEach((m, i) => {
          const tab = document.createElement("button");
          tab.type = "button";
          tab.className = "card-model-tab" + (i === 0 ? " active" : "") + (m.exact_match ? " exact" : "");
          tab.textContent = m.name || "модель";
          tab.title = m.name || "";
          tab.addEventListener("click", () => setViewerModel(sorted, i));
          controls.appendChild(tab);
        });
      } else {
        controls.hidden = true;
      }
    }

    setViewerModel(sorted, 0);

    // Source-link entry for the active model (gives access to license + author)
    const active = sorted[0];
    if (active && active.url) {
      const a = document.createElement("a");
      a.className = "card-model" + (active.exact_match ? " exact" : "");
      a.href = active.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = isTest ? "Источник тестовой модели — Sketchfab" : "Открыть на Sketchfab: " + (active.name || "");
      const meta = document.createElement("span");
      meta.className = "card-model-meta";
      const parts = [];
      if (active.license) parts.push("лицензия: " + active.license);
      if (active.author) parts.push("автор: " + active.author);
      meta.textContent = parts.join(" · ");
      a.appendChild(meta);
      cont.appendChild(a);
    }
  }


  function showCard(index) {
    const m = monuments[index];
    if (!m) return;

    cardYear.textContent = m.year ? String(m.year) : "год не установлен";
    cardTitle.textContent = m.title || "";
    cardPlace.textContent = [m.city, m.country].filter(Boolean).join(" · ");
    const a = [];
    if (m.sculptors && m.sculptors.length) a.push("Скульптор: " + m.sculptors.join(", "));
    if (m.architects && m.architects.length) a.push("Архитектор: " + m.architects.join(", "));
    cardAuthor.textContent = a.join(" · ");
    cardText.textContent = m.short_text || "";
    cardStatus.textContent = statusLabel(m.status);
    cardStatus.setAttribute("data-status", m.status || "unknown");

    cardPhoto.style.backgroundImage = "";
    cardPhoto.classList.remove("empty");
    cardPhoto.textContent = "";
    const photos = photoManifest[m.id];
    if (photos && photos.length) {
      const src = `../assets/mtk41/${m.id}/${photos[0]}`;
      cardPhoto.style.backgroundImage = `url("${encodeURI(src)}")`;
    } else {
      cardPhoto.classList.add("empty");
      cardPhoto.textContent = "фото не найдено";
    }
    populateCardModels(m.id);
    if (window.MtkMonumentViewer) window.MtkMonumentViewer.open(m);
    cardEl.hidden = false;
  }

  function hideCard() { cardEl.hidden = true; clearCardModelViewer(); if (window.MtkMonumentViewer) window.MtkMonumentViewer.close(); }
  cardClose.addEventListener("click", hideCard);

  // Tap outside the card closes it
  document.addEventListener("pointerdown", event => {
    if (cardEl.hidden) return;
    if (cardEl.contains(event.target)) return;
    if (event.target.closest(".work")) return;
    hideCard();
  });

  Promise.all([
    fetch("../data/mtk41.json").then(r => r.json()),
    fetch("../assets/mtk41/manifest.json").then(r => r.json()).catch(() => ({})),
      fetch("../assets/mtk41/models.json").then(r => r.json()).catch(() => ({})),
  ]).then(([mtk, manifest, models]) => {
    monuments = mtk.items || [];
    photoManifest = manifest || {};
      modelsManifest = models || {};
    render();
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.warn("Load failed:", err);
  });
})();
