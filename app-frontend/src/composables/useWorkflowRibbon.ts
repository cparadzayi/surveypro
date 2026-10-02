import { computed } from 'vue'
import {
  CADASTRAL_STEPS,
  getNextStep,
  getPreviousStep,
  getStepActions,
} from '../config/cadastralWorkflow'
import { group, sep, type RibbonItem, type RibbonTab, type RibbonTone } from '../components/ribbon/types'

/**
 * Builds the workflow ribbon for the Cadastral Standard module — the QGIS-style
 * command surface for the 14-step production workflow.
 *
 * Tabs:
 *   - Step      every step as a tile (lock/active/completed states) + the
 *               actions (Start / View / Edit / Download / Proceed) for the
 *               current step, like the old WorkflowDashboard action buttons.
 *   - Documents export shortcuts for the documents that exist.
 *
 * Emitted ids are namespaced so the view can route them without a huge switch:
 *   - `wf-step:<dbKey>`             jump to a step
 *   - `wf-action:<dbKey>:<action>`  run that step's action (start/view/edit/…)
 *   - `wf-prev` / `wf-next`         previous / next step
 *   - `wf-export-all`               the ZIP bundle export
 *   - `wf-service-docs`             help / reference PDFs
 */
export function useWorkflowRibbon(opts: {
  /** Reads the current dbKey step, e.g. 'csv-import'. Getter, not a snapshot. */
  currentStep: () => string
  completedStepIds: () => string[] // step ids, e.g. ['import_csv']
  stepData: () => Record<string, any>
  isExporting: () => boolean
}) {
  const completedWorkflowDocs = computed(() =>
    Object.values(CADASTRAL_STEPS)
      .filter(s => opts.stepData()[s.id]?.document_url)
      .sort((a, b) => a.order - b.order),
  )

  const statusTone = (completed: boolean, active: boolean, locked: boolean): RibbonTone =>
    active ? 'primary' : completed ? 'success' : locked ? 'default' : 'accent'

  /** Status of every workflow step, driving lock/active/completed tile tones. */
  const stepItems = computed<RibbonItem[]>(() =>
    Object.values(CADASTRAL_STEPS)
      .sort((a, b) => a.order - b.order)
      .map(step => {
        const completed = opts.completedStepIds().includes(step.id)
        const active = opts.currentStep() === step.dbKey
        const actions = getStepActions(
          step.id,
          opts.completedStepIds(),
          !!opts.stepData()[step.id]?.document_url,
        )
        const locked =
          !completed && !active && actions.every(a => a.action !== 'start' && a.action !== 'view')

        return {
          id: `wf-step:${step.dbKey}`,
          icon: step.icon,
          label: step.label.replace(' & Digitization', '').replace(' Assessment', ''),
          title: locked ? `${step.label} — locked, complete the earlier steps first` : step.description,
          tone: statusTone(completed, active, locked),
          active,
        }
      }),
  )

  const stepTabs = computed<RibbonTab[]>(() => {
    const current = Object.values(CADASTRAL_STEPS).find(s => s.dbKey === opts.currentStep())
    const currentStepId = current?.id ?? 'project_setup'
    const stepActions = getStepActions(
      currentStepId,
      opts.completedStepIds(),
      !!opts.stepData()[currentStepId]?.document_url,
    )
    const canEdit = current?.canEdit ?? false
    const prev = getPreviousStep(currentStepId)
    const next = getNextStep(currentStepId)

    const actionItems: RibbonItem[] = stepActions
      .filter(a => (a.action === 'edit' ? canEdit : true))
      .map(a => ({
        id: `wf-action:${current?.dbKey}:${a.action}`,
        icon: a.icon || '▶️',
        label: a.label,
        tone: a.variant === 'success' ? ('success' as const) : a.type === 'primary' ? ('primary' as const) : ('default' as const),
        disabled: a.action === 'download' && !opts.stepData()[currentStepId]?.document_url,
      }))

    return [
      {
        id: 'step',
        label: 'Step',
        icon: current?.icon ?? '📋',
        groups: [
          group('Current Step', actionItems, current?.description ?? ''),
          group('All Steps', stepItems.value, 'Locks clear automatically as prerequisites complete.'),
        ],
        trailing: [
          {
            id: 'wf-prev',
            icon: '◀',
            label: 'Previous',
            title: prev ? `Back to ${prev.label}` : 'Already at the first step',
            disabled: !prev,
          },
          sep,
          {
            id: 'wf-next',
            icon: '▶',
            label: 'Next',
            title: next ? `Forward to ${next.label}` : 'Already at the final step',
            disabled: !next,
          },
        ],
      },
    ]
  })

  const docTabs = computed<RibbonTab[]>(() => {
    const docs = completedWorkflowDocs.value.map<RibbonItem>(step => ({
      id: `wf-action:${step.dbKey}:download`,
      icon: step.icon,
      label: step.label.replace(' & Digitization', ''),
      title: `Download the ${step.label} document`,
      active: opts.currentStep() === step.dbKey,
    }))

    return [
      {
        id: 'documents',
        label: 'Documents',
        icon: '📄',
        groups: [
          group('Generated', docs, 'Documents appear here once their step has produced a file.'),
          group('Export', [
            {
              id: 'wf-export-all',
              icon: '📦',
              label: 'Export All (ZIP)',
              title: 'Download every generated document as a ZIP bundle',
              tone: 'success',
              badge: opts.isExporting() ? '⏳' : null,
              disabled: opts.isExporting() || docs.length === 0,
            },
            {
              id: 'wf-service-docs',
              icon: '🧾',
              label: 'Service Docs',
              title: 'User manual, supplements and other reference PDFs',
            },
          ], 'Everything the client will need, in one archive.'),
        ],
        trailing: [],
      },
    ]
  })

  const tabs = computed<RibbonTab[]>(() => [...stepTabs.value, ...docTabs.value])

  return {
    tabs,
    /** Prefix-matches an emitted id back to a routing decision. */
    parse: (id: string) => {
      if (id.startsWith('wf-step:')) return { kind: 'step' as const, dbKey: id.slice(8) }
      if (id.startsWith('wf-action:')) {
        const [dbKey, action] = id.slice(10).split(':')
        return { kind: 'action' as const, dbKey, action }
      }
      return { kind: 'other' as const, id }
    },
  }
}