/**
 * Report on Survey — Section 1 "Purpose" descriptors, shared by the structured
 * and narrative PDF generators so both state the SI 727 subcategories the same
 * way. The statutory list is:
 *
 *   1. Purpose
 *      (a) Subdivision of State land (letter of instruction reference)
 *      (b) Subdivision of municipal land (letter of instruction reference)
 *      (c) Subdivision of private land (planning authority approval reference)
 *      (d) Amended title
 *      (e) Servitude
 *      (f) Replacement of beacons
 *      (g) others
 */

export interface PurposeDescriptor {
  letter: string;
  label: string;
  /** The statutory reference cited for the purpose, e.g. "letter of instruction reference". */
  refLabel: string;
  /** Sub-description printed for "(g) others" (mining lease, "Other" detail...). */
  sub?: string;
}

/**
 * Map an internal purpose type onto its SI 727 subcategory letter and label.
 * Types not named in the statutory list (mining lease, general subdivision)
 * fall under "(g) others" with a descriptive sub-label.
 */
export function purposeDescriptor(type: string, otherDescription?: string): PurposeDescriptor {
  switch (type) {
    case 'state-land':
      return { letter: 'a', label: 'Subdivision of State land', refLabel: 'letter of instruction reference' };
    case 'municipal-land':
      return { letter: 'b', label: 'Subdivision of municipal land', refLabel: 'letter of instruction reference' };
    case 'private-land':
      return { letter: 'c', label: 'Subdivision of private land', refLabel: 'planning authority approval reference' };
    case 'amended-title':
      return { letter: 'd', label: 'Amended title', refLabel: 'reference' };
    case 'servitude':
      return { letter: 'e', label: 'Servitude', refLabel: 'reference' };
    case 'replacement':
      return { letter: 'f', label: 'Replacement of beacons', refLabel: 'reference' };
    case 'other':
      return { letter: 'g', label: 'Others', refLabel: 'reference', sub: otherDescription || 'Other' };
    case 'mining-lease':
      return { letter: 'g', label: 'Others', refLabel: 'reference', sub: 'Mining lease' };
    case 'subdivision':
      return { letter: 'g', label: 'Others', refLabel: 'reference', sub: 'Subdivision of land' };
    default:
      return { letter: 'g', label: 'Others', refLabel: 'reference', sub: type || 'Other' };
  }
}

/** The plain purpose label (without the letter), for narrative prose. */
export function purposeLabel(type: string, otherDescription?: string): string {
  const d = purposeDescriptor(type, otherDescription);
  return d.sub ? `${d.label} - ${d.sub}` : d.label;
}

/** Form-field label for the reference input, mirroring the statutory term. */
export function purposeReferenceFieldLabel(type: string): string {
  const refLabel = purposeDescriptor(type).refLabel;
  if (refLabel === 'letter of instruction reference') return 'Letter of Instruction Reference';
  if (refLabel === 'planning authority approval reference') return 'Planning Authority Approval Reference';
  return 'Permit/Approval Reference';
}

/** Build the "Purpose" line for the structured generator: "(a) Subdivision of State land, letter of instruction reference: <ref>". */
export function purposeStatement(type: string, reference: string, otherDescription?: string): string {
  const d = purposeDescriptor(type, otherDescription);
  let line = `(${d.letter}) ${d.label}`;
  if (d.sub) line += ` - ${d.sub}`;
  if (reference && reference.trim()) line += `, ${d.refLabel}: ${reference.trim()}`;
  return line;
}

/** Build the "Purpose" sentence for the narrative generator: "Subdivision of State land, letter of instruction reference <ref>." */
export function purposeSentence(type: string, reference: string, otherDescription?: string): string {
  const d = purposeDescriptor(type, otherDescription);
  let text = d.sub ? `${d.label} - ${d.sub}` : d.label;
  if (reference && reference.trim()) text += `, ${d.refLabel} ${reference.trim()}`;
  return `${text}.`;
}