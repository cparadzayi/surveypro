/**
 * Every field-book page number is decided here, and nowhere else.
 *
 * This used to be derived independently in five places — the renderer, the
 * measurement pass, the Calculations F/B lookup, and twice in the page-allocation
 * service — which is how one of them came to paginate at 20 points per page
 * while the rest used 27, quietly mis-citing every point past the 20th.
 * Cross-references in a survey record are only as trustworthy as the arithmetic
 * behind them, so there is now one function and one constant.
 *
 * A second failure mode got in the same way. `hasCalibration` shifts every point
 * page by one, because a site calibration report occupies E1, and four call sites
 * passed a literal `false` for it — including the one in the field-book renderer,
 * which was a separate, second renderer reached from the View/Download Field Book
 * buttons. On a calibrated survey those buttons printed a book with no calibration
 * and its observations on E1, disagreeing with the lodged document. The second
 * renderer and the page-allocation service are gone; of the original sites only
 * the Calculations fallback below still passes a literal, and it warns when it
 * does. Pass `Boolean(calibration)` from anything that renders a field book.
 */

/** Rows that fit on one field book page: A4 portrait less margins and header. */
export const FIELD_BOOK_POINTS_PER_PAGE = 27;

/** One party-wall servitude row: the stands bound by the wall and its beacon-pair boundary. */
export interface PartyWallRow {
  stands: string
  boundary: string
}

/** Row-slots on a field-book party-wall page: the heading, header and data rows share one grid. */
export const PARTY_WALL_ROWS_PER_PAGE = 30;
/** Heading + column-header rows, consumed only on the FIRST party-wall page. */
export const PARTY_WALL_HEADER_ROWS = 2;

/**
 * Paginate the party-wall servitude section.
 *
 * Every page is a grid of PARTY_WALL_ROWS_PER_PAGE row-slots; the first page
 * loses PARTY_WALL_HEADER_ROWS to the "Party-wall servitudes" heading and the
 * STANDS/BOUNDARY header row. Returns one list of global row indices per page —
 * a single source of truth shared by the field-book renderer, the Calculations
 * renderer, and the two-pass pagination (they must never disagree on what fits
 * where, or the field-book page-count guard throws).
 */
export function computePartyWallPaginate(partyWallCount: number): number[][] {
  if (partyWallCount <= 0) return [];
  const firstCapacity = PARTY_WALL_ROWS_PER_PAGE - PARTY_WALL_HEADER_ROWS;
  const pages: number[][] = [];
  let row = 0;
  for (let p = 0; row < partyWallCount; p++) {
    const capacity = p === 0 ? firstCapacity : PARTY_WALL_ROWS_PER_PAGE;
    const rows: number[] = [];
    for (let i = 0; i < capacity && row < partyWallCount; i++) {
      rows.push(row++);
    }
    pages.push(rows);
  }
  return pages;
}

export interface FieldBookPaginationPoint {
  id: string;
}

export interface FieldBookPagination {
  /** point id -> E-number, e.g. "E2" */
  pointPageMap: Record<string, string>;
  /** E-number of the calibration page, or null when the survey has none */
  calibrationPage: string | null;
  /** indexed party-wall row -> E-number of the field-book page that records it, e.g. "E31" */
  partyWallPageMap: Record<number, string>;
  /** E-page int of the first party-wall page (0 when there are no rows) */
  partyWallBasePage: number;
  /** numbered (E) pages */
  ePageCount: number;
  /** physical pages, including the unnumbered cover */
  physicalPageCount: number;
}

/**
 * Number the pages of a field book.
 *
 * `points` must be EXACTLY the points the field book will render, in render
 * order. Calculated points never appear in the field book, so a caller that
 * passes an unfiltered list shifts every E-number after the first calculated
 * point. This function does not filter; it paginates what it is given.
 */
export function paginateFieldBook(
  points: FieldBookPaginationPoint[],
  opts: { hasCalibration: boolean; hasCover: boolean; partyWalls?: PartyWallRow[] },
): FieldBookPagination {
  const { hasCalibration, hasCover } = opts;

  // The calibration opens the book, so every point page sits one later.
  const offset = hasCalibration ? 1 : 0;

  const pointPageMap: Record<string, string> = {};
  points.forEach((point, index) => {
    const page = Math.floor(index / FIELD_BOOK_POINTS_PER_PAGE) + 1 + offset;
    pointPageMap[point.id] = `E${page}`;
  });

  const pointPages = Math.ceil(points.length / FIELD_BOOK_POINTS_PER_PAGE);

  // The party-wall section opens on its own page after the last point page and
  // stays in the E-series, so a Calculations table can cite the exact page.
  const partyWallPages = computePartyWallPaginate(opts.partyWalls?.length ?? 0);
  const partyWallPageMap: Record<number, string> = {};
  if (partyWallPages.length) {
    const partyWallBasePage = pointPages + offset + 1;
    partyWallPages.forEach((rows, pageIndex) => {
      const pageLabel = `E${partyWallBasePage + pageIndex}`;
      rows.forEach((dataRow) => {
        partyWallPageMap[dataRow] = pageLabel;
      });
    });
  }

  const ePageCount = pointPages + offset + partyWallPages.length;

  return {
    pointPageMap,
    calibrationPage: hasCalibration ? 'E1' : null,
    partyWallPageMap,
    partyWallBasePage: partyWallPages.length ? pointPages + offset + 1 : 0,
    ePageCount,
    physicalPageCount: ePageCount + (hasCover ? 1 : 0),
  };
}
