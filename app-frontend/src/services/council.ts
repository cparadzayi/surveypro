/**
 * Council service: appointments, delivering a project to its council, and the council's review of it.
 *
 * Wraps the backend routes in app-backend/src/routes/authority.js, delivery.js and surveyClass.js. The database decides who may do what
 * (docs/AUTHORITY_TENANCY.md); the screens only ask and show the answer, and every refusal arrives as { error, message } with a message a
 * person can act on, which `errorMessage` pulls out.
 */

import api from './api';

export type MemberRole = 'surveyor' | 'head_surveyor' | 'reviewer';
export type Engagement = 'employed' | 'contracted';
export type SurveyClass = 'B' | 'C';
export type DeliveryState = 'not_delivered' | 'awaiting_review' | 'accepted' | 'rejected' | 'returned';
export type Decision = 'accepted' | 'rejected' | 'returned';

export interface MyAppointment {
  id: number;
  code: string;
  name: string;
  role: MemberRole;
  engagement: Engagement | null;
  valid_from: string;
  valid_to: string | null;
  active: boolean;
}

export interface Member {
  id: number;
  email: string;
  role: MemberRole;
  engagement: Engagement | null;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
  active: boolean;
}

export interface NewMember {
  email: string;
  role: Exclude<MemberRole, 'head_surveyor'>;
  engagement?: Engagement;
  valid_from?: string;
  valid_to?: string;
  note?: string;
}

export interface DeliveryStatus {
  state: DeliveryState;
  survey_class: SurveyClass | null;
  authority_code: string | null;
  parcels_ready: number;
  shared_project_id?: number;
  delivered_at?: string;
  decision?: Decision | null;
  decided_at?: string | null;
  note?: string | null;
}

export interface QueueItem {
  id: number;
  authority_code: string;
  name: string;
  township: string | null;
  survey_type: string | null;
  survey_class: string | null;
  engagement: Engagement | null;
  delivered_at: string;
  surveyor_name: string | null;
  surveyor_licence: string | null;
  parcels: number;
}

export interface ReviewDetail {
  project: Record<string, any>;
  state: DeliveryState;
  can_decide: boolean;
  parcels: Array<{ id: number; stand: string | null; designation: string | null; area_m2: string | number | null; status: string | null; parcel_status: string | null; closure_ratio: string | number | null }>;
  points: number;
  beacons: number;
  reviews: Array<{ decision: Decision; note: string | null; decided_at: string; reviewer_email: string | null }>;
}

/** The message the backend sent for a refusal, or a plain fallback. */
export function errorMessage(err: any, fallback = 'Something went wrong. Try again.'): string {
  const d = err?.response?.data;
  return (d && (d.message || (typeof d.error === 'string' && d.error))) || err?.message || fallback;
}

/** An appointment is a reviewer's or head surveyor's: the people who may see the review queue. */
export const mayReview = (mine: MyAppointment[]): boolean =>
  mine.some((a) => a.active && (a.role === 'reviewer' || a.role === 'head_surveyor'));

/** A head surveyor's councils: where people can be appointed. */
export const headOf = (mine: MyAppointment[]): MyAppointment[] => mine.filter((a) => a.active && a.role === 'head_surveyor');

/** Councils a surveyor may deliver to: where they hold an active appointment as surveyor or head surveyor. */
export const deliverableTo = (mine: MyAppointment[]): MyAppointment[] =>
  mine.filter((a) => a.active && (a.role === 'surveyor' || a.role === 'head_surveyor'));

export const STATE_LABEL: Record<DeliveryState, string> = {
  not_delivered: 'Not delivered',
  awaiting_review: 'With the council',
  accepted: 'Accepted by the council',
  rejected: 'Rejected by the council',
  returned: 'Returned for correction',
};

export async function myAppointments(): Promise<MyAppointment[]> {
  const { data } = await api.get('/authorities/mine');
  return data.data;
}

export async function listMembers(code: string): Promise<Member[]> {
  const { data } = await api.get(`/authorities/${encodeURIComponent(code)}/members`);
  return data.data;
}

export async function appoint(code: string, body: NewMember): Promise<Member> {
  const { data } = await api.post(`/authorities/${encodeURIComponent(code)}/members`, body);
  return data.data;
}

export async function endAppointment(code: string, id: number): Promise<void> {
  await api.post(`/authorities/${encodeURIComponent(code)}/members/${id}/end`, {});
}

