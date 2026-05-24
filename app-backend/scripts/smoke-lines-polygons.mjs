// Smoke-test Lines/Polygons via API: create layers/features and query by BBOX
// Requires backend running at API_BASE
const API = process.env.API_BASE || 'http://127.0.0.1:3050/api'
const email = process.env.SMOKE_EMAIL || 'demo@example.com'
const password = process.env.SMOKE_PASSWORD || 'demo1234'

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  const j = await res.json()
  if (!j.token) throw new Error('No token in login response')
  return j.token
}

async function authed(url, opts, token) {
  const headers = { ...(opts?.headers||{}), Authorization: `Bearer ${token}` }
  return fetch(url, { ...opts, headers })
}

async function ensureProject(token, name = 'Sample Project') {
  const r = await authed(`${API}/spatial/projects`, { method: 'GET' }, token)
  const arr = await r.json()
  let p = arr.find(x => x.name === name) || arr[0]
  if (!p) {
    const cr = await authed(`${API}/spatial/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }, token)
    p = await cr.json()
  }
  return p
}

async function ensureLayer(token, projectId, name, layer_type, geom_type) {
  const lr = await authed(`${API}/spatial/projects/${projectId}/layers`, { method: 'GET' }, token)
  const layers = await lr.json()
  let layer = layers.find(l => l.name === name)
  if (!layer) {
    const body = { name, layer_type, geom_type, srid: 0 }
    const cr = await authed(`${API}/spatial/projects/${projectId}/layers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, token)
    layer = await cr.json()
  }
  return layer
}

async function ensureFeatureByName(token, layer, name, geometry) {
  // Query by large bbox and check if a feature with this name exists
  const bbox = [-1e12, -1e12, 1e12, 1e12]
  const q = await authed(`${API}/spatial/layers/${layer.id}/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bbox }) }, token)
  const feats = await q.json()
  if (feats.some(f => f.properties?.name === name)) return
  await authed(`${API}/spatial/layers/${layer.id}/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ geometry, properties: { name, source: 'smoke' } })
  }, token)
}

async function run() {
  const token = await login()
  const proj = await ensureProject(token)

  const linesLayer = await ensureLayer(token, proj.id, 'Smoke Lines', 'lines', 'LineString')
  const polyLayer = await ensureLayer(token, proj.id, 'Smoke Polygons', 'polygons', 'Polygon')

  // Coordinates in P(Y,X) order
  const lineGeom = { type: 'LineString', coordinates: [ [1000,2000], [1500,2400], [2100,2600] ] }
  const polyGeom  = { type: 'Polygon',    coordinates: [ [ [3000,3000], [3400,3000], [3400,3400], [3000,3400], [3000,3000] ] ] }

  await ensureFeatureByName(token, linesLayer, 'SMK-L1', lineGeom)
  await ensureFeatureByName(token, polyLayer, 'SMK-P1', polyGeom)

  const bbox = [-1e12, -1e12, 1e12, 1e12]
  const lq = await authed(`${API}/spatial/layers/${linesLayer.id}/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bbox }) }, token)
  const lineFeats = await lq.json()
  const pq = await authed(`${API}/spatial/layers/${polyLayer.id}/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bbox }) }, token)
  const polyFeats = await pq.json()

  console.log(JSON.stringify({
    ok: true,
    project: { id: proj.id, name: proj.name },
    lines: { layer: { id: linesLayer.id, name: linesLayer.name }, count: lineFeats.length, types: [...new Set(lineFeats.map(f => f.geometry?.type))] },
    polys: { layer: { id: polyLayer.id, name: polyLayer.name }, count: polyFeats.length, types: [...new Set(polyFeats.map(f => f.geometry?.type))] },
    samples: {
      line: lineFeats.find(f => f.properties?.name === 'SMK-L1') || lineFeats[0] || null,
      poly: polyFeats.find(f => f.properties?.name === 'SMK-P1') || polyFeats[0] || null
    }
  }, null, 2))
}

run().catch(err => { console.error(err); process.exit(1) })
