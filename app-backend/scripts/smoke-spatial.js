#!/usr/bin/env node
import 'dotenv/config'
import fetch from 'node-fetch'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const base = process.env.API_BASE || 'http://localhost:3050'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendDir = path.resolve(__dirname, '..')

async function waitForHealth(base, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(base + '/api/health')
      if (r.ok) return true
    } catch {}
    await delay(250)
  }
  return false
}

async function spawnServerIfRequested(args) {
  if (!args.includes('--spawn')) return null
  console.log('[smoke-spatial] Spawning backend server via npx…')
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const child = spawn(npxBin, ['platformatic', 'db', 'start'], {
    cwd: backendDir,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  })
  let ready = false
  child.stdout.on('data', d => {
    const s = d.toString()
    if (s.includes('Server listening')) {
      ready = true
      console.log('[smoke-spatial] Detected server listening log line')
    }
  })
  child.stderr.on('data', d => {
    const s = d.toString()
    if (s.toLowerCase().includes('error')) console.error('[backend stderr]', s.trim())
  })
  // Try log detection first with a timeout, then health polling
  for (let i = 0; i < 40 && !ready; i++) {
    await delay(250)
  }
  if (!ready) {
    console.log('[smoke-spatial] Log line not detected, polling health…')
    const ok = await waitForHealth(base, 40)
    if (!ok) {
      console.error('[smoke-spatial] Failed to confirm backend health')
      child.kill('SIGINT')
      process.exit(1)
    }
  }
  return child
}

async function main() {
  const args = process.argv.slice(2)
  let server = null
  // If --spawn is passed, or if health check fails, spawn the server
  let healthy = await waitForHealth(base, 12)
  if (!healthy) {
    console.log('[smoke-spatial] Backend not healthy, attempting to spawn...')
    server = await spawnServerIfRequested(['--spawn'])
    healthy = await waitForHealth(base, 60)
    if (!healthy) {
      console.error('[smoke-spatial] Health endpoint not responding after spawn attempt')
      if (server) server.kill('SIGINT')
      process.exit(1)
    } else {
      console.log('[smoke-spatial] Backend health confirmed after spawn')
    }
  }
  // Register temp user (ignore 409)
  let r = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'spatial@test.com', password: 'testpass' }) })
  if (r.status !== 201 && r.status !== 409) {
    console.error('Register failed', r.status); process.exit(1)
  }
  // Login
  r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'spatial@test.com', password: 'testpass' }) })
  const login = await r.json()
  if (!login.token) { console.error('Login failed', login); process.exit(1) }
  const token = login.token

  const authHeaders = { 'content-type': 'application/json', authorization: 'Bearer ' + token }

  // List any existing test projects
  r = await fetch(base + '/api/spatial/projects', { headers: authHeaders })
  const projects = await r.json()
  const testProject = projects.find(p => p.code === 'TP1')

  // Create project (if not exists)
  let project
  if (!testProject) {
    r = await fetch(base + '/api/spatial/projects', { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: 'Test Project', code: 'TP1' }) })
    if (!r.ok) { console.error('Project create failed:', await r.json()); process.exit(1) }
    project = await r.json()
  } else {
    project = testProject
  }
  if (!project?.id) { console.error('Project create failed', project); process.exit(1) }

  // List layers and find or create test layer
  r = await fetch(`${base}/api/spatial/projects/${project.id}/layers`, { headers: authHeaders })
  const layers = await r.json()
  let layer = Array.isArray(layers) ? layers.find(l => l.name === 'Control Points') : null
  
  if (!layer) {
    r = await fetch(`${base}/api/spatial/projects/${project.id}/layers`, { 
      method: 'POST', 
      headers: authHeaders, 
      body: JSON.stringify({ 
        name: 'Control Points', 
        layer_type: 'control_points', 
        geom_type: 'Point' 
      }) 
    })
    const responseData = await r.json()
    if (r.status === 409) {
      // Re-fetch if concurrent create
      r = await fetch(`${base}/api/spatial/projects/${project.id}/layers`, { headers: authHeaders })
      const refreshedLayers = await r.json()
      layer = Array.isArray(refreshedLayers) ? refreshedLayers.find(l => l.name === 'Control Points') : null
      if (!layer) {
        console.error('Layer exists but not found after refresh')
        process.exit(1)
      }
    } else if (r.ok) {
      layer = responseData
    } else {
      console.error('Layer create failed:', responseData)
      process.exit(1)
    }
  }
  if (!layer?.id) { console.error('Layer create failed', layer); process.exit(1) }

  // Create feature (point)
  r = await fetch(`${base}/api/spatial/layers/${layer.id}/features`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ geometry: { type: 'Point', coordinates: [30.1234, -17.5678] }, properties: { code: 'CP1' } }) })
  const feature = await r.json()
  if (!feature?.id) { console.error('Feature create failed', feature); process.exit(1) }

  // BBOX query
  r = await fetch(`${base}/api/spatial/layers/${layer.id}/query`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ bbox: [30, -18, 31, -17] }) })
  const queried = await r.json()
  if (!Array.isArray(queried) || !queried.length) { console.error('BBOX query failed', queried); process.exit(1) }

  console.log('Spatial smoke OK:', { project: project.id, layer: layer.id, feature: feature.id, hits: queried.length })
  if (server) {
    server.kill('SIGINT')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
