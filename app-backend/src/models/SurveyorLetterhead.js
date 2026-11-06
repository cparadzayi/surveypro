import db from '../config/db.js'

/** A surveyor's letterhead: tagline, e-mail, website and logo. The firm, address and phone are on the profile. */
class SurveyorLetterhead {
  static async findByProfileId(profileId) {
    const result = await db.query('SELECT * FROM surveyor_letterheads WHERE surveyor_profile_id = $1', [profileId])
    return result.rows[0] ?? null
  }

  /** Sets the given text fields (subtitle, email, website); the others, and the logo, are left alone. */
  static async saveText(profileId, { subtitle, email, website }) {
    const result = await db.query(
      `INSERT INTO surveyor_letterheads (surveyor_profile_id, subtitle, email, website)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (surveyor_profile_id) DO UPDATE
         SET subtitle = COALESCE($2, surveyor_letterheads.subtitle),
             email    = COALESCE($3, surveyor_letterheads.email),
             website  = COALESCE($4, surveyor_letterheads.website),
             updated_at = now()
       RETURNING *`,
      [profileId, subtitle ?? null, email ?? null, website ?? null]
    )
    return result.rows[0]
  }

  static async saveLogo(profileId, { bytes, mime, width, height }) {
    const result = await db.query(
      `INSERT INTO surveyor_letterheads (surveyor_profile_id, logo, logo_mime, logo_width, logo_height)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (surveyor_profile_id) DO UPDATE
         SET logo = $2, logo_mime = $3, logo_width = $4, logo_height = $5, updated_at = now()
       RETURNING *`,
      [profileId, bytes, mime, width, height]
    )
    return result.rows[0]
  }

  static async removeLogo(profileId) {
    await db.query(
      `UPDATE surveyor_letterheads
          SET logo = NULL, logo_mime = NULL, logo_width = NULL, logo_height = NULL, updated_at = now()
        WHERE surveyor_profile_id = $1`,
      [profileId]
    )
  }
}

export default SurveyorLetterhead
