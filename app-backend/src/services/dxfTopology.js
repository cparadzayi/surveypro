/**
 * DXF Topological Whitespace Scanner — pure functions used by
 * sub-projects 4c (block placer), 4d (per-feature label placement),
 * and 3-v2 (Schedule of Areas topological placement).
 *
 * Algorithms are byte-for-byte ports from `app-backend/src/services/
 * pdfkitGeoPDF.js` (line numbers cited per function). Interfaces are
 * normalised to a uniform `{x, y}` object shape (matching 4a's
 * dxfGeometry.js convention) and a named-argument signature for the
 * public `computeWhitespaceZones` function.
 *
 * All inputs are unit-agnostic; caller's responsibility to keep units
 * consistent within one call. When called from sub-project 4c, units
 * will be ground metres at the chosen scale.
 *
 * No DXF dependencies, no module state, no I/O. Pure math.
 *
 * Verbatim-port fidelity note: the PDF's band-flush logic in
 * `computeWhitespaceZones` uses Math.min/max reductions that pick the
 * polygon edge closest to the zone (not the most conservative one).
 * This can produce zones that overlap the polygon when the band's
 * `rightAt[y]` varies significantly. In practice the bands form only
 * where the profile is roughly constant, so the issue rarely surfaces.
 * Preserved verbatim for fidelity to the production PDF.
 */

/**
 * Walks each polygon edge and samples it at integer multiples of
 * `scanStep`, recording for each sampled coordinate the most-extreme
 * x or y at that slice. Returns 4 dictionaries:
 *   - rightAt[y] = rightmost x of polygon at horizontal slice y
 *   - leftAt[y]  = leftmost x at slice y
 *   - bottomAt[x] = bottommost y at vertical slice x (max — y increases downward in PDF convention)
 *   - topAt[x]    = topmost y at slice x (min)
 *
 * Port of `pdfkitGeoPDF.js:9021`. Algorithm verbatim; interface
 * normalised to `{x, y}` polygon vertices (the PDF version already
 * used `{x, y}` objects so no destructuring change was needed).
 *
 * CLOSED-POLYGON ASSUMPTION: iterates `polygon.length - 1` edges, so
 * the polygon must be presented closed (last vertex equals first). An
 * open polygon will silently miss its final closing edge. Same
 * convention as `isPointNearPolygon` in 4a's dxfGeometry.js.
 *
 * @param {Array<{x:number,y:number}>} polygon - Closed polygon vertices
 * @param {number} scanStep - Sampling resolution (must be > 0)
 * @returns {{rightAt: Object, leftAt: Object, bottomAt: Object, topAt: Object}}
 *   Dictionaries keyed by integer multiples of scanStep.
 */
export function computePolygonProfile(polygon, scanStep) {
  const rightAt = {}, leftAt = {}, bottomAt = {}, topAt = {}

  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i], p2 = polygon[i + 1]

    // Horizontal profiles (rightAt / leftAt) — sample at y intervals
    if (Math.abs(p2.y - p1.y) > 0.001) {
      const yMin = Math.min(p1.y, p2.y)
      const yMax = Math.max(p1.y, p2.y)
      for (let y = Math.ceil(yMin / scanStep) * scanStep; y <= yMax; y += scanStep) {
        const t = (y - p1.y) / (p2.y - p1.y)
        const x = p1.x + t * (p2.x - p1.x)
        rightAt[y] = Math.max(rightAt[y] ?? -Infinity, x)
        leftAt[y]  = Math.min(leftAt[y]  ??  Infinity, x)
      }
    }

    // Vertical profiles (bottomAt / topAt) — sample at x intervals
    if (Math.abs(p2.x - p1.x) > 0.001) {
      const xMin = Math.min(p1.x, p2.x)
      const xMax = Math.max(p1.x, p2.x)
      for (let x = Math.ceil(xMin / scanStep) * scanStep; x <= xMax; x += scanStep) {
        const t = (x - p1.x) / (p2.x - p1.x)
        const y = p1.y + t * (p2.y - p1.y)
        bottomAt[x] = Math.max(bottomAt[x] ?? -Infinity, y)
        topAt[x]    = Math.min(topAt[x]    ??  Infinity, y)
      }
    }
  }
  return { rightAt, leftAt, bottomAt, topAt }
}

