# Five-user simulation — 27 October 2026

Five simulated users ran at once against the live backend (170 API requests in 8 s, plus one 2-minute plan generation), and one of them was then walked through the UI. Accounts were `sim_N@sim.example.test` in the dev database; they and their schemas were removed afterwards and the database was confirmed identical to its starting state (3 users, 3 profiles, the same 4 schemas).

## Limits

- The API scenarios are scripted, so they find what the script thinks to try. The UI walk-through was one technician account on two screens; the cadastral workflow itself was not driven by a simulated user.
- Latencies are from a dev machine with one backend process.
- The first plan-generation attempt used a wrong request body (it reached the old `gdal` engine). That was my test error, not an application fault, and is not counted below.

## The five users

| User | Did | Result |
|---|---|---|
| 1 Registered surveyor | register, sign in, create project, import 40 points, parcel, workflow step, generate plan, delete project | all worked; plan of a 266-parcel project took **139 s** with no progress feedback |
| 2 Trainee | duplicate sign-up, short password, bad e-mail, wrong password, blank/garbage coordinates, case-clashing names, missing project | validation mostly good (case clash gives a clear message); see findings 3, 5, 6, 8 |
| 3 Technician | 800-point import, 10 parallel listings, same import twice, 20,000-point import | 800 points in 0.8 s, re-import is idempotent, 10 parallel listings of 231 KB each under 0.6 s; 20,000 points fails (finding 4) |
| 4 Student | tried to edit/delete surveyors, promote herself, forged/stripped/`alg=none` tokens, read other users' spatial data | all refused (401/403). Tenant isolation held |
| 5 Impatient | 4 simultaneous "create project", 60 rapid list calls, 25 wrong passwords, 8 MB body, malformed JSON | findings 1, 2, 4, 7 |

## Findings, most important first

1. **No limit on password guessing.** 25 wrong passwords in a row on one account, all answered 401, then the right one accepted at once. Add a per-account and per-IP throttle (and a short lockout).
2. **Double-click creates duplicate projects.** Four simultaneous identical "create project" calls made four projects with the same name. Disable the button while saving and refuse a repeated name per surveyor.
3. **500 responses leak internals.** A failed coordinate batch returns the database error text and the full JS stack trace in the body (`coordinatePoints.js` sends `stack`). Return a short message and log the detail.
4. **Oversized or malformed requests give 500, not 413/400.** A 2 MB JSON body, an 8 MB body, a 20,000-point import and a truncated JSON body all return "Internal Server Error". Real surveys of several thousand points will hit the same limit with no useful message. Set an explicit body limit that fits the largest real import and map parser errors to 413/400.
5. **Bad input is a 500 instead of a 400.** `GET /survey-projects/abc`, a non-numeric `project_id`, and coordinate rows with text in the Y/X columns all fail inside Postgres and surface as 500. They are safe from injection (the values are parameterised) but the caller is told the server broke. Validate ids and coordinates first.
6. **Nonsense geometry is accepted.** Coordinates of 9,000,000,000 and a two-point "polygon" were stored without complaint. Add plausibility checks (Zimbabwe Lo-zone range; at least 4 ring points).
7. **Load.** 60 simultaneous project-list calls: median 1.8 s, slowest 2.1 s, no errors. Acceptable for five users, but it grows with users; worth a look at the per-request schema set-up.
8. **GDAL engine is broken against the newly installed QGIS 4.2.3 (GDAL 3.13).** The legacy `renderEngine: 'gdal'` path runs `ogr2ogr -update -append` onto a file that does not exist yet, which the new GDAL refuses, so that path now returns 500. The app itself always sends `pdfkit`, so normal plan generation is unaffected, but the **backend default is still `gdal`** and discovery now prefers QGIS 4.2.3 over 3.44.15 for DXF/GeoPackage too. Change the default to `pdfkit` and test the DXF/GPKG conversions on 4.2.3 (the `dxf-gpkg` suite has not been run since it was installed).
9. **Anonymous `/api/test` answers 200** (known scaffold; also `/diagnostic` answers any signed-in user with internal module status). Remove or restrict.

