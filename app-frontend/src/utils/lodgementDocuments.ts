/**
 * Canonical enclosed-documents list for the Surveyor-General lodgement letter,
 * plus keyword matching so each item can be ticked when a matching file exists in
 * the project output/input folders.
 */

export const LODGEMENT_DOCUMENTS: string[] = [
  'Field book',
  'Coordinate List and Calculations',
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

export interface LodgementDocumentStatus {
  label: string;
  present: boolean;
}

/** Keyword pattern per label; a file whose name matches means the item is present. */
const DOCUMENT_PATTERNS: Record<string, RegExp> = {
  'Field book': /field.?book/i,
  'Coordinate List and Calculations': /coordinate|calc|comprehensive/i,
  'General Plan': /general.?plan/i,
  'Working Plan': /working.?plan/i,
  'Report on Survey': /report.*survey|survey.?record/i,
  'Dispensation Certificate': /dispensation/i,
  'Checklist': /check.?list/i,
  'DSG Certificate (1/96)': /dsg|1.?96/i,
  'Permit/Instruction and layout': /permit|instruction|layout/i,
  'Beacon receipt': /beacon.*receipt/i,
  'Searches': /search/i,
};

export function resolveLodgementDocuments(fileNames: string[]): LodgementDocumentStatus[] {
  const names = fileNames || [];
  return LODGEMENT_DOCUMENTS.map((label) => {
    const pattern = DOCUMENT_PATTERNS[label];
    const present = names.some((n) => pattern.test(n));
    return { label, present };
  });
}
