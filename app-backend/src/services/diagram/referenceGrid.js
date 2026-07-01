/**
 * Map project metadata (2a fields) to the diagram's bottom reference grid.
 * SG-office-filled cells are always blank at submission.
 */
const KEYS = [
  'deedOfTransferNo', 'parentDiagramNo', 'parentDiagramAnnexedTo',
  'originalTitleDiagramNo', 'srNo', 'fileNo', 'gpNo',
]

export function buildReferenceGrid(metadata) {
  const src = metadata ?? {}
  const grid = {}
  for (const k of KEYS) {
    const v = src[k]
    grid[k] = v == null ? '' : String(v)
  }
  // Surveyor-General's office fills these after submission → always blank.
  grid.annexedToNo = ''
  grid.annexedToDate = ''
  grid.registrationGp = ''
  grid.compilation = ''
  return grid
}
