// Smoke test for /compute/area
// Requires backend running at 127.0.0.1:3050

const API = 'http://127.0.0.1:3050/api'

async function main() {
  try {
    const email = 'zimarea@example.com'
    const password = 'passw0rd'

    // Register (ignore conflict)
    await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }).catch(() => {})

    // Login
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const login = await loginRes.json()
    if (!login.token) throw new Error('Login failed')
    const auth = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' }

    // Project
    const projRes = await fetch(`${API}/spatial/projects`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ name: `ZIM Area ${Date.now()}` })
    })
    const proj = await projRes.json()
    if (!proj.id) throw new Error('Project create failed: ' + JSON.stringify(proj))

  // Layer (polygon storage)
    const layRes = await fetch(`${API}/spatial/projects/${proj.id}/layers`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ name: 'areas', layer_type: 'polygons', geom_type: 'Polygon', srid: 0 })
    })
    const layer = await layRes.json()
    if (!layer.id) throw new Error('Layer create failed: ' + JSON.stringify(layer))

    // Verify layers list includes the new layer
    const layersListRes = await fetch(`${API}/spatial/projects/${proj.id}/layers`, { method: 'GET', headers: auth })
    const layersList = await layersListRes.json()
    console.log('Layers list:', layersList.map((l) => l.id))

    // Simple square 100x100 (area 10000 m2)
    const pts = [
      { y: 0, x: 0 },
      { y: 100, x: 0 },
      { y: 100, x: 100 },
      { y: 0, x: 100 }
    ]

    // Compute without save
    const res0 = await fetch(`${API}/compute/area`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ points: pts })
    })
    const data0 = await res0.json()
    console.log('Area (no save):', data0)
    if (!data0.ok) throw new Error('Area compute failed: ' + JSON.stringify(data0))

    // Compute with save
    const res = await fetch(`${API}/compute/area`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ points: pts, save: true, layer_id: layer.id })
    })
    const data = await res.json()
    console.log('Area (save):', data)
    if (!data.ok) console.warn('Area save failed:', data)

    console.log('DONE')
  } catch (e) {
    console.error('Smoke area failed:', e)
    process.exit(1)
  }
}

main()
