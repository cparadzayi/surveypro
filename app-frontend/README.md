# SurveyPro Frontend (Reboot)

Minimal Vue 3 + Vite + Tailwind + Pinia frontend for the fresh SurveyPro reboot.

## Features
- Auth pages: Register, Login, Dashboard
- Pinia auth store with JWT token persistence
- Axios service with auth interceptor
- Tailwind CSS styling

## Scripts
- `npm run dev` start dev server
- `npm run build` production build
- `npm run preview` preview production build

## Environment
Set `VITE_API_BASE` if backend not on default `http://localhost:3042/api`.

## Next Steps
Previously: add survey domain pages after core auth verified – DONE. The modular scaffold is now in place.

## Module Architecture
Modules mirror core survey domains (lite, conversions, least-squares, topographical, engineering, mining, cadastral-standard, cadastral-extended). Each lives under:

```
src/views/modules/<module-slug>/
	<PascalModuleName>Index.vue   # e.g. LiteIndex.vue, CadastralExtendedIndex.vue
	<submenu>/<SubmenuPascal>View.vue  # e.g. points/PointsView.vue
```

Naming rules:
1. Module index: `<SlugWordsCapitalized>Index.vue` (kebab segments capitalized & concatenated).
2. Submenu view: inside a folder named after the submenu slug; component named `<PascalCaseSubmenu>View.vue`.
3. Router attempts (in order) for submenu:
	 - `modules/<module>/<submenu>/<SubmenuPascal>View.vue`
	 - fallback `modules/<module>/<SubmenuPascal>View.vue`

Disabled / planned submenus still get placeholders so navigation and 404 logic are stable.

## Dynamic Routing
Two dynamic routes:
- `/modules/:module` → lazy import `<ModulePascal>Index.vue`
- `/modules/:module/:submenu` → lazy import submenu view (pattern above)

Guards:
- Auth guard blocks non-public routes.
- `beforeResolve` validates module & submenu slug against the Pinia modules store (`src/stores/modules.ts`).

## Navigation
`SideNav.vue` renders module list & nested submenu list, highlights active states, and honours `disabled` / `comingSoon` flags.

## UI Scaffold & States
`ModuleScaffold.vue` centralizes header, breadcrumbs, action slot and standardized content container. It also accepts optional state props/slots:

Props:
```
loading?: boolean
error?: boolean | string
empty?: boolean
```

Named Slots (optional):
```
actions, loading, error, empty, default
```

Helper Components (in `src/components/ui`):
- `LoadingSpinner.vue`
- `ErrorNotice.vue` (retry slot via prop)
- `EmptyState.vue`

## Styling
Tailwind configured with basic palette. Module store defines a color set per module (`color`, `colorHover`, `border`, `text`).

## Adding a New Module
1. Add definition in `src/stores/modules.ts` with `slug` and optional `submenus`.
2. Create folder & index view file following naming rules.
3. (Optional) Add submenu folders + views (placeholders acceptable initially).
4. Side navigation picks it up automatically.

## Environment Variable
`VITE_API_BASE` (default: `http://localhost:3042/api`).

## Development Workflow
1. Define module + submenus in store.
2. Create placeholder views quickly (scaffold + minimal descriptive text).
3. Iterate on feature logic; wire API calls in `src/services/*`.
4. Use `LoadingSpinner`, `ErrorNotice`, `EmptyState` via scaffold.

## Pending / Future
- Integrate spatial/map layer (likely Leaflet or OpenLayers) into `MapView.vue`.
- PostGIS upgrade alignment with backend migration (currently JSONB geometry).
- Access control toggling for `restricted` modules when backend roles available.

## Testing
Minimal for now; smoke test by navigating to each module + submenu to confirm dynamic import path success (no console 404). Add Vitest / Cypress later.

## Contributing Style
- Keep new views lean; focus on incremental, testable additions.
- Prefer service modules (`src/services/`) for API separation.

---
This document reflects state as of current scaffold build-out (all modules & submenu placeholders present including disabled items).
