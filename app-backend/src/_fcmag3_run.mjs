import fs from 'fs'
import { generateGeoPDF } from './services/pdfkitGeoPDF.js'
import { generateDXF } from './services/dxfGenerator.js'
const d = JSON.parse(fs.readFileSync(process.argv[2]))
const sw = ([x, y]) => [y, x]                       // GeoJSON [Southing,Westing] -> planner [y,x]
const stands = d.par.map((r) => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [r.g.coordinates[0].map(sw)] },
  properties: { stand: String(r.stand), area_m2: Number(r.area_m2) },
}))
let ring = d.ring[0].g.coordinates.map(sw); ring = ring.slice(0, -1)
const names = ring.map((_, i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + (i % 26)) + Math.floor(i / 26)))
const bearing = (a, b) => { let t = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) * 180 / Math.PI; if (t < 0) t += 360; const D = Math.floor(t), m = Math.floor((t - D) * 60), s = Math.round(((t - D) * 60 - m) * 60); return `${D}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"` }
const edges = ring.map((v, i) => { const w = ring[(i + 1) % ring.length]; return { side: names[i] + names[(i + 1) % ring.length], metres: Math.hypot(w[0] - v[0], w[1] - v[1]).toFixed(2), direction: bearing(v, w), constants: '', y: v[0], x: v[1] } })
const plan = {
  metadata: { designation: d.pj.designation, township: d.pj.township, district: d.pj.district, standCount: stands.length, wholePortion: 'A portion', beaconSequence: names.join(''), date: '2026-01-01', surveyor: 'Test', surveyorLicense: 'LS-1', centralMeridian: Number(d.pj.central_meridian) },
  parcels: { type: 'FeatureCollection', features: stands },
  beacons: { type: 'FeatureCollection', features: ring.map((v, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: { name: names[i], type: 'iron-peg' } })) },
  outsideFigureData: { edges, coordinates: ring.map((v, i) => ({ name: names[i], y: v[0], x: v[1] })) },
  sheetSize: process.argv[3] || 'SI727_1000x800',
  scale: { value: Number(process.argv[4] || 1000), label: '1:' + (process.argv[4] || 1000) },
}
if (process.env.WITH_OF) plan.outsideFigure = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } }] }
const keep = /Schedule of Areas|Patched|stacked|stacker|Tall single|seated|Strip slotting|fits no|composite|reserved|on its own|pre-placed below|surveyStatement|stacker|stacked|promoting|Mandatory|unplaceable|no collision-free|Final dynamic|stacker|Planner-side|fluid|Topology|stepping|Tall single|Schedule|collision|Collision|composite|strip|escalat|paper|sheet/i
const mk = (tag) => { const out = []; const f = (lvl) => (m) => { const t = typeof m === 'string' ? m : (/Final dynamic|ollision/.test(m?.msg||'') ? JSON.stringify(m) : (m?.msg ?? JSON.stringify(m))); if (keep.test(t)) out.push(`${lvl} ${t.replace(/\s+/g, ' ').slice(0, 520)}`) }; return { log: { info: f('I'), warn: f('W'), error: f('E') }, out } }
const a = mk('pdf'); const r = await generateGeoPDF(plan, a.log)
console.log('== PDF', r.sheetSize, r.scale, JSON.stringify(r.warnings)); console.log([...new Set(a.out)].slice(-40).join('\n'))
const b = mk('dxf'); const x = generateDXF(plan, b.log)
console.log('== DXF', JSON.stringify(Object.keys(x))); console.log([...new Set(b.out)].slice(-40).join('\n'))
