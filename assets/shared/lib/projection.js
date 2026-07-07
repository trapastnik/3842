// Shared map projection helpers для всех МТК с 2D-картами.
//
// Winkel Tripel — стандартная параллель arccos(2/π) ≈ 50.4657°.
// Аспект (2+π)/π ≈ 1.637 (см. `ASPECT`).
// На высоких широтах не растягивает как equirectangular; на мировом
// масштабе выглядит атласно.
//
// Использование в prototype:
//   1. index.html: <script src="../assets/shared/lib/projection.js"></script>
//      (или относительный путь до этого файла из каталога прототипа)
//      ПЕРЕД <script src="./map.js"></script>.
//   2. map.js: определи map.worldW, map.worldH (обычно worldH = worldW / MtkProjection.WinkelTripel.ASPECT).
//   3. Замени свою proj(lat, lng) → возвращать { x, y } world-px:
//        function project(lat, lng) {
//          return MtkProjection.WinkelTripel.project(lat, lng, map.worldW, map.worldH);
//        }
//   4. Для рисования базовой карты (geojson) — тот же project() —
//      маркеры и полигоны в одной системе координат.
(function (root) {
  const WT_COS_PHI1 = 2 / Math.PI;
  const WT_X_HALF   = (2 + Math.PI) / 2;
  const WT_Y_HALF   = Math.PI / 2;
  const WT_ASPECT   = (2 + Math.PI) / Math.PI;   // ≈ 1.637

  function winkelTripelProject(lat, lng, worldW, worldH) {
    const phi = lat * Math.PI / 180;
    const lambda = lng * Math.PI / 180;
    const cosphi = Math.cos(phi);
    const cosLambdaHalf = Math.cos(lambda / 2);
    const alpha = Math.acos(cosphi * cosLambdaHalf);
    const sinc = alpha < 1e-9 ? 1 : Math.sin(alpha) / alpha;
    const wx = 0.5 * (lambda * WT_COS_PHI1 + 2 * cosphi * Math.sin(lambda / 2) / sinc);
    const wy = 0.5 * (phi + Math.sin(phi) / sinc);
    const x = (wx + WT_X_HALF) / (2 * WT_X_HALF) * worldW;
    const y = (WT_Y_HALF - wy) / (2 * WT_Y_HALF) * worldH;
    return { x, y };
  }

  // Простая equirectangular — на случай если проекция не критична.
  function equirectangularProject(lat, lng, worldW, worldH) {
    const x = ((lng + 180) / 360) * worldW;
    const y = ((90 - lat) / 180) * worldH;
    return { x, y };
  }

  root.MtkProjection = {
    WinkelTripel: {
      project: winkelTripelProject,
      ASPECT: WT_ASPECT,
    },
    Equirectangular: {
      project: equirectangularProject,
      ASPECT: 2.0,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
