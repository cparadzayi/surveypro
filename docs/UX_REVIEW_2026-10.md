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
| axios request timeout | none on the default client (correction, 27 Oct: the long-running calls set their own: plan PDF 10 min, DXF 5 min, working plan 2 min) |
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

- [~] Replace the 187 `alert()` calls with a toast / inline-banner / dialog layer. Messages such as "Check console for details" send a surveyor to developer tools, and "Your work is still in memory but not persisted" is a persistent warning that needs a Retry, not a dismissible pop-up. **Layer built 27 Oct 2026** (`composables/useNotifications.ts`, `components/ui/NotificationHost.vue`, mounted once in `App.vue`; `utils/errorMessage.ts` turns "Network Error" and friends into plain language). **Plan generation migrated** (its fail-fast alerts, the overwrite question, the result and the failure). About 180 `alert()` calls and 21 `confirm()` calls remain, mostly in `MapLibreAreaView` (55), `CadastralStandardView` (43) and the Areas views; migrate file by file, starting with the persistent "not saved" warnings.
- [~] Sessions fail silently: a 401 or the 4-hour idle timeout logs the user out and returns them to the landing page with no explanation. **Fixed 27 Oct 2026:** the sign-in page now says "Your session has expired. Sign in again to continue." (`auth.sessionNotice`; a wrong password is not reported as an expired session). Still open: an unsaved-changes guard, and a "server not reachable" state beyond the error text.
- [x] The working-directory requirement was checked only after the PDF, DXF and summary had all been built. **Fixed 27 Oct 2026:** `validateOutputLocation` in `planPayload.ts`, called at the top of `generatePlanDocuments`.

### 2. Plan generation

- [x] Generator warnings were invisible: the PDF renderer's warnings (for example "some blocks may overlap the figure") never left the backend, and DXF warnings went to `console.warn` only. **Fixed 27 Oct 2026:** the backend sends them in an `X-Plan-Warnings` header (single-sheet and per sheet for multi-sheet plans; `utils/planWarnings.js`), the DXF counts become sentences, and both appear in the result notice, which stays up until dismissed.
- [~] Replace the result `alert()` with a result panel. **Done in part, 27 Oct 2026:** a notice lists the files saved, files kept, parcels not drawn and the warnings. Still open: Open / Show in folder / Preview actions, and the scale and sheet used.
- [ ] Progress and cancel for generation (it can take minutes; only button text shows status).
- [x] Scale dropdown was not in numeric order (1:1000-1:7500, then 1:100-1:750). **Fixed 27 Oct 2026:** now 1:100-1:750, 1:1000-1:7500, then 1:10000 up.
- [ ] "Generate General Plan" and "Download Complete Survey Record" are equal-weight buttons; make the plan the primary action. Remember the PDF/DXF/GPKG choices; say what GPKG is.
- [ ] Associate the 12 `config-label`s in the plan panel with their controls.

### 3. Orientation in the 14-step workflow

- [~] No overall progress ("5 of 14"); step state is shown by colour alone. **Progress count added 27 Oct 2026** under "All Steps" ("5 of 14 steps complete. ..."). Step state is still colour only.
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

## Second round, also 27 October 2026

- `composables/useNotifications.ts` + `components/ui/NotificationHost.vue`: toasts (errors and warnings are `role="alert"` and stay until dismissed; successes clear themselves) and a modal confirm dialog (Escape cancels, Tab stays inside, a destructive question starts on Cancel, focus returns afterwards).
- `utils/errorMessage.ts`: plain-language text for unreachable server, timeout, 401/403/404/409/413/429 and 5xx, keeping the raw text as a detail.
- `stores/auth.ts`, `services/api.ts`, `views/LandingView.vue`: the session-expired notice.
- Plan generation (`SurveyPlanMapView.vue`, `planOutcome.ts`): alerts replaced; the result notice carries warnings. Backend: `utils/planWarnings.js`, the `X-Plan-Warnings` header in `routes/geopdf-vector.js`, and sheet warnings returned by `generateSheetedGeoPDF`; frontend `services/geopdf.ts` and `utils/planWarnings.ts` read it.
- `composables/useWorkflowRibbon.ts`: `workflowProgressNote`.
- `vitest.config.ts` now has the Vue plugin so components can be mounted in tests.

## Suggested order for the rest

- **Next:** migrate the remaining `alert()` / `confirm()` calls file by file (the "not persisted" warnings first), an unsaved-changes guard, Open / Show in folder / Preview on the result notice, and a non-colour cue for step state.
- **Later:** the accessibility pass and splitting the three giant views.
