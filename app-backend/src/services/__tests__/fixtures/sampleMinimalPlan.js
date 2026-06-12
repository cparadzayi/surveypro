// Minimal fixture: 2 stands in a 100x60m outside figure, 4 beacons, scale 1:500, ISO_A2.
export const sampleMinimalPlan = {
  metadata: {
    designation: 'Stands 1 - 2 Test Township',
    township: 'Test Township',
    district: 'Test District',
    standCount: 2,
    standRange: '1 - 2',
    wholePortion: 'A portion',
    ofTarget: 'the remainder of Lot 1',
    beaconSequence: 'ABCDA',
    date: '2026-06-12',
    surveyor: 'Test Surveyor',
    surveyorLicense: 'LS-001',
    centralMeridian: 29,
  },
  parcels: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[50000,2200000],[50050,2200000],[50050,2200060],[50000,2200060],[50000,2200000]]] }, properties: { stand: '1', area_m2: 3000, diagramNumber: 'SG-101', diagram: 'SG-101', deedNumber: 'D-1', deedDate: '2026-01-01', surveyorGeneral: 'A. Smith', surveyor: 'A. Smith' } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[50050,2200000],[50100,2200000],[50100,2200060],[50050,2200060],[50050,2200000]]] }, properties: { stand: '2', area_m2: 3000, diagramNumber: 'SG-102', diagram: 'SG-102', deedNumber: 'D-2', deedDate: '2026-01-02', surveyorGeneral: 'A. Smith', surveyor: 'A. Smith' } },
    ],
  },
  beacons: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [50000, 2200000] }, properties: { name: 'A', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [50100, 2200000] }, properties: { name: 'B', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [50100, 2200060] }, properties: { name: 'C', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [50000, 2200060] }, properties: { name: 'D', type: 'iron-peg' } },
    ],
  },
  outsideFigureData: {
    edges: [
      { side: 'AB', metres: 100.000, direction: '90°00\'00"', constants: '', y: 50100.000, x: 2200000.000 },
      { side: 'BC', metres:  60.000, direction:  '0°00\'00"', constants: '', y: 50100.000, x: 2200060.000 },
      { side: 'CD', metres: 100.000, direction: '270°00\'00"', constants: '', y: 50000.000, x: 2200060.000 },
      { side: 'DA', metres:  60.000, direction: '180°00\'00"', constants: '', y: 50000.000, x: 2200000.000 },
    ],
    coordinates: [
      { name: 'A', y: 50000.000, x: 2200000.000 },
      { name: 'B', y: 50100.000, x: 2200000.000 },
      { name: 'C', y: 50100.000, x: 2200060.000 },
      { name: 'D', y: 50000.000, x: 2200060.000 },
    ],
  },
  sheetSize: 'ISO_A2',
  scale: { value: 500, label: '1:500' },
};
