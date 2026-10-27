/**
 * Turns whatever a failed request throws into something a surveyor can act on.
 *
 * The raw text of a failed call is often useless to them: "Network Error" says nothing
 * about the server being down, and "Request failed with status code 500" says nothing
 * about what to do. `message` is the plain-language version; `technical` keeps the raw
 * text for a details line (or the console), so nothing a developer needs is lost.
 *
 * Duck-typed on purpose (no axios import): it must work on anything thrown, and be
 * testable without a network.
 */

export interface DescribedError {
  message: string
  /** The raw message, when it adds something the plain-language one does not. */
  technical?: string
}

interface AxiosLike {
  isAxiosError?: boolean
  code?: string
  message?: string
  response?: { status?: number; data?: unknown }
}

/** The server's own words for what went wrong, if it sent any. */
function serverMessage(data: unknown): string | undefined {
  if (typeof data === 'string') return data.trim() ? data.trim().slice(0, 300) : undefined
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const key of ['error', 'message', 'detail']) {
      const v = d[key]
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 300)
    }
  }
  return undefined
}

export function describeError(err: unknown, fallback = 'Something went wrong.'): DescribedError {
  if (err === null || err === undefined) return { message: fallback }
  if (typeof err === 'string') return { message: err.trim() || fallback }

  const e = err as AxiosLike
  const raw = typeof e.message === 'string' ? e.message : undefined
  const status = e.response?.status
  const fromServer = serverMessage(e.response?.data)

  if (typeof status === 'number') {
    const withServer = (plain: string) => ({ message: fromServer ?? plain, technical: raw })
    if (status === 401) return { message: 'Your session has expired. Sign in again to continue.', technical: raw }
    if (status === 403) return withServer("You don't have permission to do that.")
    if (status === 404) return withServer('That could not be found. It may have been moved or deleted.')
    if (status === 409) return withServer('That conflicts with data already saved.')
    if (status === 413) return withServer('That file is too large to send.')
    if (status === 429) return withServer('Too many requests. Wait a moment and try again.')
    if (status >= 500) {
      return {
        message: fromServer
          ? `The server hit a problem: ${fromServer}`
          : 'The server hit a problem and could not finish. Try again; if it keeps happening, contact support.',
        technical: raw,
      }
    }
    return withServer('The request was not accepted.')
  }

  // No response at all: the request never completed.
  if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || /timeout/i.test(raw ?? '')) {
    return { message: 'The request took too long and was stopped. Try again.', technical: raw }
  }
  if (e.isAxiosError || raw === 'Network Error' || e.code === 'ERR_NETWORK') {
    return {
      message: "Can't reach the SurveyPro server. Check that it is running and that you are connected, then try again.",
      technical: raw,
    }
  }

  // An ordinary Error: its own message is the best there is.
  if (raw && raw.trim()) return { message: raw.trim() }
  return { message: fallback }
}
