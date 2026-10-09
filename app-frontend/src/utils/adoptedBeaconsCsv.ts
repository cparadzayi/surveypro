import { parseCSVRow } from './cadastral-csv';
import { normalizeBeaconName } from '../../../app-shared/beaconName';

/**
 * Adopted-beacon CSV: the file a surveyor uploads to carry beacons forward
 * from a previous approved survey.
 *
 * Header (the template shipped at the repo root, adpoted_points_template.csv):
 *
 *   SR_num,Point,Y,X,Status,Description,Date
 *   112/2021,P2,97538.004,2247107.872,F,50mm Iron Pipe in Concrete,February-21
 *
 * This is the union of the two headers the app already parsed halves of: the
 * field-book CSV (Point,Y,X,Status,Description,Date) and the historical-points
 * CSV (…,SR_num,…). It is deliberately NOT parsed by validateAndParseCSV --
 * these rows never enter the field book or Calculations Part 1, so they must
 * never enter workflowState.importedPoints either; safety by construction.
 *
 * The Date column is the SOURCE survey's date, kept verbatim ("February-21"),
 * because that is what the Co-ordinate List's far-right F. B column cites.
 * It is formatted only at display time (formatAdoptedSurveyDate).
 *
 * Status is kept verbatim (decision 2026-10-08): whatever the surveyor wrote
 * in the file is what prints in the F/P column. Section membership comes from
 * the file itself -- a row here is adopted by construction -- not from the
 * status vocabulary.
 */

/** One parsed row, before persistence. Coordinates are native Cape Lo. */
export interface AdoptedBeaconCSVRow {
  /** Survey record number the beacon is adopted from, e.g. "112/2021". */
  srNumber: string;
  /** Beacon name, normalised at the door (same rule as every entry point). */
  pointName: string;
  y: number;
  x: number;
  /** Verbatim from the file (e.g. "F"), or '' when the column was left blank. */
  status: string;
  description: string;
  /** Verbatim from the file (e.g. "February-21"). */
  dateRaw: string;
}

/**
 * A row whose name is already a live observation of this survey.
 *
 * This is deliberately NOT an error. The common case is a correction: the mark
 * was captured as a found beacon earlier and is now being carried forward from
 * the earlier approved survey instead. The import panel turns each conflict
 * into a confirmed "remove from this survey and adopt instead" action, so the
 * row still parses and still rides in `points`.
 */
export interface AdoptedBeaconConflict {
  /** 1-based row number, counting the header. */
  rowNumber: number;
  /** Normalised beacon name, as it will be saved. */
  pointName: string;
}

export interface AdoptedBeaconsParseResult {
  points: AdoptedBeaconCSVRow[];
  errors: string[];
  /** Names already imported as live observations (found beacons, pegs, ...). */
  conflicts: AdoptedBeaconConflict[];
}

/** The downloadable template's exact header. */
export const ADOPTED_BEACONS_CSV_HEADERS = [
  'SR_num', 'Point', 'Y', 'X', 'Status', 'Description', 'Date',
] as const;

/** Header cells accepted on upload, case- and space-insensitive. */
const HEADER_ALIASES: Record<string, keyof typeof HEADER_INDEX> = {
  sr_num: 'sr_number',
  srnum: 'sr_number',
  sr: 'sr_number',
  point: 'point_name',
  name: 'point_name',
  y: 'y',
  x: 'x',
  status: 'status',
  description: 'description',
  date: 'date',
  date_of_survey: 'date',
  survey_date: 'date',
};

const HEADER_INDEX = {
  sr_number: 0,
  point_name: 1,
  y: 2,
  x: 3,
  status: 4,
  description: 5,
  date: 6,
} as const;

/**
 * "February-21" -> "February 2021"; "November-00" -> "November 2000".
 *
 * The source record's date arrives as month-name plus a two- or four-digit
 * year, which parseSurveyDate (d/m/yyyy, yyyy-mm-dd) cannot read and returns
 * null for -- silently dropping the very citation the Co-ordinate List's F. B
 * column exists to print. Two-digit years are read as 20YY: every survey
 * record this feature exists for is post-2000, and "00" -> 2000 is exactly
 * the November-00 style the historical-points table already holds.
 *
 * Anything that does not parse is returned untouched -- a date the surveyor
 * typed differently still prints, rather than disappearing.
 */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * The one beacon-name door, re-exported so the reclassification handler can
 * compare a name against this survey's observations exactly as the parser
 * does, without reaching into app-shared itself.
 */
export function normalizeAdoptedBeaconName(name: unknown): string {
  return normalizeBeaconName(String(name ?? ''));
}

export function formatAdoptedSurveyDate(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';

  const match = /^([A-Za-z]+)[\s\-.]+(\d{2}|\d{4})$/.exec(value);
  if (!match) return value;

  const monthIndex = MONTHS.findIndex(
    (m) => m.toLowerCase().startsWith(match[1].toLowerCase().slice(0, 3)) &&
           match[1].toLowerCase().length >= 3,
  );
  if (monthIndex === -1) return value;

  const yearDigits = match[2];
  const year = yearDigits.length === 2 ? 2000 + parseInt(yearDigits, 10) : parseInt(yearDigits, 10);

  return `${MONTHS[monthIndex]} ${year}`;
}

