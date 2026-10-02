import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModulesStore } from '../stores/modules'
import { useProjectContext } from '../stores/projectContext'
import { group, type RibbonTab } from '../components/ribbon/types'

/**
 * The application-wide ribbon: commands that make sense on *every* screen —
 * where am I, which project is open, jump to a module, jump to the workflow.
 *
 * Like QGIS's always-visible toolbar, it sits above the router view and is
 * driven entirely by the current route, so it needs no per-view wiring.
 * Views add their own task-specific ribbon underneath it.
 */
export function useGlobalRibbon() {
  const router = useRouter()
  const route = useRoute()
  const modules = useModulesStore()
  const { currentProject, hasProject } = useProjectContext()

  const currentModuleSlug = computed(() => {
    if (route.params.module) return String(route.params.module)
    if (route.params.slug && route.path.startsWith('/modules/')) return String(route.params.slug)
    return ''
  })

  const currentSubmenuSlug = computed(() =>
    route.params.submenu ? String(route.params.submenu) : ''
  )

  const on = (slug: string) => currentModuleSlug.value === slug

  const tabs = computed<RibbonTab[]>(() => [
    {
      id: 'home',
      label: 'Home',
      icon: '🏠',
      groups: [
        group('Navigate', [
          {
            id: 'go-dashboard',
            icon: '🏠',
            label: 'Dashboard',
            title: 'Back to the module dashboard',
            tone: 'primary',
            active: route.path === '/dashboard',
          },
          {
            id: 'go-modules',
            icon: '🧭',
            label: 'All Modules',
            title: 'Browse every module available to you',
          },
        ]),
      ],
    },

    {
      id: 'modules',
      label: 'Modules',
      icon: '🧩',
      groups: [
        group(
          'Jump To',
          modules.accessibleModules
            .filter(m => !m.comingSoon)
            .map(m => ({
              id: `go-module:${m.slug}`,
              icon: m.icon,
              label: m.short,
              title: m.description,
              tone: (on(m.slug) ? 'primary' : 'default') as 'primary' | 'default',
              active: on(m.slug),
            })),
          'Modules stay open across the session — pick up any tool without going back to the dashboard.'
        ),
      ],
    },

    {
      id: 'project',
      label: 'Project',
      icon: '📁',
      groups: [
        group('Current', [
          {
            id: 'open-projects',
            icon: hasProject.value ? '📂' : '📁',
            label: hasProject.value ? 'Change Project' : 'Choose Project',
            title: hasProject.value
              ? `Open: ${currentProject.value?.name}. Click to switch.`
              : 'No project is open. Pick one to unlock the cadastral workflow.',
            tone: hasProject.value ? 'default' : 'primary',
          },
          {
            id: 'open-workflow',
            icon: '📐',
            label: 'Cadastral Workflow',
            title: 'Open the Cadastral Standard production workflow',
            tone: 'primary',
            disabled: !hasProject.value,
          },
        ], hasProject.value
          ? `${currentProject.value?.name} is open.`
          : 'No project open — the workflow needs one.'),
      ],
    },

    {
      id: 'help',
      label: 'Help',
      icon: '❓',
      groups: [
        group('Reference', [
          {
            id: 'open-manual',
            icon: '📖',
            label: 'User Manual',
            title: 'Open the SurveyPro user manual (PDF)',
            tone: 'primary',
          },
          {
            id: 'open-sis',
            icon: '📐',
            label: 'SI 727 Standard',
            title: 'The Zimbabwe cadastral plan standard this app produces',
            tone: 'default',
          },
        ]),
      ],
    },
  ])

  function run(id: string) {
    // `go-module:<slug>` is a family of ids; the rest are literal commands.
    if (id.startsWith('go-module:')) {
      const slug = id.slice('go-module:'.length)
      if (slug === currentModuleSlug.value) return
      router.push(`/modules/${slug}`)
      return
    }

    switch (id) {
      case 'go-dashboard': return router.push('/dashboard')
      case 'go-modules': return router.push('/modules/lite')
      case 'open-projects': return router.push('/modules/settings/projects')
      case 'open-workflow': return router.push('/modules/cadastral-standard')
      case 'open-manual': return window.open('/help/user-manual.pdf', '_blank', 'noopener')
      case 'open-sis': return router.push('/modules/conversions/datum')
      default: return
    }
  }

  return { tabs, run, currentModuleSlug, currentSubmenuSlug }
}