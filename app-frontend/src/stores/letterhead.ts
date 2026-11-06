import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useAuthStore } from './auth';
import * as service from '../services/letterhead';
import type { Letterhead, LetterheadText } from '../services/letterhead';

/**
 * The signed-in surveyor's letterhead, loaded once and shared by the settings page and every document that
 * prints a cover letter. Held in memory only (the logo can be 400 KB, too much for localStorage), and
 * dropped whenever the signed-in user changes so one surveyor's letterhead is never printed for another.
 */
export const useLetterheadStore = defineStore('letterhead', () => {
  const letterhead = ref<Letterhead | null>(null);
  const loading = ref(false);
  let inflight: Promise<Letterhead> | null = null;

  const auth = useAuthStore();
  watch(() => auth.token, () => { letterhead.value = null; inflight = null; });

  /** The letterhead, fetched on first use (and again after `reload`). */
  async function ensureLoaded(): Promise<Letterhead> {
    if (letterhead.value) return letterhead.value;
    if (!inflight) {
      loading.value = true;
      inflight = service.fetchLetterhead()
        .then((lh) => { letterhead.value = lh; return lh; })
        .finally(() => { loading.value = false; inflight = null; });
    }
    return inflight;
  }

  async function saveText(fields: Partial<LetterheadText>) {
    letterhead.value = await service.saveLetterheadText(fields);
    return letterhead.value;
  }

  async function setLogo(dataUrl: string) {
    letterhead.value = await service.uploadLogo(dataUrl);
    return letterhead.value;
  }

  async function removeLogo() {
    letterhead.value = await service.deleteLogo();
    return letterhead.value;
  }

  return { letterhead, loading, ensureLoaded, saveText, setLogo, removeLogo };
});
