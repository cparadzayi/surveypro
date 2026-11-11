/**
 * Merging the control the survey was tied to into the Report on Survey's "Survey Based On".
 *
 * The report names two kinds of control in two lists: trigonometrical stations, and official control
 * points (OCP, the "6091/V" series). What the surveyor has written is kept; only what is missing is added,
 * so the merge can run again and again (each time the report is opened, and whenever the selection changes)
 * without duplicating or discarding anything.
 */
export interface ControlName {
  /** As it is printed: "333/S (Sebanga)" or "6091/V". */
  label: string
  /** An official control point (OCP) rather than a trig station. */
  ocp: boolean
}

/** The designation alone: "333/S (Sebanga)" and "333/S" are the same station. */
export function controlKey(label: string): string {
  return String(label ?? '').split('(')[0].trim().toUpperCase()
}

export function mergeControlNames(
  existing: { trig?: string[] | null; ocp?: string[] | null },
  found: ControlName[],
): { trig: string[]; ocp: string[]; addedTrig: number; addedOcp: number } {
  const trig = [...(existing.trig ?? [])]
  const ocp = [...(existing.ocp ?? [])]
  // a station already named in either list is not named again
  const have = new Set([...trig, ...ocp].map(controlKey))
  let addedTrig = 0
  let addedOcp = 0
  for (const c of found) {
    const key = controlKey(c.label)
    if (!key || have.has(key)) continue
    have.add(key)
    if (c.ocp) { ocp.push(c.label); addedOcp++ } else { trig.push(c.label); addedTrig++ }
  }
  return { trig, ocp, addedTrig, addedOcp }
}
