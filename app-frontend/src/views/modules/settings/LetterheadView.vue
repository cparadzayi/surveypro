<template>
  <div class="letterhead-settings max-w-4xl">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Firm &amp; letterhead</h1>
      <p class="mt-1 text-sm text-gray-600">
        Your firm's name, contact details and logo. They are printed at the top of the cover letter of every
        record you generate, and are kept with your account.
      </p>
    </div>

    <div v-if="loading && !loaded" class="text-center py-12">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-3 text-gray-600">Loading your letterhead...</p>
    </div>

    <div v-else-if="loadError" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-red-800">{{ loadError }}</p>
      <button class="mt-2 text-sm text-red-700 underline" @click="load">Try again</button>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Details and logo -->
      <form class="bg-white rounded-lg shadow-md p-6 space-y-4" @submit.prevent="save">
        <div>
          <label class="block text-sm font-medium text-gray-700" for="lh-firm">Firm name</label>
          <input id="lh-firm" v-model="form.firm" maxlength="120" type="text" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" placeholder="C Paradzayi Land Surveyors" />
          <p class="mt-1 text-xs text-gray-500">Printed in capitals.</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700" for="lh-subtitle">Tagline</label>
          <input id="lh-subtitle" v-model="form.subtitle" maxlength="160" type="text" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" placeholder="Cadastral, Engineering, Topographic &amp; Mining Surveyors" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700" for="lh-phone">Phone</label>
            <input id="lh-phone" v-model="form.phone" maxlength="40" type="text" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700" for="lh-email">E-mail</label>
            <input id="lh-email" v-model="form.email" maxlength="120" type="email" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" :placeholder="accountEmail" />
            <p class="mt-1 text-xs text-gray-500">Left empty, your sign-in address is used.</p>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700" for="lh-website">Website</label>
          <input id="lh-website" v-model="form.website" maxlength="120" type="text" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" placeholder="www.example.com" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700" for="lh-address">Address</label>
          <input id="lh-address" v-model="form.address" maxlength="200" type="text" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
        </div>

        <div class="flex items-center gap-3 pt-1">
          <button type="submit" :disabled="saving || !dirty" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {{ saving ? 'Saving...' : 'Save details' }}
          </button>
          <span v-if="dirty" class="text-xs text-amber-700">Unsaved changes</span>
        </div>

        <hr class="my-2" />

        <div>
          <span class="block text-sm font-medium text-gray-700">Logo</span>
          <p class="mt-1 text-xs text-gray-500">
            PNG, JPEG, WebP or GIF. Empty margins are cropped off and the image is reduced to a PNG
            automatically, so you can upload it as it is.
          </p>
          <div class="mt-3 flex items-center gap-4">
            <div class="h-24 w-32 flex items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 overflow-hidden">
              <img v-if="letterhead?.logo" :src="letterhead.logo.dataUrl" alt="Firm logo" class="max-h-full max-w-full" />
              <span v-else class="text-xs text-gray-400">No logo</span>
            </div>
            <div class="flex flex-col gap-2">
              <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="onFile" />
              <button type="button" :disabled="uploading" class="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50" @click="fileInput?.click()">
                {{ uploading ? 'Preparing...' : letterhead?.logo ? 'Replace logo' : 'Upload logo' }}
              </button>
              <button v-if="letterhead?.logo" type="button" :disabled="uploading" class="px-3 py-2 text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50" @click="remove">
                Remove logo
              </button>
            </div>
          </div>
        </div>
      </form>

      <!-- How it will look -->
      <div>
        <h2 class="text-sm font-medium text-gray-700 mb-2">Preview of the letter's header</h2>
        <div class="bg-white rounded-lg shadow-md p-6 border border-gray-200" aria-label="Letterhead preview">
          <div class="relative">
            <img v-if="letterhead?.logo" :src="letterhead.logo.dataUrl" alt="" class="absolute left-0 top-0 max-h-16 max-w-[6rem]" />
            <div class="text-center">
              <div class="font-bold text-lg" style="color: #008000">{{ (form.firm || 'FIRM NAME').toUpperCase() }}</div>
              <div v-if="form.subtitle" class="text-sm font-semibold" style="color: #0000ff">{{ form.subtitle }}</div>
            </div>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-800">
            <div>{{ form.phone || '' }}</div>
            <div class="text-right">{{ form.email || accountEmail }}</div>
            <div>{{ form.address || '' }}</div>
            <div class="text-right">{{ form.website || '' }}</div>
          </div>
          <hr class="mt-3 border-gray-800" />
        </div>
        <p class="mt-2 text-xs text-gray-500">The PDF draws small icons beside each contact detail.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useLetterheadStore } from '../../../stores/letterhead';
import { useAuthStore } from '../../../stores/auth';
import { prepareLogo } from '../../../utils/logoPrepare';
import { notifyFailure, notifySuccess } from '../../../composables/useNotifications';
import { describeError } from '../../../utils/errorMessage';

const store = useLetterheadStore();
const { letterhead, loading } = storeToRefs(store);
const auth = useAuthStore();
const accountEmail = computed(() => auth.surveyorEmail);

const FIELDS = ['firm', 'subtitle', 'phone', 'email', 'website', 'address'] as const;
const form = reactive({ firm: '', subtitle: '', phone: '', email: '', website: '', address: '' });
const loaded = ref(false);
const loadError = ref('');
const saving = ref(false);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

/** Whether the form differs from what is saved. */
const dirty = computed(() => !!letterhead.value && FIELDS.some((f) => form[f].trim() !== (letterhead.value![f] ?? '')));

function fillForm() {
  for (const f of FIELDS) form[f] = letterhead.value?.[f] ?? '';
}

async function load() {
  loadError.value = '';
  try {
    await store.ensureLoaded();
    fillForm();
    loaded.value = true;
  } catch (error) {
    loadError.value = `Could not load your letterhead: ${describeError(error)}`;
  }
}

async function save() {
  saving.value = true;
  try {
    await store.saveText(Object.fromEntries(FIELDS.map((f) => [f, form[f].trim()])));
    fillForm();
    notifySuccess('Letterhead saved.');
  } catch (error) {
    notifyFailure('Could not save the letterhead', error);
  } finally {
    saving.value = false;
  }
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // so choosing the same file again still fires
  if (!file) return;
  uploading.value = true;
  try {
    const logo = await prepareLogo(file);
    await store.setLogo(logo.dataUrl);
    notifySuccess('Logo saved.');
  } catch (error) {
    notifyFailure('Could not use that logo', error);
  } finally {
    uploading.value = false;
  }
}

async function remove() {
  uploading.value = true;
  try {
    await store.removeLogo();
    notifySuccess('Logo removed.');
  } catch (error) {
    notifyFailure('Could not remove the logo', error);
  } finally {
    uploading.value = false;
  }
}

onMounted(load);
</script>