/**
 * Derive rectangular whitespace zones from the polygon's boundary
 * profile. For each directional strip (right / left / bottom / top),
 * consecutive scan lines where available width ≥ tableMinWidth are
 * grouped into a conservative rectangle.
 *
 * Topology-aware: an L-shaped polygon exposes its open corner as a
 * valid zone, whereas a simple bounding-box approach would exclude
 * that corner entirely.
 *
 * Port of `pdfkitGeoPDF.js:9070`. The PDF version takes positional
 * arguments + a `scaleDenominator` for groundWidthM annotation; this
 * port uses a named-argument object and drops groundWidthM (redundant
 * when inputs are already in ground units).
 *
 * Verbatim-port fidelity note: the band-flush reductions
 * (Math.min(bandMinRight, rx) on the right strip, Math.max(bandMaxLeft,
 * lx) on the left, etc.) pick the polygon edge closest to the zone
 * rather than the most conservative one. When `rightAt[y]` varies
 * significantly within a band, the emitted zone may overlap the
 * polygon at high-rightAt y values. In practice the bands form only
 * where the profile is roughly constant, so the issue rarely surfaces.
 *
 * @param {Object} args
 * @param {Array<{x:number,y:number}>} args.polygon - Closed polygon; if null/empty/<3 vertices, returns full-bounds zone
 * @param {{x:number,y:number,width:number,height:number}} args.mapBounds - The rectangular region within which to find whitespace
 * @param {number} args.buffer - Minimum clear distance between zone edge and polygon
 * @param {number} args.tableMinWidth - Minimum zone width to be considered usable
 * @param {number} args.scanStep - Sampling resolution (passed through to computePolygonProfile)
 * @returns {Array<{x:number,y:number,width:number,height:number,side:string,area:number}>}
 *   Zones sorted by side preference (right, bottom, left, top) then area descending.
 */
