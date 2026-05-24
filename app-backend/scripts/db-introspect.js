#!/usr/bin/env node
import 'dotenv/config'
import pg from 'pg'
const { Client } = pg

async function main() {
  const cs = process.env.DATABASE_URL
  if (!cs) { console.error('DATABASE_URL not set'); process.exit(1) }
  const client = new Client({ connectionString: cs })
  await client.connect()
  const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`)
  console.log('Public tables:')
  for (const r of tables.rows) {
    const cols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [r.table_name])
    console.log('- ' + r.table_name)
    for (const c of cols.rows) {
      console.log('    * ' + c.column_name + ' : ' + c.data_type)
    }
  }
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
