import SurveyorProfile from '../models/SurveyorProfile.js'
import SurveyorLetterhead from '../models/SurveyorLetterhead.js'
import { authenticateWithSchema } from '../utils/schemaAuth.js'
import { cleanLetterheadText, parseLogoDataUrl, logoToDataUrl } from '../utils/letterhead.js'

/**
 * The signed-in surveyor's own letterhead: the firm identity at the top of the cover letter.
 *
 * Every route here acts on the CALLER'S profile and takes no profile id, so there is nothing to point at
 * someone else's: a surveyor edits their own letterhead, and only theirs. (The general profile routes in
 * surveyors.js are admin-only for writes; this is the self-service path for these fields.)
 *
 * The firm name, address and phone live on the profile; the tagline, e-mail, website and logo in
 * surveyor_letterheads. They are returned as one object.
 */
export default async function letterheadRoutes(fastify) {
  const guard = { preHandler: [fastify.authenticate, authenticateWithSchema] }

  const requireProfile = (request, reply) => {
    if (request.surveyorProfile?.id) return request.surveyorProfile.id
    reply.code(403).send({ ok: false, error: 'No surveyor profile', message: 'This needs a completed surveyor profile' })
    return null
  }

  const shape = (profile, row) => ({
    firm: profile?.firm ?? '',
    address: profile?.address ?? '',
    phone: profile?.phone ?? '',
    subtitle: row?.subtitle ?? '',
    email: row?.email ?? '',
    website: row?.website ?? '',
    logo: row?.logo
      ? { dataUrl: logoToDataUrl(row.logo, row.logo_mime), width: row.logo_width, height: row.logo_height }
      : null,
  })

  async function respond(profileId) {
    const [profile, row] = await Promise.all([SurveyorProfile.findById(profileId), SurveyorLetterhead.findByProfileId(profileId)])
    return { ok: true, letterhead: shape(profile, row) }
  }

  fastify.get('/surveyors/me/letterhead', guard, async (request, reply) => {
    const profileId = requireProfile(request, reply)
    if (!profileId) return
    reply.header('Cache-Control', 'no-store')
    return respond(profileId)
  })

  fastify.put('/surveyors/me/letterhead', guard, async (request, reply) => {
    const profileId = requireProfile(request, reply)
    if (!profileId) return
    const { values, error } = cleanLetterheadText(request.body)
    if (error) return reply.code(400).send({ ok: false, error })

    // Firm, address and phone belong to the profile; update takes COALESCE, so an absent one stays.
    const { firm, address, phone, subtitle, email, website } = values
    if (firm !== undefined || address !== undefined || phone !== undefined) {
      await SurveyorProfile.update(profileId, { firm, address, phone })
    }
    if (subtitle !== undefined || email !== undefined || website !== undefined) {
      await SurveyorLetterhead.saveText(profileId, { subtitle, email, website })
    }
    return respond(profileId)
  })

  fastify.put('/surveyors/me/letterhead/logo', guard, async (request, reply) => {
    const profileId = requireProfile(request, reply)
    if (!profileId) return
    const { logo, error } = parseLogoDataUrl(request.body?.dataUrl)
    if (error) return reply.code(400).send({ ok: false, error })
    await SurveyorLetterhead.saveLogo(profileId, logo)
    return respond(profileId)
  })

  fastify.delete('/surveyors/me/letterhead/logo', guard, async (request, reply) => {
    const profileId = requireProfile(request, reply)
    if (!profileId) return
    await SurveyorLetterhead.removeLogo(profileId)
    return respond(profileId)
  })
}
