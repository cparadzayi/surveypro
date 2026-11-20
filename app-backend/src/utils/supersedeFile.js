/**
 * Move a generated product that has been replaced into a `superseded` folder beside it.
 *
 * When a diagram is redrawn after a re-import its file name can change (the scale is in the name), so the new
 * file does not overwrite the old one. Leaving the old one where it was would put an out-of-date diagram beside
 * the current one in output/diagrams, which is how stale figures reach a lodgement. Nothing is deleted: the old
 * file is moved, and a name already taken in `superseded` gets the time of the move added.
 */
import fs from 'fs'
import path from 'path'

export class SupersedeError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

/**
 * @param {string} absWorkingDir the project's working directory, absolute
 * @param {string} relDir        the file's folder relative to it, e.g. "output/diagrams" (must be under output/)
 * @param {string} name          the file name (no path separators)
 * @returns {string} the absolute path the file was moved to
 */
export function supersedeOutputFile(absWorkingDir, relDir, name, now = new Date()) {
  if (typeof relDir !== 'string' || typeof name !== 'string' || !name || /[\\/]/.test(name) || name === '..' || name === '.') {
    throw new SupersedeError(400, 'A folder and a plain file name are required')
  }
  const root = path.resolve(absWorkingDir, 'output')
  const dir = path.resolve(absWorkingDir, relDir)
  if (dir !== root && !dir.startsWith(root + path.sep)) throw new SupersedeError(400, 'Only files under output/ can be superseded')
  if (path.basename(dir) === 'superseded') throw new SupersedeError(400, 'The file is already superseded')
  const src = path.join(dir, name)
  if (!fs.existsSync(src)) throw new SupersedeError(404, 'File not found')

  const destDir = path.join(dir, 'superseded')
  fs.mkdirSync(destDir, { recursive: true })
  let dest = path.join(destDir, name)
  if (fs.existsSync(dest)) {
    const ext = path.extname(name)
    const stamp = now.toISOString().replace(/[:.]/g, '-')
    dest = path.join(destDir, `${name.slice(0, name.length - ext.length)}_${stamp}${ext}`)
  }
  fs.renameSync(src, dest)
  return dest
}
