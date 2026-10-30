// The ring search as it was before it measured each label and circle once per ring centre: for every
// radius tried it asks every label and circle again. Slower, simpler, and the definition the interval
// version in ../beaconClusterInset.js must agree with exactly (beaconClusterInset.ringParity.test.js).
// Copied from git (the commit before the interval search), with only its name changed.

export function fitIndicatorRingReference({ cx, cy, cluster, otherBeacons = [], rects = [], beaconRadius, gap = 1.2, minR = 6, softBeacons = false, reach = 30, offsets = [1.5, 3, 5, 8], leastCut = false }) {
  // Only real labels count: a registered region far larger than any label is a
  // block or a band, and the ring cannot be asked to clear those.
  const farthest = (x, y) => Math.max(...cluster.map((p) => Math.hypot(p.x - x, p.y - y)));
  // No ring tried below can be larger than hiMax or centred further than maxOff from (cx, cy), so a
  // label or circle beyond that reach is never cut: dropping it changes no answer, and on a dense
  // plan (hundreds of beacons and labels, tried for every cluster) it is most of the work.
  const maxOff = Math.max(0, ...offsets);
  const loMax = Math.max(minR, farthest(cx, cy) + maxOff + beaconRadius + gap + 0.8);
  const hiMax = Math.max(loMax * 2.5, loMax + reach);
  const nearRect = (q) => {
    const nx = Math.max(q.x, Math.min(cx, q.x + q.width)), ny = Math.max(q.y, Math.min(cy, q.y + q.height));
    return Math.hypot(nx - cx, ny - cy) - maxOff - gap < hiMax;
  };
  const labels = rects.filter((q) => q && q.width <= 120 && q.height <= 60 && q.width * q.height <= 2500 && nearRect(q));
  otherBeacons = otherBeacons.filter((q) => Math.hypot(q.x - cx, q.y - cy) - maxOff - beaconRadius - gap < hiMax);
  // Does a ring at (x, y, r) cut label q: neither wholly outside it nor wholly around it? The farthest
  // corner is the one with the larger offset on each axis, so no array or four hypots per label.
  const cutsLabel = (x, y, r, q) => {
    const nx = Math.max(q.x, Math.min(x, q.x + q.width)), ny = Math.max(q.y, Math.min(y, q.y + q.height));
    const dmin = Math.hypot(nx - x, ny - y);
    const dmax = Math.hypot(Math.max(Math.abs(q.x - x), Math.abs(q.x + q.width - x)), Math.max(Math.abs(q.y - y), Math.abs(q.y + q.height - y)));
    return !(dmax + gap <= r || dmin - gap >= r);
  };
  const okAt = (x, y, r) => {
    // softBeacons: only labels must be clear; another beacon's circle may be cut.
    if (!softBeacons) {
      for (const q of otherBeacons) {
        const d = Math.hypot(q.x - x, q.y - y);
        if (!(d + beaconRadius + gap <= r || d - beaconRadius - gap >= r)) return false;
      }
    }
    for (const q of labels) if (cutsLabel(x, y, r, q)) return false;
    return true;
  };
  // How much a ring at (x, y, r) would cut: a label counts 3, another beacon's circle 1.
  // `stopAbove`: the count only ever grows, so once it passes this the caller has a better ring
  // already and the exact total no longer matters; the partial count returned then is still above it.
  const cutsAt = (x, y, r, stopAbove = Infinity) => {
    let n = 0;
    for (const q of otherBeacons) {
      const d = Math.hypot(q.x - x, q.y - y);
      if (!(d + beaconRadius + gap <= r || d - beaconRadius - gap >= r)) { n += 1; if (n > stopAbove) return n; }
    }
    for (const q of labels) if (cutsLabel(x, y, r, q)) { n += 3; if (n > stopAbove) return n; }
    return n;
  };
  const centres = [[0, 0]];
  for (const off of offsets) {
    for (let a = 0; a < 360; a += 45) centres.push([Math.cos((a * Math.PI) / 180) * off, Math.sin((a * Math.PI) / 180) * off]);
  }
  let best = null;
  for (const [ox, oy] of centres) {
    const x = cx + ox, y = cy + oy;
    const lo = Math.max(minR, farthest(x, y) + beaconRadius + gap + 0.8);
    const hi = Math.max(lo * 2.5, lo + reach);
    for (let r = lo; r <= hi; r += 0.5) {
      if (!okAt(x, y, r)) continue;
      const cost = r + Math.hypot(ox, oy) * 2;
      if (!best || cost < best.cost) best = { cx: x, cy: y, r, cost, clear: true };
      break;
    }
  }
  if (best) return { cx: best.cx, cy: best.cy, r: best.r, clear: true };
  if (leastCut) {
    // No clear ring exists: the full ring that cuts the least, labels weighing most.
    let worst = null;
    for (const [ox, oy] of centres) {
      const x = cx + ox, y = cy + oy;
      const lo = Math.max(minR, farthest(x, y) + beaconRadius + gap + 0.8);
      for (let r = lo; r <= Math.max(lo * 2.5, lo + reach); r += 0.5) {
        const off2 = Math.hypot(ox, oy) * 2;
        // A ring needs cuts * 100 + r + off2 < worst.cost to replace the best so far, so any count
        // past (worst.cost - r - off2) / 100 loses and need not be finished.
        const cuts = cutsAt(x, y, r, worst ? (worst.cost - r - off2) / 100 : Infinity);
        const cost = cuts * 100 + r + off2;
        if (!worst || cost < worst.cost) worst = { cx: x, cy: y, r, cost, cuts };
      }
    }
    if (worst) return { cx: worst.cx, cy: worst.cy, r: worst.r, clear: false, cuts: worst.cuts };
  }
  const lo = Math.max(minR, farthest(cx, cy) + beaconRadius + gap + 0.8);
  return { cx, cy, r: lo, clear: false };
}
