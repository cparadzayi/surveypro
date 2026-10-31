/**
 * The classify-a-side form's state and its conversions, shared by every screen
 * that tags sides (see SideClassifyModal.vue). Pure, so the rules are testable.
 */
import { endFromFraction, fractionAlongSide, type SideAnnotation, type SideRole } from './sideAnnotations'

export interface SideEditorState {
  side: string
  role: SideRole
  label: string
  widthM: number | null
  destinationFrom: string
  destinationTo: string
  end: 'from' | 'to' | 'both' | 'mid'
}

/**
 * The form to open for a clicked side. An existing tag shows its stored values
 * (a contiguous one its stored abutment); a fresh tag takes the abutment implied
 * by where along the side the surveyor clicked.
 *
 * @param clickedEnd the terminal(s) implied by the click position
 */
export function openSideEditor(
  side: string,
  existing: SideAnnotation | undefined,
  clickedEnd: 'from' | 'to' | 'both',
): SideEditorState {
  return {
    side,
    role: existing?.role ?? 'contiguous',
    label: existing?.label ?? '',
    widthM: existing?.widthM ?? null,
    destinationFrom: existing?.destinationFrom ?? '',
    destinationTo: existing?.destinationTo ?? '',
    end: existing?.role === 'contiguous' ? (existing.end ?? 'both') : clickedEnd,
  }
}

/** Which terminal a click on a side was nearest to, from the side's two end points
 *  and the click, all in the same (screen) space. */
export function clickedEndOnSide(
  a: [number, number], b: [number, number], click: [number, number],
): 'from' | 'to' | 'both' {
  return endFromFraction(fractionAlongSide(a, b, click))
}

/** The annotation a saved form stands for; fields that do not apply to the role are dropped. */
export function sideEditorToAnnotation(ed: SideEditorState): SideAnnotation {
  return {
    side: ed.side,
    role: ed.role,
    label: ed.label?.trim() || undefined,
    widthM: (ed.role === 'servitude' || ed.role === 'road') && ed.widthM != null ? ed.widthM : undefined,
    destinationFrom: ed.role === 'road' ? (ed.destinationFrom?.trim() || undefined) : undefined,
    destinationTo: ed.role === 'road' ? (ed.destinationTo?.trim() || undefined) : undefined,
    end: ed.role === 'contiguous' ? ed.end : undefined,
  }
}
