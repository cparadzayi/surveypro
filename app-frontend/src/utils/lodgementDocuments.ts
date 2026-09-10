/**
 * Canonical enclosed-documents list for the Surveyor-General lodgement letter,
 * plus folder-aware matching: SurveyPro-generated docs must live in their
 * designated output subfolder (deterministic, no cross-folder false positives),
 * while surveyor-supplied docs are matched by keyword anywhere under input/.
 */

import type { RecordComposition } from './recordComposition';

/** Every enclosed-document label, both plan families included. */
const ALL_LODGEMENT_DOCUMENTS: string[] = [
  'Field book',
  'Coordinate List and Calculations',
  'Diagram',
  'General Plan',
  'Working Plan',
  'Report on Survey',
  'Dispensation Certificate',
  'Checklist',
  'DSG Certificate (1/96)',
  'Permit/Instruction and layout',
  'Beacon receipt',
  'Searches',
];

/**
 * The enclosed-document labels for a given record composition.
 *
 * An unconfirmed or absent composition yields the both-inclusive list, so a
 * project that never set one behaves as it always did (plus the Diagram row).
 */
export function lodgementDocumentsFor(composition?: RecordComposition | null): string[] {
  const gated = composition && composition.source === 'confirmed';
  const wantDiagrams = !gated || composition!.includesDiagrams;
  const wantGeneralPlans = !gated || composition!.includesGeneralPlans;
  return ALL_LODGEMENT_DOCUMENTS.filter((label) => {
    if (label === 'Diagram') return wantDiagrams;
    if (label === 'General Plan') return wantGeneralPlans;
    return true;
  });
}

/** Both-inclusive default, used where no composition is available. */
export const LODGEMENT_DOCUMENTS: string[] = lodgementDocumentsFor(null);

export interface LodgementDocumentStatus {
  /** Canonical identity. Never carries a count — consumers match on this. */
  label: string;
  /** What the letter prints: the label plus a live copy count for the two plan rows. */
  displayLabel: string;
  present: boolean;
}

/** A file from the project output/input manifest. relDir is POSIX, e.g. "output/field-book". */
export interface ManifestFile {
  name: string;
  relDir: string;
}

type DocRule =
  | { kind: 'generated'; folders: string[]; keyword: RegExp }
  | { kind: 'external'; keyword: RegExp };

/**
 * Copies of each file that are physically lodged. Three copies of every diagram go to
 * the SG; general plans go one per plan. Anything not listed is not counted at all.
 */
const COPIES_PER_FILE: Record<string, number> = {
  'Diagram': 3,
  'General Plan': 1,
};

/**
 * Render an enclosed-document label, with a live count for the two plan rows.
 *
 * The count is derived from the manifest on every render, exactly as presence is, so
 * it cannot drift from what is on disk — superseding a plan re-derives both.
 */
function enclosedLabel(label: string, fileCount: number): string {
  const copies = COPIES_PER_FILE[label];
  if (copies === undefined || fileCount === 0) return label;
  const noun = label === 'Diagram' && fileCount > 1 ? 'Diagrams' : label;
  return `${noun} (${fileCount * copies})`;
}

/** Per-item matching rule. Generated items are folder-scoped; external items live under input/. */
const DOCUMENT_RULES: Record<string, DocRule> = {
  'Field book': { kind: 'generated', folders: ['field-book'], keyword: /field.?book/i },
  'Coordinate List and Calculations': { kind: 'generated', folders: ['coordinate-list', 'calculations'], keyword: /coordinate|calc|comprehensive/i },
  // Diagrams are saved as `diagram-<designation>.pdf` into output/diagrams. Folder-gated,
  // so a general plan that names its parent diagram number cannot tick this row.
  'Diagram': { kind: 'generated', folders: ['diagrams'], keyword: /diagram/i },
  // Plans are saved as `<planType>-<designation>.pdf`; the general-plans folder holds the
  // general-developed / general-undeveloped / general-plan slugs — all General Plan products,
  // all starting with "general". Folder-gated, so the keyword need only confirm the product.
  'General Plan': { kind: 'generated', folders: ['general-plans'], keyword: /general/i },
  'Working Plan': { kind: 'generated', folders: ['working-plans'], keyword: /working.?plan/i },
  'Report on Survey': { kind: 'generated', folders: ['survey-record', 'reports'], keyword: /report|survey.?record/i },
  'DSG Certificate (1/96)': { kind: 'generated', folders: ['certificates'], keyword: /dsg|1.?96/i },
  'Dispensation Certificate': { kind: 'generated', folders: ['certificates'], keyword: /dispensation/i },
  'Checklist': { kind: 'external', keyword: /check.?list/i },
  'Permit/Instruction and layout': { kind: 'external', keyword: /permit|instruction|layout/i },
  'Beacon receipt': { kind: 'external', keyword: /beacon.*receipt/i },
  'Searches': { kind: 'external', keyword: /search/i },
};

export function resolveLodgementDocuments(
  files: ManifestFile[],
  composition?: RecordComposition | null
): LodgementDocumentStatus[] {
  const list = files || [];
  return lodgementDocumentsFor(composition).map((label) => {
    const rule = DOCUMENT_RULES[label];
    const matches = list.filter((file) => {
      if (!rule || !rule.keyword.test(file.name)) return false;
      const segments = (file.relDir || '').split('/').filter(Boolean);
      if (rule.kind === 'external') return segments[0] === 'input';
      return segments.some((seg) => rule.folders.includes(seg));
    });
    return {
      label,
      displayLabel: enclosedLabel(label, matches.length),
      present: matches.length > 0,
    };
  });
}

/** Enclosed-document labels that the comprehensive record itself always produces. */
export const RECORD_ENCLOSED_SECTIONS = ['Field book', 'Coordinate List and Calculations'] as const;

/**
 * Force the record's own sections to present. The comprehensive record encloses the
 * field book, coordinate list, and calculations by construction, but their split files
 * are written during generation — after the on-disk manifest is read — so the disk check
 * alone would show them missing on the generating run. Marking them present reflects that
 * they are always part of the record being produced.
 */
export function markRecordSectionsPresent(documents: LodgementDocumentStatus[]): LodgementDocumentStatus[] {
  const forced = new Set<string>(RECORD_ENCLOSED_SECTIONS);
  return documents.map((d) => (forced.has(d.label) ? { ...d, present: true } : d));
}
