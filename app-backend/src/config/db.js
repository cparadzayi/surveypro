import pg from 'pg'
import { config } from 'dotenv'

config()

// Create a connection pool
// The server connects as the RUNTIME login (APP_DATABASE_URL: no ownership, no bypass of row-level security, no rights on the tenant tables, migration 104).
// DATABASE_URL, the owner, is for migrations and operator scripts. With no APP_DATABASE_URL the server keeps using DATABASE_URL, as it always has.
const pool = new pg.Pool({
  connectionString: process.env.APP_DATABASE_URL || process.env.DATABASE_URL,
  max: 20, // Maximum number of clients
  idleTimeoutMillis: 30000,
  // Per-attempt handshake budget. The startup probe below retries, so this does
  // not need to cover the whole cold-start module load — just one handshake.
  connectionTimeoutMillis: 10000,
})

// Verify the database is reachable before serving traffic.
//
// A single attempt is not enough. Cold start loads ~30 route modules (pdfkit,
// proj4, turf, …) and this file is imported at the top of server.js, so the
// probe's first handshake competes with that loading work. On a cold boot the
// server took 24s to reach "listening", and the probe's connect was still
// waiting on a connectionTimeoutMillis=10s window when it fired — killing a
// server whose database was completely healthy. Bumping the timeout only moves
// the threshold; the loading time is not a fixed constant. Retry instead, so
// fail-fast is preserved for a genuinely unreachable database while a slow
// first handshake is given room to land.
const STARTUP_PROBE_ATTEMPTS = 5
const STARTUP_PROBE_RETRY_MS = 1000

async function probeDatabase(attempt = 1) {
  try {
    const client = await pool.connect()
    try {
      await client.query('SELECT NOW()')
    } finally {
      client.release()
    }
    console.log(`Database connection established (attempt ${attempt})`)
  } catch (err) {
    if (attempt >= STARTUP_PROBE_ATTEMPTS) {
      console.error(
        `Database connection error after ${STARTUP_PROBE_ATTEMPTS} attempts:`,
        err.message
      )
      process.exit(1)
      return
    }
    console.warn(
      `Database connection attempt ${attempt}/${STARTUP_PROBE_ATTEMPTS} failed (${err.message}); retrying in ${STARTUP_PROBE_RETRY_MS}ms`
    )
    setTimeout(() => probeDatabase(attempt + 1), STARTUP_PROBE_RETRY_MS)
  }
}

probeDatabase()

// Helper function to generate schema name from email/username
function generateSchemaName(identifier) {
  // Remove domain from email, convert to lowercase, replace non-alphanumeric with underscore
  const username = identifier.includes('@') ? identifier.split('@')[0] : identifier
  return 'surveyor_' + username.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

// Get database pool with schema context for specific surveyor
function getSurveyorPool(schemaName) {
  // Validate schema name to prevent SQL injection
  // Must start with 'surveyor_' and contain only lowercase letters, numbers, and underscores
  if (!schemaName || !/^surveyor_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`Invalid schema name format: ${schemaName}. Must match pattern: surveyor_[a-z0-9_]+`)
  }
  
  return {
    async query(sql, params) {
      const client = await pool.connect()
      try {
        // SET LOCAL is transaction-scoped: Postgres reverts it at COMMIT/ROLLBACK,
        // so this connection never carries one tenant's search_path to the next
        // borrower of the shared pool. A bare SET here leaked the previous
        // tenant's schema into subsequent pool.query() calls, because every model
        // uses unqualified table names and each surveyor_* schema has its own.
        await client.query('BEGIN')
        try {
          // Safe to use string interpolation after validation above.
          await client.query(`SET LOCAL search_path = ${schemaName}, public`)
          const result = await client.query(sql, params)
          await client.query('COMMIT')
          return result
        } catch (err) {
          // Never let a rollback failure mask the original error.
          await client.query('ROLLBACK').catch(() => {})
          throw err
        }
      } finally {
        client.release()
      }
    },

    // KNOWN GAP: search_path set here is session-scoped and is NOT reset on
    // release, because the caller owns release(). The 7 call sites in
    // utils/beaconNameDoors.js, models/SurveyProject.js, routes/csvImports.js
    // and routes/historicalSurveyPoints.js must be refactored to bracket their
    // work in BEGIN/COMMIT with SET LOCAL, as query() above now does.
    // Do NOT "fix" this by resetting inside a patched release(): the pool can
    // hand the connection to another borrower before an async reset lands,
    // which reintroduces the same cross-tenant leak in a harder-to-see form.
    async connect() {
      const client = await pool.connect()
      // Set search path immediately on connect
      await client.query(`SET search_path = ${schemaName}, public`)
      return client
    }
  }
}

// Create schema for new surveyor
async function createSurveyorSchema(identifier) {
  const schemaName = generateSchemaName(identifier)
  try {
    // provision_surveyor_schema() makes the schema as its owner and gives the calling (runtime) login its rights on it; a database without
    // migration 104 has only the plain function, which an owner login can call itself
    let result
    try {
      result = await pool.query('SELECT provision_surveyor_schema($1) AS schema_name', [schemaName])
    } catch (err) {
      if (err.code !== '42883') throw err
      result = await pool.query('SELECT create_surveyor_schema($1) AS schema_name', [schemaName])
    }
    return result.rows[0].schema_name
  } catch (error) {
    console.error('Error creating surveyor schema:', error.message)
    throw error
  }
}

// Drop surveyor schema (with confirmation)
async function dropSurveyorSchema(identifier, confirmation) {
  const schemaName = generateSchemaName(identifier)
  try {
    await pool.query(
      'SELECT drop_surveyor_schema($1, $2)',
      [schemaName, confirmation]
    )
    return true
  } catch (error) {
    console.error('Error dropping surveyor schema:', error.message)
    throw error
  }
}

// Get schema statistics
async function getSurveyorSchemaStats(identifier) {
  const schemaName = generateSchemaName(identifier)
  try {
    const result = await pool.query(
      'SELECT * FROM get_surveyor_schema_stats($1)',
      [schemaName]
    )
    return result.rows
  } catch (error) {
    console.error('Error getting schema stats:', error.message)
    throw error
  }
}

// Export both the pool and helper functions
export default pool

export {
  pool,
  generateSchemaName,
  getSurveyorPool,
  createSurveyorSchema,
  dropSurveyorSchema,
  getSurveyorSchemaStats
}