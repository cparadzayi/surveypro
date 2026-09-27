/**
 * The party-wall servitude statement, and which of its rows a sheet carries.
 *
 * This lives in `utils/` rather than beside `buildPartyWallStatementRows` in
 * `views/` for one structural reason: `utils/` must never import from `views/`,
 * and `sheetPayloads.ts` needs the per-sheet filter. It was briefly copied into
 * `sheetPayloads.ts` instead, which put two implementations of one rule in the
 * tree -- the drift this codebase has spent a long time paying down. One
 * implementation lives here; `servitudes.ts` re-exports it so every existing
 * caller keeps working.
 */

export interface PartyWallStatementRow {
  stands: string
  boundary: string
}

/**
 * The rows a given sheet must carry (spec Decision 8).
 *
 * Filters the ROWS, not the servitudes. A row's `stands` already merges the two
 * stands a wall joins, and a wall between stands on different sheets is a
 * boundary of both, so it belongs on both statements; filtering servitudes by
 * their subject would drop it from one side.
 *
 * Matches whole names: '168' must not match stand 1686, and 1686 must not match
 * 16860. The separator is what `buildPartyWallStatementRows` actually joins with
 * -- ', ' -- and 'and' is accepted too, because a hand-written fixture once used
 * it and the tolerance costs nothing.
 */
export function statementRowsForSheet(
  rows: PartyWallStatementRow[],
  sheetStands: string[],
): PartyWallStatementRow[] {
  const wanted = new Set(sheetStands.map((s) => String(s).trim()))
  return rows.filter((row) =>
    String(row.stands)
      .split(/\s+and\s+|,\s*/)
      .map((name) => name.trim())
      .some((name) => wanted.has(name)),
  )
}
