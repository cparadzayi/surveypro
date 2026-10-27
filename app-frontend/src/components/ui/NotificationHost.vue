<template>
  <!-- Toasts. Errors and warnings use role="alert" (announced at once); the rest role="status". -->
  <div
    class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)] pointer-events-none"
    data-testid="toast-stack"
  >
    <div
      v-for="n in notices"
      :key="n.id"
      :role="n.kind === 'error' || n.kind === 'warning' ? 'alert' : 'status'"
      class="pointer-events-auto rounded-lg border shadow-lg p-3 text-sm flex gap-3"
      :class="TONE[n.kind].box"
      :data-kind="n.kind"
    >
      <span
        class="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold"
        :class="TONE[n.kind].badge"
        aria-hidden="true"
      >{{ TONE[n.kind].glyph }}</span>

      <div class="min-w-0 flex-1">
        <p v-if="n.title" class="font-semibold">{{ n.title }}</p>
        <p class="whitespace-pre-line break-words">{{ n.message }}</p>
        <ul v-if="n.details.length" class="mt-1.5 max-h-40 overflow-y-auto list-disc pl-5 text-xs space-y-0.5">
          <li v-for="(d, i) in n.details" :key="i" class="break-words">{{ d }}</li>
        </ul>
        <div v-if="n.actions.length" class="mt-2 flex flex-wrap gap-2">
          <button
            v-for="a in n.actions"
            :key="a.label"
            type="button"
            class="rounded px-2 py-1 text-xs font-medium underline focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            @click="runAction(n.id, a)"
          >{{ a.label }}</button>
        </div>
      </div>

      <button
        type="button"
        class="flex-none self-start rounded p-1 leading-none opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        aria-label="Dismiss notification"
        @click="dismissNotice(n.id)"
      ><span aria-hidden="true">&times;</span></button>
    </div>
  </div>

  <!-- Confirm dialog: one question at a time. -->
  <div
    v-if="current"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    data-testid="confirm-overlay"
    @click.self="answerConfirm(false)"
  >
    <div
      ref="dialogEl"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="`confirm-title-${current.id}`"
      :aria-describedby="`confirm-message-${current.id}`"
      class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      @keydown="onDialogKeydown"
    >
      <h2 :id="`confirm-title-${current.id}`" class="text-lg font-semibold text-gray-900">{{ current.title }}</h2>
      <p :id="`confirm-message-${current.id}`" class="mt-2 whitespace-pre-line break-words text-sm text-gray-700">{{ current.message }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          ref="cancelBtn"
          type="button"
          class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          @click="answerConfirm(false)"
        >{{ current.cancelLabel }}</button>
        <button
          ref="confirmBtn"
          type="button"
          class="rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          :class="current.tone === 'danger'
            ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
            : 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500'"
          @click="answerConfirm(true)"
        >{{ current.confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  answerConfirm,
  confirmQueue,
  dismissNotice,
  notices,
  type NoticeAction,
  type NoticeKind,
} from '../../composables/useNotifications'

const TONE: Record<NoticeKind, { box: string; badge: string; glyph: string }> = {
  info: { box: 'bg-blue-50 border-blue-200 text-blue-900', badge: 'bg-blue-600 text-white', glyph: 'i' },
  success: { box: 'bg-green-50 border-green-200 text-green-900', badge: 'bg-green-600 text-white', glyph: '✓' },
  warning: { box: 'bg-amber-50 border-amber-300 text-amber-900', badge: 'bg-amber-500 text-white', glyph: '!' },
  error: { box: 'bg-red-50 border-red-300 text-red-900', badge: 'bg-red-600 text-white', glyph: '!' },
}

function runAction(id: number, a: NoticeAction) {
  try {
    a.run()
  } finally {
    dismissNotice(id)
  }
}

// ── Confirm dialog focus handling ────────────────────────────────────────────────
const current = computed(() => confirmQueue.value[0] ?? null)
const dialogEl = ref<HTMLElement | null>(null)
const cancelBtn = ref<HTMLButtonElement | null>(null)
const confirmBtn = ref<HTMLButtonElement | null>(null)
let returnFocusTo: HTMLElement | null = null

watch(
  () => current.value?.id,
  async (id, previous) => {
    if (id !== undefined && previous === undefined) {
      returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    if (id !== undefined) {
      await nextTick()
      // A destructive question starts on Cancel, so a stray Enter does not confirm it.
      ;(current.value?.tone === 'danger' ? cancelBtn.value : confirmBtn.value)?.focus()
    } else if (previous !== undefined) {
      returnFocusTo?.focus?.()
      returnFocusTo = null
    }
  },
)

function onDialogKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    answerConfirm(false)
    return
  }
  if (e.key !== 'Tab') return
  // Keep Tab inside the dialog: it is modal, so the page behind must not take focus.
  const focusables = Array.from(
    dialogEl.value?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [],
  ).filter((el) => !el.hasAttribute('disabled'))
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}
</script>
