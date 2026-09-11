import { getOutputManifest } from '@/services/documentStorage'
import {
  resolveLodgementDocuments,
  markRecordSectionsPresent,
  verifyAgainstManifest,
  countUnknownSheetPlans,
  type LodgementDocumentStatus,
  type ManifestFile,
  type CompositionVerification,
} from '@/utils/lodgementDocuments'
import type { RecordComposition } from '@/utils/recordComposition'

/**
 * Determine which enclosed documents exist in the project output/input folders.
 * When no working directory is available (download-only path), skips the fetch and
 * reports every item as absent — callers should NOT show a warning dialog then.
 *
 * The composition, when confirmed, decides which plan rows the letter carries and
 * enables a two-way cross-check against the folders. Omit it and the behaviour is
 * the both-inclusive list with no verification, exactly as before.
 */
export async function checkLodgementDocuments(
  workingDirectory?: string,
  composition?: RecordComposition | null
): Promise<{
  documents: LodgementDocumentStatus[]
  missing: string[]
  verification: CompositionVerification
  /** General plans whose sheet count could not be read. Feeds buildLodgementWarnings. */
  unknownSheetPlans: number
}> {
  let files: ManifestFile[] = []
  if (workingDirectory) {
    const manifest = await getOutputManifest(workingDirectory)
    files = manifest.files
  }
  const documents = markRecordSectionsPresent(resolveLodgementDocuments(files, composition))
  const missing = documents.filter((d) => !d.present).map((d) => d.label)
  const verification = verifyAgainstManifest(composition ?? null, files)
  const unknownSheetPlans = countUnknownSheetPlans(files)
  return { documents, missing, verification, unknownSheetPlans }
}
