// app-frontend/src/utils/beaconReportGeometry.js
// Pure helpers for the beacon comparison report — no jsPDF/Vue imports, so they
// can be checked under Node in isolation.

/** Smallest "nice" 1/2/5 ×10ⁿ value ≥ x (for exaggeration factors). */
export function niceNumber(x) {
  if (!(x > 0) || !isFinite(x)) return 1
  const exp = Math.floor(Math.log10(x))
  const base = Math.pow(10, exp)
  const f = x / base
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * base
}

/** Largest "nice" 1/2/5 ×10ⁿ value ≤ x (for scale-bar lengths). */
export function niceFloor(x) {
  if (!(x > 0) || !isFinite(x)) return 0
  const exp = Math.floor(Math.log10(x))
  const base = Math.pow(10, exp)
  const f = x / base
  const nice = f >= 5 ? 5 : f >= 2 ? 2 : 1
  return nice * base
}

/** Filesystem-safe identifier for the report filename. */
export function sanitizeReportFilename(id) {
  const cleaned = String(id || '').trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'report'
}

/** Page mm per ground metre that fits the network span into the plot box. */
export function planScaleMmPerM(spanE, spanN, boxW, boxH) {
  const sE = boxW / (spanE || 1)
  const sN = boxH / (spanN || 1)
  return Math.min(sE, sN)
}

/** Vector exaggeration so the largest displacement renders ≈ targetMm. */
export function chooseExaggeration(maxDispM, mmPerM, targetMm = 20) {
  if (!(maxDispM > 0) || !(mmPerM > 0)) return 1
  return Math.max(1, niceNumber(targetMm / (maxDispM * mmPerM)))
}

/** Nice round ground metres whose drawn length fits within maxBarMm. */
export function scaleBarMetres(mmPerM, maxBarMm = 40) {
  if (!(mmPerM > 0)) return 0
  return niceFloor(maxBarMm / mmPerM)
}
