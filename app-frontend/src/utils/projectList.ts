/** Search and ordering for the dashboard's project list. Pure, so it can be tested without a page. */

export type ProjectSort = 'recent' | 'name' | 'created'

export const PROJECT_SORT_LABELS: Record<ProjectSort, string> = {
  recent: 'Recently opened',
  name: 'Name (A–Z)',
  created: 'Newest first',
}

interface ListedProject {
  name?: string | null
  client_name?: string | null
  district?: string | null
  survey_type?: string | null
  last_used?: string | null
  created_at?: string | null
}

const time = (v?: string | null): number => {
  const t = v ? Date.parse(v) : NaN
  return Number.isNaN(t) ? 0 : t
}

/** Every word of `query` must appear in the name, client, district or survey type (any case). */
export function matchesQuery(p: ListedProject, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = [p.name, p.client_name, p.district, p.survey_type].filter(Boolean).join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}

export function filterAndSortProjects<T extends ListedProject>(projects: T[], query: string, sort: ProjectSort): T[] {
  const list = projects.filter((p) => matchesQuery(p, query))
  const byName = (a: T, b: T) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true, sensitivity: 'base' })
  return list.sort((a, b) => {
    if (sort === 'name') return byName(a, b)
    if (sort === 'created') return time(b.created_at) - time(a.created_at) || byName(a, b)
    // Recently opened: projects never opened fall back to when they were made, so a new project is not buried.
    return (time(b.last_used) || time(b.created_at)) - (time(a.last_used) || time(a.created_at)) || byName(a, b)
  })
}
