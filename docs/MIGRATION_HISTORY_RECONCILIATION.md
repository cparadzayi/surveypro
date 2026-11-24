# Migration history reconciliation (24 November 2026)

`nov-alpha` is the single product branch. The database had already applied nine
migrations whose files were unavailable on this branch: `096`–`100` were present
but with different content, and `101`–`104` were absent. `npm run migrate:status`
therefore exited non-zero with five `MODIFIED AFTER APPLYING` and four
`FILE MISSING` entries.

This was a one-time repository-side reconciliation. The nine files were copied
byte-for-byte from the archived `beta-vungis` worktree into
`app-backend/migrations/`, preserving line endings. Their SHA-256 hashes match
the `migrations_history.checksum` values recorded in the database:

| Migration | SHA-256 |
|---|---|
| `096_authority_tenancy_foundation.do.sql` | `96d43c0e5510a5cd3863598697fdcc1715429e8864f414f9dd4f04f74d8153ff` |
| `097_survey_shared_tables.do.sql` | `aa52804c9ffbce843adfbb2abce9582132637c10157df57d6abf302c3cba3f13` |
| `098_survey_adopt_schema.do.sql` | `449906f8c9b7a33476a3d1c3c98b45ae7d9bbc8ea7f9c728842ca2c42ec3f561` |
| `099_authority_share_views.do.sql` | `b9287735f3bc5dab7bc8df5540887a342e43edfb9d3920a666fee7715bb283cf` |
| `100_launch_tokens.do.sql` | `93032e0e5a5fc894f7be11ed998842c8a16805fb69ba9bfd8ca07cf237c8c2a1` |
| `101_survey_class.do.sql` | `66200438d5cd0ef1db4f04d0f71d40d914edb08e7235faab4cd750c203432604` |
| `102_delivery_review.do.sql` | `8807e18c383deb6f0d742945839f63e010d0d5fdb41a6d9eb42ea20e5a295db7` |
| `103_application_switch.do.sql` | `03416432889dbddc8a99b62d87385015ae8f5b8bf3256c643eb56cfdea605071` |
| `104_runtime_login.do.sql` | `fb30907216712ef623e05da689efc30f6bc0262fc29c1c9b69ca601e6db4681d` |

No database rows or checksums were changed. `nov-alpha`'s own `094`, `095` and
`105`–`109` were left untouched.

The migration runner hashes raw file bytes, not Git-normalised text. `.gitattributes`
now pins the line endings of every checksummed migration: `096`–`100` must be
CRLF, the rest (`094`, `095`, `101`–`109`) must be LF. Without those rules, a
fresh checkout on a machine with a different `core.autocrlf` setting would
change the bytes and recreate the drift even though Git sees no content change.

Verified afterwards from `app-backend`:

- `npm run migrate:status` — exit 0, no drift, no pending files.
- `npm run migrate` — "All migrations already applied - database is up to date".
  Its `applied without a recorded checksum` lines are the expected historical
  rows from before checksums were introduced.

These nine files are now applied history. **Do not edit them.** Any schema
change goes in a new numbered migration, as usual. They are retained here so
`migrate:status` remains trustworthy; the product itself stays on `nov-alpha`
and does not use the beta-era shared store or council screens unless those are
explicitly ported as new work.