export function computeWhitespaceZones({
  polygon, mapBounds, buffer, tableMinWidth, scanStep,
}) {
  const mLeft   = mapBounds.x
  const mRight  = mapBounds.x + mapBounds.width
  const mTop    = mapBounds.y
  const mBottom = mapBounds.y + mapBounds.height

  if (!polygon || polygon.length < 3) {
    return [{
      x: mLeft, y: mTop, width: mapBounds.width, height: mapBounds.height,
      side: 'full', area: mapBounds.width * mapBounds.height,
    }]
  }

  const profile = computePolygonProfile(polygon, scanStep)
  const zones   = []

  // Align scan starts to multiples of scanStep so they hit the same keys
  // computePolygonProfile wrote (which also samples at ceil(coord/step)*step).
  const yStart = Math.ceil(mTop / scanStep) * scanStep
  const xStart = Math.ceil(mLeft / scanStep) * scanStep

  // RIGHT strip — scan y top→bottom; available x = rightAt[y]+buffer → mRight
  {
    let bandStart = null, bandMinRight = Infinity
    const flush = (yEnd) => {
      if (bandStart === null) return
      const x = bandMinRight + buffer
      const w = mRight - x
      if (w >= tableMinWidth) {
        zones.push({
          x, y: bandStart, width: w, height: yEnd - bandStart,
          side: 'right', area: w * (yEnd - bandStart),
        })
      }
      bandStart = null
      bandMinRight = Infinity
    }
    for (let y = yStart; y <= mBottom; y += scanStep) {
      const rx = profile.rightAt[y]
      if (rx == null || rx + buffer >= mRight - tableMinWidth) { flush(y); continue }
      const avail = mRight - (rx + buffer)
      if (avail < tableMinWidth) { flush(y); continue }
      if (bandStart === null) bandStart = y
      bandMinRight = Math.min(bandMinRight, rx)  // PDF verbatim — see fidelity note
    }
    flush(mBottom)
  }

  // LEFT strip — scan y top→bottom; available x = mLeft → leftAt[y]-buffer
  {
    let bandStart = null, bandMaxLeft = -Infinity
    const flush = (yEnd) => {
      if (bandStart === null) return
      const right = bandMaxLeft - buffer
      const w = right - mLeft
      if (w >= tableMinWidth) {
        zones.push({
          x: mLeft, y: bandStart, width: w, height: yEnd - bandStart,
          side: 'left', area: w * (yEnd - bandStart),
        })
      }
      bandStart = null
      bandMaxLeft = -Infinity
    }
    for (let y = yStart; y <= mBottom; y += scanStep) {
      const lx = profile.leftAt[y]
      if (lx == null || lx - buffer <= mLeft + tableMinWidth) { flush(y); continue }
      const avail = (lx - buffer) - mLeft
      if (avail < tableMinWidth) { flush(y); continue }
      if (bandStart === null) bandStart = y
      bandMaxLeft = Math.max(bandMaxLeft, lx)  // PDF verbatim
    }
    flush(mBottom)
  }

  // BOTTOM strip — scan x left→right; available y = bottomAt[x]+buffer → mBottom
  {
    let bandStart = null, bandMinBottom = Infinity
    const flush = (xEnd) => {
      if (bandStart === null) return
      const y = bandMinBottom + buffer
      const h = mBottom - y
      if (h >= tableMinWidth / 2 && xEnd - bandStart >= tableMinWidth) {
        zones.push({
          x: bandStart, y, width: xEnd - bandStart, height: h,
          side: 'bottom', area: (xEnd - bandStart) * h,
        })
      }
      bandStart = null
      bandMinBottom = Infinity
    }
    for (let x = xStart; x <= mRight; x += scanStep) {
      const by = profile.bottomAt[x]
      if (by == null || by + buffer >= mBottom) { flush(x); continue }
      if (bandStart === null) bandStart = x
      bandMinBottom = Math.min(bandMinBottom, by)  // PDF verbatim
    }
    flush(mRight)
  }

  // TOP strip — scan x left→right; available y = mTop → topAt[x]-buffer
  {
    let bandStart = null, bandMaxTop = -Infinity
    const flush = (xEnd) => {
      if (bandStart === null) return
      const bottom = bandMaxTop - buffer
      const h = bottom - mTop
      if (h >= tableMinWidth / 2 && xEnd - bandStart >= tableMinWidth) {
        zones.push({
          x: bandStart, y: mTop, width: xEnd - bandStart, height: h,
          side: 'top', area: (xEnd - bandStart) * h,
        })
      }
      bandStart = null
      bandMaxTop = -Infinity
    }
    for (let x = xStart; x <= mRight; x += scanStep) {
      const ty = profile.topAt[x]
      if (ty == null || ty - buffer <= mTop) { flush(x); continue }
      if (bandStart === null) bandStart = x
      bandMaxTop = Math.max(bandMaxTop, ty)  // PDF verbatim
    }
    flush(mRight)
  }

  // Sort: right preferred (SI 727 natural block side), then by area descending
  const sideOrder = { right: 0, bottom: 1, left: 2, top: 3 }
  return zones
    .filter(z => z.width > 0 && z.height > 0)
    .sort((a, b) => {
      const d = (sideOrder[a.side] ?? 9) - (sideOrder[b.side] ?? 9)
      return d !== 0 ? d : b.area - a.area
    })
}

/**
 * Topology gate certification — the single authority BOTH renderers (PDF and
 * DXF/.gpkg) consult before passing `topologyGatedFraction` into the shared
 * sheeting resolver.
 *
 * Mirror of pdfkitGeoPDF.js's topology pre-check (:6112-6137), expressed in
 * physical metres. The comparison is scale-invariant PROVIDED every input is
 * expressed at the SAME scale denominator S: mapBounds metres, schedule metres,
 * buffer metres, tableMinWidth metres and scanStep metres all grow by a common
 * factor under reprojection, so zone area / needed area is unchanged. Callers
 * MUST derive every argument from one consistent S (see the seam wiring).
 *
 * When the whitespace around a figure is sculpted by actual polygon edges, the
 * default 25% reserve (FIGURE_MAX_FRACTION) is over-conservative — the schedule
 * can be placed in a topology zone even when the figure fills a larger fraction
 * of the drawing area. This certifier confirms that room objectively exists
 * (same proportions the topological placer trusts) so the gate may be raised.
 *
 * @param {Object} args
 * @param {Array<{x:number,y:number}>} args.polygon - Figure polygon in plan space (metres; closed or open)
 * @param {{width:number,height:number}} args.contentMeters - Drawing-area content box in metres, computed at scale S
 * @param {{width:number,height:number}} args.scheduleMeters - Schedule-of-areas physical size in metres, computed at the SAME scale S
 * @param {number} args.bufferMeters - Clearance between zone edge and polygon (metres at S; PDF's 40pt = 0.014111 m.x at 1:1000)
 * @param {number} args.tableMinWidthMeters - Minimum usable zone width (metres at S; PDF's 260pt = 0.091722 m.x at 1:1000)
 * @param {number} args.scanStepMeters - Profile sampling resolution (metres at S; PDF's 20pt = 0.007056 m.x at 1:1000)
 * @param {number} [args.slackFactor=1.1] - Multiplier on needed area (the PDF pre-check's 1.1)
 * @returns {{certified:boolean, zoneCount:number, zoneAreaM2:number,
 *            neededAreaM2:number, ratio:number}}
 */
