// Smoke-test: authenticate, list projects/layers, bbox query points from DB
// Requires the demo user seeded by scripts/seed-sample-points.mjs
// Node 18+ (global fetch)

const API = process.env.API_BASE || 'http://127.0.0.1:3050/api'
const email = process.env.SMOKE_EMAIL || 'demo@example.com'
const password = process.env.SMOKE_PASSWORD || 'demo1234'

async function main() {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!loginRes.ok) {
    console.error('Login failed', loginRes.status)
    process.exit(1)
  }
  const login = await loginRes.json()
  const token = login.token
  if (!token) throw new Error('No token received')
  const auth = { Authorization: `Bearer ${token}` }

  const projRes = await fetch(`${API}/spatial/projects`, { headers: auth })
  if (!projRes.ok) throw new Error('Projects list failed')
  const projects = await projRes.json()
  if (!projects.length) throw new Error('No projects found')
  const proj = projects.find(p => p.name === 'Sample Project') || projects[0]

  const layersRes = await fetch(`${API}/spatial/projects/${proj.id}/layers`, { headers: auth })
  if (!layersRes.ok) throw new Error('Layers list failed')
  const layers = await layersRes.json()
  if (!layers.length) throw new Error('No layers found')
  const layer = layers.find(l => l.name === 'Sample Points') || layers[0]

  const bbox = [-1e12, -1e12, 1e12, 1e12]
  const featsRes = await fetch(`${API}/spatial/layers/${layer.id}/query`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bbox })
  })
  if (!featsRes.ok) throw new Error('BBox query failed')
  const feats = await featsRes.json()

  console.log(JSON.stringify({
    ok: true,
    project: { id: proj.id, name: proj.name },
    layer: { id: layer.id, name: layer.name, geom_type: layer.geom_type, srid: layer.srid, params: layer.params },
    count: feats.length,
    sample: feats.slice(0, 3)
  }, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
