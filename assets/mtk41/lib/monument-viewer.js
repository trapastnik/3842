/**
 * MonumentViewer — оффлайн-3D-плеер процедурных моделей памятников Ленину.
 *
 * Каждая модель строится из примитивов (постамент + фигура + голова)
 * с пропорциями из данных о высоте конкретного памятника. Сцена
 * автоматически вращается, drag/touch отменяет автовращение, через 4с
 * без касаний — возобновляет.
 *
 * Использование:
 *
 *   import { MonumentViewer } from "../assets/mtk41/lib/monument-viewer.js";
 *   const v = new MonumentViewer(container, { heights, status, type, title });
 *   ...
 *   v.dispose();
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const PALETTE = {
  paper: 0xF7F9EF,
  brass: 0xD2B773,
  red: 0xA02128,
  graphite: 0x435059,
  window: 0x9DA3A6,
  ink: 0x0E1214,
};

function statusColor(status) {
  switch (status) {
    case "extant":     return PALETTE.red;
    case "demolished": return PALETTE.graphite;
    case "relocated":  return PALETTE.brass;
    default:           return PALETTE.window;
  }
}

/**
 * Build the procedural mesh group for one monument.
 *
 * shape categories:
 *   - "bust":   short pedestal + head only (бюст 1919, бюст на Капитале, мавзолей-бюст)
 *   - "head":   огромная голова на пьедестале (Улан-Удэ)
 *   - "group":  две стилизованные фигуры рядом (Горки Пинчук+Таурит, Похороны)
 *   - "figure": стандартный полнофигурный монумент (большинство)
 */
function buildMonumentMesh({ heights, status, type }) {
  const root = new THREE.Group();
  const h = heights || { statue: 5, pedestal: 2 };
  const statueH = Math.max(0.3, h.statue || 5);
  const pedH = Math.max(0, h.pedestal || 0);
  const baseColor = statusColor(status);

  // --- Pedestal -----------------------------------------------------------
  if (pedH > 0.1) {
    const pedW = Math.max(0.8, Math.min(pedH * 0.55, statueH * 0.9));
    const pedD = pedW * 0.85;
    const pedGeom = new THREE.BoxGeometry(pedW, pedH, pedD);
    const pedMat = new THREE.MeshStandardMaterial({
      color: PALETTE.graphite,
      roughness: 0.85,
      metalness: 0.05,
    });
    const ped = new THREE.Mesh(pedGeom, pedMat);
    ped.position.y = pedH / 2;
    root.add(ped);

    // Subtle brass band at top of pedestal
    const bandGeom = new THREE.BoxGeometry(pedW * 1.05, pedH * 0.06, pedD * 1.05);
    const bandMat = new THREE.MeshStandardMaterial({
      color: PALETTE.brass,
      roughness: 0.4,
      metalness: 0.55,
    });
    const band = new THREE.Mesh(bandGeom, bandMat);
    band.position.y = pedH - pedH * 0.06;
    root.add(band);
  }

  // --- Figure / bust / head ----------------------------------------------
  const figMat = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.55,
    metalness: 0.35,
  });
  const figGroup = new THREE.Group();
  figGroup.position.y = pedH;

  if (type === "head") {
    // Just an oversized head on the pedestal (Ulan-Ude).
    const headR = statueH * 0.45;
    const headGeom = new THREE.SphereGeometry(headR, 32, 24);
    const head = new THREE.Mesh(headGeom, figMat);
    head.position.y = headR * 0.95;
    // Slightly squash to feel like a stylised head
    head.scale.set(1, 1.1, 1);
    figGroup.add(head);
  } else if (type === "bust" || statueH < 1.8) {
    // Bust on a short neck/collar.
    const collarH = statueH * 0.35;
    const collarTopR = statueH * 0.32;
    const collarGeom = new THREE.CylinderGeometry(collarTopR, collarTopR * 1.4, collarH, 16);
    const collar = new THREE.Mesh(collarGeom, figMat);
    collar.position.y = collarH / 2;
    figGroup.add(collar);

    const headR = statueH * 0.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 32, 24), figMat);
    head.position.y = collarH + headR * 0.85;
    head.scale.set(1, 1.12, 1);
    figGroup.add(head);
  } else if (type === "group") {
    // Two stylised figures side by side.
    for (let i = 0; i < 2; i += 1) {
      const sub = makeFigure(statueH * 0.85, figMat);
      sub.position.x = (i === 0 ? -1 : 1) * statueH * 0.32;
      // Second figure subtly different — slightly turned
      sub.rotation.y = i === 0 ? 0.08 : -0.05;
      figGroup.add(sub);
    }
  } else {
    // Standing single figure (most monuments).
    figGroup.add(makeFigure(statueH, figMat));
  }
  root.add(figGroup);

  // Ground disc (very subtle) — gives the eye a base.
  const ringR = Math.max(statueH, pedH) * 1.5;
  const ringGeom = new THREE.RingGeometry(ringR * 0.55, ringR * 0.6, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: PALETTE.brass,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  root.add(ring);

  // Centre the group so its base sits at y=0 and its overall bounding box
  // is centred on x=0,z=0. (Computed once after population.)
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;

  // Total monument height (used by camera framing).
  root.userData.totalHeight = statueH + pedH;
  return root;
}

/**
 * Stylised full-figure: tapered "robe" body, narrower shoulders, head, one extended arm.
 */
