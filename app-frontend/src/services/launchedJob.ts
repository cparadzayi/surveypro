/**
 * The job a surveyor arrived with from the council system (VunGIS), kept for the rest of the browser session so the dashboard can say
 * which job it is and where it came from. Session storage only: it is a reminder, never the record (the project holds the link to the job).
 * Every read and write is guarded: the page must work when storage is blocked.
 */
export interface LaunchedJob {
  projectId: number
  projectName: string
  authorityCode: string
  authorityName: string
  engagement: string | null
  standNumber: string | null
  ward: string | null
  taskType: string | null
  dueDate: string | null
  instructions: string | null
}

const KEY = 'launchedJob'

/** Shape the launch answer (POST /api/auth/launch) into what the banner shows. */
export function fromLaunch(answer: any): LaunchedJob | null {
  const project = answer?.project
  if (!project || project.id == null) return null
  const job = answer?.job || {}
  return {
    projectId: Number(project.id),
    projectName: String(project.name || ''),
    authorityCode: String(answer?.authority?.code || ''),
    authorityName: String(answer?.authority?.name || answer?.authority?.code || ''),
    engagement: answer?.engagement ?? null,
    standNumber: job.stand_number ?? null,
    ward: job.suburb_ward ?? null,
    taskType: job.task_type ?? null,
    dueDate: job.due_date ?? null,
    instructions: job.instructions ?? null,
  }
}

export function rememberLaunchedJob(job: LaunchedJob | null) {
  try { if (job) sessionStorage.setItem(KEY, JSON.stringify(job)) } catch { /* storage may be blocked */ }
}

export function launchedJob(): LaunchedJob | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const j = JSON.parse(raw)
    return j && typeof j.projectId === 'number' ? (j as LaunchedJob) : null
  } catch { return null }
}

export function forgetLaunchedJob() {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to forget */ }
}
