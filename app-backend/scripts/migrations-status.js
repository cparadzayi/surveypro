#!/usr/bin/env node
/**
 * Report which migrations are applied, and flag any that were modified after
 * they ran.
 *
 * This previously queried a table named `migrations`, but scripts/migrate.js
 * writes to `migrations_history` (the `migrations` name was a leftover from the
 * retired Platformatic backend). Against any database migrated by the current
 * runner, the old `to_regclass('public.migrations')` probe found nothing and
 * this script printed "No migrations table yet" while the database was in fact
 * fully migrated. It now reads the table the runner actually writes, and
 * cross-checks each applied row against the file on disk.
 */
import 'dotenv/config'
import pg from 'pg'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { createHash } from 'crypto'

const { Client } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../migrations')
const TRACKING_TABLE = 'migrations_history'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function main() {
  const cs = process.env.DATABASE_URL
  if (!cs) {
    console.error('DATABASE_URL not set. Define it in .env, e.g.:')
    console.error('  DATABASE_URL=postgres://user:pass@localhost:5432/surveypro_app')
    process.exit(1)
  }
  const client = new Client({ connectionString: cs })
  await client.connect()

  const exists = await client.query(`SELECT to_regclass('public.${TRACKING_TABLE}') as reg`)
  if (!exists.rows[0].reg) {
    console.log(`No ${TRACKING_TABLE} table yet. Run: npm run migrate`)
    await client.end()
    return
  }

  // The `checksum` column was added to the tracking table after some databases
  // were first migrated, and scripts/migrate.js creates it with
  // ADD COLUMN IF NOT EXISTS. This script has to do the same, or it dies with
  // `column "checksum" does not exist` on exactly those databases -- i.e. the
  // status command fails on any database that has not migrated since the column
  // was introduced, which is the database you most want to inspect. Rows written
  // before checksums existed stay NULL and are reported as unverifiable.
  const hasChecksum = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'checksum'`,
    [TRACKING_TABLE]
  )
  if (!hasChecksum.rowCount) {
    await client.query(`ALTER TABLE ${TRACKING_TABLE} ADD COLUMN IF NOT EXISTS checksum CHAR(64)`)
    console.log('(added the missing `checksum` column to ' + TRACKING_TABLE + ')')
  }

  const res = await client.query(
    `SELECT id, migration_name, checksum, applied_at FROM ${TRACKING_TABLE} ORDER BY id`
  )
  if (!res.rows.length) {
    console.log('No migrations applied.')
    await client.end()
    return
  }

  // Applied rows whose file no longer exists, and applied rows whose file has
  // changed since it ran. Both mean the database and the repo disagree.
  const drifted = []
  const missing = []
  console.log('Applied migrations:')
  for (const r of res.rows) {
    const full = join(MIGRATIONS_DIR, r.migration_name)
    let note = ''
    if (!fs.existsSync(full)) {
      missing.push(r.migration_name)
      note = '  <-- FILE MISSING'
    } else if (r.checksum) {
      const onDisk = sha256(fs.readFileSync(full))
      if (onDisk !== r.checksum) {
        drifted.push(r.migration_name)
        note = '  <-- MODIFIED AFTER APPLYING'
      }
    }
    console.log(`#${r.id} ${r.migration_name} @ ${r.applied_at}${note}`)
  }

  // Files on disk that have not been applied yet.
  const onDisk = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.do.sql'))
    .sort()
  const appliedNames = new Set(res.rows.map((r) => r.migration_name))
  const pending = onDisk.filter((f) => !appliedNames.has(f))

  if (pending.length) {
    console.log(`\nPending (${pending.length}) — run "npm run migrate":`)
    for (const p of pending) console.log(`  ${p}`)
  }

  if (drifted.length || missing.length) {
    console.error(
      `\n✗ ${drifted.length} modified and ${missing.length} missing applied migration(s). ` +
        `Applied migrations are never re-run, so these changes have NOT reached the database.`
    )
    for (const d of drifted) console.error(`  modified: ${d}`)
    for (const m of missing) console.error(`  missing:  ${m}`)
    await client.end()
    process.exit(2)
  }

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
