/**
 * Thin outward ribbon following a polyline — used for the burnt-sienna road band so it
 * can run along the road frontage and then BEND at each end to lie flush along the
 * flanking contiguous offshoot (instead of overshooting straight along the road axis,
 * which diverges from an angled offshoot on an irregular parcel).
 *
 * The ribbon keeps a constant thin `widthPt`, offset to the OUTWARD side (away from the
 * figure centroid, matching edgeStrip's convention). Miter joins at the bends keep the
 * width roughly constant. All points are `[x, y]` in PDF-point space.
 */

/** Unit normal of edge p1→p2, flipped to point AWAY from the centroid (as edgeStrip does). */
export function outwardNormal(p1, p2, cen) {
  const ex = p2[0] - p1[0], ey = p2[1] - p1[1]
  const len = Math.hypot(ex, ey) || 1
  let nx = -ey / len, ny = ex / len
  const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2
  const withN = (mx + nx - cen[0]) ** 2 + (my + ny - cen[1]) ** 2
  const withoutN = (mx - cen[0]) ** 2 + (my - cen[1]) ** 2
  if (withN < withoutN) { nx = -nx; ny = -ny }
  return [nx + 0, ny + 0]   // normalise -0 → 0 (keeps toEqual/coords clean)
}

/**
 * @param {Array<[number,number]>} inner  The ribbon's inner (parcel-side) polyline, in order.
 *        For a road: [offshootTipA?, A, B, offshootTipB?].
 * @param {number} widthPt  Ribbon thickness (thin — the road band width).
 * @param {[number,number]} centroid  Figure centroid; the ribbon is offset away from it.
 * @returns {Array<[number,number]>} Closed polygon: the inner polyline followed by the
 *        outward-offset polyline reversed. Empty if `inner` has < 2 points.
 */
export function roadBandRibbon(inner, widthPt, centroid) {
  if (!Array.isArray(inner) || inner.length < 2) return []
  const segN = []
  for (let k = 0; k < inner.length - 1; k++) segN.push(outwardNormal(inner[k], inner[k + 1], centroid))
  const outer = []
  for (let j = 0; j < inner.length; j++) {
    let nrm, scale = widthPt
    if (j === 0) {
      nrm = segN[0]
    } else if (j === inner.length - 1) {
      nrm = segN[segN.length - 1]
    } else {
      // Miter: bisector of the two adjacent segment normals, lengthened by 1/cos(half-angle)
      // so the offset edges meet. Cap the stretch so a sharp bend can't spike the corner.
      let mx = segN[j - 1][0] + segN[j][0], my = segN[j - 1][1] + segN[j][1]
      const ml = Math.hypot(mx, my) || 1
      mx /= ml; my /= ml
      const cosHalf = Math.max(0.5, mx * segN[j][0] + my * segN[j][1])
      nrm = [mx, my]
      scale = widthPt / cosHalf
    }
    outer.push([inner[j][0] + nrm[0] * scale, inner[j][1] + nrm[1] * scale])
  }
  return inner.concat(outer.reverse())
}
