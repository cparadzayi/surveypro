/**
 * AutoCAD Color Index (ACI): the 256-colour palette a Release 12 DXF can name. A diagram colour
 * (an RGB from the PDF) becomes the nearest index, so the DXF's colours track the PDF's.
 *
 * Indices 10-249 are generated, 24 hues (every 15 degrees) x 10 shades; 1-9 and 250-255 are listed.
 */

const FIXED = {
  1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255], 5: [0, 0, 255], 6: [255, 0, 255],
  8: [128, 128, 128], 9: [192, 192, 192],
  250: [51, 51, 51], 251: [80, 80, 80], 252: [105, 105, 105], 253: [130, 130, 130], 254: [190, 190, 190],
}

function hsv(h, s, v) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

const PALETTE = (() => {
  const p = { ...FIXED }
  const V = [1, 0.8, 0.6, 0.5, 0.3]
  for (let n = 10; n <= 249; n++) {
    const hue = Math.floor((n - 10) / 10) * 15
    const k = (n - 10) % 10
    p[n] = hsv(hue, k % 2 === 0 ? 1 : 0.5, V[Math.floor(k / 2)])
  }
  return p
})()

export const aciRgb = (n) => PALETTE[n] ?? null

/** '#rrggbb' -> the nearest ACI. Black is 7 (ACI 7 shows as white on a dark screen and plots black,
 *  the usual way a drawing's black is written) and pure white is 255, which stays white on both. */
export function nearestAci(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex))
  if (!m) return 7
  const v = parseInt(m[1], 16)
  const rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  if (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0) return 7
  if (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255) return 255
  let best = 7, bd = Infinity
  for (const [k, c] of Object.entries(PALETTE)) {
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2
    if (d < bd) { bd = d; best = Number(k) }
  }
  return best
}
