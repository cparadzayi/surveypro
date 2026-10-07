import pg from 'pg'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { createHash } from 'crypto'
import { config } from 'dotenv'

config()

const __dirname = dirname(fileURLToPath(import.meta.url))

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function runMigration() {
  console.log('Running migrations...')
  try {
    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations_history (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        checksum CHAR(64),
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    // Rows written before checksums existed have none; leave them NULL rather
    // than inventing a value that would then "verify" against a modified file.
    await pool.query('ALTER TABLE migrations_history ADD COLUMN IF NOT EXISTS checksum CHAR(64)')
    console.log('✓ Migrations tracking table ready')
    
    // Get list of already applied migrations
    const appliedResult = await pool.query('SELECT migration_name, checksum FROM migrations_history')
    const appliedMigrations = new Map(appliedResult.rows.map(r => [r.migration_name, r.checksum]))
    console.log(`✓ Found ${appliedMigrations.size} previously applied migrations`)
    
    const dir = join(__dirname, '../migrations')
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.do.sql')) // Only run .do.sql files, not .undo.sql
      .sort()
    
    let newMigrationsCount = 0
    let driftedCount = 0
    
    for (const f of files) {
      const full = join(dir, f)
      const bytes = fs.readFileSync(full)
      const checksum = sha256(bytes)
      
      if (appliedMigrations.has(f)) {
        const recorded = appliedMigrations.get(f)
        if (recorded && recorded !== checksum) {
          // An already-applied migration was edited after the fact. This used
          // to be reported as a plain skip, so a schema fix could be committed
          // and never reach any database: the filename stays "applied" forever.
          driftedCount++
          console.error(
            `✗ DRIFT: ${f} was modified after it was applied\n` +
            `    recorded ${recorded}\n` +
            `    on disk  ${checksum}\n` +
            `    Applied migrations are never re-run, so this change has NOT\n` +
            `    reached the database. Revert the file, or add a new numbered migration.`
          )
        } else if (!recorded) {
          console.warn(`? ${f} was applied without a recorded checksum; cannot verify it is unmodified`)
        } else {
          console.log(`⊘ Skipping ${f} (already applied)`)
        }
        continue
      }
      
      const sql = bytes.toString('utf8')
      console.log(`→ Applying migration: ${f}`)
      
      await pool.query('BEGIN')
      try {
        await pool.query(sql)
        await pool.query('INSERT INTO migrations_history (migration_name, checksum) VALUES ($1, $2)', [f, checksum])
        await pool.query('COMMIT')
        console.log(`✓ Applied ${f}`)
        newMigrationsCount++
      } catch (err) {
        await pool.query('ROLLBACK')
        throw new Error(`Failed to apply ${f}: ${err.message}`)
      }
    }
    
    if (driftedCount > 0) {
      // Non-zero exit so CI catches it. Everything new was still applied first,
      // so this does not block unrelated pending migrations.
      console.error(`\n✗ ${driftedCount} applied migration(s) were modified after the fact.`)
      process.exit(2)
    }
    
    if (newMigrationsCount === 0) {
      console.log('✓ All migrations already applied - database is up to date')
    } else {
      console.log(`✓ Successfully applied ${newMigrationsCount} new migration(s)`)
    }
    
    process.exit(0)
  } catch (err) {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

runMigration()