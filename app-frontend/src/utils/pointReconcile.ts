import { normalizeBeaconName } from '../../../app-shared/beaconName'

/**
 * Keeping the workflow's copies of the survey points in step with the registry.
 *
 * `coordinate_points` is the authority for which points the survey has. The workflow also keeps copies --
 * step_data['csv-import'].points, the Calculations' adjusted_coordinates -- and the Field Book and the
 * Co-ordinate List are built from them. A point deleted in the interface left the registry but not those
 * copies, and the next Calculations run rebuilt from the import copy, so the deleted point came back into the
 * Field Book and the Co-ordinate List. These helpers compare the copies with the registry by name.
 *
 * The registry's own answer is only used when it has an answer: with no registry rows (nothing exported yet,
 * or the fetch failed) nothing can be judged and nothing is dropped.
 */

/** The registry's point names, normalised the way beacon names are compared everywhere else. */
export function registryNames(dbPoints: Array<{ name?: unknown }> | null | undefined): Set<string> {
  const out = new Set<string>()
  for (const p of dbPoints ?? []) {
    const n = String(p?.name ?? '').trim()
    if (n) out.add(normalizeBeaconName(n))
  }
  return out
}

const keyOf = (name: unknown): string => normalizeBeaconName(String(name ?? '').trim())

/** The items whose point is in the registry. With an empty registry, every item is kept. */
export function keepRegistered<T>(
  items: T[] | null | undefined,
  nameOf: (item: T) => unknown,
  registry: Set<string>,
): T[] {
  const list = items ?? []
  if (registry.size === 0) return list
  return list.filter((it) => registry.has(keyOf(nameOf(it))))
}

/** The items whose point is not among `names` (points deleted in the interface). */
export function dropNamed<T>(
  items: T[] | null | undefined,
  nameOf: (item: T) => unknown,
  names: Iterable<unknown>,
): T[] {
  const gone = new Set<string>()
  for (const n of names) gone.add(keyOf(n))
  return (items ?? []).filter((it) => !gone.has(keyOf(nameOf(it))))
}
