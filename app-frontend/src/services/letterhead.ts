import api from '@/services/api';

/** The signed-in surveyor's letterhead: the firm identity printed at the top of the cover letter. */
export interface Letterhead {
  firm: string;
  address: string;
  phone: string;
  subtitle: string;
  email: string;
  website: string;
  logo: { dataUrl: string; width: number; height: number } | null;
}

export type LetterheadText = Omit<Letterhead, 'logo'>;

export async function fetchLetterhead(): Promise<Letterhead> {
  const { data } = await api.get('/surveyors/me/letterhead');
  return data.letterhead;
}

/** Saves the text fields given; the logo is untouched. */
export async function saveLetterheadText(fields: Partial<LetterheadText>): Promise<Letterhead> {
  const { data } = await api.put('/surveyors/me/letterhead', fields);
  return data.letterhead;
}

/** Stores a prepared logo (a PNG data URL, see utils/logoPrepare). */
export async function uploadLogo(dataUrl: string): Promise<Letterhead> {
  const { data } = await api.put('/surveyors/me/letterhead/logo', { dataUrl });
  return data.letterhead;
}

export async function deleteLogo(): Promise<Letterhead> {
  const { data } = await api.delete('/surveyors/me/letterhead/logo');
  return data.letterhead;
}
