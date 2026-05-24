-- Migration 083: Add whole_portion field to survey_projects
-- SI 727 Seventh Schedule (b): The figure description requires specifying whether
-- the survey covers "the whole", "the remainder", or "a portion" of the township/subdivision.
-- Values: 'the whole' | 'the remainder' | 'a portion'

ALTER TABLE survey_projects
  ADD COLUMN IF NOT EXISTS whole_portion TEXT DEFAULT 'the whole'
    CHECK (whole_portion IN ('the whole', 'the remainder', 'a portion'));
