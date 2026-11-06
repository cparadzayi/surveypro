import type { CoverPageInfo } from './cover-page';
import type { Letterhead } from '../services/letterhead';
import { useLetterheadStore } from '../stores/letterhead';
import { useAuthStore } from '../stores/auth';

/** The cover letter's firm fields. */
export type CoverLetterhead = Pick<CoverPageInfo, 'firmName' | 'firmSubtitle' | 'phone' | 'email' | 'website' | 'address' | 'logo'>;

const text = (s: string | null | undefined) => (s ?? '').trim() || undefined;

/**
 * Maps a surveyor's letterhead onto the cover letter's firm fields.
 *
 * Nothing here is a default for any particular firm: a field the surveyor has not filled in is simply left
 * off the letter, rather than printing someone else's details. The firm name is set in capitals, as the
 * letterhead has always been. The e-mail falls back to the sign-in address when none is set.
 */
export function coverFieldsFromLetterhead(lh: Letterhead | null, accountEmail = ''): CoverLetterhead {
  return {
    firmName: text(lh?.firm)?.toUpperCase(),
    firmSubtitle: text(lh?.subtitle),
    phone: text(lh?.phone),
    email: text(lh?.email) ?? text(accountEmail),
    website: text(lh?.website),
    address: text(lh?.address),
    logo: lh?.logo ?? undefined,
  };
}

/**
 * The signed-in surveyor's letterhead as cover-letter fields. If it cannot be fetched the letter is still
 * produced, with the details the profile already carries in the browser (firm, address, phone, e-mail).
 */
export async function loadCoverLetterhead(): Promise<CoverLetterhead> {
  const auth = useAuthStore();
  try {
    return coverFieldsFromLetterhead(await useLetterheadStore().ensureLoaded(), auth.surveyorEmail);
  } catch (error) {
    console.warn('[letterhead] could not load the letterhead, using the profile held in the browser', error);
    const p = auth.currentSurveyor;
    return coverFieldsFromLetterhead(
      p ? { firm: p.firm ?? '', address: p.address ?? '', phone: p.phone ?? '', subtitle: '', email: '', website: '', logo: null } : null,
      auth.surveyorEmail,
    );
  }
}
