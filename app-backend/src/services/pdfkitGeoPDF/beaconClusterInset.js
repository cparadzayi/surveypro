import { fitSuffixLabel, boxFitsInside } from '../diagram/suffixLabelFit.js';

/**
 * Beacon-cluster insets.
 *
 * Where several beacons stand a few millimetres apart (the tips of a row of
 * narrow stands meeting a road, say) the suffix letters cannot sit inside their
 * own stands at a legible size, and end up tiny, crowded or overlapping the
 * boundaries. Those beacons are pulled out of the main plan and drawn at a larger
 * scale in an inset, where each letter fits inside its own stand at full size;
 * the main plan keeps the beacon circles and marks the area "Inset N".
 *
 * The inset is the main plan's own transform, magnified about the cluster's
 * centre, so its orientation always agrees with the plan.
 */

const CLUSTER_LINK_PT = 40;      // beacons closer than this share an inset
const WINDOW_PAD_PT = 16;        // paper margin kept round a cluster
const MIN_MAG = 3;
const MAX_MAG = 10;

/** Sutherland-Hodgman: polygon [{x,y}] clipped to the axis-aligned rect. */
export function clipToRect(poly, r) {
  const edges = [
    (p) => p.x - r.x, (p) => r.x + r.width - p.x,
    (p) => p.y - r.y, (p) => r.y + r.height - p.y,
  ];
  let out = poly;
  for (const inside of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length];
      const da = inside(a), db = inside(b);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    if (out.length === 0) break;
  }
  return out;
}

/**
 * Where a stand's number goes in the inset: the roomiest spot of the part of the
 * stand that shows, clear of the letters and circles already placed. The largest
 * of a few sizes that fits wins, so a narrow stand still gets a (smaller) number.
 * Returns {cx, cy, fontSize} or null if nothing fits.
 */
export function placeStandNumber(poly, widthAt, obstacles, { sizes = [9, 8, 7, 6, 5], step = 2 } = {}) {
  if (poly.length < 3) return null;
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const far = { x: -1e9, y: -1e9 };
  const hit = (b) => obstacles.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
  for (const fs of sizes) {
    const w = widthAt(fs), h = fs * 1.0;
    let best = null;
    for (let cy = y0; cy <= y1; cy += step) {
      for (let cx = x0; cx <= x1; cx += step) {
        if (!boxFitsInside(poly, far, cx, cy, w, h, 0, { beaconRadius: 0, edgeClear: 0.8, circleClear: 0 })) continue;
        if (hit({ x: cx - w / 2 - 0.5, y: cy - h / 2 - 0.5, w: w + 1, h: h + 1 })) continue;
        // Prefer the middle of the visible part of the stand.
        const d = Math.hypot(cx - (x0 + x1) / 2, cy - (y0 + y1) / 2);
        if (!best || d < best.d) best = { cx, cy, d };
      }
    }
    if (best) return { cx: best.cx, cy: best.cy, fontSize: fs };
  }
  return null;
}

/**
 * Group cramped items (each {pos:{x,y}}) into clusters of mutually-near beacons.
 * Returns an array of arrays of items, biggest cluster first.
 */
