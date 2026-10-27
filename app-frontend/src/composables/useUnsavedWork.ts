import { getCurrentInstance, onBeforeUnmount, reactive } from 'vue'
import { confirmDialog } from './useNotifications'

/**
 * Knows what the user has typed but not yet saved, so leaving cannot lose it silently.
 *
 * Nothing used to track this: the project-setup form, for one, only wrote anything when
 * "Complete Setup" was pressed, and a stray click on another step, the Dashboard link or
 * the browser's close button discarded the lot without a word.
 *
 * A screen registers itself while it holds unsaved input:
 *
 *   const unsaved = useUnsavedWork('project-setup', 'Project setup details')
 *   <form @input="unsaved.mark()">      // user input, not programmatic loading
 *   …after a successful save:  unsaved.clear()
 *
 * and three exits ask first: `confirmDiscardUnsaved()` for in-page navigation (the workflow's
 * step changes call it), the router guard for leaving the page's route, and the browser's own
 * "Leave site?" prompt for closing the tab or reloading. Marking is by user INPUT events, never
 * by comparing values, so a form that fills itself in after loading is not "dirty".
 */

/** id of the screen -> what is unsaved on it, in words a surveyor would use. */
const unsaved = reactive(new Map<string, string>())

export function hasUnsavedWork(): boolean {
  return unsaved.size > 0
}

export function unsavedWork(): string[] {
  return [...unsaved.values()]
}

export function markUnsaved(id: string, what: string): void {
  if (!unsaved.has(id)) unsaved.set(id, what)
}

export function markSaved(id: string): void {
  unsaved.delete(id)
}

export function clearUnsavedWork(): void {
  unsaved.clear()
}

/**
 * Resolves true when it is fine to carry on: nothing is unsaved, or the user chose to leave
 * and lose it. False means they chose to stay.
 */
export async function confirmDiscardUnsaved(): Promise<boolean> {
  if (!hasUnsavedWork()) return true
  const items = unsavedWork()
  const leave = await confirmDialog({
    title: 'Leave without saving?',
    message: `These changes are not saved yet:\n\n${items.map((i) => `• ${i}`).join('\n')}\n\nLeave anyway and lose them?`,
    confirmLabel: 'Leave without saving',
    cancelLabel: 'Stay and keep editing',
    tone: 'danger',
  })
  if (leave) clearUnsavedWork()
  return leave
}

/** For a component's setup(): `mark()` on user input, `clear()` once saved. Cleared on unmount. */
export function useUnsavedWork(id: string, what: string) {
  if (getCurrentInstance()) onBeforeUnmount(() => markSaved(id))
  return {
    mark: () => markUnsaved(id, what),
    clear: () => markSaved(id),
  }
}

// Closing or reloading the tab: the browser shows its own "Leave site?" prompt (its text
// cannot be customised) only while something is unsaved.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!hasUnsavedWork()) return
    e.preventDefault()
    e.returnValue = ''
  })
}
