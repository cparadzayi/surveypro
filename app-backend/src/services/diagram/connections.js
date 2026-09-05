/**
 * Resolve `metadata.connections` into drawable connecting-data marks, shared by
 * the diagram PDF and DXF renderers so the two cannot disagree about which
 * beacon a connection leaves, which way it points or what it is lettered.
 *
 * A connection is stored against BEACON NAMES, not vertex letters. Letters come
 * from ring order, so re-digitising a parcel silently reassigns them and a
 * connection stored as 'B' would move to a different corner. Names survive it.
 */
import { normalizeCapeLoYX } from '../pdfkitGeoPDF/geometry.js'
import { resolveVertexBeaconName } from './beaconName.js'
import { letterAt } from './subjectGeometry.js'

/** Canonical [Y, X] of a named beacon in the project's coordinate list. */
function beaconYX(name, beacons) {
  const want = String(name ?? '').trim().toUpperCase()
  if (!want) return null
  for (const f of beacons?.features ?? []) {
    const p = f?.properties ?? {}
    const n = p.name ?? p.beacon_name ?? p.id
    if (String(n ?? '').trim().toUpperCase() !== want) continue
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c)) continue
    return normalizeCapeLoYX(c[0], c[1])
  }
  return null
}

/**
 * @param {object}   args
 * @param {object}   args.geometry     from deriveSubjectGeometry
 * @param {object}   args.beacons      the project's beacon FeatureCollection
 * @param {Array}    args.connections  metadata.connections
 * @returns {{marks: Array, suppressed: Set<string>}}
 *   `marks` carries one entry per drawable connection, in the order the letters
 *   were assigned. `suppressed` holds the vertex LETTERS that carry a
 *   connection, so the abutment stub at that beacon can be dropped: a beacon
 *   showing both would make two different claims with one mark, and the
 *   connection is the one the Surveyor-General requires.
 */
export function resolveConnections({ geometry, beacons, connections }) {
  const marks = []
  const suppressed = new Set()
  const list = Array.isArray(connections) ? connections : []
  if (!list.length) return { marks, suppressed }

  const vertices = geometry?.vertices ?? []
  // vertex letter -> its beacon name, by the same coordinate match the sides
  // table uses to name beacons.
  const nameOf = new Map(
    vertices.map((v) => [v.letter, resolveVertexBeaconName([v.y, v.x], beacons)]),
  )

  let next = vertices.length
  for (const c of list) {
    const from = String(c?.fromBeacon ?? '').trim().toUpperCase()
    if (!from) continue
    const vertex = vertices.find(
      (v) => String(nameOf.get(v.letter) ?? '').trim().toUpperCase() === from,
    )
    // A connection whose beacon is not a corner of THIS figure belongs to
    // another diagram in the same project. Skipped, not drawn at a guess.
    if (!vertex) continue
    const toYX = beaconYX(c?.toBeacon, beacons)
    if (!toYX) continue

    marks.push({
      fromLetter: vertex.letter,
      fromYX: [vertex.y, vertex.x],
      toYX,
      toBeacon: String(c?.toBeacon ?? ''),
      distanceM: Number(c?.distanceM) || 0,
      // Continues the figure's own sequence: A B C D, then E, F...
      letter: letterAt(next++),
    })
    suppressed.add(vertex.letter)
  }
  return { marks, suppressed }
}