## UI observations

- Sign-in form: the "Password" label is not tied to its field (the field's accessible name is its placeholder dots). Same for e-mail. Fix with `for`/`id`.
- A technician sees only Lite, Conversions, Topo, Eng, Mining, Settings, yet the dashboard shows her project with **Open →**, which lands in the generic Lite module with no sign of which project is open. Either hide the project cards for roles with no module that uses them, or show the project name in every module.
- Dashboard cards for a new user are otherwise clear; Logout sits top right at normal widths (the missing-Logout report from the user's wide, zoomed window was not reproduced; the ribbon's Sign out tile covers it).

## What held up

- Tenant isolation, role refusals, token forgery checks, duplicate-registration and case-clash checks, and wrong-password/unknown-user messages (identical, so no account enumeration).
- Re-importing the same points does not duplicate them.

## Fixed 27 October 2026 (findings 1-5 and 8)

Each fix has tests (`utils/__tests__/{loginThrottle,httpErrors,requestChecks}.test.js`, `routes/__tests__/simulationFixes.test.js`, one case in `geopdf-vector.warnings.test.js`). The simulation was re-run against the patched backend: **0 server errors in 167 requests** (was 6 of 170), and the account-lockout, duplicate-project and stack-trace notes no longer appear. Test accounts were removed again and the database matched its starting state.

1. **Password guessing:** `utils/loginThrottle.js`. 8 failures per account or 40 per address in 15 minutes returns 429 with `Retry-After`; unknown accounts count too; a correct sign-in clears the account. The sign-in page shows the server's sentence. In memory, per process.
2. **Duplicate projects:** `utils/projectNameLock.js` plus a name check in `POST /survey-projects`. A repeated name (any case, active projects only) is a 409 saying so; four simultaneous clicks make one project.
3. **Error bodies:** the five routes that put `stack`/`stderr`/`stdout` in a response no longer do, and `utils/httpErrors.js` strips those keys from every 4xx/5xx body as a backstop.
4. **Large and malformed requests:** body limit is now explicit (25 MB, was Fastify's 1 MB), an oversize body is a 413 that names the limit, bad JSON is a 400, a wrong media type is a 415. The 20,000-point import now succeeds (9 s).
5. **Bad input:** non-numeric project ids are a 400 (`survey-projects`, `coordinate-points`); coordinate rows with text or a blank name are a 400 naming each row ("Row 2 (B2): Y is not a number"); Postgres "wrong format" errors map to 400 without the database text.
8. **GDAL default:** `/geopdf/vector` now defaults to `pdfkit`. The `gdal` path still fails on GDAL 3.13 (QGIS 4.2.3) if asked for explicitly; the DXF/GeoPackage conversion suite passes on this machine.

Correction: the UI note about the sign-in labels was wrong. The labels are tied to their fields (`input.labels` confirms it); the accessibility tree I read listed the label and the field separately. Nothing to fix there.

### Second batch: findings 6 and 9

6. **Implausible geometry:** coordinate rows beyond 10 million metres (the largest any projected coordinate can be) are a 400 naming the row; parcel boundaries must be a closed Polygon/MultiPolygon with at least 4 numeric points per ring, checked on create, batch and edit (`describeGeometryProblems`). The limits are deliberately loose. Checked against the dev database first: all 975 stored parcels and 3,311 stored points pass, so no real workflow is refused.
9. **Scaffolding routes:** `testRoute.js` and `diagnostic.js` are unmounted (`UNMOUNTED_ROUTES`); both now answer 404. Nothing in the frontend called either. CLAUDE.md no longer lists `testRoute` as an open route.

Still open: 7 (60 simultaneous list calls take ~1.8 s), the technician-project dashboard question, and the in-process limits of the sign-in throttle and duplicate-name guard.
