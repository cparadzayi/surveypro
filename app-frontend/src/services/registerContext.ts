/**
 * What the register already holds around a project (VunGIS's farms, approved stands and the council's own surveyed stands), for the map.
 *
 * Fetched from SurveyPro's backend (POST /survey-projects/:id/context), which asks VunGIS with a signed token. Kept on the device so that a surveyor in
 * the field with no signal still has it: the copy is stamped with when it was taken, and it is shown as an offline copy if it could not be refreshed.
 * Advisory and read-only: nothing here changes a survey, and when it cannot be had the map simply works without it.
 */

import api from './api';

export type Quality = 'approved' | 'council_survey' | 'indicative';

export interface ContextProps {
  parcel_id: string; stand_no: string | null; township_code: string | null; kind: 'stand' | 'farm' | 'plot'; status: string
  quality: Quality; origin: string; sg_ref: string | null; survey_class: string | null; basis: string | null
  area_m2: number | null; farm_ref: string | null; council: string | null
  /** how far out an indicative outline may be, in metres; null where it is a survey */
  indicative_m: number | null
}
export interface ContextFeature { type: 'Feature'; properties: ContextProps; geometry: { type: string; coordinates: any } }
export interface RegisterContext {
  authority: string; as_of: string; lo_zone: number; srid: number; truncated: boolean; count: number; features: ContextFeature[]
}
export interface LoadedContext { context: RegisterContext; fromCache: boolean; offline: boolean }

/** A copy younger than this is used without asking again (a surveyor in the field should not spend data on every map open). */
export const FRESH_MS = 12 * 60 * 60 * 1000

// ── the copy kept on the device ─────────────────────────────────────────────────────────────────────────────────────────────────
interface Stored { key: string; savedAt: number; context: RegisterContext }
export interface ContextStore { get(key: string): Promise<Stored | undefined>; put(row: Stored): Promise<void> }

const memory = new Map<string, Stored>();
const memoryStore: ContextStore = { get: async (k) => memory.get(k), put: async (r) => { memory.set(r.key, r) } };

function indexedDbStore(): ContextStore | null {
  if (typeof indexedDB === 'undefined') return null;
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => (opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('surveypro-register-context', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('ctx', { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => { const r = fn(db.transaction('ctx', mode).objectStore('ctx')); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  };
  return { get: (k) => tx('readonly', (s) => s.get(k) as IDBRequest<Stored | undefined>), put: async (row) => { await tx('readwrite', (s) => s.put(row)); } };
}

let store: ContextStore = indexedDbStore() ?? memoryStore;
/** For tests: replace where the copy is kept. */
export function useContextStore(s: ContextStore | null) { store = s ?? indexedDbStore() ?? memoryStore; }

const keyOf = (projectId: number) => `project:${projectId}`;
const safe = async <T>(p: Promise<T>): Promise<T | undefined> => { try { return await p; } catch { return undefined; } };

/** The copy kept on this device for a project, if any, with when it was taken. */
export async function cachedContext(projectId: number): Promise<{ context: RegisterContext; savedAt: number } | null> {
  const row = await safe(store.get(keyOf(projectId)));
  return row ? { context: row.context, savedAt: row.savedAt } : null;
}

/**
 * The context for a project: a recent copy from the device if there is one, otherwise from the register; and if the register cannot be reached,
 * whatever copy the device has, said to be offline. \`refresh\` skips the recent-copy shortcut. Throws only when there is nothing at all to show.
 */
export async function loadContext(projectId: number, opts: { refresh?: boolean; authorityCode?: string; now?: number } = {}): Promise<LoadedContext> {
  const now = opts.now ?? Date.now();
  const copy = await cachedContext(projectId);
  if (copy && !opts.refresh && now - copy.savedAt < FRESH_MS) return { context: copy.context, fromCache: true, offline: false };
  try {
    const { data } = await api.post(`/survey-projects/${projectId}/context`, opts.authorityCode ? { authority_code: opts.authorityCode } : {});
    const context = data.data as RegisterContext;
    await safe(store.put({ key: keyOf(projectId), savedAt: now, context }));
    return { context, fromCache: false, offline: false };
  } catch (err: any) {
    // a refusal (not appointed, nothing to place yet, too wide) is an answer, not a lost connection: say it
    if (err?.response) throw err;
    if (copy) return { context: copy.context, fromCache: true, offline: true };
    throw err;
  }
}

export const QUALITY_LABEL: Record<Quality, string> = {
  approved: 'Approved by the Surveyor-General',
  council_survey: "The council's survey, awaiting approval",
  indicative: 'Indicative: digitised from a map',
};

/** One line for a popup or a list: what it is, and how far to trust it. */
export function describeFeature(p: ContextProps): string {
  const name = p.kind === 'farm' ? (p.farm_ref || 'Farm') : `Stand ${p.stand_no ?? '(no number)'}${p.township_code ? `, ${p.township_code}` : ''}`;
  const trust = p.quality === 'indicative'
    ? `indicative${p.indicative_m ? `, may be ${Math.round(p.indicative_m)} m out` : ''}: do not set out from it`
    : p.quality === 'approved' ? `approved${p.sg_ref ? ` (${p.sg_ref})` : ''}` : `council survey${p.survey_class ? `, class ${p.survey_class}` : ''}, awaiting approval`;
  return `${name}: ${trust}`;
}

/** What is in the context, by how far to trust it. */
export function countByQuality(features: ContextFeature[]): Record<Quality, number> {
  const out: Record<Quality, number> = { approved: 0, council_survey: 0, indicative: 0 };
  for (const f of features) out[f.properties.quality] = (out[f.properties.quality] ?? 0) + 1;
  return out;
}