export function certifyTopologyGate({
  polygon,
  contentMeters: { width: contentW, height: contentH },
  scheduleMeters: { width: schedW, height: schedH },
  bufferMeters,
  tableMinWidthMeters,
  scanStepMeters,
  slackFactor = 1.1,
}) {
  const neededAreaM2 = schedW * schedH;

  // mapBounds centred on the content box — the certifier only cares about the
  // RELATIVE shape (polygon vs box), and all four strip scans align to the box
  // origin, so translation is irrelevant.
  const mapBounds = { x: -contentW / 2, y: -contentH / 2, width: contentW, height: contentH };

  // RECENTRE THE POLYGON: the seams feed raw coordinate frames — cape/Lo YX
  // (y≈50300, x≈2200000) for PDF, DXF space (-y, -x) for DXF/.gpkg — whose
  // origin sits millions of units from the drawing. Profile keys are built by
  // snapping the raw coords, so an untranslated polygon never meets the scan
  // grid (0 zones). Like the PDF pre-check's pdfPoints, shift the polygon so
  // its BOUNDING-BOX centre (not vertex mean, which the repeated closing vertex
  // skews) lands on the origin: whitespace zones are relative geometry, so this
  // changes nothing about the verdict while making the two grids coincide.
  const xMin = Math.min(...polygon.map((p) => p.x));
  const xMax = Math.max(...polygon.map((p) => p.x));
  const yMin = Math.min(...polygon.map((p) => p.y));
  const yMax = Math.max(...polygon.map((p) => p.y));
  const polyC = { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2 };
  const centred = polygon.map((p) => ({ x: p.x - polyC.x, y: p.y - polyC.y }));

  // INTEGER-GRID NORMALIZATION: computeWhitespaceZones indexes
  // computePolygonProfile's dicts by raw float keys and walks mapBounds with
  // accumulated `+= scanStep`. At float edges (e.g. scanStep = 7.055…m derived
  // from pt), a profile key of `-197.55568` is never hit by the scan value
  // `-197.55568000000002`, so ZERO zones are found. Scaling every coordinate
  // into integer multiples of scanStep and scanning at step 1 turns all the
  // arithmetic into exact integer accumulation — profile keys and scan landings
  // then always coincide. The verdict is identical for grid-aligned inputs and
  // correct for float callers.
  const u = (v) => Math.round(v / scanStepMeters);
  const polygonU = centred.map((p) => ({ x: u(p.x), y: u(p.y) }));
  const bounds = {
    x: u(mapBounds.x), y: u(mapBounds.y),
    width: u(mapBounds.x + mapBounds.width) - u(mapBounds.x),
    height: u(mapBounds.y + mapBounds.height) - u(mapBounds.y),
  };
  const shifted = (p) => ({ x: p.x - bounds.x, y: p.y - bounds.y });
  const polygonFinal = polygonU.map(shifted);

  const zones = computeWhitespaceZones({
    polygon: polygonFinal,
    mapBounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
    buffer: Math.round(bufferMeters / scanStepMeters),
    tableMinWidth: Math.round(tableMinWidthMeters / scanStepMeters),
    scanStep: 1,
  });
  // Integer-grid zones are in scanStep² units — rescale to real m² so the
  // returned metrics and ratio are honest (unit-agnostic for the verdict).
  const unitAreaM2 = scanStepMeters * scanStepMeters;
  const zoneAreaM2 = zones.reduce((s, z) => s + z.area, 0) * unitAreaM2;
  const certified = zones.length > 0 && zoneAreaM2 >= neededAreaM2 * slackFactor;

  return { certified, zoneCount: zones.length, zoneAreaM2, neededAreaM2, ratio: zoneAreaM2 / neededAreaM2 };
}
