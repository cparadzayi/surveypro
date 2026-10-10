# The non-owner runtime login

SurveyPro's server should not connect as the owner of its tables. An owner is not subject to row-level security, so any code that reached `survey.*` without stepping down to `surveypro_request` would run with every council's rows in reach, and nobody would notice. The server connects as a separate login that owns nothing instead (migration 104).

| | owner login (`surveypro_app`) | runtime login (`surveypro_runtime`) |
|---|---|---|
| used for | migrations, `cutover-*` and other operator scripts | the server, every request |
| setting | `DATABASE_URL` | `APP_DATABASE_URL` (the server prefers it, and falls back to `DATABASE_URL` when it is not set) |
| owns tables | yes | no |
| bypasses row-level security | no, but an owner is exempt from it | no, and cannot |
| tenant tables (`survey.survey_projects`, points, parcels, reviews, appointments) | all rights | **none of its own**: only by stepping down to `surveypro_request`, where the rules apply |
| ordinary tables of `public` (users, profiles, the spatial module, control points) | all rights | read and write |
| per-surveyor schemas (while `SURVEY_STORE=schema`) | all rights | read and write |
| `survey.authority`, `survey.launch_token_use` | all rights | read; record that a launch link was used |
| DDL, creating roles, schemas | yes | no |

The login is created **NOINHERIT**: it may step down to `surveypro_request` but does not inherit that role's rights, so it has no privilege of its own on the tenant tables. A route that forgets to step down is refused ("permission denied"), not silently served.

What needs owner power runs as the owner, in `SECURITY DEFINER` functions with a fixed search path: delivering a project (`survey.deliver_project`, `deliver_shared_project`), creating a surveyor's schema (`public.provision_surveyor_schema`, which also gives the calling login its rights on it), the QGIS project-view functions, and `survey.active_appointment(person, council, roles)` (the server's own appointment checks on a person's behalf). They take **who is asking as an argument**, which means they trust the caller to pass the signed-in person: the application server is that trust boundary, as VunGIS's system plane is.

## Setting it up

```
npm run migrate                                   # migration 104 (as the owner)
ADMIN_DATABASE_URL=<a Postgres administrator>  DATABASE_URL=<the owner>  node scripts/create-runtime-login.js            # dry run
ADMIN_DATABASE_URL=...                          DATABASE_URL=...          node scripts/create-runtime-login.js --apply    # create it, grant, write .env.runtime
node --env-file=.env.runtime scripts/verify-runtime-login.js                                                              # prove it
node --env-file=.env.runtime src/server.js                                                                                # run the server as it
```

The administrator creates the login and lets it step down to the request role; the owner issues the grants (so default privileges follow the objects the owner creates). The password is generated, written only to `.env.runtime` (git-ignored) and never printed. `--rotate` gives an existing login a new password. After a later migration adds tables to `public`, nothing needs doing: default privileges cover them.

## Proof

- `scripts/verify-runtime-login.js` connects as the login and checks: not a superuser, no bypass, no inheritance, owns nothing; **no privilege of its own on any tenant table** (the list is read from `tenancy.runtime_reach(login)`: only `survey.authority` and `survey.launch_token_use` may appear); refused on projects, points, parcels, reviews, appointments and the council views; sees nothing as a person with no projects once stepped down; allowed on the ordinary tables; refused DDL, roles, schemas and edits to the tenancy contract.
- Every cross-system scenario in VunGIS (`npm run test:cross-system`) now runs SurveyPro AS this login, and `runtime` is the scenario that runs the verification.
- `scripts/cutover-rehearsal.js` makes the login on the copy of the real database, verifies it, and reads the real surveyors' projects and points back through a real server in shared mode and in schema mode (the way back).
