/**
 * The survey date, read and written in one place.
 *
 * A survey date is a fact about the survey. It is recorded in the field, it is
 * lodged with the Surveyor-General, and nothing that happens afterwards changes
 * it -- least of all the day someone regenerated the PDF. Four points along the
 * chain from CSV to field book each substituted `new Date()` when the recorded
 * date was missing or unreadable, so the record dated itself to its own printing.
 *
 * Three faults fed that, and each is fixed here rather than at the four sites:
 *
 *   The column name. CSVs head this column "Date"; the parser looked only for
 *   "date of survey", found nothing, and fell through to today.
 *
 *   The reading. `new Date('2/07/2026')` is month-first and gives 7 February.
 *   Zimbabwe writes dd/mm/yyyy, so a slash date is read day-first here.
 *
 *   The writing. `new Date(2026, 6, 2).toISOString()` is 2026-07-01T22:00Z in
 *   UTC+2: storing a date through toISOString moved it a day earlier on every
 *   round trip. `toISODate` reads the local calendar fields instead.
 *
 * A date that cannot be read is null, and null prints as an empty cell. An empty
 * cell says the date was not recorded, which is true. Today's date says the
 * survey happened today, which is not.
 */

/** dd/mm/yyyy or d/m/yyyy -- how a date is written in Zimbabwe. */
const SLASHED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/** yyyy-mm-dd, optionally followed by a time we discard. */
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/;

/**
 * Build a local-midnight Date, rejecting any field the calendar does not have.
 *
 * `new Date(2026, 12, 1)` is January 2027 and `new Date(2026, 1, 31)` is 3 March
 * -- JavaScript rolls impossible dates forward rather than refusing them. So a
 * month-first date like 01/13/2026 would silently become a real day in the wrong
 * year. Reading the fields back is what catches that.
 */
function localDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Read a recorded survey date, or null if there isn't one that can be read.
 *
 * Never guesses and never falls back to today: an unreadable date is null, and
 * the caller decides what an absent date looks like.
 */
export function parseSurveyDate(raw: string | Date | null | undefined): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;

  const text = (raw ?? '').trim();
  if (!text) return null;

  const slashed = SLASHED.exec(text);
  if (slashed) {
    return localDate(Number(slashed[3]), Number(slashed[2]), Number(slashed[1]));
  }

  const iso = ISO.exec(text);
  if (iso) {
    return localDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  return null;
}

/**
 * The date as dd/mm/yyyy, the way it is written on a Zimbabwean field book page.
 *
 * A string that cannot be read is returned exactly as it was recorded. A date
 * the reader can interpret beats a sentence telling them the software could not.
 */
export function formatSurveyDate(value: string | Date | null | undefined): string {
  const date = parseSurveyDate(value);
  if (date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
  }

  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The date as yyyy-mm-dd for storage, taken from the local calendar.
 *
 * Not `toISOString().split('T')[0]`: that converts to UTC first, and every date
 * in Zimbabwe's UTC+2 would come back a day earlier than it was entered.
 */
export function toISODate(value: string | Date | null | undefined): string {
  const date = parseSurveyDate(value);
  if (!date) return '';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Month names of the local calendar, for the "July 2026" cover wording. */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * The date as "July 2026", the month-and-year the survey was carried out as the
 * field book cover and the report on survey state it. A string that cannot be
 * read is returned exactly as it was recorded, like formatSurveyDate.
 */
export function formatSurveyMonthYear(value: string | Date | null | undefined): string {
  const date = parseSurveyDate(value);
  if (date) {
    const monthName = MONTH_NAMES[date.getMonth()];
    if (monthName) return `${monthName} ${date.getFullYear()}`;
  }

  return typeof value === 'string' ? value.trim() : '';
}

/** Column headings that have held the survey date across the CSVs in use. */
export const SURVEY_DATE_COLUMNS = [
  'date',
  'date of survey',
  'survey_date',
  'survey date',
  'surveydate',
];
