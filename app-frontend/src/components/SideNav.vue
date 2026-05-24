<template>
  <nav
    :class=" [
      'fixed inset-y-0 left-0 z-40 w-64 transform bg-white border-r shadow-sm flex flex-col transition-transform md:translate-x-0 md:static md:shadow-none',
      open ? 'translate-x-0' : '-translate-x-full'
    ]"
    aria-label="Main navigation"
  >
    <div class="h-14 flex items-center px-4 border-b justify-between md:hidden">
      <span class="font-semibold text-sm">SurveyPro</span>
      <button @click="toggle" class="p-2 rounded hover:bg-gray-100" aria-label="Close navigation">✕</button>
    </div>
    <div class="flex-1 overflow-y-auto px-3 py-4 space-y-6">
      <!-- Modules list -->
      <div>
        <h3 class="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Modules</h3>
        <ul class="mt-2 space-y-1">
          <li v-for="m in modules" :key="m.slug">
            <button
              @click="goModule(m.slug)"
              :aria-current="isActiveModule(m.slug) ? 'page' : undefined"
              :class=" [
                'w-full flex items-center gap-2 px-2 py-2 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors',
                isActiveModule(m.slug) ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50'
              ]"
            >
              <span class="text-lg leading-none" aria-hidden="true">{{ m.icon }}</span>
              <span class="truncate">{{ m.short }}</span>
              <span v-if="m.comingSoon" class="ml-auto text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Soon</span>
            </button>
          </li>
        </ul>
      </div>

      <!-- Grouped navigation for active module -->
      <template v-if="activeModule">
        <!-- Favorites -->
        <div v-if="favorites.length">
          <h3 class="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Favorites</h3>
          <ul class="mt-2 space-y-1">
            <li v-for="f in favorites" :key="f.slug">
              <div class="w-full flex items-center justify-between">
                <button
                  @click="goSubmenu(currentModuleSlug, f.slug)"
                  :aria-current="isActiveSubmenu(f.slug) ? 'page' : undefined"
                  class="flex-1 text-left px-2 py-1.5 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center gap-2 hover:bg-gray-50"
                >
                  <span class="truncate flex items-center gap-2"><span aria-hidden="true">{{ f.icon || '•' }}</span>{{ f.title }}</span>
                </button>
                <button type="button" class="text-[10px] text-indigo-600 hover:underline ml-2 px-1 py-0.5" @click="toggleFav(f)">Unpin</button>
              </div>
            </li>
          </ul>
        </div>

        <!-- Sections -->
        <div v-for="section in sections" :key="section.slug">
          <h3 class="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ section.title }}</h3>
          <ul class="mt-2 space-y-1">
            <li v-for="item in section.items" :key="item.slug">
              <button
                @click="!item.disabled && goSubmenu(currentModuleSlug, item.slug)"
                :disabled="item.disabled"
                :aria-current="isActiveSubmenu(item.slug) ? 'page' : undefined"
                :class=" [
                  'w-full text-left px-2 py-1.5 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center gap-2 justify-between transition-colors',
                  item.disabled ? 'opacity-50 cursor-not-allowed' : (isActiveSubmenu(item.slug) ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50')
                ]"
              >
                <span class="truncate flex items-center gap-2"><span aria-hidden="true">{{ item.icon || '•' }}</span>{{ item.title }}</span>
                <span class="flex items-center gap-2">
                  <span v-if="item.badge" class="text-[10px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-700">{{ item.badge }}</span>
                  <button v-if="!item.disabled" type="button" class="text-[10px] text-indigo-600 hover:underline" @click.stop="toggleFav({ slug: item.slug, title: item.title, icon: item.icon })">{{ isFav(item.slug) ? 'Unpin' : 'Pin' }}</button>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </template>
    </div>
    <div class="p-3 border-t text-[10px] text-gray-400">
      <div class="flex items-center justify-between">
        <span>v0.1 • Modules preview</span>
        <a
          href="/help/user-manual.pdf"
          target="_blank"
          rel="noopener noreferrer"
          class="text-indigo-600 hover:underline"
          title="Open User Manual (PDF)"
        >Help</a>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModulesStore } from '../stores/modules'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'toggle'): void }>()

const route = useRoute()
const router = useRouter()
const store = useModulesStore()

const modules = computed(() => store.accessibleModules)

// Determine current module from either :module param or legacy :slug param
const currentModuleSlug = computed(() => {
  if (route.params.module) return route.params.module as string
  if (route.params.slug && route.path.startsWith('/modules/')) return route.params.slug as string
  return ''
})

const activeModule = computed(() => store.getBySlug(currentModuleSlug.value) || null)
const activeSubmenus = computed(() => activeModule.value?.submenus || [])
const sections = computed(() => activeModule.value?.sections || [])

// Favorites (reuse the same localStorage key as Lite view when current module is 'lite')
const favKey = computed(() => currentModuleSlug.value === 'lite' ? 'lite-favorites' : `${currentModuleSlug.value}-favorites`)
const favorites = ref<Array<{ slug: string; title: string; icon?: string }>>([])
function loadFavs() {
  try { favorites.value = JSON.parse(localStorage.getItem(favKey.value) || '[]') } catch { favorites.value = [] }
}
loadFavs()

function saveFavs() { localStorage.setItem(favKey.value, JSON.stringify(favorites.value)) }
function isFav(slug: string) { return favorites.value.some(f => f.slug === slug) }
function toggleFav(item: { slug: string; title: string; icon?: string }) {
  const i = favorites.value.findIndex(f => f.slug === item.slug)
  if (i >= 0) favorites.value.splice(i, 1)
  else favorites.value.unshift({ slug: item.slug, title: item.title, icon: item.icon })
  favorites.value = favorites.value.slice(0, 8)
  saveFavs()
}
const currentSubmenuSlug = computed(() => (route.params.submenu ? route.params.submenu as string : ''))

function toggle() { emit('toggle') }
function closeIfMobile() { if (props.open) toggle() }

function goModule(slug: string) {
  if (slug === currentModuleSlug.value) return // Already there
  router.push(`/modules/${slug}`)
  closeIfMobile()
}
function goSubmenu(moduleSlug: string, submenuSlug: string) {
  if (!moduleSlug || !submenuSlug) return
  if (isActiveSubmenu(submenuSlug)) return
  router.push(`/modules/${moduleSlug}/${submenuSlug}`)
  closeIfMobile()
}
function isActiveModule(slug: string) { return currentModuleSlug.value === slug }
function isActiveSubmenu(slug: string) { return currentSubmenuSlug.value === slug }
</script>

<script lang="ts">
export default { name: 'SideNav' }
</script>

<style scoped>
@media (min-width: 768px) {
  nav { transform: none !important; }
}
</style>
