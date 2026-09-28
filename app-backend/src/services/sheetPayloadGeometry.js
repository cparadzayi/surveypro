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
 */
export function sheetMetadata(metadata, sheet) {
  return {
    ...(metadata || {}),
    servitudeStatement: { rows: sheet?.servitudeRows || [] },
  };
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
