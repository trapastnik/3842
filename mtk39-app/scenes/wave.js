/* МТК 39 · сцена «Прилив и отлив».
 * Столетие имени на карте мира: 1900 → 2025. Точка вспыхивает в год, когда
 * объект получил имя Ленина, и гаснет в год, когда имя сняли.
 *
 * Проекция — общий канон проекта: MtkProjection.WinkelTripel (порядок
 * аргументов (lat, lng), аспект только из WT.ASPECT — своей математики нет). */

import {
  DATA, nf, esc, fitCanvas, drawScale, loop, slowLoop, sizeWatch,
} from "./shared.js?v=1";

const FROM = 1900;
const TO = 2025;
const FLASH = 2.2;            // сколько лет держится вспышка события

const C = {
  live: "#d2b773",
  gone: "#c9545a",
  bg: "rgba(157, 163, 168, 0.22)",
};

const DEFAULTS = { speed: 6, autoplay: true };

export const waveScene = {
  id: "wave",
  title: { ru: "Прилив и отлив", en: "Ebb and flow", zh: "潮起与潮落" },
  keepAlive: true,
  watchdog: true,

  preload: {
    data: { corpus: DATA.corpus, countries: DATA.countries },
    fonts: ["1em '20 Kopeek'", "1em 'Nolde'", "1em '21 Cent'"],
  },

  settings: [
    { key: "speed", label: { ru: "Скорость хода", en: "Playback speed", zh: "播放速度" },
      type: "range", min: 1, max: 20, step: 0.5, unit: " лет/с", default: 6 },
    { key: "autoplay", label: { ru: "Идти сразу", en: "Autoplay", zh: "自动播放" },
      type: "toggle", default: true },
  ],

  opt: Object.assign({}, DEFAULTS),

  applySettings(values) {
    this.opt = Object.assign({}, DEFAULTS, values || {});
  },

  mount(el, ctx) {
    const scene = this;
    const app = ctx.app;
    const WT = window.MtkProjection.WinkelTripel;
    this.appRef = app;

    const corpus = ctx.data.corpus;
    const geolocated = corpus.records.filter((r) => r.lat !== null && r.lng !== null);
    const dated = geolocated.filter((r) => r.year_named || r.year_renamed);
    const undated = geolocated.filter((r) => !r.year_named && !r.year_renamed);

    el.classList.add("m39-scene", "m39-wave");
    el.innerHTML =
      '<canvas class="m39-canvas"></canvas>' +
      '<header class="m39-head m39-head--over">' +
        '<h1 class="m39-title"></h1><p class="m39-sub"></p></header>' +
      '<div class="m39-year"><div class="m39-year__num">1900</div>' +
        '<div class="m39-year__counts"></div></div>' +
      '<aside class="m39-legend"></aside>' +
      '<div class="m39-timeline">' +
        '<button class="m39-play kiosk-target" type="button">❚❚</button>' +
        '<input class="m39-scrub" type="range" min="' + FROM + '" max="' + TO +
          '" step="1" value="' + FROM + '" />' +
        '<div class="m39-ticks"></div>' +
      "</div>" +
      '<p class="m39-note"></p>';

    const canvas = el.querySelector(".m39-canvas");
    const g = canvas.getContext("2d");
    const title = el.querySelector(".m39-title");
    const sub = el.querySelector(".m39-sub");
    const yearEl = el.querySelector(".m39-year__num");
    const countsEl = el.querySelector(".m39-year__counts");
    const legend = el.querySelector(".m39-legend");
    const scrub = el.querySelector(".m39-scrub");
    const playBtn = el.querySelector(".m39-play");
    const ticks = el.querySelector(".m39-ticks");
    const note = el.querySelector(".m39-note");

    let width = 0;
    let height = 0;
    let worldW = 0;
    let worldH = 0;
    let offX = 0;
    let offY = 0;
    let year = FROM;
    let playing = true;
    let lastFrame = 0;

    /* ---- контуры суши ---- */
    const land = [];
    for (const f of ctx.data.countries.features) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates]
        : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
      for (const poly of polys) {
        for (const ring of poly) if (ring.length >= 4) land.push(ring);
      }
    }

    const project = (lat, lng) => {
      const p = WT.project(lat, lng, worldW, worldH);
      return [p.x + offX, p.y + offY];
    };

    function drawLand() {
      g.beginPath();
      for (const ring of land) {
        let started = false;
        let prevX = 0;
        for (const [lng, lat] of ring) {
          const [x, y] = project(lat, lng);
          // разрыв на антимеридиане: не тянем полигон через всю карту
          if (started && Math.abs(x - prevX) > worldW * 0.5) started = false;
          if (!started) { g.moveTo(x, y); started = true; } else { g.lineTo(x, y); }
          prevX = x;
        }
      }
      g.fillStyle = "rgba(72, 86, 95, 0.72)";
      g.fill();
      g.strokeStyle = "rgba(247, 249, 239, 0.18)";
      g.lineWidth = 0.7;
      g.stroke();
    }

    // 0 — ещё не названо, 1 — носит имя, 2 — имя снято
    function stateAt(p, y) {
      if (p.year_named && y < p.year_named) return 0;
      if (p.year_renamed && y >= p.year_renamed) return 2;
      if (!p.year_named && p.year_renamed && y < p.year_renamed) return 1;
      return p.year_named ? 1 : 0;
    }

    const hexToRgba = (hex, a) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
    };

    function render() {
      const u = drawScale(app, width);
      g.clearRect(0, 0, width, height);
      drawLand();

      // фон: объекты, для которых материалы не называют год
      for (const p of undated) {
        const [x, y] = project(p.lat, p.lng);
        g.beginPath();
        g.arc(x, y, 1.7 * u, 0, Math.PI * 2);
        g.fillStyle = C.bg;
        g.fill();
      }

      let live = 0;
      let gone = 0;
      const flashes = [];

      for (const p of dated) {
        const st = stateAt(p, year);
        if (st === 0) continue;
        const [x, y] = project(p.lat, p.lng);
        if (st === 1) {
          live += 1;
          g.beginPath();
          g.arc(x, y, 2.6 * u, 0, Math.PI * 2);
          g.fillStyle = C.live;
          g.fill();
          if (p.year_named && year - p.year_named < FLASH) {
            flashes.push([x, y, 1 - (year - p.year_named) / FLASH, C.live]);
          }
        } else {
          gone += 1;
          g.beginPath();
          g.arc(x, y, 2.1 * u, 0, Math.PI * 2);
          g.fillStyle = year - p.year_renamed < FLASH ? C.gone : "rgba(201, 84, 90, 0.34)";
          g.fill();
          if (year - p.year_renamed < FLASH) {
            flashes.push([x, y, 1 - (year - p.year_renamed) / FLASH, C.gone]);
          }
        }
      }

      // вспышки поверх всего: событие года должно быть видно в общей россыпи
      for (const [x, y, t, color] of flashes) {
        const r = (5 + (1 - t) * 26) * u;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.lineWidth = 1.6 * u;
        g.strokeStyle = hexToRgba(color, t * 0.8);
        g.stroke();
      }

      yearEl.textContent = Math.floor(year);
      countsEl.textContent = app.t("wave.counts", {
        live: nf.format(live), gone: nf.format(gone),
      });
    }

    const anim = loop((now) => {
      ctx.beat();
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
      lastFrame = now;
      if (playing) {
        year += dt * (scene.opt.speed || DEFAULTS.speed);
        if (year > TO) year = FROM;
        scrub.value = String(Math.floor(year));
      }
      render();
    });

    const watch = sizeWatch(el, (w, h) => {
      width = w; height = h;
      fitCanvas(canvas, w, h);
      // карта занимает ширину сцены, поля — под заголовок и таймлайн
      worldW = Math.min(w * 0.92, h * 0.62 * WT.ASPECT);
      worldH = worldW / WT.ASPECT;
      offX = (w - worldW) / 2;
      offY = (h - worldH) / 2 - h * 0.04;
      render();
    });

    function setPlaying(next) {
      playing = next;
      playBtn.textContent = playing ? "❚❚" : "▶";
      playBtn.setAttribute("aria-label", app.t(playing ? "wave.pause" : "wave.play"));
    }

    const onPlay = () => setPlaying(!playing);
    const onScrub = () => {
      setPlaying(false);
      year = Number(scrub.value);
      render();
    };
    playBtn.addEventListener("click", onPlay);
    scrub.addEventListener("input", onScrub);

    function retext() {
      title.textContent = app.t("wave.title");
      sub.textContent = app.t("wave.sub");
      note.textContent = app.t("wave.note", {
        dated: nf.format(dated.length), undated: nf.format(undated.length),
      });
      scrub.setAttribute("aria-label", app.t("wave.year"));
      legend.replaceChildren();
      for (const [color, key] of [
        [C.live, "wave.legend.live"], [C.gone, "wave.legend.gone"], [C.bg, "wave.legend.bg"],
      ]) {
        const row = document.createElement("div");
        row.className = "m39-legend__row";
        row.innerHTML = '<span class="m39-legend__dot" style="background:' + color + '"></span>' +
          esc(app.t(key));
        legend.appendChild(row);
      }
      setPlaying(playing);
    }

    ticks.replaceChildren();
    for (let y = FROM; y <= TO; y += 25) {
      const s = document.createElement("span");
      s.textContent = y;
      ticks.appendChild(s);
    }

    this.api = {
      anim,
      retext,
      remeasure: () => watch.measure(true),
      redraw: () => { if (width) render(); },
      reset() {
        year = FROM;
        scrub.value = String(FROM);
        setPlaying(scene.opt.autoplay !== false);
        lastFrame = 0;
        if (width) render();
      },
      /* Аттрактор: столетие идёт само, но медленно и без интерфейса. */
      standby(fps) {
        anim.stop();
        this.reset();
        setPlaying(true);
        const step = 1 / Math.max(1, fps) * (scene.opt.speed || DEFAULTS.speed);
        const slow = slowLoop(() => {
          year += step;
          if (year > TO) year = FROM;
          scrub.value = String(Math.floor(year));
          render();
        }, fps);
        slow.start();
        return () => { slow.stop(); lastFrame = 0; anim.start(); };
      },
      destroy() {
        anim.stop();
        playBtn.removeEventListener("click", onPlay);
        scrub.removeEventListener("input", onScrub);
        watch.destroy();
      },
    };

    retext();
    watch.measure(true);
    setPlaying(this.opt.autoplay !== false);
    anim.start();
  },

  resume() {
    if (!this.api) return;
    this.api.remeasure();
    this.api.anim.start();
  },

  pause() { if (this.api) this.api.anim.stop(); },
  reset() { if (this.api) this.api.reset(); },
  setLang() { if (this.api) this.api.retext(); },

  setA11y() {
    if (!this.api) return;
    this.api.remeasure();
    this.api.redraw();
  },

  standby() {
    if (!this.api) return null;
    const fps = ((this.appRef && this.appRef.config.timings) || {}).standbyFps || 10;
    return this.api.standby(fps);
  },

  unmount() {
    if (this.api) this.api.destroy();
    this.api = null;
  },
};