export async function deliveryStatus(projectId: number): Promise<DeliveryStatus> {
  const { data } = await api.get(`/survey-projects/${projectId}/delivery`);
  return data.data;
}

export async function setSurveyClass(projectId: number, surveyClass: SurveyClass | null): Promise<SurveyClass | null> {
  const { data } = await api.patch(`/survey-projects/${projectId}/survey-class`, { survey_class: surveyClass });
  return data.data.survey_class;
}

export async function deliver(projectId: number, authorityCode?: string): Promise<{ delivered_at: string; parcels: number; points: number }> {
  const { data } = await api.post(`/survey-projects/${projectId}/deliver`, authorityCode ? { authority_code: authorityCode } : {});
  return data.data;
}

export async function reviewQueue(authority?: string): Promise<QueueItem[]> {
  const { data } = await api.get('/reviews/queue', { params: authority ? { authority } : {} });
  return data.data;
}

export async function reviewDetail(id: number): Promise<ReviewDetail> {
  const { data } = await api.get(`/reviews/projects/${id}`);
  return data.data;
}

export async function decide(id: number, decision: Decision, note?: string): Promise<void> {
  await api.post(`/reviews/projects/${id}/decision`, { decision, note: note || null });
}

// ── the register check: a layout against what VunGIS already holds ───────────────────────────────────────────────────────────────

/** One problem or note from VunGIS's rules; the fields depend on the code (docs/HARMONIZATION-SCOPE.md, piece A1). */
export interface RegisterIssue {
  code: string
  stand?: string; stands?: string[]; parcel?: number; parcel_id?: string; stand_no?: string
  overlap_m2?: number; reason?: string; type?: string; lo_zone?: number | null
  surveypro_m2?: number; computed_m2?: number; survey_class?: string; expected?: string
}
export interface RegisterCheckReport { ok: boolean; errors: RegisterIssue[]; warnings: RegisterIssue[]; checked: number }

const m2 = (n?: number) => (n == null ? '' : `${Number(n).toLocaleString('en', { maximumFractionDigits: 2 })} m²`)
const ISSUE_TEXT: Record<string, (i: RegisterIssue) => string> = {
  stand_no_exists: (i) => `Stand ${i.stand} is already registered in this township (${i.parcel_id}).`,
  overlaps_existing: (i) => `Stand ${i.stand} overlaps the registered stand ${i.stand_no ?? i.parcel_id} by ${m2(i.overlap_m2)}.`,
  overlap_within_project: (i) => `Stands ${(i.stands || []).join(' and ')} overlap each other by ${m2(i.overlap_m2)}.`,
  duplicate_stand_no_in_project: (i) => `Stand number ${i.stand} is used by more than one parcel.`,
  missing_stand_no: () => 'A parcel has no stand number.',
  no_geometry: (i) => `Stand ${i.stand} has no boundary.`,
  not_a_polygon: (i) => `Stand ${i.stand}'s boundary is not a polygon${i.type ? ` (${i.type})` : ''}.`,
  invalid_geometry: (i) => `Stand ${i.stand}'s boundary is not valid${i.reason ? `: ${i.reason}` : ''}.`,
  unsupported_crs: (i) => `Stand ${i.stand} is in a coordinate system the register does not take (${i.lo_zone != null ? `Lo${i.lo_zone}` : 'not a Cape / Lo belt'}); it takes Lo27, Lo29, Lo31 and Lo33.`,
  area_disagrees: (i) => `Stand ${i.stand}: the recorded area (${m2(i.surveypro_m2)}) differs from its boundary (${m2(i.computed_m2)}).`,
  class_vs_township: (i) => `The survey class is ${i.survey_class}, but a survey ${i.expected === 'B' ? 'in a township is class B' : 'outside a township is class C'}.`,
}
export const describeIssue = (i: RegisterIssue): string => (ISSUE_TEXT[i.code]?.(i) ?? i.code)

/** Check the surveyor's own project against the register. Advisory: it never stops a delivery. */
export async function checkRegister(projectId: number, authorityCode?: string): Promise<RegisterCheckReport> {
  const { data } = await api.post(`/survey-projects/${projectId}/check-layout`, authorityCode ? { authority_code: authorityCode } : {});
  return data.data;
}

/** A reviewer checks a delivered project (the shared project id) against the register. */
export async function checkRegisterAsReviewer(projectId: number): Promise<RegisterCheckReport> {
  const { data } = await api.post(`/reviews/projects/${projectId}/check-layout`, {});
  return data.data;
}
