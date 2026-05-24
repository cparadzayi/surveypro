#!/usr/bin/env node
import 'dotenv/config'
import pg from 'pg'

const { Client } = pg

async function main() {
  const cs = process.env.DATABASE_URL
  if (!cs) {
    console.error('DATABASE_URL not set. Define it in .env, e.g.:')
    console.error('  DATABASE_URL=postgres://user:pass@localhost:5432/surveypro')
    process.exit(1)
  }
  const client = new Client({ connectionString: cs })
  await client.connect()
  // Platformatic creates a table named migrations
  const exists = await client.query("SELECT to_regclass('public.migrations') as reg")
  if (!exists.rows[0].reg) {
    console.log('No migrations table yet.')
    await client.end(); return
  }
  const res = await client.query('SELECT id, name, applied_at FROM migrations ORDER BY id')
  if (!res.rows.length) {
    console.log('No migrations applied.')
  } else {
    console.log('Applied migrations:')
    for (const r of res.rows) {
      console.log(`#${r.id} ${r.name} @ ${r.applied_at}`)
    }
  }
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
