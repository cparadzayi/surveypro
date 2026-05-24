<template>
  <component v-if="Comp" :is="Comp" />
  <div v-else class="text-sm text-gray-500">Loading…</div>
</template>

<script setup lang="ts">
import { shallowRef, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

// Glob all module views under this directory for Vite to include them
// @ts-ignore - Provided by Vite's import.meta.glob
const moduleViewFiles = (import.meta as any).glob('./**/*.vue') as Record<string, () => Promise<any>>

function pascalCase(slug: string): string {
  return slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
}

async function resolveSubmenuComponent(moduleSlug: string, submenuSlug: string) {
  const submenuPascal = pascalCase(submenuSlug)
  const attemptPaths = [
    `./${moduleSlug}/${submenuSlug}/${submenuPascal}View.vue`,
    `./${moduleSlug}/${submenuPascal}View.vue`
  ]
  for (const p of attemptPaths) {
    const loader = moduleViewFiles[p]
    if (loader) {
      const m = await loader()
      return m.default
    }
  }
  const nf = await import('../NotFoundView.vue')
  return nf.default
}

const route = useRoute()
const Comp = shallowRef<any | null>(null)

watchEffect(async () => {
  if (!route || !route.params) {
    console.warn('⚠️ SubmenuLoader: Route not available yet')
    return
  }
  const mod = String(route.params.module || '')
  const submenu = String(route.params.submenu || '')
  Comp.value = await resolveSubmenuComponent(mod, submenu)
})
</script>
