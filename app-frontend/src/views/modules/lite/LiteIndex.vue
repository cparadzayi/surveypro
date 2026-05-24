<template>
  <div class="space-y-6">
    <header class="space-y-1">
      <h2 class="text-2xl font-semibold tracking-tight flex items-center gap-2"><span aria-hidden="true">🧭</span> SurveyPro "Lite"</h2>
      <p class="text-sm text-gray-600 max-w-prose">Core tools: basic points, lines, areas and export utilities.</p>
    </header>

    <!-- Favorites Row (optional) -->
    <section v-if="favorites.length" class="space-y-2">
      <div class="flex items-baseline justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Favorites</h3>
      </div>
      <ul class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <li v-for="fav in favorites" :key="fav.slug">
          <RouterLink :to="`/modules/lite/${fav.slug}`" :class="['block p-3 rounded border bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs', borderClass, hoverClass]">
            <div class="flex items-center gap-2 font-medium"><span class="text-base" aria-hidden="true">{{ fav.icon || '⭐' }}</span>{{ fav.title }}</div>
            <div v-if="fav.description" class="mt-0.5 text-[10px] text-gray-500 line-clamp-2">{{ fav.description }}</div>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- Sections -->
    <section v-for="section in sections" :key="section.slug" class="space-y-2">
      <div class="flex items-baseline justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ section.title }}</h3>
        <p v-if="section.description" class="text-[11px] text-gray-500">{{ section.description }}</p>
      </div>
      <ul class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <li v-for="item in section.items" :key="item.slug">
          <template v-if="!item.disabled">
            <RouterLink :to="`/modules/lite/${item.slug}`" :class="['block p-3 rounded border bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs', borderClass, hoverClass]">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 font-medium"><span class="text-base" aria-hidden="true">{{ item.icon || '•' }}</span>{{ item.title }}</div>
                <button class="text-[10px] text-indigo-600 hover:underline" @click.prevent="toggleFav(item)">{{ isFav(item) ? 'Unpin' : 'Pin' }}</button>
              </div>
              <div class="mt-0.5 text-[10px] text-gray-500 line-clamp-2" v-if="item.description">{{ item.description }}</div>
              <span v-if="item.badge" class="inline-block mt-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px]">{{ item.badge }}</span>
            </RouterLink>
          </template>
          <template v-else>
            <div class="block p-3 rounded border bg-white shadow-sm text-xs opacity-60 cursor-not-allowed">
              <div class="flex items-center gap-2 font-medium"><span class="text-base" aria-hidden="true">{{ item.icon || '•' }}</span>{{ item.title }}</div>
              <div class="mt-0.5 text-[10px] text-gray-500 line-clamp-2" v-if="item.description">{{ item.description }}</div>
              <span v-if="item.badge" class="inline-block mt-1 px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[10px]">{{ item.badge }}</span>
              <span class="inline-block mt-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">Disabled</span>
            </div>
          </template>
        </li>
      </ul>
    </section>

    <!-- Back-compat: show flat list when sections not defined -->
    <section v-if="!sections.length">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Submenus</h3>
      <ul class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <li v-for="s in submenus" :key="s.slug">
          <RouterLink :to="`/modules/lite/${s.slug}`" :class="['block p-3 rounded border bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs', borderClass, hoverClass]">
            <div class="font-medium">{{ s.title }}</div>
            <div class="mt-0.5 text-[10px] text-gray-500 line-clamp-2" v-if="s.description">{{ s.description }}</div>
            <span v-if="s.badge" class="inline-block mt-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px]">{{ s.badge }}</span>
            <span v-if="s.disabled" class="inline-block mt-1 px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[10px]">Disabled</span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- Utilities bar -->
    <section class="mt-4 flex gap-2 items-center text-[12px] text-gray-600">
      <span class="opacity-70">Utilities:</span>
      <button class="px-2 py-1 rounded border hover:bg-gray-50" @click="openCalculator">🧮 Calculator</button>
      <button class="px-2 py-1 rounded border hover:bg-gray-50" @click="openConverter">↔️ Convert</button>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useModulesStore } from '../../../stores/modules'

const store = useModulesStore()
const module = computed(() => store.getBySlug('lite'))
const submenus = computed(() => module.value?.submenus || [])
const sections = computed(() => module.value?.sections || [])

// Theme helpers
const borderClass = computed(() => module.value?.border || 'border-gray-200')
const hoverClass = computed(() => module.value?.colorHover || 'hover:bg-gray-50')

// Favorites handling
const favKey = 'lite-favorites'
const favorites = ref<Array<{ slug: string; title: string; description?: string; icon?: string }>>([])
function loadFavs() {
  try { favorites.value = JSON.parse(localStorage.getItem(favKey) || '[]') } catch { favorites.value = [] }
}
function saveFavs() { localStorage.setItem(favKey, JSON.stringify(favorites.value)) }
function isFav(item: { slug: string }) { return favorites.value.some(f => f.slug === item.slug) }
function toggleFav(item: { slug: string; title: string; description?: string; icon?: string }) {
  const i = favorites.value.findIndex(f => f.slug === item.slug)
  if (i >= 0) favorites.value.splice(i, 1)
  else favorites.value.unshift({ slug: item.slug, title: item.title, description: item.description, icon: item.icon })
  favorites.value = favorites.value.slice(0, 8)
  saveFavs()
}
loadFavs()

// Seed defaults on first load (configurable)
if (!favorites.value.length) {
  // Priority: localStorage override → env var → hardcoded defaults
  const seedKey = 'lite-favorites-seed'
  const storedSeed = (localStorage.getItem(seedKey) || '').trim()
  // Read seed from data attribute (optional) or default; this avoids env typing in some editors
  const htmlSeed = (document.documentElement.getAttribute('data-lite-fav-seed') || '').trim()
  const seedCsv = storedSeed || htmlSeed || 'polar,intersections'
  const seedSlugs: string[] = seedCsv.split(',').map((s: string) => s.trim()).filter(Boolean)

  // Build candidate objects from available items so titles/icons are correct
  const allItems = [
    ...submenus.value.map(s => ({ slug: s.slug, title: s.title, description: s.description, icon: s.icon })),
    ...sections.value.flatMap(sec => sec.items.map(i => ({ slug: i.slug, title: i.title, description: i.description, icon: i.icon })))
  ]
  const bySlug = new Map(allItems.map(i => [i.slug, i]))
  favorites.value = seedSlugs.map((slug: string) => bySlug.get(slug)).filter(Boolean) as typeof favorites.value
  favorites.value = favorites.value.slice(0, 8)
  saveFavs()
}

// Utilities placeholders
function openCalculator() { alert('Calculator coming soon') }
function openConverter() { alert('Unit converter coming soon') }
</script>
