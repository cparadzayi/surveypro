/**
 * Classify a filesystem write error into an HTTP-friendly, actionable result.
 *
 * The common failure when saving a rolling "latest" document (e.g.
 * Comprehensive_Latest.pdf) is that the user still has the previous version
 * open in a PDF viewer. On Windows that makes the overwrite throw EBUSY (and
 * sometimes EPERM/EACCES). Surfacing the raw code is useless to the user, so we
 * translate lock errors into a clear "close it and try again" message with a
 * 409 status and a machine-readable `FILE_LOCKED` code.
 *
 * @param {NodeJS.ErrnoException} error - the error thrown by fs.writeFileSync
 * @param {string} [fileName] - the document name, for a helpful message
 * @returns {{ status: number, code: string, message: string }}
 */
export function classifyFsWriteError(error, fileName) {
  const LOCK_CODES = new Set(['EBUSY', 'EPERM', 'EACCES'])
  const named = fileName ? `"${fileName}"` : 'The file'

  if (error && LOCK_CODES.has(error.code)) {
    return {
      status: 409,
      code: 'FILE_LOCKED',
      message:
        `${named} is open in another program (e.g. a PDF viewer). ` +
        `Please close it and try again.`,
    }
  }

  return {
    status: 500,
    code: (error && error.code) || 'WRITE_FAILED',
    message: (error && error.message) || 'Failed to save document',
  }
}
