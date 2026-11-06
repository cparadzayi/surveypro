<template>
  <div v-dialog="{ label: 'Add new surveyor', onClose: () => emit('close') }" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
      <h2 class="text-xl font-bold text-gray-900 mb-1">Add New Surveyor</h2>
      <p class="text-sm text-gray-600 mb-4">
        This creates their account. You will get a link to give them so they can choose their own password.
      </p>

      <form class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="ns-type">Type *</label>
          <select id="ns-type" v-model="form.surveyorType" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500">
            <option v-for="o in SURVEYOR_TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="ns-name">Name *</label>
          <input id="ns-name" v-model="form.name" type="text" required maxlength="120" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" placeholder="Enter surveyor name" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="ns-email">E-mail (their sign-in) *</label>
          <input id="ns-email" v-model="form.email" type="email" required maxlength="254" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" placeholder="surveyor@example.com" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="ns-number">{{ numberField.label }}{{ numberField.required ? ' *' : '' }}</label>
          <input id="ns-number" v-model="form.number" type="text" :required="numberField.required" maxlength="60" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" />
        </div>

        <div v-if="form.surveyorType === 'student'">
          <label class="block text-sm font-medium text-gray-700 mb-1" for="ns-institution">Institution</label>
          <input id="ns-institution" v-model="form.institution" type="text" maxlength="120" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="ns-firm">Firm</label>
          <input id="ns-firm" v-model="form.firm" type="text" maxlength="120" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" placeholder="Enter firm name" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="ns-phone">Phone</label>
          <input id="ns-phone" v-model="form.phone" type="tel" maxlength="40" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="ns-address">Address</label>
          <textarea id="ns-address" v-model="form.address" rows="3" maxlength="200" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"></textarea>
        </div>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <div class="flex gap-2 pt-2">
          <button type="submit" :disabled="loading" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors">
            {{ loading ? 'Creating account...' : 'Add Surveyor' }}
          </button>
          <button type="button" class="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors" @click="emit('close')">
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSurveyors, type CreatedSurveyor } from '../../composables/useSurveyors'
import { notifySuccess } from '../../composables/useNotifications'
import { describeTimeLeft, resetLink } from '../../utils/passwordResetLink'
import { emptyNewSurveyorForm, NUMBER_FIELD, SURVEYOR_TYPE_OPTIONS, toNewSurveyor } from '../../utils/newSurveyorForm'

const emit = defineEmits<{ close: []; created: [result: CreatedSurveyor] }>()

const { loading, createSurveyor } = useSurveyors()
const form = ref(emptyNewSurveyorForm())
const error = ref('')
const numberField = computed(() => NUMBER_FIELD[form.value.surveyorType])

async function submit() {
  error.value = ''
  let result: CreatedSurveyor
  try {
    result = await createSurveyor(toNewSurveyor(form.value))
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create surveyor'
    return
  }

  const { surveyor, setPassword } = result
  if (setPassword) {
    // The app cannot send e-mail, so the administrator passes the link on. It is shown once.
    const link = resetLink(window.location.origin, setPassword.resetPath)
    notifySuccess(`${surveyor.name} has an account. Send them this link to set a password. It works once and expires ${describeTimeLeft(setPassword.expiresAt)}.`, {
      title: `Account created for ${surveyor.name}`,
      details: [link],
      sticky: true,
      actions: [{ label: 'Copy link', keepOpen: true, run: () => { void navigator.clipboard?.writeText(link) } }],
    })
  } else {
    notifySuccess(`${surveyor.name} has an account, but the set-password link could not be made. Use "Reset link" on their card to make one.`, { sticky: true })
  }
  emit('created', result)
}
</script>
