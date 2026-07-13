import { getOutputManifest } from '@/services/documentStorage'
import { resolveLodgementDocuments, type LodgementDocumentStatus, type ManifestFile } from '@/utils/lodgementDocuments'

/**
 * Determine which enclosed documents exist in the project output/input folders.
 * When no working directory is available (download-only path), skips the fetch and
 * reports every item as absent — callers should NOT show a warning dialog then.
 */
export async function checkLodgementDocuments(
  workingDirectory?: string
): Promise<{ documents: LodgementDocumentStatus[]; missing: string[] }> {
  let files: ManifestFile[] = []
  if (workingDirectory) {
    const manifest = await getOutputManifest(workingDirectory)
    files = manifest.files
  }
  const documents = resolveLodgementDocuments(files)
  const missing = documents.filter((d) => !d.present).map((d) => d.label)
  return { documents, missing }
}
