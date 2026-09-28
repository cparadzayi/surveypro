/**
 * Turning a SheetPayload into what a renderer actually takes.
 *
 * A SheetPayload (app-frontend/src/utils/sheetPayloads.ts) is the whole
 * contract between the surveyor's cuts and both renderers. It arrives over the
 * route as plain JSON, in Lo metres, every point `{ y, x }` -- y easting,
 * x southing -- and it is NOT the shape either renderer was written for: they
 * both want GeoJSON, a schedule of surveyed parcels, an `outsideFigureData`
 * bag and a `sheetInfo`.
 *
 * That translation lives here, once, because the alternative is the failure
 * this plan already paid for once: two renderers each deriving "which parcels
 * are on this sheet" in their own words, and the PDF and the DXF then stating
 * different things about the same survey. Both `generateSheetedGeoPDF`
 * (pdfkitGeoPDF.js) and `generateSheetedDXF` (dxfGenerator.js) call in here, so
 * PDF↔DXF parity on a multi-sheet plan is structural rather than a convention
 * somebody has to remember.
 *
 * Nothing in here derives anything. Every fact it returns was already decided
 * per sheet by `buildSheetPayloads` -- this module only reshapes.
 */

/**
 * Close an open Lo {y,x} ring for GeoJSON Polygon use. A SheetPayload's `ring`
 * is documented as "open" (see sheetPayloads.ts); GeoJSON requires the first
 * position repeated at the end. Idempotent when already closed.
 */
export function closeLoRing(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  const EPS = 1e-6;
  const alreadyClosed =
    Math.abs(first.y - last.y) < EPS && Math.abs(first.x - last.x) < EPS;
  return alreadyClosed ? ring : [...ring, { y: first.y, x: first.x }];
}

/** The sheet's ring as GeoJSON coordinates: `[[y, x], ...]`, closed. */
export function sheetRingCoordinates(sheet) {
  return closeLoRing(sheet?.ring).map((p) => [p.y, p.x]);
}

/**
 * The sheet's OUTSIDE FIGURE: one feature on the sheet's own ring.
 *
 * A tile (a slice of one shared master figure) and a sheet (one part of a
 * divided figure) are different objects, and a renderer that cannot tell them
 * apart ends up labelling a sheet from the whole plan's beacon sequence. Each
 * part has its own, so the figure carries no properties at all -- the
 * title block's sequence comes from this sheet's own `vertices`/`edges`.
 */
export function sheetOutsideFigure(sheet) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [sheetRingCoordinates(sheet)] },
    }],
  };
}

/**
 * The sheet's PARCELS, as the caller's own objects gave them.
 *
 * A payload carries stand names AND its parcels, because names alone are not
 * enough: the schedule draws its Area, Diagram, Deed and S.G. columns from
 * parcel properties, so with names only every one of them came out blank, and
 * the figure had nothing to place each stand by. That was found by rendering a
 * page, not by a test.
 *
 * `properties.stand` and `properties.area_m2` are the names the schedule
 * drawers read. The caller's other fields pass through untouched, so anything
 * the single-sheet path already understands keeps working -- a `ring` is the
 * one field that does not, because its place is the geometry.
 */
export function sheetParcels(sheet) {
  const ringCoordinates = sheetRingCoordinates(sheet);
  const featureFor = (parcel) => {
    const { ring, ...rest } = parcel || {};
    const own = Array.isArray(ring) && ring.length >= 3
      ? closeLoRing(ring).map((p) => [p.y, p.x])
      : ringCoordinates;
    return {
      type: 'Feature',
      properties: { ...rest, stand: parcel?.name ?? rest.stand ?? '' },
      geometry: { type: 'Polygon', coordinates: [own] },
    };
  };

  return {
    type: 'FeatureCollection',
    features: Array.isArray(sheet?.parcels) && sheet.parcels.length > 0
      ? sheet.parcels.map(featureFor)
      // A payload built before `parcels` existed, or a sheet holding only public
      // places: fall back to names so the page still renders.
      : (sheet?.stands || []).map((standName) => ({
          type: 'Feature',
          properties: { stand: standName },
          geometry: { type: 'Polygon', coordinates: [ringCoordinates] },
        })),
  };
}

