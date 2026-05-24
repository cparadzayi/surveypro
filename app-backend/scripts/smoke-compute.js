// Quick smoke test for compute endpoints (polar and intersections)
// Requires backend running at 127.0.0.1:3050

const API = 'http://127.0.0.1:3050/api'

async function main() {
  try {
    const email = 'zimtest@example.com'
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
      body: JSON.stringify({ name: `ZIM Test ${Date.now()}` })
    })
    const proj = await projRes.json()
    if (!proj.id) throw new Error('Project create failed: ' + JSON.stringify(proj))

    // Layer
    const layRes = await fetch(`${API}/spatial/projects/${proj.id}/layers`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ name: 'calc', layer_type: 'points', geom_type: 'Point', srid: 0 })
    })
    const layer = await layRes.json()
    if (!layer.id) throw new Error('Layer create failed: ' + JSON.stringify(layer))

    // Polar compute
    const polarRes = await fetch(`${API}/compute/polar`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ y: -3551.377, x: 1965611.534, distance: 100.0, bearingDeg: 90, save: true, layer_id: layer.id, properties: { name: 'Q1' } })
    })
    const polar = await polarRes.json()
    console.log('Polar:', polar)

    // Intersections compute (two rays intersecting roughly near polar point)
    const p1 = { y: -3551.377, x: 1965611.534, bearingDeg: 45 }
    const p2 = { y: -3500.000, x: 1965600.000, bearingDeg: 200 }
    const interRes = await fetch(`${API}/compute/intersections/bearing-bearing`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ p1, p2, save: true, layer_id: layer.id, properties: { name: 'I1' } })
    })
    const inter = await interRes.json()
    console.log('Intersection:', inter)

    console.log('DONE')
  } catch (e) {
    console.error('Smoke test failed:', e)
    process.exit(1)
  }
}

main()
