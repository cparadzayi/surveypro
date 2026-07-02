export interface PaperSizeOption {
  value: string
  label: string
}

// Diagram sheets are portrait A4/A3; other plan types use the SI 727 ISO ladder.
const DIAGRAM: PaperSizeOption[] = [
  { value: 'A4', label: 'A4 (210×297mm)' },
  { value: 'A3', label: 'A3 (297×420mm)' },
]

const GENERAL: PaperSizeOption[] = [
  { value: 'auto', label: 'Auto (Recommended)' },
  { value: 'ISO_A2', label: 'ISO A2 (594×420mm)' },
  { value: 'ISO_A1', label: 'ISO A1 (841×594mm)' },
  { value: 'ISO_A0', label: 'ISO A0 (1189×841mm)' },
]

export function paperSizeOptionsFor(planType: string): PaperSizeOption[] {
  return planType === 'diagram' ? DIAGRAM : GENERAL
}
