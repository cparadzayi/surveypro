/**
 * Ribbon data model.
 *
 * The ribbon is described as plain data so any screen can declare its own
 * toolbar without writing markup. `Ribbon.vue` renders the structure and emits
 * `action` with the button id; the host view decides what that means.
 *
 * Vocabulary follows the desktop CAD/GIS tools this borrows from:
 *   ribbon        → the whole bar (this file's root)
 *   tab           → a ribbon tab ("Digitize", "Modify", …)
 *   group         → a labelled cluster of tiles inside a tab
 *   button/tile   → one command
 *   split button  → a primary command plus an attached dropdown
 */

export type RibbonTone =
  | 'default'
  | 'primary'
  | 'success'
  | 'danger'
  | 'warn'
  | 'accent'

export interface RibbonButton {
  /** Stable id. Emitted verbatim as the ribbon's `action` payload. */
  id: string
  icon: string
  label: string
  /** Tooltip. Falls back to `label`. */
  title?: string
  disabled?: boolean
  /** Renders in the "on" state — toggles and modes. */
  active?: boolean
  /** Large (glyph over caption) or compact (inline). Defaults to large. */
  large?: boolean
  /** Small pill beside the caption, for counts or a spinner. */
  badge?: string | number | null
  tone?: RibbonTone
  /**
   * Hide entirely when false. Prefer this over `disabled` for commands that are
   * simply not part of the current mode — a greyed-out tile still occupies space.
   */
  when?: boolean
}

export interface RibbonSeparator {
  kind: 'separator'
}

export type RibbonItem = RibbonButton | RibbonSeparator

export interface RibbonGroup {
  label: string
  /** Helper text under the tiles. Keep it to one short line. */
  note?: string
  items: RibbonItem[]
}

export interface RibbonTab {
  id: string
  label: string
  icon?: string
  groups: RibbonGroup[]
  /** Right-aligned, after the last group — e.g. a panel toggle. */
  trailing?: RibbonItem[]
}

export function isSeparator(item: RibbonItem): item is RibbonSeparator {
  return (item as RibbonSeparator).kind === 'separator'
}

/**
 * Convenience constructor so callers get type-checking without importing every
 * interface by hand.
 */
export function group(label: string, items: RibbonItem[], note?: string): RibbonGroup {
  return note ? { label, items, note } : { label, items }
}

export function btn(b: RibbonButton): RibbonButton {
  return b
}

export const sep: RibbonSeparator = { kind: 'separator' }