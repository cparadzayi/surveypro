-- A surveyor's letterhead: the firm identity printed at the top of the cover letter.
--
-- Until now the firm name, tagline, phone, e-mail, website and address were typed into two Vue views, so
-- every surveyor's cover letter carried one firm's details, and there was nowhere for a logo.
--
-- Its own table, not columns on surveyor_profiles: the logo is an image, and the profile rows are read
-- with `SELECT p.*` by the directory, the supervisor lookups and auth. Putting up to 512 KB on every one
-- of those would send it to every caller on every request. The firm name, address and phone stay on
-- the profile, where they already are and where the rest of the app reads them.

CREATE TABLE IF NOT EXISTS surveyor_letterheads (
  surveyor_profile_id INTEGER PRIMARY KEY REFERENCES surveyor_profiles(id) ON DELETE CASCADE,
  subtitle   TEXT,
  email      TEXT,
  website    TEXT,
  logo       BYTEA,
  logo_mime  TEXT,
  logo_width  INTEGER,
  logo_height INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An image and its type travel together; the size cap is a backstop for the route's own check.
  CONSTRAINT surveyor_letterheads_logo_mime_check CHECK (logo_mime IS NULL OR logo_mime IN ('image/png', 'image/jpeg')),
  CONSTRAINT surveyor_letterheads_logo_pair_check CHECK ((logo IS NULL) = (logo_mime IS NULL)),
  CONSTRAINT surveyor_letterheads_logo_size_check CHECK (logo IS NULL OR octet_length(logo) <= 524288)
);
