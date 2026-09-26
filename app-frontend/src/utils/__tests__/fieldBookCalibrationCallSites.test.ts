/**
 * `paginateFieldBook`'s `hasCalibration` shifts every point page by one, because
 * a site calibration report occupies E1. Four call sites used to pass a literal
 * `false`, and each one was a document that silently disagreed with the field
 * book it was citing:
 *
 *   - the field-book renderer in utils/pdf-generator.ts, a SECOND renderer
 *     reached from the View/Download Field Book buttons, which never emitted a
 *     calibration page at all. Deleted; both buttons use utils/field-book.ts now.
 *   - utils/services/pageAllocation.ts, twice. Deleted.
 *   - utils/cadastral-combined-document.ts. Deleted; it had no callers.
 *   - the Calculations F/B fallback, which is legitimate: it is reached only by
 *     a caller that has not paginated the field book yet, it cannot know the
 *     answer, and it warns when it guesses.
 *
 * None of those were caught by a test of behaviour, because each produced a
 * self-consistent document that was wrong about a *different* document. So this
 * guards the call sites themselves. A new call site that hardcodes the offset
 * fails here and has to be added to the allowlist deliberately -- which is the
 * point: "does this renderer know about the calibration?" is the question that
 * has to be asked out loud each time.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Source files allowed to pass a literal offset. */
const ALLOWED_LITERAL_FALSE = new Set([
  // The Calculations F/B fallback estimate. Warned about at the call site; see
  // generateFieldBookPageLookup in utils/calculations-part1.ts.
  'utils/calculations-part1.ts',
])

/**
 * Files allowed to paginate a field book at all. Anything new that numbers a
 * field book has to be listed here, so a second renderer cannot appear without
 * someone deciding to add one.
 */
const ALLOWED_PAGINATORS = new Set([
  'utils/field-book.ts',              // the renderer
  'utils/TwoPassDocumentGenerator.ts', // the measurement + render passes
  'composables/useCadastralWorkflow.ts', // the workflow state's point->page map
  'utils/workflowExcelExporter.ts',   // the Excel export
  'utils/calculations-part1.ts',      // the F/B lookup and its documented fallback
])

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (entry.endsWith('.ts') || entry.endsWith('.vue')) out.push(full)
  }
  return out
}

/** Every `paginateFieldBook(` occurrence, as the text that follows it. */
function paginationCalls(text: string): string[] {
  const calls: string[] = []
  const needle = 'paginateFieldBook('
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    calls.push(text.slice(at, at + 400))
  }
  return calls
}

const read = (file: string) => readFileSync(join(SRC, ...file.split('/')), 'utf8')

// Tests are excluded: this file names the offsets deliberately, and the parity
// suite needs to exercise both.
const files = sourceFiles(SRC)
  .map(f => relative(SRC, f).split(sep).join('/'))
  .filter(f => !f.includes('/__tests__/') && !f.endsWith('.d.ts'))

describe('field book pagination call sites', () => {
  it('found the source tree', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('only the documented fallback hardcodes the calibration offset away', () => {
    const offenders = files.filter(file =>
      paginationCalls(read(file)).some(call => /hasCalibration:\s*false\b/.test(call))
      && !ALLOWED_LITERAL_FALSE.has(file),
    )
    expect(offenders).toEqual([])
  })

  it('nobody outside the allowlist numbers a field book', () => {
    const offenders = files.filter(file =>
      file !== 'utils/fieldBookPagination.ts' // the declaration, not a call site
      && paginationCalls(read(file)).length > 0
      && !ALLOWED_PAGINATORS.has(file),
    )
    expect(offenders).toEqual([])
  })

  it('has a single field-book renderer', () => {
    // The consolidation that removed utils/pdf-generator.ts is what makes this
    // hold, and it is the one that had drifted: a second renderer with no
    // calibration page, reached from two live buttons.
    const renderers = files.filter(f => /class\s+\w*FieldBook\w*Generator\b/.test(read(f)))
    expect(renderers).toEqual(['utils/field-book.ts'])
  })
})
