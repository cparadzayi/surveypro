/**
 * One sheet's outside figure, in the shape the existing SI 727 edge-table
 * builder already wants.
 *
 * `buildEdgeTable` is agnostic about where its vertices came from, so a per-sheet
 * table needs no new builder -- only a conversion from the part ring splitFigure
 * returns. The lettering restarts at A on every sheet, which is spec Part 4: the
 * same physical point appears in two sheets' tables under two different letters.
 */
import { letterPart } from '../../../app-shared/sheetDerivation'
import type { OfdVertex } from './ofdClipping'

interface LoPoint {
  y: number
  x: number
}

export interface LoPointNamed {
  y: number
  x: number
  name?: string
  id?: string
}

export function sheetOutsideFigureVertices(
  part: LoPointNamed[],
  newPoints: LoPointNamed[],
  names?: Map<LoPointNamed, string>,
): OfdVertex[] {
  // A Set of the actual OBJECTS. splitFigure returns the same objects in the part
  // ring and in newPoints, so identity is exact -- where a coordinate comparison
  // would need an epsilon and would misclassify a beacon surveyed to 3 dp as a
  // created point.
  const created = new Set<LoPointNamed>(newPoints)
  const letters = letterPart(part)
  const namesMap = names ?? new Map<LoPointNamed, string>()

  return part.map((p, i) => {
    const named = namesMap.get(p) ?? p.name ?? p.id
    const pointId = named != null && String(named).trim() !== '' ? String(named) : letters[i]
    return {
      id: `${i}`,
      pointId,
      y: p.y,
      x: p.x,
      type: created.has(p) ? 'cut' : 'survey',
    }
  })
}
