#!/usr/bin/env node
// Seed a sample project, layer and point features from CSV for smoke-testing Areas
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config as dotenv } from 'dotenv'
import db from '../src/config/db.js'

dotenv()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CSV_PATH = path.join(__dirname, 'sample-points.csv')

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(Boolean)
  const header = lines.shift().split(',').map(s => s.trim())
  const rows = lines.map(line => {
    const cols = line.split(',')
    const obj = {}
    header.forEach((h, i) => { obj[h] = (cols[i] ?? '').trim() })
    return obj
  })
  return rows
}

async function ensureUser(email = 'demo@example.com', passwordHash = null) {
  // Create a demo user if none exists; use a fixed id for simplicity
  let userRes = await db.query('SELECT * FROM users WHERE email = $1', [email])
  if (!userRes.rows[0]) {
    const bcrypt = await import('bcrypt')
    const hash = await bcrypt.hash('demo1234', 10)
    userRes = await db.query('INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING *', [email, hash])
  }
  return userRes.rows[0]
}

async function ensureProject(userId, name = 'Sample Project') {
  let p = await db.query('SELECT * FROM projects WHERE user_id=$1 AND name=$2', [userId, name])
  if (!p.rows[0]) {
    p = await db.query('INSERT INTO projects (name, user_id, code, description) VALUES ($1,$2,$3,$4) RETURNING *', [name, userId, 'SAMPLE', 'Seeded sample project'])
  }
  return p.rows[0]
}

async function ensureLayer(projectId, name = 'Sample Points', geomType = 'Point') {
  let l = await db.query('SELECT * FROM layers WHERE project_id=$1 AND name=$2', [projectId, name])
  if (!l.rows[0]) {
    l = await db.query('INSERT INTO layers (name, project_id, layer_type, geom_type, srid) VALUES ($1,$2,$3,$4,$5) RETURNING *', [name, projectId, 'points', geomType, 0])
  }
  return l.rows[0]
}

function toFeatureRow(r, layerId, projectId) {
  const name = r.POINT
  const y = Number(r.Y)
  const x = Number(r.X)
  const fp = r.F_P || null
  const desc = r.DESCRIPTION || null
  const geometry = { type: 'Point', coordinates: [y, x] }
  const properties = { name, f_p: fp, description: desc, system: 'ZIM_P(Y,X)' }
  return { layerId, projectId, geometry, properties }
}

async function upsertFeature(layerId, projectId, feature) {
  // Simple insert; if an identical name exists in the layer, skip
  const existing = await db.query('SELECT * FROM features WHERE layer_id=$1 AND properties->>\'name\' = $2', [layerId, feature.properties.name])
  if (existing.rows[0]) return existing.rows[0]
  const result = await db.query('INSERT INTO features (layer_id, project_id, geometry, properties, bbox) VALUES ($1,$2,$3,$4,$5) RETURNING *', [layerId, projectId, feature.geometry, feature.properties, null])
  return result.rows[0]
}

async function main() {
  const user = await ensureUser()
  const project = await ensureProject(user.id)
  const layer = await ensureLayer(project.id)

  const content = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parseCSV(content)

  let count = 0
  for (const r of rows) {
    if (!r.POINT || !r.Y || !r.X) continue
    const f = toFeatureRow(r, layer.id, project.id)
    await upsertFeature(layer.id, project.id, f)
    count++
  }
  // Backfill bbox for any existing point features lacking it (as double precision[])
  await db.query(`UPDATE features
    SET bbox = ARRAY[
      ((geometry->'coordinates')->>0)::double precision,
      ((geometry->'coordinates')->>1)::double precision,
      ((geometry->'coordinates')->>0)::double precision,
      ((geometry->'coordinates')->>1)::double precision
    ]::double precision[]
    WHERE layer_id = $1 AND (geometry->>'type')='Point' AND bbox IS NULL`, [layer.id])
  console.log(`Seeded ${count} points into project '${project.name}' layer '${layer.name}'.`)
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
