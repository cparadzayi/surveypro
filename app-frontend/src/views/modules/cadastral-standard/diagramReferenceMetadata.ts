export interface DiagramReferenceFields {
  deedOfTransferNo?: string | null
  parentDiagramNo?: string | null
  parentDiagramAnnexedTo?: string | null
  originalTitleDiagramNo?: string | null
  originalTitleAnnexedTo?: string | null
  originalTitleDeedNo?: string | null
  srNo?: string | null
  fileNo?: string | null
  gpNo?: string | null
}

const DIAGRAM_REFERENCE_KEYS: (keyof DiagramReferenceFields)[] = [
  'deedOfTransferNo',
  'parentDiagramNo',
  'parentDiagramAnnexedTo',
  'originalTitleDiagramNo',
  'originalTitleAnnexedTo',
  'originalTitleDeedNo',
  'srNo',
  'fileNo',
  'gpNo',
]

/**
 * Pick the nine project-level diagram reference fields from a projectInfo-like
 * object, normalising missing/null values to '' so the renderer metadata is
 * stable and complete. These exact keys are the contract sub-projects 2b/2c
 * (the Diagram PDF/DXF renderers) read from `metadata`.
 */
export function diagramReferenceMetadata(
  projectInfo: DiagramReferenceFields | null | undefined,
): Record<keyof DiagramReferenceFields, string> {
  const src = (projectInfo ?? {}) as Record<string, unknown>
  const out = {} as Record<keyof DiagramReferenceFields, string>
  for (const key of DIAGRAM_REFERENCE_KEYS) {
    const v = src[key]
    out[key] = v == null ? '' : String(v)
  }
  return out
}