/**
 * The same date, split for the Co-ordinate List's far-right F. B column,
 * which is narrower than "February 2021" and adjacent to F/P:
 *
 *   "February-21"  -> { top: 'Feb', bottom: '2021' }
 *
 * The month is abbreviated to three letters and stacked over the year so the
 * citation fits the column without crowding the F/P cell. A value that does
 * not parse is returned whole as the top line (nothing is dropped, matching
 * formatAdoptedSurveyDate); an empty value yields two empty parts.
 */
export function formatAdoptedSurveyDateLines(
  raw: string | null | undefined,
): { top: string; bottom: string } {
  const full = formatAdoptedSurveyDate(raw);
  if (!full) return { top: '', bottom: '' };

  const parsed = /^([A-Za-z]+)\s+(\d{4})$/.exec(full);
  if (!parsed) return { top: full, bottom: '' };

  return { top: parsed[1].slice(0, 3), bottom: parsed[2] };
}

/**
 * Parse the adopted-beacons CSV.
 *
 * @param csv - file contents
 * @param existingPointNames - names already imported for this project. A match
 *   is reported in `conflicts` (not `errors`): the row still parses, so the
 *   import panel can offer to reclassify the live observation as adopted.
 */
export function parseAdoptedBeaconsCSV(
  csv: string,
  existingPointNames: string[] = [],
): AdoptedBeaconsParseResult {
  const errors: string[] = [];
  const points: AdoptedBeaconCSVRow[] = [];
  const conflicts: AdoptedBeaconConflict[] = [];

  const lines = csv
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { points, errors: ['The file is empty.'], conflicts };
  }

  // Header: map accepted spellings to positions; required columns must be present.
  const headerCells = parseCSVRow(lines[0]).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, '_'),
  );
  const columnOf: Partial<Record<keyof typeof HEADER_INDEX, number>> = {};
  headerCells.forEach((cell, index) => {
    const key = HEADER_ALIASES[cell];
    if (key !== undefined && columnOf[key] === undefined) columnOf[key] = index;
  });

  const missing = (['sr_number', 'point_name', 'y', 'x'] as const).filter(
    (key) => columnOf[key] === undefined,
  );
  if (missing.length > 0) {
    errors.push(
      `Missing required column(s): ${missing.join(', ')}. Expected header: ${ADOPTED_BEACONS_CSV_HEADERS.join(',')}`,
    );
    return { points, errors, conflicts };
  }

  const cell = (cells: string[], key: keyof typeof HEADER_INDEX): string => {
    const index = columnOf[key];
    return index === undefined || index >= cells.length ? '' : cells[index].trim();
  };

  const existingNames = new Set(
    existingPointNames.map((n) => normalizeBeaconName(String(n))),
  );
  const seen = new Map<string, number>(); // normalised name -> first row number

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-based, counting the header
    const cells = parseCSVRow(lines[i]);

    const srNumber = cell(cells, 'sr_number');
    const rawName = cell(cells, 'point_name');
    const yRaw = cell(cells, 'y');
    const xRaw = cell(cells, 'x');

    if (!srNumber) errors.push(`Row ${rowNumber}: S.R. number is required.`);
    if (!rawName) errors.push(`Row ${rowNumber}: point name is required.`);

    const y = Number(yRaw);
    const x = Number(xRaw);
    if (yRaw === '' || !Number.isFinite(y)) {
      errors.push(`Row ${rowNumber}: Y "${yRaw}" is not a number.`);
    }
    if (xRaw === '' || !Number.isFinite(x)) {
      errors.push(`Row ${rowNumber}: X "${xRaw}" is not a number.`);
    }

    const pointName = normalizeBeaconName(rawName);
    if (pointName) {
      const firstRow = seen.get(pointName);
      if (firstRow !== undefined) {
        errors.push(
          `Row ${rowNumber}: duplicate beacon name "${pointName}" (already used on row ${firstRow}).`,
        );
      } else {
        seen.set(pointName, rowNumber);
        if (existingNames.has(pointName)) {
          // Not a fatal error: the row is kept so the surveyor can confirm the
          // correction ("remove from this survey, adopt instead") in one step.
          conflicts.push({ rowNumber, pointName });
        }
      }
    }

    if (srNumber && pointName && Number.isFinite(y) && Number.isFinite(x)) {
      points.push({
        srNumber,
        pointName,
        y,
        x,
        status: cell(cells, 'status'),
        description: cell(cells, 'description'),
        dateRaw: cell(cells, 'date'),
      });
    }
  }

  return { points, errors, conflicts };
}

/** The downloadable template -- the repo-root sample, spelled correctly. */
export function generateAdoptedBeaconsTemplate(): string {
  const sampleRows = [
    ['112/2021', 'P2', '97538.004', '2247107.872', 'F', '50mm Iron Pipe in Concrete', 'February-21'],
    ['112/2021', 'ZA', '96271.08', '2247869.919', 'F', '50mm Iron Pipe in Concrete', 'February-21'],
    ['112/2021', 'ZD', '96551.464', '2248065.632', 'F', '50mm Iron Pipe in Concrete', 'February-21'],
  ];

  return [
    ADOPTED_BEACONS_CSV_HEADERS.join(','),
    ...sampleRows.map((row) =>
      row.map((c) => (c.includes(',') ? `"${c}"` : c)).join(','),
    ),
  ].join('\n');
}
