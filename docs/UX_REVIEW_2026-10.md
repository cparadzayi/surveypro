# UX review — October 2026

Reviewed 27 October 2026. Scope: the Vue frontend (`app-frontend`), 133 components, ~50,000 lines.

## How it was done, and its limits

- Counted patterns across `src/` (dialogs, accessibility attributes, shared components, error handling).
- Read the code of the main screens: app shell, dashboard, side navigation, the Cadastral Standard workflow (ribbon and step config), plan generation (`SurveyPlanMapView.vue`), CSV import.
- Opened the public login page in the browser, on desktop and phone width.
- **Not done:** the signed-in screens were not seen running (no credentials were used). Findings about the dashboard, workflow and plan-generation screens come from reading their code, not from using them. A walkthrough with a real project would confirm or correct them.

## What already works well

- CSV import: summary tiles, per-row errors, a suggestion with each warning.
- Fail-fast checks before generation (outside figure, parcels, formats) with clear messages.
- Side navigation: `aria-current`, labelled buttons, mobile drawer.
- Login page: labelled inputs, autocomplete, responsive.
- Dates are DD/MM/YYYY throughout.

## Evidence (counts at review time, excluding tests)

| Pattern | Count |
|---|---|
| native `alert()` | 187 in 21 files (55 `MapLibreAreaView`, 43 `CadastralStandardView`) |
| `confirm()` | 21 in 7 files |
| toast / notification system | none |
| `EmptyState`, `ErrorNotice`, `LoadingSpinner` (shared) | each used in 1 file |
| route-leave / `beforeunload` guards | 0 |
| axios request timeout | none |
| `<label>` with `for=` | 27 of 297 (some wrap their input) |
| files with modals / declaring `role="dialog"` | 12 / 4 |
| live regions (`aria-live`, `role=status/alert`) | 5 |
| text 9-11px / `text-gray-400` as text | 86 / 47 |
| hex colours / CSS variables / dark mode | 484 / 0 / none |
| `console.log` calls | 1,676 |
| `@media` rules | 7 in 5 files |
| views over 4,000 lines | 3 (`MapLibreAreaView` 8.6k, `SurveyPlanMapView` 7.3k, `CadastralStandardView` 4.3k) |

## Findings and recommendations

### 1. Protect work and build trust

- [ ] Replace the 187 `alert()` calls with a toast / inline-banner / dialog layer. Messages such as "Check console for details" send a surveyor to developer tools, and "Your work is still in memory but not persisted" is a persistent warning that needs a Retry, not a dismissible pop-up.
- [ ] Sessions fail silently: a 401 or the 4-hour idle timeout logs the user out and returns them to the landing page with no explanation. Add "Your session expired. Sign in to continue", an unsaved-changes guard, and request timeouts with a real "server not reachable" message.
- [x] The working-directory requirement was checked only after the PDF, DXF and summary had all been built. **Fixed 27 Oct 2026:** `validateOutputLocation` in `planPayload.ts`, called at the top of `generatePlanDocuments`.

### 2. Plan generation

- [ ] Generator warnings are invisible: the PDF renderer's warnings (for example "some blocks may overlap the figure") never leave the backend, and DXF warnings go to `console.warn` only. Surface them after generation.
- [ ] Replace the result `alert()` with a result panel: Open, Show in folder, Preview, scale and sheet used, sheet count, warnings.
- [ ] Progress and cancel for generation (it can take minutes; only button text shows status).
- [x] Scale dropdown was not in numeric order (1:1000-1:7500, then 1:100-1:750). **Fixed 27 Oct 2026:** now 1:100-1:750, 1:1000-1:7500, then 1:10000 up.
- [ ] "Generate General Plan" and "Download Complete Survey Record" are equal-weight buttons; make the plan the primary action. Remember the PDF/DXF/GPKG choices; say what GPKG is.
- [ ] Associate the 12 `config-label`s in the plan panel with their controls.

### 3. Orientation in the 14-step workflow

- [ ] No overall progress ("5 of 14"); step state is shown by colour alone.
- [x] Ribbon note said "Locks clear automatically as prerequisites complete", contradicting `cadastralWorkflow.ts` (steps are deliberately not gated). **Fixed 27 Oct 2026:** now "Open any step at any time; each one reports what it still needs."
- [ ] Where a step has nothing to work on, say which earlier step supplies the data and link to it.
- [ ] Show the project name persistently in the workflow.

### 4. Dashboard

- [x] Project cards were `div`s with click handlers, unreachable by keyboard. **Fixed 27 Oct 2026:** `role="button"`, `tabindex="0"`, Enter/Space, focus ring, accessible name.
- [ ] Show progress and last activity on a card (current step, plans generated, last edited).
- [ ] A way to create a project when projects already exist; search, sort, archive.
- [ ] "Quick Access" shows only the first four modules (`modules.slice(0, 4)`).
- [x] "Forgot password?" was a dead `href="#"` link. There is no reset flow in the backend or frontend. **Fixed 27 Oct 2026:** it now says reset by email is not available yet and to ask the administrator. A real reset flow is still open.

### 5. Accessibility

- [ ] Label association across forms (27 of 297 use `for=`).
- [ ] Ribbon: `role="tab"` with no arrow-key handling and no tab panel.
- [ ] Modals without `role="dialog"` / focus handling (8 of 12 files).
- [ ] More live regions for status and errors.
- [ ] Text under 12px and `text-gray-400` text colour.
- [ ] Emoji used as icons (about 3,300 template lines): noisy for screen readers and rendered differently per platform.

### 6. Consistency and maintainability

- [ ] Use the shared `EmptyState` / `ErrorNotice` / `LoadingSpinner` instead of hand-rolled copies.
- [ ] Colour tokens (CSS variables) in place of 484 hex values; remove inline `style=` blocks.
- [ ] Remove the 1,676 `console.log` calls from production paths.
- [ ] Split the three giant views.

### 7. Copy to check

- [ ] The CSV format guide says coordinates "will be auto-converted to WGS84". Stored geometry stays in the Lo system; the conversion is for display only. Reword so it is not misleading.

## Quick wins completed

Done 27 October 2026 in `app-frontend/src`: the five items marked `[x]` above.

- `views/modules/cadastral-standard/planPayload.ts`: `validateOutputLocation` (tested in `planPayload.test.ts`).
- `views/modules/cadastral-standard/SurveyPlanMapView.vue`: working-directory check moved to the top of `generatePlanDocuments`; scale dropdown reordered.
- `composables/useWorkflowRibbon.ts`: ribbon note.
- `views/LandingView.vue`: forgot-password note.
- `views/DashboardView.vue`: keyboard-operable project cards.

## Suggested order for the rest

- **Next (a week or two):** the toast/dialog layer replacing the alerts, session-expiry and unsaved-work handling, a post-generation result panel with warnings, workflow progress count.
- **Later:** the accessibility pass and splitting the three giant views.
