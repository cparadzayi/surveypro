/**
 * Canonical enclosed-documents list for the Surveyor-General lodgement letter,
 * plus folder-aware matching: SurveyPro-generated docs must live in their
 * designated output subfolder (deterministic, no cross-folder false positives),
 * while surveyor-supplied docs are matched by keyword anywhere under input/.
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

/** A file from the project output/input manifest. relDir is POSIX, e.g. "output/field-book". */
export interface ManifestFile {
  name: string;
  relDir: string;
}

type DocRule =
  | { kind: 'generated'; folders: string[]; keyword: RegExp }
  | { kind: 'external'; keyword: RegExp };

/** Per-item matching rule. Generated items are folder-scoped; external items live under input/. */
const DOCUMENT_RULES: Record<string, DocRule> = {
  'Field book': { kind: 'generated', folders: ['field-book'], keyword: /field.?book/i },
  'Coordinate List and Calculations': { kind: 'generated', folders: ['coordinate-list', 'calculations'], keyword: /coordinate|calc|comprehensive/i },
  'General Plan': { kind: 'generated', folders: ['general-plans'], keyword: /general.?plan/i },
  'Working Plan': { kind: 'generated', folders: ['working-plans'], keyword: /working.?plan/i },
  'Report on Survey': { kind: 'generated', folders: ['survey-record', 'reports'], keyword: /report|survey.?record/i },
  'DSG Certificate (1/96)': { kind: 'generated', folders: ['certificates'], keyword: /dsg|1.?96/i },
  'Dispensation Certificate': { kind: 'external', keyword: /dispensation/i },
  'Checklist': { kind: 'external', keyword: /check.?list/i },
  'Permit/Instruction and layout': { kind: 'external', keyword: /permit|instruction|layout/i },
  'Beacon receipt': { kind: 'external', keyword: /beacon.*receipt/i },
  'Searches': { kind: 'external', keyword: /search/i },
};

export function resolveLodgementDocuments(files: ManifestFile[]): LodgementDocumentStatus[] {
  const list = files || [];
  return LODGEMENT_DOCUMENTS.map((label) => {
    const rule = DOCUMENT_RULES[label];
    const present = list.some((file) => {
      if (!rule || !rule.keyword.test(file.name)) return false;
      const segments = (file.relDir || '').split('/').filter(Boolean);
      if (rule.kind === 'external') return segments[0] === 'input';
      return segments.some((seg) => rule.folders.includes(seg));
    });
    return { label, present };
  });
}
