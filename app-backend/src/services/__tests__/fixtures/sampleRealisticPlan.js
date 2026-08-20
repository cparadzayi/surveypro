// 12 stands, 4 columns x 3 rows, each 75m (Y) x 65m (X) = 4875 m2.
// The outside figure is therefore 300m x 195m (3 x 65), NOT 300 x 200:
// 12 x 4875 = 58500 = 300 x 195. The edges/coordinates below once declared
// 200m, which disagreed with the stand geometry every consumer actually
// draws from - PDF derives tick bounds from the polygon, DXF from these
// edges, so the two silently disagreed by 5m.
const stands = Array.from({ length: 12 }, (_, i) => {
  const row = Math.floor(i / 4); const col = i % 4;
  const y0 = 50000 + col * 75; const x0 = 2200000 + row * 65;
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[y0, x0], [y0 + 75, x0], [y0 + 75, x0 + 65], [y0, x0 + 65], [y0, x0]]] },
    properties: {
      stand: String(i + 100),
      area_m2: 4875,
      diagramNumber: `SG-${200 + i}`,
      diagram: `SG-${200 + i}`,
      deedNumber: `D-${i + 1}`,
      deedDate: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
      surveyorGeneral: 'B. Jones',
      surveyor: 'B. Jones',
    },
  };
});

const beacons = [
  ['A', 50000, 2200000], ['B', 50300, 2200000], ['C', 50300, 2200195], ['D', 50000, 2200195],
  ['E', 50075, 2200065], ['F', 50150, 2200065], ['G', 50225, 2200065],
  ['H', 50075, 2200130], ['I', 50150, 2200130], ['J', 50225, 2200130],
  ['K', 50075, 2200195], ['L', 50150, 2200195], ['M', 50225, 2200195],
  // Top-edge points where the interior row lines (2200065/2200130) meet it.
  // There is no third: 2200195 IS corner C, not an intermediate point.
  ['M1', 50300, 2200065], ['M2', 50300, 2200130],
].map(([name, y, x]) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [y, x] },
  properties: { name, type: /^M\d/.test(name) ? 'not-beaconed' : 'iron-peg' },
}));

export const sampleRealisticPlan = {
  metadata: {
    designation: 'Stands 100 - 111 Maglas Township',
    township: 'Maglas Township',
    district: 'Bulawayo',
    standCount: 12,
    standRange: '100 - 111',
    wholePortion: 'A portion',
    ofTarget: 'Subdivision A of the Maglas farm',
    beaconSequence: 'ABCDA',
    date: '2026-06-12',
    surveyor: 'C. Paradzayi',
    surveyorLicense: 'LS-042',
    centralMeridian: 29,
  },
  parcels: { type: 'FeatureCollection', features: stands },
  beacons: { type: 'FeatureCollection', features: beacons },
  outsideFigureData: {
    edges: [
      { side: 'AB', metres: 300.000, direction:  '90°00\'00"', constants: '', y: 50300.000, x: 2200000.000 },
      { side: 'BC', metres: 195.000, direction:   '0°00\'00"', constants: '', y: 50300.000, x: 2200195.000 },
      { side: 'CD', metres: 300.000, direction: '270°00\'00"', constants: '', y: 50000.000, x: 2200195.000 },
      { side: 'DA', metres: 195.000, direction: '180°00\'00"', constants: '', y: 50000.000, x: 2200000.000 },
    ],
    coordinates: [
      { name: 'A', y: 50000.000, x: 2200000.000 },
      { name: 'B', y: 50300.000, x: 2200000.000 },
      { name: 'C', y: 50300.000, x: 2200195.000 },
      { name: 'D', y: 50000.000, x: 2200195.000 },
    ],
  },
  sheetSize: 'SI727_500x400',
  scale: { value: 1000, label: '1:1000' },
};
