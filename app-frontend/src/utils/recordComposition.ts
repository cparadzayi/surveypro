/**
 * Record composition — whether a survey record encloses Diagrams, General Plans, or
 * both. The surveyor declares it once per project; it then drives the lodgement
 * letter, the enclosed-document checks, and which plan types the workflow offers.
 *
 * Pure module: no Vue, no API, no manifest. The manifest cross-check
 * (`verifyAgainstManifest`) lives in `lodgementDocuments.ts`, where `ManifestFile`
 * is defined.
 */

/** Which family a plan type belongs to, for gating purposes. */
export type PlanFamily = 'diagram' | 'general' | 'working';

export interface RecordComposition {
  includesDiagrams: boolean;
  includesGeneralPlans: boolean;
  /** 'inferred' until the surveyor confirms it; 'confirmed' after. */
  source: 'inferred' | 'confirmed';
  confirmedAt?: string;
}

export interface CompositionDescription {
  /** Short noun phrase for banners and summaries, e.g. "General Plans only". */
  label: string;
  /** Why a plan type is blocked, or null when nothing is blocked. */
  reason: string | null;
}

/**
 * SI 727 §61(1)(a): a General Plan is required where a parcel is divided into three
 * or more adjoining parcels and the immediate parent property is plotted at too small
 * a scale to show the portions clearly. Three is that statutory threshold, not a
 * tuning knob.
 */
const GENERAL_PLAN_PARCEL_THRESHOLD = 3;

/**
 * Pre-fill the composition from the parcel count (excluding the Outside Figure).
 *
 * `>= 3` ⇒ General Plans, per the SI 727 §61(1)(a) threshold above; `1` or `2` ⇒
 * Diagrams; `0` ⇒ neither, which is not a valid *confirmed* state — the confirm
 * control cannot submit an empty selection.
 *
 * "Both" is never guessed: whether individual stand diagrams are cut inside a general
 * plan is an instruction/commercial decision that is absent from the data.
 *
 * This is a pre-fill only. The surveyor confirms or overrides it, so a record split
 * into 2 parcels that still needs a General Plan (the small-scale-parent clause of
 * §61(1)(a)) is not blocked, only defaulted differently.
 */
export function inferComposition(parcelCount: number): RecordComposition {
  const count = Number.isFinite(parcelCount) ? Math.floor(parcelCount) : 0;
  return {
    includesDiagrams: count > 0 && count < GENERAL_PLAN_PARCEL_THRESHOLD,
    includesGeneralPlans: count >= GENERAL_PLAN_PARCEL_THRESHOLD,
    source: 'inferred',
  };
}

/**
 * Validate the untyped jsonb held at `workflow_state.step_data['record-composition']`,
 * returning null when it is unusable. A composition must name at least one family, so
 * a record with neither flag set is unusable rather than empty.
 *
 * Flags are read strictly — only `true` counts — and an unrecognised `source` falls
 * back to 'inferred'. Gating happens only on a confirmed composition, so malformed
 * data can never block a plan type.
 */
export function normalizeComposition(raw: unknown): RecordComposition | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  const includesDiagrams = record.includesDiagrams === true;
  const includesGeneralPlans = record.includesGeneralPlans === true;
  if (!includesDiagrams && !includesGeneralPlans) return null;

  const source: RecordComposition['source'] = record.source === 'confirmed' ? 'confirmed' : 'inferred';
  const composition: RecordComposition = { includesDiagrams, includesGeneralPlans, source };
  if (source === 'confirmed' && typeof record.confirmedAt === 'string') {
    composition.confirmedAt = record.confirmedAt;
  }
  return composition;
}

/**
 * Whether a plan family may be produced for this record.
 *
 * Working Plans are never gated — a working plan is neither a diagram nor a general
 * plan and is lodged either way. Gating otherwise applies only once the composition is
 * confirmed: while it is merely inferred (or absent) every family is allowed, which is
 * what makes a wrong guess harmless — an inference can propose, never block.
 */
export function allowsFamily(composition: RecordComposition | null | undefined, family: PlanFamily): boolean {
  if (family === 'working') return true;
  if (!composition || composition.source !== 'confirmed') return true;
  return family === 'diagram' ? composition.includesDiagrams : composition.includesGeneralPlans;
}

/**
 * Wording for the composition banner and for the reason shown against a blocked plan
 * type. A composition naming neither family — `inferComposition(0)` — reads as
 * unconfirmed, since it configures nothing. The reason is null whenever nothing is
 * blocked: both families included, or not confirmed yet.
 */
export function describeComposition(composition: RecordComposition | null | undefined): CompositionDescription {
  const includesDiagrams = composition?.includesDiagrams === true;
  const includesGeneralPlans = composition?.includesGeneralPlans === true;

  if (!includesDiagrams && !includesGeneralPlans) return { label: 'Not yet confirmed', reason: null };
  if (includesDiagrams && includesGeneralPlans) return { label: 'General Plans and Diagrams', reason: null };

  const label = includesDiagrams ? 'Diagrams only' : 'General Plans only';
  const reason = composition?.source === 'confirmed'
    ? `This record is configured as ${label}. Change it in Record Composition above.`
    : null;
  return { label, reason };
}
