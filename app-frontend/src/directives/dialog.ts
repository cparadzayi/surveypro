import type { Directive } from 'vue'

/**
 * `v-dialog` turns an overlay element into an accessible modal dialog.
 *
 *   <div v-if="open" class="fixed inset-0 ..." v-dialog="{ label: 'Add surveyor', onClose: () => (open = false) }">
 *
 * Put it on the element that is created and destroyed with the modal (the one carrying `v-if`).
 * It gives that element role="dialog" and aria-modal, a name for screen readers, moves focus into
 * it on open and back to where it was on close, keeps Tab inside, and calls `onClose` on Escape.
 * Escape does nothing when no `onClose` is given (a dialog that must be answered).
 */
export interface DialogOptions {
  /** Spoken name of the dialog. Prefer `labelledby` when a visible heading exists. */
  label?: string
  /** id of the visible heading that names the dialog. */
  labelledby?: string
  /** Called on Escape. */
  onClose?: () => void
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface Bound {
  opts: DialogOptions
  returnTo: HTMLElement | null
  onKeydown: (e: KeyboardEvent) => void
}
const state = new WeakMap<HTMLElement, Bound>()

function focusables(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.getAttribute('aria-hidden') !== 'true')
}

function apply(el: HTMLElement, opts: DialogOptions) {
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  if (opts.labelledby) {
    el.setAttribute('aria-labelledby', opts.labelledby)
    el.removeAttribute('aria-label')
  } else if (opts.label) {
    el.setAttribute('aria-label', opts.label)
  }
}

export const vDialog: Directive<HTMLElement, DialogOptions> = {
  mounted(el, binding) {
    const opts = binding.value ?? {}
    apply(el, opts)
    const bound: Bound = {
      opts,
      returnTo: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      onKeydown: (e) => {
        const current = state.get(el)?.opts ?? {}
        if (e.key === 'Escape' && current.onClose) {
          e.preventDefault()
          e.stopPropagation()
          current.onClose()
          return
        }
        if (e.key !== 'Tab') return
        const items = focusables(el)
        if (!items.length) { e.preventDefault(); el.focus(); return }
        const first = items[0], last = items[items.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === el)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      },
    }
    state.set(el, bound)
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    el.addEventListener('keydown', bound.onKeydown)
    // After the browser has laid the dialog out: the first field if there is one, else the dialog itself.
    queueMicrotask(() => { if (!el.contains(document.activeElement)) (focusables(el)[0] ?? el).focus() })
  },
  updated(el, binding) {
    const bound = state.get(el)
    if (!bound) return
    bound.opts = binding.value ?? {}
    apply(el, bound.opts)
  },
  unmounted(el) {
    const bound = state.get(el)
    if (!bound) return
    el.removeEventListener('keydown', bound.onKeydown)
    state.delete(el)
    // Only hand focus back if nothing else has claimed it (another dialog opening in its place).
    if (bound.returnTo && bound.returnTo.isConnected && (document.activeElement === document.body || !document.activeElement)) bound.returnTo.focus()
  },
}
