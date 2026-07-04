/**
 * Windows-transient file-lock mitigation for synchronous writes.
 *
 * On Windows, `fs.writeFileSync` over (or near) an existing file can throw
 * EBUSY/EPERM/EACCES for a few tens of milliseconds even when no viewer holds
 * the file — antivirus real-time scanning and the search indexer briefly grab a
 * handle right after a nearby file is written. A single write attempt fails on
 * that blip and looks like a real "file is open" lock. Retrying the write a few
 * times with a short backoff lets those transient locks clear; a GENUINE viewer
 * lock persists past the retries and is rethrown so the caller can still surface
 * the "close it and try again" message.
 */

const TRANSIENT_LOCK_CODES = new Set(['EBUSY', 'EPERM', 'EACCES'])

/**
 * @param {() => void} writeFn - performs the synchronous write (e.g. () => fs.writeFileSync(p, buf))
 * @param {{ attempts?: number, delayMs?: number, onRetry?: (code: string, attempt: number) => void }} [opts]
 */
export async function writeFileWithRetry(writeFn, { attempts = 5, delayMs = 80, onRetry } = {}) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      writeFn()
      return
    } catch (e) {
      lastErr = e
      // Non-transient error, or out of attempts → let the caller classify it.
      if (!e || !TRANSIENT_LOCK_CODES.has(e.code) || i === attempts - 1) throw e
      if (onRetry) onRetry(e.code, i + 1)
      // Linear backoff: 80, 160, 240, 320 ms (≈0.8s total across 5 attempts).
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)))
    }
  }
  throw lastErr
}
