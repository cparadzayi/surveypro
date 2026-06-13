// High-density Maglas regression fixture: 240 synthetic stands modelled on
// the actual problem plan flagged during 3-v6 testing. Sized to trigger
// schedule overflow + paper-size escalation. Deed numbers and surveyor
// names are synthetic; the polygon shape mimics the actual township boundary.

const STAND_COUNT = 240;
const standsPerRow = 20;
const standsPerCol = 12;
const standWidth = 25;   // metres
const standHeight = 35;  // metres
const yBase = 50000;
const xBase = 2200000;

const stands = Array.from({ length: STAND_COUNT }, (_, i) => {
  const row = Math.floor(i / standsPerRow);
  const col = i % standsPerRow;
  const y0 = yBase + col * standWidth;
  const x0 = xBase + row * standHeight;
  const standNumber = 1686 + i;
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
      diagramNumber: `SG-${5000 + i}`,
      diagram:       `SG-${5000 + i}`,
      deedNumber:    `D-${10000 + i}/2024`,
      deedDate:      `2024-${String((i % 12) + 1).padStart(2, '0')}-15`,
      surveyorGeneral: 'A. Mukandi',
      surveyor:        'A. Mukandi',
    },
  };
});

// Outer boundary as 4 edges; coordinates as 4 corner points.
const ofW = standsPerRow * standWidth;
const ofH = standsPerCol * standHeight;
const ofYmin = yBase, ofYmax = yBase + ofW;
const ofXmin = xBase, ofXmax = xBase + ofH;

export const sampleMaglasPlan = {
  metadata: {
    designation: 'Stands 1686 - 1925 Maglas Township',
    township: 'Maglas Township',
    district: 'Bulawayo',
    standCount: STAND_COUNT,
    standRange: '1686 - 1925',
    wholePortion: 'A portion',
    ofTarget: 'Subdivision A of Shabani Mine Surface Rights A',
    beaconSequence: 'ABCDEFA',
    date: '2024-06-15',
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
  sheetSize: 'ISO_A2',
  scale: { value: 1000, label: '1:1000' },
};
