import { ref } from 'vue'

/**
 * One place for telling the user something: toasts for results and problems, and a
 * confirm dialog for questions. It replaces the native `alert()` / `confirm()` calls,
 * which block the page, cannot carry detail or a next step, and are not announced the
 * same way by assistive technology.
 *
 *   notifySuccess('Plan saved', { details: ['plan.pdf', 'plan.dxf'] })
 *   notifyError(describeError(e).message, { title: 'Generation failed' })
 *   if (await confirmDialog({ title: 'Overwrite?', message: '…', tone: 'danger' })) { … }
 *
 * State is module-level, so any component or composable can raise a notice and the one
 * `<NotificationHost />` in App.vue shows it.
 */

export type NoticeKind = 'info' | 'success' | 'warning' | 'error'

export interface NoticeAction {
  label: string
  run: () => void
}

export interface Notice {
  id: number
  kind: NoticeKind
  title?: string
  message: string
  details: string[]
  /** A sticky notice stays until dismissed; errors are sticky unless told otherwise. */
  sticky: boolean
  actions: NoticeAction[]
}

export interface NotifyOptions {
  kind?: NoticeKind
  title?: string
  message: string
  details?: string[]
  sticky?: boolean
  /** Overrides how long a non-sticky notice stays up. */
  timeoutMs?: number
  actions?: NoticeAction[]
}

/** How long a non-sticky notice stays up. Errors are sticky: a problem should not vanish unread. */
const DEFAULT_TIMEOUT_MS: Record<NoticeKind, number | null> = {
  info: 7000,
  success: 6000,
  warning: 14000,
  error: null,
}

/** The most notices shown at once; the oldest non-sticky one makes room. */
export const MAX_NOTICES = 5

export const notices = ref<Notice[]>([])
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export function dismissNotice(id: number): void {
  const t = timers.get(id)
  if (t !== undefined) {
    clearTimeout(t)
    timers.delete(id)
  }
  notices.value = notices.value.filter((n) => n.id !== id)
}

export function clearNotices(): void {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  notices.value = []
}

/** Raises a notice and returns its id. An identical notice already showing is not duplicated. */
export function notify(opts: NotifyOptions): number {
  const kind = opts.kind ?? 'info'
  const existing = notices.value.find(
    (n) => n.kind === kind && n.message === opts.message && n.title === opts.title,
  )
  if (existing) return existing.id

  const timeoutMs = opts.timeoutMs !== undefined ? opts.timeoutMs : DEFAULT_TIMEOUT_MS[kind]
  const sticky = opts.sticky ?? timeoutMs === null
  const notice: Notice = {
    id: nextId++,
    kind,
    title: opts.title,
    message: opts.message,
    details: opts.details ?? [],
    sticky,
    actions: opts.actions ?? [],
  }

  // Make room: drop the oldest notice that is allowed to go (never a sticky one).
  while (notices.value.length >= MAX_NOTICES) {
    const evictable = notices.value.find((n) => !n.sticky)
    if (!evictable) break
    dismissNotice(evictable.id)
  }
  notices.value = [...notices.value, notice]

  if (!sticky && timeoutMs) {
    timers.set(notice.id, setTimeout(() => dismissNotice(notice.id), timeoutMs))
  }
  return notice.id
}

type ShortcutOptions = Omit<NotifyOptions, 'message' | 'kind'>

export const notifyInfo = (message: string, o: ShortcutOptions = {}) => notify({ ...o, message, kind: 'info' })
export const notifySuccess = (message: string, o: ShortcutOptions = {}) => notify({ ...o, message, kind: 'success' })
export const notifyWarning = (message: string, o: ShortcutOptions = {}) => notify({ ...o, message, kind: 'warning' })
export const notifyError = (message: string, o: ShortcutOptions = {}) => notify({ ...o, message, kind: 'error' })

// ── Confirm dialog ──────────────────────────────────────────────────────────────

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` styles the confirm button as destructive and focuses Cancel first. */
  tone?: 'default' | 'danger'
}

export interface ConfirmRequest extends Required<ConfirmOptions> {
  id: number
  resolve: (answer: boolean) => void
}

/** Pending questions, answered one at a time in the order they were asked. */
export const confirmQueue = ref<ConfirmRequest[]>([])
let nextConfirmId = 1

/** Asks the user a yes/no question. Resolves true on confirm, false on cancel, Escape or click-away. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    confirmQueue.value = [
      ...confirmQueue.value,
      {
        id: nextConfirmId++,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'OK',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        tone: opts.tone ?? 'default',
        resolve,
      },
    ]
  })
}

/** Answers the question at the front of the queue. */
export function answerConfirm(answer: boolean): void {
  const [current, ...rest] = confirmQueue.value
  if (!current) return
  confirmQueue.value = rest
  current.resolve(answer)
}

export function useNotifications() {
  return {
    notices,
    confirmQueue,
    notify,
    notifyInfo,
    notifySuccess,
    notifyWarning,
    notifyError,
    dismissNotice,
    clearNotices,
    confirmDialog,
    answerConfirm,
  }
}
