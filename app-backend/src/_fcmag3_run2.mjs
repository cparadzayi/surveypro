import fs from 'fs'
import { generateGeoPDF } from './services/pdfkitGeoPDF.js'
import { generateDXF } from './services/dxfGenerator.js'
const d = JSON.parse(fs.readFileSync(process.argv[2]))
const sw = ([x, y]) => [y, x]
const stands = d.par.map((r) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [r.g.coordinates[0].map(sw)] }, properties: { stand: String(r.stand), area_m2: Number(r.area_m2) } }))
let ring = d.of.g.coordinates[0].map(sw); const closed = ring.slice(); ring = ring.slice(0, -1)
const nameAt = (v) => { const p = d.pts.find((q) => Math.abs(q.y - v[0]) < 0.6 && Math.abs(q.x - v[1]) < 0.6); return p ? p.name : null }
const names = ring.map((v, i) => nameAt(v) || ('V' + i))
const bearing = (a, b) => { let t = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) * 180 / Math.PI; if (t < 0) t += 360; const D = Math.floor(t), m = Math.floor((t - D) * 60), s = Math.round(((t - D) * 60 - m) * 60); return `${D}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"` }
const edges = ring.map((v, i) => { const w = ring[(i + 1) % ring.length]; return { side: names[i] + '-' + names[(i + 1) % ring.length], metres: Math.hypot(w[0] - v[0], w[1] - v[1]).toFixed(2), direction: bearing(v, w), constants: '', y: v[0], x: v[1] } })
const plan = {
  metadata: { designation: d.pj.designation, township: d.pj.township, district: d.pj.district, standCount: stands.length, wholePortion: 'A portion', beaconSequence: names.join(''), date: '2026-01-01', surveyor: 'Test', surveyorLicense: 'LS-1', centralMeridian: Number(d.pj.central_meridian) },
  planType: 'general-developed',
  parcels: { type: 'FeatureCollection', features: stands },
  beacons: { type: 'FeatureCollection', features: d.pts.map((q) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [q.y, q.x] }, properties: { name: q.name, type: 'iron-peg' } })) },
  outsideFigureData: { edges, coordinates: ring.map((v, i) => ({ name: names[i], y: v[0], x: v[1] })) },
  outsideFigure: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [closed] } }] },
  sheetSize: process.argv[3] || 'SI727_1000x800',
}
if (process.argv[4]) plan.scale = { value: Number(process.argv[4]), label: '1:' + process.argv[4] }
const keep = /Vertex|Final dynamic/i
const mk = () => { const out = []; const f = (l) => (m) => { const t = typeof m === 'string' ? m : (/Final dynamic/.test(m?.msg||'') ? JSON.stringify(m) : (m?.msg ?? '')); if (t && keep.test(t)) out.push(`${l} ${t.replace(/\s+/g, ' ').slice(0, 480)}`) }; return { log: { info: f('I'), warn: f('W'), error: f('E') }, out } }
const a = mk(); const r = await generateGeoPDF(plan, a.log)
if (process.env.SAVE) fs.writeFileSync(process.env.SAVE, r.pdfBuffer)
console.log('== PDF', r.sheetSize, r.scale, JSON.stringify(r.warnings)); console.log(a.out.slice(-80).join('\n'))
