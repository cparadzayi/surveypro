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

- [~] Replace the 187 `alert()` calls with a toast / inline-banner / dialog layer. Messages such as "Check console for details" send a surveyor to developer tools, and "Your work is still in memory but not persisted" is a persistent warning that needs a Retry, not a dismissible pop-up. **Layer built 27 Oct 2026** (`composables/useNotifications.ts`, `components/ui/NotificationHost.vue`, mounted once in `App.vue`; `utils/errorMessage.ts` turns "Network Error" and friends into plain language; `notifyFailure(title, error)` is the one-line form for a catch block). **Migrated:** plan generation, and (second pass, 28 Oct) every alert that sent the user to the console or reported a failed save: 27 calls in 10 files, including the auto-save failure in `MapLibreAreaView`, which is now a persistent "Parcel not saved" error with a working **Retry save**. **Fourth pass (28 Oct):** 115 more one-line `alert()` calls converted mechanically in 16 files. About 39 multi-line or concatenated `alert()` calls and 21 `confirm()` calls remain; they need hand conversion.
- [x] Sessions fail silently: a 401 or the 4-hour idle timeout logged the user out and returned them to the landing page with no explanation. **Fixed 27 Oct 2026:** the sign-in page says "Your session has expired. Sign in again to continue." (`auth.sessionNotice`; a wrong password is not reported as an expired session). **Unsaved-changes guard added 28 Oct 2026** (`composables/useUnsavedWork.ts`): a screen registers while it holds unsaved input, and leaving asks first through the workflow step changes (ribbon jumps, Previous/Next), the router, and the browser's own prompt on closing or reloading the tab. It is wired into project setup and the servitude editor (eighth round), and marks by the user's own input events, never by comparing values. Still open: wire it into other forms (record composition, parcel editing), and a "server not reachable" state beyond the error text.
- [x] The working-directory requirement was checked only after the PDF, DXF and summary had all been built. **Fixed 27 Oct 2026:** `validateOutputLocation` in `planPayload.ts`, called at the top of `generatePlanDocuments`.

### 2. Plan generation

- [x] Generator warnings were invisible: the PDF renderer's warnings (for example "some blocks may overlap the figure") never left the backend, and DXF warnings went to `console.warn` only. **Fixed 27 Oct 2026:** the backend sends them in an `X-Plan-Warnings` header (single-sheet and per sheet for multi-sheet plans; `utils/planWarnings.js`), the DXF counts become sentences, and both appear in the result notice, which stays up until dismissed.
- [~] Replace the result `alert()` with a result panel. **Done in part:** a notice lists the files saved, files kept, parcels not drawn and the warnings, with a **Copy folder path** action (28 Oct 2026; a browser page cannot open a folder). **Preview and the scale and sheet used added 28 Oct 2026** (see the eighth round).
- [~] Progress and cancel for generation. **Done 28 Oct 2026:** the button shows a running clock beside the stage text, and a **Cancel generation** button stops the PDF/DXF/GeoPackage requests and saves nothing (`formatElapsed`, `isCancelled`, `signal` on `generateVectorGeoPDF`/`generateDXF`). Limits: the server cannot report percentage progress (one request, one answer), and it finishes the render it already started after you cancel; the Complete Survey Record button is not covered yet.
- [x] Scale dropdown was not in numeric order (1:1000-1:7500, then 1:100-1:750). **Fixed 27 Oct 2026:** now 1:100-1:750, 1:1000-1:7500, then 1:10000 up.
- [ ] "Generate General Plan" and "Download Complete Survey Record" are equal-weight buttons; make the plan the primary action. Remember the PDF/DXF/GPKG choices; say what GPKG is.
- [x] Associate the 12 `config-label`s in the plan panel with their controls. **Done 28 Oct 2026:** single-control labels use `for`/`id`; the labels that head a group (subject, sheet size, layers, outside-figure data, export) are spans naming a `role="group"`. **5 done 28 Oct 2026** (plan type, rotation, scale, surveyor name, licence number); the rest label groups or custom inputs (date, parcel picker, layers).

### 3. Orientation in the 14-step workflow

- [x] No overall progress ("5 of 14"); step state is shown by colour alone. **Progress count added 27 Oct 2026** under "All Steps". **Non-colour step state added 28 Oct 2026:** a tick on completed steps, a spoken status for every step ("completed", "current step", "not started"), `aria-current="step"` on the current one, and the status in the tooltip.
- [x] Ribbon note said "Locks clear automatically as prerequisites complete", contradicting `cadastralWorkflow.ts` (steps are deliberately not gated). **Fixed 27 Oct 2026:** now "Open any step at any time; each one reports what it still needs."
- [ ] Where a step has nothing to work on, say which earlier step supplies the data and link to it.
- [x] Show the project name persistently in the workflow. **Done 28 Oct 2026:** the ribbon shows it before the tabs (`contextLabel`).

