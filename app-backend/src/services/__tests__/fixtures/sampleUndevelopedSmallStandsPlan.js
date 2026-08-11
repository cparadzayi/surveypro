// Regression fixture: a 'general-undeveloped' township where every stand is
// well below the Surveyor-General's 200m² relaxation threshold. Used to
// verify the area-majority mandate now forces exactly 1:500 for undeveloped
// plans too when stands are mostly small -- a new restriction: previously
// 'general-undeveloped' was never capped regardless of stand size.

const STAND_COUNT = 10;
const standsPerRow = 5;
const standWidth = 10;   // metres -- 150 m^2 per stand, below 200 m^2
const standHeight = 15;  // metres
const yBase = 50000;
const xBase = 2200000;

const stands = Array.from({ length: STAND_COUNT }, (_, i) => {
  const row = Math.floor(i / standsPerRow);
  const col = i % standsPerRow;
  const y0 = yBase + col * standWidth;
  const x0 = xBase + row * standHeight;
  const standNumber = 1 + i;
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
      diagramNumber: `SG-${7000 + i}`,
      diagram:       `SG-${7000 + i}`,
      deedNumber:    `D-${30000 + i}/2024`,
      deedDate:      '2024-06-15',
      surveyorGeneral: 'A. Mukandi',
      surveyor:        'A. Mukandi',
    },
  };
});

const ofW = standsPerRow * standWidth;
const ofH = 2 * standHeight;
const ofYmin = yBase, ofYmax = yBase + ofW;
const ofXmin = xBase, ofXmax = xBase + ofH;

export const sampleUndevelopedSmallStandsPlan = {
  metadata: {
    designation: 'Stands 1 - 10 Small Holdings',
    township: 'Small Holdings Township',
    district: 'Bulawayo',
    standCount: STAND_COUNT,
    standRange: '1 - 10',
    wholePortion: 'A portion',
    ofTarget: 'Subdivision B of Small Holdings',
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
  planType: 'general-undeveloped',
};
