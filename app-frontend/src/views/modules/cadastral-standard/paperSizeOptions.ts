import { SI727_GENERAL_PLAN_SHEET_SIZES } from '../../../../../app-shared/si727SheetSizes.js'

export interface PaperSizeOption {
  value: string
  label: string
}

// Diagram sheets are portrait A4/A3; other plan types use the SI 727 Section 62(1) ladder.
const DIAGRAM: PaperSizeOption[] = [
  { value: 'A4', label: 'A4 (210×297mm)' },
  { value: 'A3', label: 'A3 (297×420mm)' },
]

const GENERAL: PaperSizeOption[] = [
  { value: 'auto', label: 'Auto (Recommended)' },
  ...SI727_GENERAL_PLAN_SHEET_SIZES.map((s) => ({
    value: s.name,
    label: `${s.width} × ${s.height}mm`,
  })),
]

export function paperSizeOptionsFor(planType: string): PaperSizeOption[] {
  return planType === 'diagram' ? DIAGRAM : GENERAL
}