### 4. Dashboard

- [x] Project cards were `div`s with click handlers, unreachable by keyboard. **Fixed 27 Oct 2026:** `role="button"`, `tabindex="0"`, Enter/Space, focus ring, accessible name.
- [~] Show progress and last activity on a card. **Last activity done 28 Oct 2026:** the card says "Last opened <date>" (opening a project now records it through `POST /survey-projects/:id/touch`, which nothing called before). Current step and plans generated are not shown.
- [~] A way to create a project when projects already exist; search, sort, archive. **Search and sort done 28 Oct 2026** (shown once there are more than 3 projects; `utils/projectList.ts`). Creating another project and archiving from the dashboard are still open.
- [ ] "Quick Access" shows only the first four modules (`modules.slice(0, 4)`).
- [x] "Forgot password?" was a dead `href="#"` link. There is no reset flow in the backend or frontend. **Fixed 27 Oct 2026:** it now says reset by email is not available yet and to ask the administrator. A real reset flow is still open.

### 5. Accessibility

- [ ] Label association across forms (27 of 297 use `for=`).
- [x] Ribbon: `role="tab"` with no arrow-key handling and no tab panel. **Done 28 Oct 2026:** one tab stop, arrows/Home/End, `tabpanel` labelled by the tab.
- [x] Modals without `role="dialog"` / focus handling. **Done 28 Oct 2026:** a `v-dialog` directive (`directives/dialog.ts`, registered in `main.ts`) gives an overlay `role="dialog"`, `aria-modal`, a name, focus on open, Tab kept inside, Escape to close and focus returned afterwards. Applied to 20 overlays in 13 files; checked live on the Add Project dialog. Overlays that already handled Escape themselves (five in `MapLibreAreaView`) got the role and name only.
- [ ] More live regions for status and errors.
- [~] Text under 12px and `text-gray-400` text colour. **Done in part 28 Oct 2026:** 35 uses of `text-gray-400` (hints, icon buttons, placeholders in tables; 2.5:1 on white) are now `text-gray-500` (4.8:1), and 57 pieces of 9-11px text that were not pill badges are now 12px (`text-xs`) across 29 files. Left alone: disabled controls, text on the dark QGIS panel, decorative glyphs, and 29 badge-style labels still under 12px. The result was not reviewed screen by screen; a pass over the Compare and Servitudes screens is the most likely place to find a cramped layout.
- [ ] Emoji used as icons (about 3,300 template lines): noisy for screen readers and rendered differently per platform.

### 6. Consistency and maintainability

- [ ] Use the shared `EmptyState` / `ErrorNotice` / `LoadingSpinner` instead of hand-rolled copies.
- [ ] Colour tokens (CSS variables) in place of 484 hex values; remove inline `style=` blocks.
- [ ] Remove the 1,676 `console.log` calls from production paths.
- [ ] Split the three giant views.

### 7. Copy to check

- [x] The CSV format guide said coordinates "will be auto-converted to WGS84". **Reworded 28 Oct 2026:** stored as they are (Y westing, X southing); WGS84 is used only to draw the map.

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

## Third round, 28 October 2026

- `notifyFailure` helper, and 27 console-referring or save-failure alerts converted across 10 files (`DocumentPreviewPanel`, `AreaComputationView`, `CadastralStandardView`, `ControlPointSelectionView`, `DSGCertificateView`, `MapLibreAreaView`, `ReportOnSurveyView`, `SurveyPlanMapView`, `SurveyPlanViewNew`, `Areas2View`). The parcel auto-save failure now offers Retry save.
- `composables/useUnsavedWork.ts` and its wiring (project setup, workflow step changes, router).
- Step tiles carry a tick, a spoken status and `aria-current` (`RibbonButton`, `useWorkflowRibbon`).
- "Copy folder path" on the plan result notice (`outputFolderPath`); notice actions can keep the notice open (`keepOpen`).

## Fourth round, 28 October 2026

- 115 single-line `alert()` calls in 16 files now use `notifySuccess` / `notifyWarning` / `notifyError`. The tone was chosen from the wording and a leading status emoji was dropped, because the toast has its own glyph. The tone of the 52 warnings is a heuristic and worth a skim. Type-check count unchanged (297); 1481 frontend tests pass.

## Suggested order for the rest

- **Next:** the remaining `alert()` / `confirm()` calls, file by file; wire the unsaved-work guard into the other forms; Preview on the result notice; project name shown persistently in the workflow; then the accessibility pass (labels, ribbon keyboard handling, dialogs).
- **Later:** the accessibility pass and splitting the three giant views.

## Fifth round, 28 October 2026