/**
 * The sheet's features taken from the WHOLE-PLAN collection, not rebuilt from
 * the payload.
 *
 * This is the difference between a sheet that looks like the single-sheet plan
 * and one that does not. The route's single-sheet pass hands the renderer
 * parcels already carrying computed areas, edges, closure data and metadata;
 * rebuilding a sheet's parcels from the payload instead re-derives all of that
 * from `name` + `ring` and quietly loses whatever the payload did not carry.
 * That is how a cut plan rendered its stands on the right sheets with a blank
 * Area column and no servitude statement: two correct halves with a different
 * set of fields between them.
 *
 * A sheet is the same render restricted to that sheet's own stands, so the
 * features are the plan's OWN objects, taken by name -- never reconstructed.
 * `sheet.stands` is authoritative about which stands are on the sheet; a stand
 * the plan collection does not carry (a public place, or a name the plan spells
 * differently) falls back to the payload so the sheet still draws it.
 *
 * Matches on `stand` OR `designation`, because the payload names a stand by
 * `designation || stand` while the plan's own features carry `stand`.
 */
export function selectSheetFeatures(wholePlanParcels, sheet) {
  const planFeatures = Array.isArray(wholePlanParcels?.features) ? wholePlanParcels.features : [];
  const stands = sheet?.stands || [];
  if (stands.length === 0 || planFeatures.length === 0) return sheetParcels(sheet);

  // Index the plan's own features by every name they answer to, so a stand the
  // payload calls by designation is still found under `stand` and vice versa.
  const byName = new Map();
  for (const f of planFeatures) {
    const p = f?.properties || {};
    for (const key of [p.stand, p.designation]) {
      const name = String(key ?? '');
      if (name && !byName.has(name)) byName.set(name, f);
    }
  }

  const payload = new Map();
  for (const parcel of sheet?.parcels || []) {
    const name = String(parcel?.name ?? parcel?.stand ?? '');
    if (name && !payload.has(name)) payload.set(name, parcel);
  }

  const out = [];
  for (const stand of stands) {
    const name = String(stand);
    // The plan's own feature for this stand, computed data and all; failing
    // that the payload's. Per stand, not per sheet: a sheet holding stands the
    // plan collection partly covers (a public place, a stand it spells
    // differently) must still draw every one of them. An all-or-nothing
    // fallback would drop the uncovered stands from the page entirely.
    const chosen = byName.get(name);
    if (chosen) {
      out.push(chosen);
    } else if (payload.has(name)) {
      out.push(sheetParcels({ ...sheet, stands: [name], parcels: [payload.get(name)] }).features[0]);
    }
  }

  if (out.length === 0) return sheetParcels(sheet);
  return { type: 'FeatureCollection', features: out };
}

/**
 * The sheet's own outside-figure table input, in the exact shape the renderers
 * already take for `outsideFigureData` -- no translation, and nothing from the
 * whole plan mixed in.
 */
export function sheetOutsideFigureData(sheet) {
  return {
    edges: sheet?.edges || [],
    constants: sheet?.constants || null,
  };
}

/**
 * Whole-plan metadata with THIS sheet's servitude rows, as the servitude block
 * reads them.
 *
 * A copy, never a mutation: `metadata` is shared by every sheet, and writing one
 * sheet's rows into it would leave the next sheet stating the first sheet's
 * servitudes.
 *
 * The override is CONDITIONAL, and that is the point. A payload that carries no
 * per-sheet rows -- an older one, or a caller that never passed them -- used to
 * replace the plan's statement with an empty one, so a sheet that could have
 * stated the plan's servitudes stated none at all. A sheet that has its own rows
 * states those; a sheet that has none leaves the plan's statement alone rather
 * than erasing it.
 */
export function sheetMetadata(metadata, sheet) {
  const own = Array.isArray(sheet?.servitudeRows) ? sheet.servitudeRows : null;
  if (own && own.length > 0) {
    return { ...(metadata || {}), servitudeStatement: { rows: own } };
  }
  return { ...(metadata || {}) };
}

/**
 * The `sheetInfo` a renderer hands to its own title-block code, which already
 * draws "SHEET N" from `sheetNumber`/`totalSheets` -- see formatSheetLabel
 * (dxfGenerator.js) and _buildTitleBlockTexts (pdfkitGeoPDF.js).
 *
 * The four extra fields are the payload's OWN wording, passed through rather
 * than recomputed. `formatFigureDescription` picks the multi-sheet template on
 * `otherSheets` being non-empty, and a renderer that recomputed the phrase in
 * its own words would eventually disagree with the PDF about which sheets this
 * one is read with.
 *
 * `totalSheets` is carried because it decides whether there is a key plan and
 * which template the sentence uses -- NOT because anything prints "SHEET N OF M".
 * A general plan refers to the sheet, or the sheets it is read with; the
 * Seventh Schedule sentence already says how many.
 */
export function sheetSheetInfo(sheet) {
  return {
    sheetNumber: sheet?.sheetNumber,
    totalSheets: sheet?.totalSheets,
    figureLabel: sheet?.figureLabel,
    otherSheets: sheet?.otherSheets,
    standRange: sheet?.standRange,
    totalStandCount: sheet?.totalStandCount,
  };
}
