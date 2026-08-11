// Regression fixture: a dense, spatially-large 'general-developed' township
// (modelled on the real Shabani Mine surface-rights overlap case) where every
// stand is well above the Surveyor-General's 200m² relaxation threshold.
// Forcing this extent to 1:500 requires multi-sheet tiling; the natural
// auto-fit scale comfortably fits a single sheet. Used to verify the
// area-majority mandate lifts the old unconditional 1:500 ceiling for
// 'general-developed' plans once the majority of stands are large.
//
// Stand count/layout (10 stands, 5x2, wide aspect) was tuned empirically to
// stay clear of a separate, pre-existing, already-documented block-placement
// gap (the schedule-of-areas block vs. the planner's approximate-vs-accurate
// figure-polygon check -- see pdfkitGeoPDF.scheduleNoOverlap.test.js's Maglas
// "exhausts every escalation level" case for the same underlying limitation).
// A denser/taller grid (e.g. 30 stands in a 6x5 or 10x3 layout) reliably trips
// that unrelated gap; this task is about the scale mandate, not that gap, so
// the fixture was kept comfortably clear of it rather than characterizing it.
const STAND_COUNT = 10;
const standsPerRow = 5;
const standsPerCol = 2;
const standWidth = 300;   // metres -- 75,000 m^2 per stand, well above 200 m^2
const standHeight = 250;  // metres
const yBase = 50000;
const xBase = 2200000;

const stands = Array.from({ length: STAND_COUNT }, (_, i) => {
  const row = Math.floor(i / standsPerRow);
  const col = i % standsPerRow;
  const y0 = yBase + col * standWidth;
  const x0 = xBase + row * standHeight;
  const standNumber = 207 + i;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [y0, x0],
        [y0 + standWidth, x0],
        [y0 + standWidth, x0 + standHeight],
        [y0, x0 + standHeight],
        [y0, x0],
      ]],
    },
    properties: {
      stand: String(standNumber),
      area_m2: standWidth * standHeight,
      diagramNumber: `SG-${6000 + i}`,
      diagram:       `SG-${6000 + i}`,
      deedNumber:    `D-${20000 + i}/2024`,
      deedDate:      '2024-06-15',
      surveyorGeneral: 'A. Mukandi',
      surveyor:        'A. Mukandi',
    },
  };
});

const ofW = standsPerRow * standWidth;
const ofH = standsPerCol * standHeight;
const ofYmin = yBase, ofYmax = yBase + ofW;
const ofXmin = xBase, ofXmax = xBase + ofH;

export const sampleDevelopedLargeStandsPlan = {
  metadata: {
    designation: 'Stands 207 - 216 Shabani Mine Surface',
    township: 'Shabani Mine Surface Township',
    district: 'Zvishavane',
    standCount: STAND_COUNT,
    standRange: '207 - 216',
    wholePortion: 'A portion',
    ofTarget: 'Subdivision A of Shabani Mine Surface Rights A',
    beaconSequence: 'ABCDEFA',
    date: '2026-06-16',
    surveyor: 'A. Mukandi',
    surveyorLicense: 'LS-100',
    centralMeridian: 29,
  },
  parcels: { type: 'FeatureCollection', features: stands },
  beacons: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmin, ofXmin] }, properties: { name: 'A', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmax, ofXmin] }, properties: { name: 'B', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmax, ofXmax] }, properties: { name: 'C', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmin, ofXmax] }, properties: { name: 'D', type: 'iron-peg' } },
    ],
  },
  outsideFigureData: {
    edges: [
      { side: 'AB', metres: ofW.toFixed(3), direction:  '90°00\'00"', constants: '', y: ofYmax, x: ofXmin },
      { side: 'BC', metres: ofH.toFixed(3), direction:   '0°00\'00"', constants: '', y: ofYmax, x: ofXmax },
      { side: 'CD', metres: ofW.toFixed(3), direction: '270°00\'00"', constants: '', y: ofYmin, x: ofXmax },
      { side: 'DA', metres: ofH.toFixed(3), direction: '180°00\'00"', constants: '', y: ofYmin, x: ofXmin },
    ],
    coordinates: [
      { name: 'A', y: ofYmin, x: ofXmin },
      { name: 'B', y: ofYmax, x: ofXmin },
      { name: 'C', y: ofYmax, x: ofXmax },
      { name: 'D', y: ofYmin, x: ofXmax },
    ],
  },
  sheetSize: 'SI727_500x400',
  planType: 'general-developed',
};
