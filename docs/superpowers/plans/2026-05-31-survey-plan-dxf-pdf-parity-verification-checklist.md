# DXF / PDF Parity — Manual CAD Verification Checklist

> **Run this once per branch before merging.** Embed the captured screenshots and the completed checklist in the PR description.

**Plan:** [`2026-05-31-survey-plan-dxf-pdf-parity.md`](./2026-05-31-survey-plan-dxf-pdf-parity.md)
**Spec:** [`../specs/2026-05-31-survey-plan-dxf-pdf-parity-design.md`](../specs/2026-05-31-survey-plan-dxf-pdf-parity-design.md)

## Tooling

- **LibreCAD** (https://librecad.org) or **QCAD** — both are free and read DXF R12 natively. No AutoCAD licence required.
- A backend dev server (`cd app-backend && npm run dev`) and frontend dev server (`cd app-frontend && npm run dev`) running locally.
- A logged-in browser session (re-use the test user from `verification/drive.mjs` established for the conformality verification, or register a fresh one with the snippet in Plan Task 16).
- A project with sample plan data (the seed script `npm run seed:sample` in `app-backend/` populates one if none exists).

## Procedure

1. Start the backend + frontend dev servers.
2. Log in with the test user.
3. Navigate to a Cadastral Standard project with sample plan data.
4. Click **📐 Export AutoCAD DXF**.
5. Save the downloaded `.dxf` to `verification/dxf-verification/` (already git-ignored).
6. Open the file in LibreCAD or QCAD.
7. Walk the visual checklist below; capture one screenshot per major area; save the screenshots beside the `.dxf` under `verification/dxf-verification/`.
8. Type `_UCS R CAD_NORTH_UP` in the CAD command line; verify the view flips to north-up. Type `_UCS World` to restore.

## Visual checklist

Each item must read true. Tick the box when verified; attach the screenshot reference.

- [ ] Title block at the **top of the sheet** (south-up orientation); shows designation, surveyOf, firm, parent-property, whole/portion, district fields where the project has them. *(Screenshot: `01-title-block.png`)*
- [ ] **SI 727 figure-description sentence** present in the title zone — reads as a coherent paragraph (`"The figure A, B, C, D, A represents Borrowdale comprising 2 stands numbered 123–124 and public places being a portion of Borrowdale of Lot 9 Of Borrowdale, situate in the district of Harare."`). Wrap is on word boundaries (no mid-word splits). Fits within the content-area horizontally. *(Screenshot: `01b-figure-description.png`)*
- [ ] **"Vide diagram S.G. No. ..."** line present immediately below the figure description. Dotted blanks visible (`........................ annexed to ........................ No. ........................`). *(Screenshot: `01c-vide-line.png`)*
- [ ] **SHEET N label** — verify by running a synthetic multi-sheet export: temporarily edit `app-backend/src/routes/geopdf-vector.js` to inject `sheetInfo: { sheetNumber: 1, totalSheets: 3 }` into the `generateDXF()` call (or pass it via the request body), re-export, and confirm `SHEET 1` renders **above** the figure description in bold. Revert the temporary change after verification. *(Screenshot: `01d-sheet-label.png`)*
- [ ] Drawing zone shows the parcel(s) with **south at the top**. *(Screenshot: `02-drawing-orientation.png`)*
- [ ] North/south arrow visible in the **upper-right of the drawing zone**, points up (toward south on the printed sheet, since the page is south-up). *(Screenshot: `03-north-arrow.png`)*
- [ ] Scale bar visible in the **lower-right of the drawing zone** with metre labels (0, ¼, ½, full length) and a `1:<scale>` footer. *(Screenshot: `04-scale-bar.png`)*
- [ ] Coordinate-grid tick marks along the **four drawing borders** with rounded Cape Lo Y / X values. *(Screenshot: `05-grid-ticks.png`)*
- [ ] Beacons render with **distinct placed vs found symbols** (placed = filled circle via radial fill; found = open circle + cross). *(Screenshot: `06-beacon-symbols.png`)*
- [ ] **Schedule of Areas** in the lower-left zone. *(Screenshot: `07-schedule.png`)*
- [ ] **SI 727 6-column layout** — header reads `STAND No.`, `AREAS SQUARE METRES`, `DIAGRAM NUMBER`, `DEED` parent above `NUMBER` and `DATE`, `SURVEYOR-GENERAL`. Blank cells appear where the optional fields aren't populated (SG officials fill these at approval). *(Screenshot: `07a-schedule-6col.png`)*
- [ ] **Single-table layout** — for plans with ≤ ~25 stands on A2, the schedule renders as one table in the bottom-left zone with the beacon-descriptions block immediately below. *(Screenshot: `07b-single-table.png`)*
- [ ] **Side-by-side continuation tables** — for plans with more rows than the single-column budget (synthesise via a temporary fixture or a real ~30-parcel plan), the schedule splits into two or more sub-tables labelled `SCHEDULE OF AREAS` and `SCHEDULE OF AREAS (cont'd)`. *(Screenshot: `07c-multi-table.png`)*
- [ ] **Schedule overflow signal** — for plans that overflow at A2 (synthesise via a temporary 200-parcel payload), the response `warnings.summary.scheduleOverflow` contains `{ atSheetSize: 'ISO_A2', requiredSheetSize: 'ISO_A1' | 'ISO_A0' | 'multi-sheet-required', standCount: N }`. Verify via the backend log or inspect the response payload in dev tools. *(Screenshot: `07d-overflow-warning.png`)*
- [ ] **Beacon descriptions block** immediately below the Schedule of Areas. *(Screenshot: `07-schedule.png` covers this too.)*
- [ ] **Outside-figure data** in the lower-centre zone. *(Screenshot: `08-outside-figure-data.png`)*
- [ ] **Endorsement column** in the right margin with all five sub-blocks visible:
  - [ ] APPROVED FOR LODGEMENT header + three signature lines (Date / Surveyor-General / Reference)
  - [ ] Dispensation Certificate slot
  - [ ] Plan No. stamp box (30 × 15 mm RECT with "Plan No.:" label)
  - [ ] Prior diagram references (list or "Prior diagrams: None")
  - [ ] Surveyor certification footer with the surveyor's name + license number + signature line
  *(Screenshot: `09-endorsement.png`)*
- [ ] **Margin guides / crop marks** visible at the page and content-area corners. *(Screenshot: `10-margin-guides.png`)*
- [ ] Typing `_UCS R CAD_NORTH_UP` in the CAD command line flips the view to north-up; typing `_UCS World` restores south-up. *(Screenshot: `11-ucs-toggle.png` — one before, one after.)*
- [ ] Each outside-figure vertex carries a small tick mark pointing outward plus a Cape Lo coordinate label (`Y=… X=…`) just outside the boundary. *(Screenshot: `12-outside-figure-annotation.png`)*
- [ ] Each outside-figure edge has a distance label (metres, 2 dp) and a bearing label (DMS) at its midpoint, offset outward from the boundary. *(Screenshot: `12-outside-figure-annotation.png` covers this too)*
- [ ] Toggling the CAD `DISTANCES` layer off hides BOTH parcel edge distances AND outside-figure edge distances simultaneously (proves they share the layer).

## After verification

1. Move all screenshots into `verification/dxf-verification/`.
2. Copy this checklist (with ticks and screenshot references) into the PR description for the branch.
3. Mark the PR as ready for review.

## If something is off

Open an issue describing what failed and link the screenshot. The likely culprits, by symptom:

- Title block at the bottom of the sheet → coordinate transform regression (Plan Task 2).
- Beacons appear as plain circles, no fill or cross → `addBeaconSymbol` not invoked (Plan Task 6).
- Endorsement column missing or stub-only → `drawEndorsementZone` not invoked (Plan Task 13).
- Schedule of Areas overlapping Beacon Descriptions → zone-bottom calculation in Plan Task 11.
- No grid ticks visible → drawing extent too small for the auto-selected grid step (Plan Task 9).
- `X-DXF-Warning-Count` header missing in DevTools Network panel → route adaptation (Plan Task 3) or frontend reading (Plan Task 14).