function makeFigure(totalH, mat) {
  const g = new THREE.Group();

  const bodyH = totalH * 0.74;
  const shoulderR = totalH * 0.16;
  const hipR = totalH * 0.21;
  const bodyGeom = new THREE.CylinderGeometry(shoulderR, hipR, bodyH, 24, 1);
  const body = new THREE.Mesh(bodyGeom, mat);
  body.position.y = bodyH / 2;
  g.add(body);

  // Shoulders capsule
  const shoulderGeom = new THREE.SphereGeometry(shoulderR * 1.05, 24, 16);
  const shoulders = new THREE.Mesh(shoulderGeom, mat);
  shoulders.position.y = bodyH;
  shoulders.scale.set(1, 0.45, 1);
  g.add(shoulders);

  // Head
  const headR = totalH * 0.10;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 32, 20), mat);
  head.position.y = bodyH + shoulderR * 0.7 + headR * 0.9;
  head.scale.set(1, 1.12, 1);
  g.add(head);

  // Extended arm — Lenin's iconic «указующий» gesture.
  const armLen = totalH * 0.32;
  const armR = totalH * 0.045;
  const armGeom = new THREE.CylinderGeometry(armR * 0.85, armR, armLen, 14);
  const arm = new THREE.Mesh(armGeom, mat);
  arm.position.set(shoulderR * 0.6, bodyH * 0.85, armR * 0.2);
  arm.rotation.z = -Math.PI / 2 + 0.42;   // raised slightly above horizontal
  arm.rotation.y = -0.18;
  // After rotation, the cylinder's axis lies along x; translate by half its length
  arm.translateY(armLen / 2);
  g.add(arm);

  return g;
}


export class MonumentViewer {
  /**
   * @param {HTMLElement} container — square-ish empty div
   * @param {Object} opts
   * @param {{statue:number,pedestal:number}} opts.heights
   * @param {string} opts.status — extant | demolished | relocated | unknown
   * @param {string} [opts.type] — figure | bust | head | group
   */
  constructor(container, opts) {
    this.container = container;
    this.opts = opts || {};
    this._autoRotate = true;
    this._lastInteraction = 0;
    this._disposed = false;

    this._initThree();
    this._buildScene();
    this._fitCamera();
    this._attachInteraction();
    this._tick = this._tick.bind(this);
    this._rafId = requestAnimationFrame(this._tick);
    this._onResize = this._onResize.bind(this);
    window.addEventListener("resize", this._onResize);
  }

  _initThree() {
    const c = this.container;
    const rect = c.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height) || Math.floor(rect.width * 0.7));

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(PALETTE.ink, 0);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    c.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 500);

    // --- Lighting (brand-matched) -----------------------------------------
    const amb = new THREE.AmbientLight(0xFFFFFF, 0.35);
    this.scene.add(amb);

    const key = new THREE.DirectionalLight(PALETTE.brass, 1.4);
    key.position.set(8, 14, 6);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(PALETTE.paper, 0.55);
    fill.position.set(-6, 8, 4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(PALETTE.red, 0.35);
    rim.position.set(0, 4, -10);
    this.scene.add(rim);
  }

  _buildScene() {
    this.monument = buildMonumentMesh(this.opts);
    this.scene.add(this.monument);
  }

  _fitCamera() {
    const totalH = this.monument.userData.totalHeight || 7;
    // Camera framing: place a bit further back than the height; tilt slightly down.
    const d = totalH * 2.1;
    this.camera.position.set(d * 0.9, totalH * 0.65, d * 0.9);
    this.camera.lookAt(0, totalH * 0.55, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.minPolarAngle = Math.PI * 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.target.set(0, totalH * 0.55, 0);
    this.controls.update();
  }

  _attachInteraction() {
    const el = this.renderer.domElement;
    const onStart = () => {
      this._autoRotate = false;
      this._lastInteraction = performance.now();
    };
    const onEnd = () => {
      this._lastInteraction = performance.now();
    };
    el.addEventListener("pointerdown", onStart);
    el.addEventListener("pointerup", onEnd);
    el.addEventListener("pointercancel", onEnd);
    this._onStart = onStart;
    this._onEnd = onEnd;
  }

  _tick(now) {
    if (this._disposed) return;
    if (!this._autoRotate) {
      // Resume autorotate 3.5s after the last interaction
      if (now - this._lastInteraction > 3500) {
        this._autoRotate = true;
      }
    }
    if (this._autoRotate && this.monument) {
      this.monument.rotation.y += 0.0035;
    }
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._rafId = requestAnimationFrame(this._tick);
  }

  _onResize() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height) || Math.floor(rect.width * 0.7));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this._disposed = true;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener("resize", this._onResize);
    if (this.renderer) {
      const el = this.renderer.domElement;
      el.removeEventListener("pointerdown", this._onStart);
      el.removeEventListener("pointerup", this._onEnd);
      el.removeEventListener("pointercancel", this._onEnd);
      this.renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    if (this.controls) this.controls.dispose();
    if (this.monument) {
      this.monument.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.renderer = null;
    this.scene = null;
    this.controls = null;
    this.monument = null;
  }
}


/**
 * Heuristic shape category from monument id (used as default if not provided).
 */
export function inferMonumentType(id) {
  if (!id) return "figure";
  if (id === "ulan-ude-1970-zilberman") return "head";
  if (id === "gorki-pinchuk-taurit" || id === "merkurov-1958-funeral") return "group";
  if (
    id === "alekseev-1919-bust" ||
    id === "voznesenye-1925-capital-bust" ||
    id === "chelyabinsk-aloe-pole-1925"
  ) return "bust";
  return "figure";
}
