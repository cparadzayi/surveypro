#!/usr/bin/env node
import 'dotenv/config'
import fetch from 'node-fetch'

const base = process.env.API_BASE || 'http://127.0.0.1:3050'

async function loginEnsure() {
  await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'entitydebug@test.com', password: 'testpass' }) })
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'entitydebug@test.com', password: 'testpass' }) })
  const j = await r.json()
  if (!j.token) throw new Error('Login failed: ' + JSON.stringify(j))
  return j.token
}

async function main() {
  const token = await loginEnsure()
  const res = await fetch(base + '/api/spatial/debug/entities', { headers: { authorization: 'Bearer ' + token } })
  const json = await res.json()
  console.log(JSON.stringify(json, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })
