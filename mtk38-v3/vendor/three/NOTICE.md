# Vendored: Three.js — локально, для офлайн-киоска

- **Версия:** three **0.184.0** (r184), npm `three@0.184.0`.
- **Лицензия:** MIT © three.js authors (mrdoob и контрибьюторы).
- **Зачем локально:** прод = офлайн-киоск; рантайм-CDN запрещён (CDN → чёрный экран). См. `mtk38-handoff/START-v3.md`.

## Что вендорено
```
build/
  three.core.js / .min.js        — ядро (общая база)
  three.webgpu.js / .min.js      — WebGPU-сборка (вкл. WebGPURenderer + WebGLBackend-фоллбэк + TSL)
  three.tsl.js / .min.js         — TSL (Three Shading Language), реэкспорт из three/webgpu
jsm/
  tsl/                           — TSL-пост-ноды (BloomNode, DepthOfFieldNode, ChromaticAberrationNode,
                                   FilmNode, SMAANode, Lut3DNode, GTAONode, GodraysNode, …) — для Ф1
  controls/OrbitControls.js      — орбита камеры (dev/полигон)
  capabilities/WebGPU.js         — проба доступности WebGPU (для фоллбэка)
```

## Патч (важно для офлайна)
Из `build/three.webgpu.js` (non-min) **удалён единственный рантайм-CDN-импорт** —
dev-хелпер `import 'https://greggman.github.io/webgpu-avoid-redundant-state-setting/…'`
(строка ~79868). В min-сборке его и так нет. После патча — **ноль** рантайм-CDN-ссылок
во всём вендоренном дереве (проверено grep по `import … from 'http…'`).

## Подключение (importmap)
```html
<script type="importmap">{ "imports": {
  "three":         "./vendor/three/build/three.webgpu.js",
  "three/webgpu":  "./vendor/three/build/three.webgpu.js",
  "three/tsl":     "./vendor/three/build/three.tsl.js",
  "three/addons/": "./vendor/three/jsm/"
}}</script>
```
ESM → страницы движка открываются по **http** (не `file://`). Dev-сервер — не на 8092.

## Как обновить версию
`npm pack three@<ver>` → распаковать → скопировать `build/` (+ нужные `examples/jsm/…`) →
**снова вырезать** greggman-импорт из non-min webgpu → переаудит grep на `import … 'http`.
