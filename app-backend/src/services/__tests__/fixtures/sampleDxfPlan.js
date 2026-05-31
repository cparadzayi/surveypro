/**
 * Representative survey-plan fixture for Layer 2 integration tests.
 *
 * Outside figure: 200 × 100 m rectangle  (Y: 50000–50200, X: 2200000–2200100)
 * in Cape Lo Lo 29 coordinates.
 * 2 surveyed parcels (left rectangle + right rectangle within the OF bounds),
 * 6 beacons (3 placed: A, B, C along the southern edge; 3 found: D, E, F along
 * the northern edge), 2 beaconGroups, 2 priorDiagrams, scale 1:1000, ISO_A2.
 *
 * DESIGN NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1.  Beacon positions are INSIDE the outside-figure polygon (all 6 sit on the
 *     boundary or interior) so the generator's "within OF + 2 m buffer" filter
 *     does not discard any of them.  The original plan template placed beacons C
 *     and F at Y=50200 which is ON the eastern OF edge — verified to be within
 *     the BBOX.
 *
 * 2.  At 1:1000 the grid step is 250 m.  The OF spans DXF-X 50000–50200 and
 *     DXF-Y 2200000–2200100.  After the 10 m ext-buffer the draw bounds are
 *     [49990, 50210] × [2199990, 2200110].  The first grid-step multiple ≥ 49990
 *     is 50000 (= 200 × 250), which is ≤ 50210, so at least one X-axis tick is
 *     produced.  Similarly, 2200000 (= 8800 × 250) ≤ 2200110 gives at least one
 *     Y-axis tick.  Total GRID LINEs ≥ 4, satisfying toBeGreaterThan(0).
 *
 * 3.  Orientation invariant: first beacon coordinates [50000, 2200000].
 *     capeLoToDxfSouthUp(50000, 2200000) → {x: 50000, y: 2200000} (no swap
 *     because 50000 < 1 000 000 and 2 200 000 > 1 000 000, matching the
 *     typical Cape Lo Y/X convention the generator expects).
 */
export const sampleFixture = {
  parcels: {
    features: [
      // Surveyed parcel 1 — left rectangle (Y 50000–50100, X 2200000–2200100)
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [50000, 2200000],
            [50100, 2200000],
            [50100, 2200100],
            [50000, 2200100],
            [50000, 2200000],
          ]],
        },
        properties: { stand: '123', area_m2: 10000 },
      },
      // Surveyed parcel 2 — right rectangle (Y 50100–50200, X 2200000–2200100)
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [50100, 2200000],
            [50200, 2200000],
            [50200, 2200100],
            [50100, 2200100],
            [50100, 2200000],
          ]],
        },
        properties: { stand: '124', area_m2: 10000 },
      },
    ],
  },
  beacons: {
    features: [
      // Three PLACED beacons on the southern OF edge (X = 2200000)
      { type: 'Feature', geometry: { coordinates: [50000, 2200000] }, properties: { pointId: 'A', type: 'placed' } },
      { type: 'Feature', geometry: { coordinates: [50100, 2200000] }, properties: { pointId: 'B', type: 'placed' } },
      { type: 'Feature', geometry: { coordinates: [50200, 2200000] }, properties: { pointId: 'C', type: 'placed' } },
      // Three FOUND beacons on the northern OF edge (X = 2200100)
      { type: 'Feature', geometry: { coordinates: [50000, 2200100] }, properties: { pointId: 'D', type: 'found' } },
      { type: 'Feature', geometry: { coordinates: [50100, 2200100] }, properties: { pointId: 'E', type: 'found' } },
      { type: 'Feature', geometry: { coordinates: [50200, 2200100] }, properties: { pointId: 'F', type: 'found' } },
    ],
  },
  // Outside figure: 200 × 100 m rectangle.  4 unique vertex edges (closed by
  // returning to A implicitly through the polyline-closed flag in the DXF).
  outsideFigureData: {
    edges: [
      { side: 'A-B', distance: 200, direction: '90°00\'00"',  pointId: 'A', y: 50000, x: 2200000 },
      { side: 'B-C', distance: 100, direction: '180°00\'00"', pointId: 'B', y: 50200, x: 2200000 },
      { side: 'C-D', distance: 200, direction: '270°00\'00"', pointId: 'C', y: 50200, x: 2200100 },
      { side: 'D-A', distance: 100, direction: '0°00\'00"',   pointId: 'D', y: 50000, x: 2200100 },
    ],
    constants: { pointId: 'A', y: 50000, x: 2200000 },
  },
  metadata: {
    designation: 'STAND 123-124 BORROWDALE',
    surveyOf: 'Two stands at Borrowdale Heights',
    township: 'Borrowdale',
    district: 'Harare',
    surveyor: 'J. Doe',
    date: '2026-05-31',
    firm: 'Acme Surveying & Mapping (Pvt) Ltd',
    licenseNumber: '1234',
    parentProperty: 'Lot 9 of Borrowdale',
    wholePortion: 'a portion',
    priorDiagrams: ['Diagram-GP No. 4567', 'Diagram-GP No. 8910'],
  },
  beaconGroups: [
    { points: 'A–C', description: 'Permanent concrete pillars' },
    { points: 'D–F', description: 'Iron pegs with cement collar' },
  ],
  projection: 'EPSG:22291',
  scale: '1:1000',
  sheetSize: 'ISO_A2',
}
