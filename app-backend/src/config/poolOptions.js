/**
 * Connection pool settings, in one pure function so they can be tested without opening a socket.
 *
 * idleTimeoutMillis is the one that matters for speed. It used to be 30 s: a surveyor who paused
 * for half a minute came back to an empty pool, and the next page load paid for opening a fresh
 * Postgres connection per concurrent request (measured: 20 simultaneous list calls took 1.2 s
 * cold, 0.1 s warm — the whole difference was connection set-up). Ten minutes keeps a working
 * session warm; DB_IDLE_TIMEOUT_MS overrides it.
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000

export function buildPoolOptions(env = process.env) {
  const idle = Number(env.DB_IDLE_TIMEOUT_MS)
  return {
    connectionString: env.DATABASE_URL,
    max: 20, // Maximum number of clients
    idleTimeoutMillis: Number.isFinite(idle) && idle >= 1000 ? idle : DEFAULT_IDLE_TIMEOUT_MS,
    // Idle connections must not keep a process alive (a script or a test that imports this file
    // would otherwise hang for the whole idle timeout after it is done). The server stays up
    // because it is listening, not because of the pool.
    allowExitOnIdle: true,
    // Per-attempt handshake budget. The startup probe below retries, so this does
    // not need to cover the whole cold-start module load — just one handshake.
    connectionTimeoutMillis: 10000,
  }
}
