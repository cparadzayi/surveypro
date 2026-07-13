import { getOutputManifest } from '@/services/documentStorage'
import { resolveLodgementDocuments, type LodgementDocumentStatus } from '@/utils/lodgementDocuments'

/**
 * Determine which enclosed documents exist in the project output/input folders.
 * When no working directory is available (download-only path), skips the fetch and
 * reports every item as absent — callers should NOT show a warning dialog then.
 */
export async function checkLodgementDocuments(
  workingDirectory?: string
): Promise<{ documents: LodgementDocumentStatus[]; missing: string[] }> {
  let fileNames: string[] = []
  if (workingDirectory) {
    const manifest = await getOutputManifest(workingDirectory)
    fileNames = manifest.files.map((f) => f.name)
  }
  const documents = resolveLodgementDocuments(fileNames)
  const missing = documents.filter((d) => !d.present).map((d) => d.label)
  return { documents, missing }
}
