import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

export interface ModuleSubmenu {
  slug: string
  title: string
  description?: string
  badge?: string
  disabled?: boolean
  icon?: string
}

export interface SurveyModule {
  slug: string
  title: string
  short: string
  description: string
  color: string        // base background color
  colorHover: string   // hover/active state
  border: string
  text: string
  icon: string         // simple emoji placeholder until proper icons
  comingSoon?: boolean
  requiredRole?: 'registered' | 'in_training' | 'technician' | 'student' // minimum role required
  submenus?: ModuleSubmenu[]
  // Optional grouped sections for cleaner UI menus. Items still route to /modules/:module/:slug
  sections?: Array<{
    slug: string
    title: string
    description?: string
    items: ModuleSubmenu[]
  }>
}

// Color palette rationale (mobile-first, high contrast):
// - Core (Lite): Indigo / brand anchor
// - Conversions: Slate / neutral operations
// - Least Squares: Sky / computation clarity
// - Topographical: Yellow / terrain maps
// - Engineering: Cyan / precision/infrastructure
// - Mining: Green (earth) / could shift to amber later for pits
// - Cadastral Standard: Rose / parcel boundaries
// - Cadastral Extended: Fuchsia / advanced cadastral tooling

export const useModulesStore = defineStore('modules', {
  state: () => ({
    modules: [
      {
        slug: 'lite',
        title: 'SurveyPro "Lite"',
        short: 'Lite',
        description: 'General core tools: basic points, distances, bearings, simple exports.',
        color: 'bg-indigo-600',
        colorHover: 'hover:bg-indigo-700',
        border: 'border-indigo-700',
        text: 'text-white',
        icon: '🧭',
        submenus: [
          { slug: 'points', title: 'Points', description: 'Manage survey control & detail points', badge: 'Core', icon: '📍' },
          { slug: 'lines', title: 'Lines & Bearings', description: 'Bearing & distance computations', icon: '📐' },
          { slug: 'areas', title: 'Areas', description: 'Simple parcel / polygon area calc', icon: '▭' },
          { slug: 'exports', title: 'Exports', description: 'CSV / JSON outputs', icon: '⬆️⬇️' },
          // Newly activated compute tools exposed in flat submenus for quick access
          { slug: 'polar', title: 'Polar', description: 'Compute Q from P, distance, bearing', icon: '🎯', badge: 'Core' },
          { slug: 'intersections', title: 'Intersections', description: 'Bearing–Bearing intersection', icon: '✖️', badge: 'Core' },
          { slug: 'maplibre-playground', title: 'MapLibre Playground', description: 'Interactive MapLibre GL map testing', icon: '🗺️', badge: 'New' },
          { slug: 'help', title: 'Help & Manual', description: 'Getting started and PDF manual', icon: '❓' }
        ],
        sections: [
          {
            slug: 'data',
            title: 'Data',
            description: 'Points, devices and file workflows',
            items: [
              { slug: 'points', title: 'Points', description: 'Manage control & detail points', badge: 'Core', icon: '📍' },
              { slug: 'exports', title: 'Import/Export', description: 'CSV • ASCII • DXF', icon: '⬆️⬇️' },
              { slug: 'help', title: 'Help & Manual', description: 'Open the user manual', icon: '❓' },
              { slug: 'devices', title: 'Devices & IO', description: 'GNSS/TS connections', disabled: true, badge: 'Soon', icon: '🛰️' },
              { slug: 'jobs', title: 'Jobs & Layers', description: 'Quick job switch', disabled: true, badge: 'Soon', icon: '🗂️' },
              { slug: 'viewer', title: 'File Viewer', description: 'ASCII • DXF • DB', disabled: true, badge: 'Soon', icon: '📄' }
            ]
          },
          {
            slug: 'compute',
            title: 'Compute',
            description: 'Core survey computations',
            items: [
              { slug: 'lines', title: 'Lines & Bearings', description: 'Bearings and distances', icon: '📐' },
              { slug: 'areas', title: 'Areas', description: 'Polygon areas • fixed area', icon: '▭' },
              { slug: 'areas2', title: 'Areas v2 (Search)', description: 'Search points, build polygon, compute area', icon: '▭', badge: 'Beta' },
              { slug: 'estimate', title: 'Financial Estimate', description: 'Tariff‑based quotation', icon: '💰', badge: 'New' },
              { slug: 'polar', title: 'Polar', description: 'from plane/observations', icon: '🎯', badge: 'Core' },
              { slug: 'reverse-polar', title: 'Reverse Polar', disabled: true, badge: 'Planned', icon: '🔄🎯' },
              { slug: 'intersections', title: 'Intersections', icon: '✖️', badge: 'Core' },
              { slug: 'curves', title: 'Curves', description: 'TP & 3-point', disabled: true, badge: 'Planned', icon: '〰️' }
            ]
          },
          {
            slug: 'traverse',
            title: 'Traverse',
            description: 'Data & field traverses',
            items: [
              { slug: 'data-traverse', title: 'Data Traverse', disabled: true, badge: 'Planned', icon: '🧭' },
              { slug: 'field-traverse', title: 'Field Traverse', disabled: true, badge: 'Planned', icon: '🗺️' },
              { slug: 'adjustment', title: 'Traverse Adjustment', disabled: true, badge: 'Planned', icon: '⚖️' }
            ]
          },
          {
            slug: 'transform',
            title: 'Transform',
            description: 'Systems • ellipsoids • transforms',
            items: [
              { slug: 'system', title: 'System Selection', disabled: true, badge: 'Planned', icon: '🌐' },
              { slug: 'helmert', title: 'Helmert', disabled: true, badge: 'Planned', icon: '🧮' },
              { slug: 'geodetic-plane', title: 'Geodetic ↔ Plane', description: 'Cape Datum ↔ WGS84 transformations with mapping', icon: '↔️', badge: 'New' },
              { slug: 'compare', title: 'Compare Points', disabled: true, badge: 'Planned', icon: '🔍' }
            ]
          },
          {
            slug: 'cad',
            title: 'CAD & Sheets',
            description: 'Sketch • overlays • print',
            items: [
              { slug: 'cad', title: '2D CAD', disabled: true, badge: 'Planned', icon: '✏️' },
              { slug: 'setting-out', title: 'Setting-out Sheets', disabled: true, badge: 'Planned', icon: '📝' },
              { slug: 'print', title: 'Print & Export', disabled: true, badge: 'Planned', icon: '🖨️' }
            ]
          }
        ]
      },
      {
        slug: 'conversions',
        title: 'Conversions',
        short: 'Conversions',
        description: 'Coordinate / unit transformations & datum utilities.',
        color: 'bg-slate-600',
        colorHover: 'hover:bg-slate-700',
        border: 'border-slate-700',
        text: 'text-white',
        icon: '🔁',
        submenus: [
          { slug: 'datum', title: 'Datum Shifts', description: 'Helmert / grid transforms' },
            { slug: 'projection', title: 'Projection', description: 'Map projection conversions' },
          { slug: 'units', title: 'Units', description: 'Distance / angle unit conversions' },
          { slug: 'geoid', title: 'Geoid', description: 'Orthometric ↔ ellipsoidal height (future)', disabled: true, badge: 'Soon' }
        ]
      },
      {
        slug: 'least-squares',
        title: 'Least Squares',
        short: 'LSQ',
        description: 'Network adjustments, residual analysis, precision metrics.',
        color: 'bg-sky-600',
        colorHover: 'hover:bg-sky-700',
        border: 'border-sky-700',
        text: 'text-white',
        icon: '📐',
        comingSoon: true,
        requiredRole: 'in_training', // Requires in-training or higher
        submenus: [
          { slug: 'network-setup', title: 'Network Setup', disabled: true, badge: 'Planned' },
          { slug: 'adjustment', title: 'Adjustment', disabled: true, badge: 'Planned' },
          { slug: 'residuals', title: 'Residuals', disabled: true, badge: 'Planned' },
          { slug: 'quality', title: 'Quality Metrics', disabled: true, badge: 'Planned' }
        ]
      },
      {
        slug: 'topographical',
        title: 'Topographical',
        short: 'Topo',
        description: 'Surface models, contours, terrain point management.',
        color: 'bg-yellow-400',
        colorHover: 'hover:bg-yellow-500',
        border: 'border-yellow-500',
        text: 'text-gray-900',
        icon: '🗺️',
        submenus: [
          { slug: 'dtm', title: 'DTM', description: 'Digital terrain model (future)', disabled: true, badge: 'Soon' },
          { slug: 'contours', title: 'Contours', disabled: true, badge: 'Soon' },
          { slug: 'sections', title: 'Sections', disabled: true, badge: 'Soon' },
          { slug: 'points', title: 'Topo Points', description: 'Manage terrain point sets' }
        ]
      },
      {
        slug: 'engineering',
        title: 'Engineering',
        short: 'Eng',
        description: 'Setout, alignment geometry, design checks.',
        color: 'bg-cyan-600',
        colorHover: 'hover:bg-cyan-700',
        border: 'border-cyan-700',
        text: 'text-white',
        icon: '🏗️',
        submenus: [
          { slug: 'setout', title: 'Setout', description: 'Layout coordinates & offsets' },
          { slug: 'alignments', title: 'Alignments', disabled: true, badge: 'Soon' },
          { slug: 'volumes', title: 'Volumes', disabled: true, badge: 'Planned' },
          { slug: 'stake-log', title: 'Stake Log', disabled: true, badge: 'Planned' }
        ]
      },
      {
        slug: 'mining',
        title: 'Mining',
        short: 'Mining',
        description: 'Pit design references, volume checks, blast pattern planning.',
        color: 'bg-emerald-600',
        colorHover: 'hover:bg-emerald-700',
        border: 'border-emerald-700',
        text: 'text-white',
        icon: '⛏️',
        submenus: [
          { slug: 'pit-design', title: 'Pit Design', disabled: true, badge: 'Planned' },
          { slug: 'blast', title: 'Blast Patterns', disabled: true, badge: 'Planned' },
          { slug: 'stockpiles', title: 'Stockpiles', disabled: true, badge: 'Planned' },
          { slug: 'volumes', title: 'Volumes', disabled: true, badge: 'Planned' }
        ]
      },
      {
        slug: 'cadastral-standard',
        title: 'Cadastral (Standard)',
        short: 'Cadastral Std',
        description: 'Digital cadastral records production from reduced field notes.',
        color: 'bg-rose-500',
        colorHover: 'hover:bg-rose-600',
        border: 'border-rose-600',
        text: 'text-white',
        icon: '📋',
        requiredRole: 'registered', // Only registered surveyors can access
        submenus: [
          { slug: 'workflow', title: 'Cadastral Workflow', description: 'Complete 7-step cadastral records production', icon: '📋', badge: 'New' },
          { slug: 'parcels', title: 'Parcels', description: 'Stand / parcel management', disabled: true },
          { slug: 'beacons', title: 'Beacons', description: 'Boundary beacons list', disabled: true },
          { slug: 'inverse', title: 'Inverse', description: 'Bearing & distance between points', disabled: true },
          { slug: 'forward', title: 'Forward', description: 'Coordinate from bearing + distance', disabled: true }
        ]
      },
      {
        slug: 'cadastral-extended',
        title: 'Cadastral (Extended)',
        short: 'Cadastral Ext',
        description: 'Advanced cadastral adjustments, transformation matrices, compliance exports.',
        color: 'bg-fuchsia-600',
        colorHover: 'hover:bg-fuchsia-700',
        border: 'border-fuchsia-700',
        text: 'text-white',
        icon: '🧮',
        comingSoon: true,
        requiredRole: 'registered', // Only registered surveyors can access
        submenus: [
          { slug: 'adjustments', title: 'Boundary Adjustment', disabled: true, badge: 'Planned' },
          { slug: 'transform', title: 'Advanced Transform', disabled: true, badge: 'Planned' },
          { slug: 'compliance', title: 'Compliance Exports', disabled: true, badge: 'Planned' },
          { slug: 'audit', title: 'Audit Trail', disabled: true, badge: 'Planned' }
        ]
      },
      {
        slug: 'settings',
        title: 'Settings & Management',
        short: 'Settings',
        description: 'Manage surveyors, projects, and application settings.',
        color: 'bg-gray-700',
        colorHover: 'hover:bg-gray-800',
        border: 'border-gray-800',
        text: 'text-white',
        icon: '⚙️',
        submenus: [
          { slug: 'surveyors', title: 'Surveyors', description: 'Manage surveyor profiles and licenses', icon: '👤', badge: 'New' },
          { slug: 'projects', title: 'Projects', description: 'Manage survey projects', icon: '📁', badge: 'New' }
        ]
      }
    ] as SurveyModule[]
  }),
  getters: {
    getBySlug: (state) => (slug: string) => state.modules.find(m => m.slug === slug),
    
    // Get modules accessible to current user based on role
    accessibleModules: (state) => {
      const auth = useAuthStore()
      if (!auth.isSurveyor) return state.modules.filter(m => !m.requiredRole)
      
      const surveyorType = auth.surveyorType
      const roleHierarchy: Record<string, number> = {
        'student': 1,
        'technician': 2,
        'in_training': 3,
        'registered': 4
      }
      
      const userLevel = roleHierarchy[surveyorType || 'student'] || 0
      
      return state.modules.filter(m => {
        if (!m.requiredRole) return true
        const requiredLevel = roleHierarchy[m.requiredRole] || 0
        return userLevel >= requiredLevel
      })
    },
    
    // Check if user can access a specific module
    canAccessModule: (state) => (slug: string) => {
      const auth = useAuthStore()
      const module = state.modules.find(m => m.slug === slug)
      
      if (!module) return false
      if (!module.requiredRole) return true
      if (!auth.isSurveyor) return false
      
      const surveyorType = auth.surveyorType
      const roleHierarchy: Record<string, number> = {
        'student': 1,
        'technician': 2,
        'in_training': 3,
        'registered': 4
      }
      
      const userLevel = roleHierarchy[surveyorType || 'student'] || 0
      const requiredLevel = roleHierarchy[module.requiredRole] || 0
      
      return userLevel >= requiredLevel
    }
  }
})
