/**
 * Cancelling a generation that is already running on the server.
 *
 * The browser's Cancel (or a closed tab) only ends the client's wait. A route that renders in one long
 * synchronous stretch never runs its event loop, so it cannot see the connection close, and would keep a
 * core busy to the end for nobody. Work that can be stopped hands the loop a turn at points it chooses
 * (`yieldOrCancel`), or hands an AbortSignal to a child process; either way a stop surfaces as one error
 * whose `name` is GENERATION_CANCELLED, which a route answers quietly (nobody is left to read it).
 */
export const GENERATION_CANCELLED = 'GenerationCancelled'

export function cancelledError(message = 'Generation cancelled: the client went away') {
  const e = new Error(message)
  e.name = GENERATION_CANCELLED
  return e
}

export const isCancelled = (err) => err?.name === GENERATION_CANCELLED

/** Throw if `signal` has been aborted. Without a signal it costs nothing. */
export function throwIfCancelled(signal) {
  if (signal?.aborted) throw cancelledError()
}

/** Give the event loop a turn (so a closed connection's 'close' event can fire), then throw if cancelled. */
export async function yieldOrCancel(signal) {
  if (!signal) return
  await new Promise((resolve) => setImmediate(resolve))
  throwIfCancelled(signal)
}

/**
 * An AbortController that fires when the client's connection closes before the reply was sent.
 * Use `.signal`; the handler need not clean up (the listener lives and dies with the reply).
 */
export function abortOnClientGone(reply) {
  const ac = new AbortController()
  reply.raw.on('close', () => { if (!reply.raw.writableFinished) ac.abort() })
  return ac
}