export function clusterCramped(items, linkPt = CLUSTER_LINK_PT) {
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const d = Math.hypot(items[i].pos.x - items[j].pos.x, items[i].pos.y - items[j].pos.y);
      if (d < linkPt) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  items.forEach((it, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(it);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

/** The main-plan window (PDF points) a cluster's inset magnifies, and its magnification. */
export function clusterWindow(items, mapAreaW, mapAreaH) {
  const xs = items.map((i) => i.pos.x), ys = items.map((i) => i.pos.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const w = Math.max(...xs) - Math.min(...xs) + 2 * WINDOW_PAD_PT;
  const h = Math.max(...ys) - Math.min(...ys) + 2 * WINDOW_PAD_PT;
  const mag = Math.max(MIN_MAG, Math.min(MAX_MAG, mapAreaW / w, mapAreaH / h));
  return { cx, cy, w, h, mag, radius: Math.hypot(w, h) / 2 };
}

/**
 * Draw one cluster inset.
 * @param {object} doc
 * @param {object} inset  from InsetManager.createBeaconClusterInset
 * @param {number} width
 * @param {number} height
 */
export function renderBeaconClusterInset(doc, inset, width, height) {
  const { position, number, scale, win, toPdf, beacons, parcels, stands, beaconRadius, textColor } = inset;
  const area = { x: position.x + 5, y: position.y + 12, width: width - 10, height: height - 20 };
  const mid = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
  const toInset = (y, x) => {
    const p = toPdf(y, x);
    return { x: mid.x + (p.x - win.cx) * win.mag, y: mid.y + (p.y - win.cy) * win.mag };
  };

  doc.save();
  doc.rect(position.x, position.y, width, height).lineWidth(0.5).strokeColor('#000000').stroke();
  doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000')
    .text(`Inset ${number} (1:${scale}) - Stand${stands.length > 1 ? 's' : ''} ${stands.join(', ')}`,
      position.x + 2, position.y + 2, { width: width - 4, lineBreak: false });

  doc.save();
  doc.rect(area.x, area.y, area.width, area.height).clip();

  // Boundary lines of every stand that reaches the window.
  const rings = new Map();
  const visible = []; // stands (any, not just the cluster's) with the part that shows
  for (const feat of parcels) {
    let ring = feat?.geometry?.coordinates?.[0];
    if (Array.isArray(ring) && ring.length === 1 && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) ring = ring[0];
    if (!Array.isArray(ring) || ring.length < 3) continue;
    const pts = ring.map((c) => {
      const cc = Array.isArray(c) ? c : [c.y ?? c[1], c.x ?? c[0]];
      return toInset(cc[0], cc[1]);
    });
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
    if (maxX < area.x || minX > area.x + area.width || maxY < area.y || minY > area.y + area.height) continue;
    doc.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) doc.lineTo(pts[i].x, pts[i].y);
    doc.lineWidth(0.8).strokeColor('#000000').stroke();
    const stand = String(feat.properties?.stand ?? '');
    if (stand && !feat.properties?.isOutsideFigure) {
      const open = pts.slice();
      const f = open[0], l = open[open.length - 1];
      if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-6) open.pop();
      rings.set(stand, open);
      const shown = clipToRect(open, area);
      if (shown.length >= 3) visible.push({ stand, poly: shown });
    }
  }

  // Beacons inside the window, with letters placed inside their own stand.
  const inWin = beacons
    .map((b) => ({ ...b, ...toInset(b.y, b.x) }))
    .filter((b) => b.x > area.x + 2 && b.x < area.x + area.width - 2 && b.y > area.y + 2 && b.y < area.y + area.height - 2)
    .sort((a, b) => a.name.localeCompare(b.name));
  const placed = [];
  const hit = (r) => placed.some((q) => r.x < q.x + q.w + 0.5 && q.x < r.x + r.w + 0.5 && r.y < q.y + q.h + 0.5 && q.y < r.y + r.h + 0.5);
  const FONT = 8;
  for (const b of inWin) {
    const ring = rings.get(b.stand);
    if (!ring || !b.suffix) continue;
    const fit = fitSuffixLabel({
      beaconPos: b, polygon: ring,
      widthAt: (fs) => doc.widthOfString(b.suffix, { font: 'Helvetica-Bold', size: fs }),
      fontSize: FONT, beaconRadius,
      neighbours: inWin.filter((o) => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 45),
      collides: hit,
    });
    const rr = (fit.rotation * Math.PI) / 180;
    const w = doc.widthOfString(b.suffix, { font: 'Helvetica-Bold', size: fit.fontSize });
    const h = fit.fontSize * 1.2;
    const ew = Math.abs(Math.cos(rr)) * w + Math.abs(Math.sin(rr)) * h;
    const eh = Math.abs(Math.sin(rr)) * w + Math.abs(Math.cos(rr)) * h;
    placed.push({ x: fit.cx - ew / 2, y: fit.cy - eh / 2, w: ew, h: eh });
    doc.save();
    doc.translate(fit.cx, fit.cy);
    if (fit.rotation) doc.rotate(fit.rotation);
    doc.fontSize(fit.fontSize).font('Helvetica-Bold').fillColor(textColor || '#000000')
      .text(b.suffix, -w / 2, -h / 2, { lineBreak: false });
    doc.restore();
  }
  // Surrounding properties: every stand that reaches the window carries its
  // number, so the cluster reads in context. Placed after the letters so the
  // numbers keep clear of them and of the beacon circles.
  const obstacles = [
    ...placed,
    ...inWin.map((b) => ({ x: b.x - beaconRadius - 0.5, y: b.y - beaconRadius - 0.5, w: 2 * beaconRadius + 1, h: 2 * beaconRadius + 1 })),
  ];
  for (const v of visible.sort((a, b) => a.stand.localeCompare(b.stand, undefined, { numeric: true }))) {
    const spot = placeStandNumber(v.poly, (fs) => doc.widthOfString(v.stand, { font: 'Helvetica-Bold', size: fs }), obstacles);
    if (!spot) continue;
    const w = doc.widthOfString(v.stand, { font: 'Helvetica-Bold', size: spot.fontSize });
    obstacles.push({ x: spot.cx - w / 2, y: spot.cy - spot.fontSize / 2, w, h: spot.fontSize });
    doc.fontSize(spot.fontSize).font('Helvetica-Bold').fillColor('#000000')
      .text(v.stand, spot.cx - w / 2, spot.cy - spot.fontSize * 0.5, { lineBreak: false });
  }
  for (const b of inWin) {
    doc.circle(b.x, b.y, beaconRadius).lineWidth(0.8).fillColor('#FFFFFF').strokeColor('#000000').fillAndStroke();
  }
  doc.restore(); // clip

  // North arrow stays out of the plan: the inset shares the plan's orientation.
  doc.fontSize(4).font('Helvetica').fillColor('#000000')
    .text('Same orientation as the plan', position.x + 3, position.y + height - 7, { lineBreak: false });
  doc.restore();
}
