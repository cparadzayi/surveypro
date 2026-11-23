import type { JoinResult } from '../../../../utils/join'
import { bankersRound } from '../../../../utils/dms'

const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** The joins of a session as CSV, with the figures as the screen shows them (banker's-rounded). */
export function joinsCsv(rows: Array<{ from: string; to: string; result: JoinResult }>): string {
  const out = ['From,To,Direction (D:M:S),Distance (m),Reverse direction (D:M:S),dY (m),dX (m)']
  for (const r of rows) {
    const j = r.result
    out.push([
      cell(r.from), cell(r.to), j.directionDms, j.distanceRounded.toFixed(2), j.reverseDirectionDms,
      bankersRound(j.dy, 2).toFixed(2), bankersRound(j.dx, 2).toFixed(2),
    ].join(','))
  }
  return out.join('\r\n') + '\r\n'
}
