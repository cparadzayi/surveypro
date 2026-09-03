/**
 * The module's own worked example: the Brackenhurst 403-405 sheet rebuilt from
 * nothing but the final coordinate list. Held verbatim so the golden test can
 * prove the vendored module still renders it byte-for-byte.
 *
 * Note this is the SAME survey the module was reverse-engineered from, so it
 * pins the module's stability, not its generality.
 */
const B = (name, X, Y, symbol, label) => ({ name, X, Y, symbol, label })

export const brackenhurstSpec = {
  scale: 2000,

  beacons: [
    B('86B',  2143972.22, -85728.79, 'rm',  'NE'),
    B('87B',  2143988.69, -85741.50, 'rm',  'NE'),
    B('CHK',  2144004.38, -85764.70, 'rm',  'NW'),
    B('SD1',  2144017.17, -85765.13, 'peg', 'E'),
    B('SD4',  2144027.08, -85673.91, 'peg', 'NW'),
    B('BASE', 2144038.34, -85778.60, 'rm',  'W'),
    B('SD5',  2144063.20, -85710.12, 'peg', 'W'),
    B('86C',  2144068.05, -85633.14, 'rm',  'W'),
    B('87A',  2144070.87, -85809.70, 'rm',  'NE'),
    B('SD6',  2144076.45, -85723.41, 'peg', 'E'),
    B('87CR', 2144078.23, -85816.29, 'peg', 'E'),
    B('RM16', 2144100.66, -85623.81, 'rm',  'W'),
    B('SD3',  2144117.40, -85682.55, 'peg', 'E'),
    B('SD2',  2144120.24, -85774.40, 'peg', 'SE'),
    B('RM15', 2144120.41, -85643.50, 'rm',  'S'),
    B('87DR', 2144164.75, -85729.94, 'peg', 'SW'),
    B('88X2', 2144262.68, -85828.08, 'rm',  'N'),
  ],

  parcels: [
    { label: '405',   ring: ['SD4', '86B', '87B', 'SD1', 'SD5'] },
    { label: '404',   ring: ['86C', 'SD4', 'SD5', 'SD6', 'SD3'] },
    { label: '403',   ring: ['SD3', 'SD6', 'SD2', '87DR'] },
    { label: 'Rem./', ring: ['SD5', 'SD1', '87A', '87CR', 'SD2', 'SD6'] },
  ],

  existing: [
    { from: 'SD1',  to: '87CR', extendTo: 16 },
    { from: '87CR', to: 'SD2' },
    { from: '87B',  to: '86B',  extendTo: 12 },
    { from: '87DR', to: '86C',  extendTo: 16 },
    { from: '86C',  to: '87DR', extendTo: 16 },
  ],

  roads: [
    { name: 'Main Road',          from: 'SD1', to: '87CR', offset: 9.5, along: -3 },
    { name: 'Klein Road 25.19 m', from: '86C', to: '87DR', offset: 9.0, along: 5 },
  ],

  notes: [
    { text: '86', X: 2144004.2, Y: -85662.0 },
    { text: '88', X: 2144138.1, Y: -85796.2 },
  ],

  title: [
    'Survey of',
    'Stands 403-405 Brackenhurst Township',
    'of Stand 87 Brackenhurst Township',
    'Gwelo District',
  ],

  certificate: {
    line1: 'Surveyed in July 2026 by me,',
    line2: 'Land Surveyor',
  },

  approvalBox: true,

  inset: {
    scale: 200000,
    beacons: [
      { name: '170/T', X: 2136771, Y: -81571, symbol: 'trig' },
      { name: '176/T', X: 2149106, Y: -71084, symbol: 'trig' },
      { name: '49/T',  X: 2146860, Y: -88454, symbol: 'trig' },
      { name: '50/T',  X: 2151241, Y: -88962, symbol: 'trig' },
      { name: 'RM7',   X: 2141540, Y: -68649, symbol: 'rm' },
      { name: 'BASE',  X: 2144038, Y: -85777, symbol: 'rm' },
    ],
  },
}
