# Cut-over to the shared store: plan and runbook

Moves SurveyPro from per-surveyor schemas (`SURVEY_STORE=schema`) to the shared tables (`SURVEY_STORE=shared`, migration 103). Background: `docs/AUTHORITY_TENANCY.md`. Everything below has been rehearsed on a copy of the SurveyPro database on this machine (`surveypro_app`); nothing has been run on the database itself.

## What was found (read-only, 2026-10-10)

| | |
|---|---|
| Migrations applied | through 095. 096-103 are pending |
| Roles | `surveypro_request` and `survey_reader` do not exist; the application login (`surveypro_app`) cannot create roles, so an administrator must |
| Per-surveyor schemas | `surveyor_surveyor_cparadzayi`: 6 projects, 2,947 points, 831 parcels (828 finalized), 17 adopted beacons, 7 imports. `surveyor_surveyor_demo`: empty |
| Not movable | `surveyor_finalize_test`: a surveyor profile ("Finalize Tester") whose schema has none of the tables. A leftover; `--skip` it, or fix the profile |
| Stray | `surveyor_surveyor_kuda`: a schema with no surveyor profile (8 tables, no projects). Not moved; keep or drop it |
| Launched projects | none: no project carries a council or a job, so nothing is council work yet |
| Existing objects changed by 096-103 | one check and a few grants: the check on `public.users.user_type` is widened to allow `authority_reviewer`, and the request role may read `public.users` (id, email only) and `public.zim_control_points`. Everything else is new schemas (`survey`, `survey_share`, `tenancy`, `app`) and roles |

## Decisions (made 2026-10-10)

1. **cparadzayi's six projects move as private practice.** No `--map`. They are visible only to their surveyor and can be handed to a council later (the council must first exist in `survey.authority`; step 8).
2. **`surveyor_finalize_test` is skipped, not deleted** (`--skip surveyor_finalize_test`). It is a leftover test profile ("Finalize Tester") whose schema has no tables, so there is nothing to move and nothing in it to lose; the shared store does not need a per-surveyor schema, so it harms nothing. Deleting a profile is irreversible and gains nothing now: remove it when the per-surveyor schemas are retired, after a fresh backup.
3. **`surveyor_surveyor_kuda`** (no profile, no projects): left alone. The cut-over ignores it.
4. **This is the only SurveyPro database.** There is no second deployment to repeat this on.
5. **Project ids change** (a project's id in the shared tables is not its id in the private schema; `legacy_schema` / `legacy_id` record which is which). Anyone with a project open must reopen it.

## Rehearsal (repeat it any time; it only reads the real database)

```
SURVEYPRO_SOURCE_ENV=<env file holding the real DATABASE_URL> REHEARSAL_ADMIN_URL=<administrator URL, same server> \
  node scripts/cutover-rehearsal.js --skip surveyor_finalize_test [--map surveyor_x=CODE:employed]
```

It copies the database (as the administrator, read-only) into a throw-away one, creates the two roles, applies 096-103 as the application login, runs the cut-over exactly as below, and checks: no tenancy violations; counts equal; each person, through the request role, sees their own work and only that; a second run copies nothing; and a real SurveyPro server in shared mode returns each person's projects and points through its API. Then it drops the copy, the roles it made and the dump file.

**Result (2026-10-10, with the decisions above): passed, including the runtime login (a real server as the non-owner login, in shared mode and in schema mode).** 096-104 applied cleanly on the real data; 6 projects, 2,947 points and 831 parcels moved with counts matching; user 3 saw exactly 6, 2,947 and 831 and a stranger saw nothing; the API listed the six projects and returned all 2,947 points.

## The day

Allow an hour; the move itself takes seconds at this size. Nobody should be working in SurveyPro (their work is copied at one moment).

1. **Stop SurveyPro** (the backend), so nothing changes while it is copied.
2. **Back up the whole database** and prove the backup is readable:
   ```
   pg_dump -Fc -h localhost -U <administrator> -d surveypro_app -f surveypro_app-before-cutover.dump
   pg_restore -l surveypro_app-before-cutover.dump | head
   ```
   Keep the file somewhere other than the database's disk. This is the only way back from a mistake in step 4; steps 5-7 are undone by setting `SURVEY_STORE=schema`.
3. **Create the two group roles, once, as an administrator** (the application login cannot; the runtime login itself is made in step 4):
   ```sql
   CREATE ROLE surveypro_request NOLOGIN;  GRANT surveypro_request TO surveypro_app;
   CREATE ROLE survey_reader NOLOGIN;
   ```
4. **Apply the migrations** (096-104): `npm run migrate` in `app-backend`. Check `npm run migrate:status`, then `select * from tenancy.violations;` must return no rows.
   **Then create the runtime login** (docs/RUNTIME_LOGIN.md): `create-runtime-login.js --apply` with an administrator and the owner, then `node --env-file=.env.runtime scripts/verify-runtime-login.js` must say ALL OK. The server is started with `.env.runtime` from step 7; the owner login stays for migrations and the scripts in these steps.
5. **Preflight**: `node scripts/cutover-preflight.js`. The only blocker left should be the incomplete `surveyor_finalize_test`, which decision 2 acknowledges (the skip is given to the cut-over in the next step). Anything else: stop and look.
6. **Dry run**, then apply, with the decisions above:
   ```
   node scripts/cutover-to-shared.js --skip surveyor_finalize_test
   node scripts/cutover-to-shared.js --apply --skip surveyor_finalize_test
   ```
   Each schema prints `verified: counts match`. Anything else: stop, do not switch. (No `--map`: the work moves as private practice, decision 1.)
7. **Switch**: set `SURVEY_STORE=shared` in SurveyPro's environment and start it **as the runtime login** (`node --env-file=.env.runtime src/server.js`). Smoke test, signed in as a surveyor: the project list shows their projects (the same six for cparadzayi, 2,947 points between them), a project opens, points load, the Deliver screen opens.
8. **Set up councils** (only when there is one): as an administrator, `INSERT INTO survey.authority (code, name, kind)` for the council (the code is the one VunGIS uses), appoint its first head surveyor in `survey.authority_member` (everything after is done through the Appointments screen), and make its reader login with `node scripts/create-authority-reader.js --authority CODE --apply`. To launch jobs from VunGIS, set `VUNGIS_LAUNCH_PUBLIC_KEY`.
9. **Watch** the first day: failed requests (a 403 means the database refused; check the appointment), and `select * from tenancy.violations;` stays empty.

## Rolling back

- **Before the switch (steps 1-6):** nothing to undo for users. The private schemas are untouched. To remove what was added, restore the step-2 backup.
- **After the switch:** set `SURVEY_STORE=schema` and restart. Everyone is back on their private schemas exactly as they were at step 1. **Work done on the shared store since the switch is not copied back**: weigh that before rolling back late. If the work done since matters, keep going forward and fix the problem instead.
- The widened `user_type` check is harmless to leave in place.

## Afterwards (not part of the day)

Retire the per-surveyor schemas and registration's schema creation only once the shared store has run long enough to trust, and only after a fresh backup. Until then they are the way back.