- Another 20 `alert()` calls converted (17 error catches now use `notifyFailure`). **All native `alert()` and `confirm()` calls are now gone from the app (seventh pass, 28 Oct).**
- `Ribbon.vue`: project name shown before the tabs, arrow-key/Home/End tab navigation, `tabpanel` wiring (tested in `Ribbon.test.ts`).
- `SurveyPlanMapView.vue`: five plan-panel labels tied to their controls.

## Sixth round, 28 October 2026

- 10 native `confirm()` calls now use `confirmDialog`: the four step resets, delete-all-parcels, delete-point, clear-points, and both "Generate anyway?" lodgement checks. 11 remain, mostly in `MapLibreAreaView` (and two in `CadastralStandardView`, `Areas2View`, `DocumentPreviewPanel`) where the answer feeds longer logic.

## Seventh round, 28 October 2026

- The last 21 multi-line `alert()` and 11 `confirm()` calls are converted (`MapLibreAreaView`, `CadastralStandardView`, `ControlPointSelectionView`, `SurveyPlanMapView`, `DocumentPreviewPanel`, `Areas2View`, `useAreaConsistencyPDF`). Results are toasts with the facts as a list (sticky when they need action); every question is a `confirmDialog` with a button named for what it does ("Delete parcel", "Overwrite", "Download") and a red, Cancel-first dialog when the act is destructive. `grep` finds no `alert(` or `confirm(` outside the notification layer.
- Behaviour to know: in the two-way "merged PDF" question, Cancel/Escape now means "Save to project folder" (named on the button); `startEditingVertices` is async because it can now wait for an answer.

## Eighth round, 28 October 2026

- **Plan result notice:** says what the plan was drawn at ("Drawn at 1:600 on a 1000 × 800 mm sheet", or "on 4 sheets") and has a **Preview PDF** action that opens the generated file in the browser's viewer (`describeSheet`, `openPdfPreview`). A blocked pop-up is reported, not silent.
- **Plan-panel labels:** all 12 are now tied to their control or to the group they head.
- **Unsaved-work guard:** also on the servitude editor (marked by typing, cleared on save or cancel), so changing step or leaving the page asks first.
- **Project name:** the global ribbon names the selected project on every screen, not only in the cadastral workflow (checked live in the Lite module).
- **Technician dashboard:** a project that needs the cadastral workflow opens in Lite with a notice when the account type cannot use that workflow; the "Start Cadastral Workflow" button is replaced by an explanation. The empty state was not seen live (the stubbed session never finished loading projects).

## Ninth round, 28 October 2026

- **Dashboard:** with more than three projects, a search box (name, client, district, type; every word must match) and a sort menu (recently opened, name with numbers in numeric order, newest first). Cards show "Last opened", and opening a project now records that. Checked live with four stubbed projects.

## Tenth round, 28 October 2026

- **Contrast and size:** see the accessibility item above (35 colour changes, 57 size changes, 29 files).

## Eleventh round, 28 October 2026

- The unsaved-work guard now also covers the **Report on Survey** (cleared by Save Draft or Generate) and the **DSG certificate** (cleared when the certificate is generated, which is what saves it).
- The CSV format guide wording is corrected.
- Looked at the Beacon Comparison screen after the contrast pass: hints and the configuration panel read cleanly at 12px. Servitudes was not opened (it needs a project with parcels).

## Twelfth round, 28 October 2026

- **Dashboard progress:** every project card shows how many of the 14 workflow steps are done and which comes next, with a labelled progress bar. Covered by `projectProgress.test.ts` and a component test of the dashboard cards (`DashboardView.progress.test.ts`, which also covers search and sort).
- **First decided against, then done at the user's request (thirteenth round, below):** a cancel for the Complete Survey Record and a database unique index on project names.

## Thirteenth round, 28 October 2026

- **Cancel for "Download Complete Survey Record".** The run has about ten client-side stages and writes parcel marks to the database after it saves the file, so a cancel that could strike anywhere would leave a saved file with unmarked parcels. Instead it is cooperative: `generateComprehensiveLatestPDF` asks `shouldCancel` before each slow stage and once more immediately before the first write, and stops with `cancelled: true` and nothing saved. After that point the run is finished, not stopped: the button turns into "Saving — almost done" (`onSaveStart`). The stages themselves cannot be interrupted, so a cancel takes effect at the next boundary, not at once. Covered by `comprehensivePdfCancel.test.ts`, including "a cancel that arrives as saving begins is ignored, so the file and the parcel marks stay together". The button shares the plan's elapsed clock.
- **A bug found on the way:** `SurveyPlanMapView` passed the DSG certificate to the record builder as `dsgCertificate`, but the builder reads `dsg`, so the DSG Certificate (1/96) was **never appended** to a Complete Survey Record made from the Survey Plan screen (the Area Computation screen passed it correctly). Fixed; type errors 297 → 296.
