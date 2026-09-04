import { describe, it, expect } from 'vitest'
import {
  buildWorkingPlanSpec,
  beaconSymbol,
  ringNames,
  workingPlanTitle,
  workingPlanEmptyReason,
  insetSymbolFor,
} from '../workingPlanSpec'

/** Beacons as exportBeaconsAsGeoJSON emits them: coordinates are [Y, X]. */
function beaconFC(
  points: Array<{ name: string; y: number; x: number; description?: string }>,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map(p => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.y, p.x] },
      properties: { name: p.name, description: p.description ?? '', y: p.y, x: p.x },
    })),
  }
}

const coordinateList = beaconFC([
  { name: 'SD4', y: -85673.91, x: 2144027.08, description: '12mm iron peg in concrete' },
  { name: 'SD5', y: -85710.12, x: 2144063.20, description: '12mm iron peg in concrete' },
  { name: 'SD6', y: -85723.41, x: 2144076.45, description: '12mm iron peg in concrete' },
  { name: 'SD3', y: -85682.55, x: 2144117.40, description: '12mm iron peg in concrete' },
  { name: 'RM16', y: -85623.81, x: 2144100.66, description: 'Reference mark' },
  { name: '49/T', y: -88454.0, x: 2146860.0, description: 'Trig beacon' },
])

const parcel = (stand: string, ids: string[]) => ({
  stand,
  metadata: { cape_lo_points: ids.map(id => ({ id, y: 0, x: 0, status: 'P', description: '' })) },
})

const ctx = (overrides: Record<string, any> = {}) => ({
  beacons: coordinateList,
  parcels: [parcel('404', ['SD4', 'SD5', 'SD6', 'SD3'])],
  projectInfo: { designation: 'Stands 403-405 Brackenhurst Township' },
  config: { surveyorName: 'A. Surveyor', surveyDate: '2026-07-15' },
  ...overrides,
})

describe('ringNames', () => {
  it('reads the ring straight off cape_lo_points, in order', () => {
    expect(ringNames(parcel('404', ['SD4', 'SD5', 'SD6']))).toEqual(['SD4', 'SD5', 'SD6'])
  })

  it('drops a duplicated closing vertex', () => {
    // geom carries a closing duplicate; cape_lo_points normally does not. If one
    // slips in, the module would draw the first leg twice.
    expect(ringNames(parcel('404', ['SD4', 'SD5', 'SD6', 'SD4']))).toEqual(['SD4', 'SD5', 'SD6'])
  })

  it('returns nothing for a parcel with no cape_lo_points', () => {
    // QGIS-imported parcels have none. Better an empty ring the caller can
    // report than a ring guessed by proximity.
    expect(ringNames({ stand: '404', metadata: {} })).toEqual([])
    expect(ringNames({ stand: '404' })).toEqual([])
  })

  it('returns nothing for a ring too short to be a polygon', () => {
    expect(ringNames(parcel('404', ['SD4', 'SD5']))).toEqual([])
  })

  it('returns nothing when any vertex has no name', () => {
    const p = { stand: '404', metadata: { cape_lo_points: [{ id: 'SD4' }, { id: '' }, { id: 'SD6' }] } }
    expect(ringNames(p)).toEqual([])
  })

  it('rejects a ring that is really just two distinct points with a closing duplicate', () => {
    // Three raw vertices, but 'A' repeats: only two distinct points, which is
    // not a polygon. Popping the duplicate must not leave a false 3-point ring.
    expect(ringNames(parcel('404', ['A', 'B', 'A']))).toEqual([])
  })
})

describe('beaconSymbol', () => {
  it('reads the description, since status says found-or-placed, not what kind', () => {
    expect(beaconSymbol('12mm iron peg in concrete')).toBe('peg')
    expect(beaconSymbol('Reference mark')).toBe('rm')
    expect(beaconSymbol('RM 16')).toBe('rm')
    expect(beaconSymbol('Trig beacon')).toBe('trig')
    expect(beaconSymbol('trigonometrical station')).toBe('trig')
  })

  it('falls back to peg for anything it does not recognise', () => {
    // Drawing a peg for an unknown description is a smaller lie than promoting
    // it to a trig station on a guess.
    expect(beaconSymbol('')).toBe('peg')
    expect(beaconSymbol(null)).toBe('peg')
    expect(beaconSymbol(undefined)).toBe('peg')
    expect(beaconSymbol('something nobody wrote a rule for')).toBe('peg')
  })
})

describe('workingPlanTitle', () => {
  it('builds up to four heading lines', () => {
    const t = workingPlanTitle({
      designation: 'Stands 403-405 Brackenhurst Township',
      parentProperty: 'Stand 87 Brackenhurst Township',
      district: 'Gwelo',
    })
    expect(t).toEqual([
      'Survey of',
      'Stands 403-405 Brackenhurst Township',
      'of Stand 87 Brackenhurst Township',
      'Gwelo District',
    ])
  })

  it('omits the lines it has no data for', () => {
    expect(workingPlanTitle({ designation: 'Stand 405' })).toEqual(['Survey of', 'Stand 405'])
  })

  it('never exceeds the four lines the module accepts', () => {
    const t = workingPlanTitle({
      designation: 'A', parentProperty: 'B', district: 'C', township: 'D', surveyOf: 'E',
    })
    expect(t.length).toBeLessThanOrEqual(4)
  })
})

describe('buildWorkingPlanSpec', () => {
  it('maps the ring to beacon names in order', () => {
    const { spec } = buildWorkingPlanSpec(ctx())
    expect(spec.parcels).toEqual([{ label: '404', ring: ['SD4', 'SD5', 'SD6', 'SD3'] }])
  })

  it('reads X and Y off the GeoJSON the right way round', () => {
    // The feature's coordinates are [Y, X]; the module wants X and Y named.
    // Swapping them puts the plan on the other side of the planet.
    const { spec } = buildWorkingPlanSpec(ctx())
    const sd4 = spec.beacons.find(b => b.name === 'SD4')!
    expect(sd4.X).toBeCloseTo(2144027.08, 2)
    expect(sd4.Y).toBeCloseTo(-85673.91, 2)
  })

  it('emits a shared beacon once, referenced from both rings', () => {
    const { spec } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'SD6']), parcel('403', ['SD5', 'SD6', 'SD3'])],
    }))
    expect(spec.beacons.filter(b => b.name === 'SD5')).toHaveLength(1)
    expect(spec.parcels[0].ring).toContain('SD5')
    expect(spec.parcels[1].ring).toContain('SD5')
  })

  it('leaves out coordinate-list points that no ring names', () => {
    // Control and reference points belong in the coordinate list, but putting
    // them on the sheet would stretch the extent and shrink the figure.
    const { spec } = buildWorkingPlanSpec(ctx())
    expect(spec.beacons.map(b => b.name)).not.toContain('49/T')
    expect(spec.beacons.map(b => b.name)).not.toContain('RM16')
  })

  it('carries the symbol through from each beacon description', () => {
    const { spec } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'RM16'])],
    }))
    expect(spec.beacons.find(b => b.name === 'SD4')!.symbol).toBe('peg')
    expect(spec.beacons.find(b => b.name === 'RM16')!.symbol).toBe('rm')
  })

  it('skips a parcel with no named ring and says which one', () => {
    const { spec, skippedParcels } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'SD6']), { stand: '999', metadata: {} }],
    }))
    expect(spec.parcels.map(p => p.label)).toEqual(['404'])
    expect(skippedParcels).toEqual(['999'])
  })

  it('skips a parcel whose ring names a point the coordinate list does not have', () => {
    // Reaching the backend with this would earn a 400. Catching it here lets
    // the rest of the plan still draw, and names the parcel at fault.
    const { spec, skippedParcels } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'SD6']), parcel('403', ['SD3', 'SD6', 'GONE'])],
    }))
    expect(spec.parcels.map(p => p.label)).toEqual(['404'])
    expect(skippedParcels).toEqual(['403'])
  })

  it('asks the module to choose the scale', () => {
    expect(buildWorkingPlanSpec(ctx()).spec.scale).toBe('auto')
  })

  it('builds the certificate from the surveyor and survey date', () => {
    const { spec } = buildWorkingPlanSpec(ctx())
    expect(spec.certificate.line1).toBe('Surveyed in July 2026 by me,')
    expect(spec.certificate.line2).toBe('A. Surveyor, Land Surveyor')
  })

  it('still produces a usable certificate with no surveyor or date', () => {
    const { spec } = buildWorkingPlanSpec(ctx({ config: {} }))
    expect(spec.certificate.line1).toBe('Surveyed by me,')
    expect(spec.certificate.line2).toBe('Land Surveyor')
  })

  it('renders a first-of-month survey date in the correct month regardless of local timezone', () => {
    // new Date('2026-07-01') is UTC midnight; a negative-offset local timezone
    // rendering that without pinning timeZone: 'UTC' would print June, not July.
    const { spec } = buildWorkingPlanSpec(ctx({
      config: { surveyorName: 'A. Surveyor', surveyDate: '2026-07-01' },
    }))
    expect(spec.certificate.line1).toBe('Surveyed in July 2026 by me,')
  })
})

describe('buildWorkingPlanSpec — Outside Figure', () => {
  // The Outside Figure carries a named ring like any other parcel (SD4/SD5/
  // SD6/SD3 all resolve), so nothing about ringNames() rejects it -- it must
  // be excluded explicitly, by id, via outsideFigureId.
  const outsideFigure = {
    id: 'of-1',
    stand: 'Outside Figure',
    metadata: { cape_lo_points: ['SD4', 'SD5', 'SD6', 'SD3'].map(id => ({ id, y: 0, x: 0, status: 'P', description: '' })) },
  }

  it('excludes the Outside Figure parcel from both spec.parcels and skippedParcels when outsideFigureId is set', () => {
    const { spec, skippedParcels } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'SD6']), outsideFigure],
      outsideFigureId: outsideFigure.id,
    }))
    expect(spec.parcels.map(p => p.label)).toEqual(['404'])
    expect(skippedParcels).toEqual([])
  })

  it('leaves the Outside Figure parcel in place when no outsideFigureId is supplied', () => {
    const { spec, skippedParcels } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'SD6']), outsideFigure],
    }))
    expect(spec.parcels.map(p => p.label)).toEqual(['404', 'Outside Figure'])
    expect(skippedParcels).toEqual([])
  })
})

/**
 * The guard that fires when nothing can be drawn used to say one fixed thing:
 * "run Compute Area & Consistency so each parcel stores its beacon names."
 *
 * On the real project that first hit it, that advice was wrong. The parcels DID
 * store their beacon names — all three of them, correctly. What was missing was
 * the coordinate list, cleared by a CSV-import reset and never re-imported. The
 * surveyor was sent to recompute areas that were already fine, and the actual
 * fix (re-import in Step 2) was never mentioned.
 *
 * These cases are distinguishable from what the adapter already computes, so
 * the message has no excuse to guess.
 */
describe('workingPlanEmptyReason', () => {
  it('blames the empty coordinate list, not the parcels, when no beacons loaded', () => {
    // The real project-20 case: rings are named and correct, the list is gone.
    const result = buildWorkingPlanSpec(ctx({
      beacons: { type: 'FeatureCollection', features: [] },
      parcels: [parcel('403', ['87D', 'SD2', 'SD3']), parcel('404', ['86C', 'SD3', 'SD4'])],
    }))
    expect(result.spec.parcels).toEqual([])
    expect(result.beaconCount).toBe(0)

    const msg = workingPlanEmptyReason(result)
    expect(msg).toMatch(/coordinate list/i)
    expect(msg).toMatch(/Step 2/)
    expect(msg).not.toMatch(/Compute Area/i)
  })

  it('names the specific boundary points the coordinate list is missing', () => {
    const result = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'GONE1']), parcel('403', ['SD3', 'SD6', 'GONE2'])],
    }))
    expect(result.spec.parcels).toEqual([])
    expect(result.missingBeacons).toEqual(['GONE1', 'GONE2'])

    const msg = workingPlanEmptyReason(result)
    expect(msg).toContain('GONE1')
    expect(msg).toContain('GONE2')
    expect(msg).not.toMatch(/Compute Area/i)
  })

  it('caps a long missing-point list instead of pasting fifty names into an alert', () => {
    const many = Array.from({ length: 20 }, (_, i) => `M${i + 1}`)
    const result = buildWorkingPlanSpec(ctx({ parcels: [parcel('404', many)] }))

    const msg = workingPlanEmptyReason(result)
    expect(msg).toContain('M1')
    expect(msg).toMatch(/\d+ more/)
    expect(msg).not.toContain('M20')
  })

  it('sends the surveyor to Compute Area & Consistency only when rings are genuinely unnamed', () => {
    // The one case the old message was actually right about.
    const result = buildWorkingPlanSpec(ctx({
      parcels: [{ stand: '404', metadata: {} }, { stand: '403', metadata: {} }],
    }))
    expect(result.parcelsWithoutNamedRing).toEqual(['404', '403'])

    const msg = workingPlanEmptyReason(result)
    expect(msg).toMatch(/Compute Area/i)
    expect(msg).not.toMatch(/coordinate list is empty/i)
  })

  it('explains a project whose only parcel is the Outside Figure', () => {
    // Nothing failed: there is simply no stand to draw. Saying "no parcel
    // stores its beacon names" here would be a third wrong answer.
    const of = {
      id: 99, stand: 'Outside Figure',
      metadata: { cape_lo_points: ['SD4', 'SD5', 'SD6'].map(id => ({ id, y: 0, x: 0 })) },
    }
    const result = buildWorkingPlanSpec(ctx({ parcels: [of], outsideFigureId: 99 }))
    expect(result.spec.parcels).toEqual([])
    expect(result.skippedParcels).toEqual([])

    const msg = workingPlanEmptyReason(result)
    expect(msg).toMatch(/Outside Figure/)
    expect(msg).not.toMatch(/Compute Area/i)
  })

  it('still reports the beacon count when the plan builds fine', () => {
    const result = buildWorkingPlanSpec(ctx())
    expect(result.spec.parcels).toHaveLength(1)
    expect(result.beaconCount).toBe(6)
    expect(result.missingBeacons).toEqual([])
  })
})

/**
 * The locality inset shows the national control the survey was tied to. Its
 * source is the imported GNSS calibration report, because those pairs ARE the
 * control the surveyor observed -- not a proximity search of the registry,
 * which would show trigs the survey never used.
 */
const calibration = (ids: Array<[string, number, number]>) => ({
  pairs: ids.map(([pointId, controlNorthing, controlEasting]) => ({
    pointId, controlNorthing, controlEasting,
  })),
})

/** The four control points from the Brackenhurst calibration report. */
const brackenhurstControl = calibration([
  ['170/P', 2136777.89, -81572.33],
  ['176/P', 2149103.82, -71089.60],
  ['49/T',  2146857.23, -88454.47],
  ['50/T',  2151238.71, -88963.45],
])

describe('insetSymbolFor', () => {
  it('reads the Zimbabwe control designation suffix', () => {
    // Primary, Secondary, Tertiary, Quaternary are all trigonometrical stations.
    expect(insetSymbolFor('170/P')).toBe('trig')
    expect(insetSymbolFor('314/S')).toBe('trig')
    expect(insetSymbolFor('49/T')).toBe('trig')
    expect(insetSymbolFor('88/Q')).toBe('trig')
    expect(insetSymbolFor('50/t')).toBe('trig')
  })

  it('treats anything without that suffix as a reference mark', () => {
    // BASE and RM7 in the reference sheet are local marks, not trig stations.
    expect(insetSymbolFor('BASE')).toBe('rm')
    expect(insetSymbolFor('RM7')).toBe('rm')
    expect(insetSymbolFor('TSM5168')).toBe('rm')
    expect(insetSymbolFor('')).toBe('rm')
  })
})

describe('buildWorkingPlanSpec — locality inset', () => {
  it('omits the inset entirely when no calibration was imported', () => {
    // An empty inset box would be worse than none: it asserts there was no
    // control, rather than that we do not know what it was.
    expect(buildWorkingPlanSpec(ctx()).spec.inset).toBeUndefined()
    expect(buildWorkingPlanSpec(ctx({ calibration: { pairs: [] } })).spec.inset).toBeUndefined()
  })

  it('carries every control point from the calibration report', () => {
    const { spec } = buildWorkingPlanSpec(ctx({ calibration: brackenhurstControl }))
    const names = spec.inset!.beacons.map(b => b.name)
    expect(names).toEqual(expect.arrayContaining(['170/P', '176/P', '49/T', '50/T']))
  })

  it('keeps the control coordinates the same way round as the main figure', () => {
    const { spec } = buildWorkingPlanSpec(ctx({ calibration: brackenhurstControl }))
    const t = spec.inset!.beacons.find(b => b.name === '50/T')!
    expect(t.X).toBeCloseTo(2151238.71, 2)   // northing
    expect(t.Y).toBeCloseTo(-88963.45, 2)    // easting
    expect(t.symbol).toBe('trig')
  })

  it('adds the survey itself, or the inset shows control and no job', () => {
    const { spec } = buildWorkingPlanSpec(ctx({ calibration: brackenhurstControl }))
    const site = spec.inset!.beacons.find(b => b.name === 'SITE')
    expect(site).toBeDefined()
    // The figure centroid: the fixture's four beacons average here.
    expect(site!.X).toBeCloseTo(2144071.03, 0)
    expect(site!.Y).toBeCloseTo(-85697.50, 0)
  })

  it('computes a scale that fits the spread rather than hardcoding one', () => {
    const wide = buildWorkingPlanSpec(ctx({ calibration: brackenhurstControl }))
    expect(wide.spec.inset!.scale).toBe(200000)   // ~20 km spread, as the reference sheet used

    const tight = buildWorkingPlanSpec(ctx({
      calibration: calibration([['1/T', 2144200, -85800], ['2/T', 2145000, -86400]]),
    }))
    expect(tight.spec.inset!.scale).toBeLessThan(200000)
  })

  it('does not let the inset disturb the main figure', () => {
    const without = buildWorkingPlanSpec(ctx())
    const with_ = buildWorkingPlanSpec(ctx({ calibration: brackenhurstControl }))
    expect(with_.spec.parcels).toEqual(without.spec.parcels)
    expect(with_.spec.beacons).toEqual(without.spec.beacons)
  })
})

/**
 * Beacon kind now comes from the CSV status code where the surveyor supplied
 * one. That is a better source than the free-text description, which was only
 * ever a guess: RM15 and RM16 are reference marks because the surveyor said
 * RM, not because someone wrote "reference mark" in the notes.
 *
 * Status codes: F fixed/control, P peg, TRIG trigonometrical station,
 * RM reference mark, WS working station.
 */
const beaconFCWithStatus = (
  points: Array<{ name: string; y: number; x: number; status?: string; description?: string }>,
): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: points.map(p => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [p.y, p.x] },
    properties: { name: p.name, status: p.status ?? '', description: p.description ?? '' },
  })),
})

describe('beaconSymbol — status takes precedence over description', () => {
  it('honours an explicit RM status, whatever the description says', () => {
    expect(beaconSymbol('12mm iron peg in concrete', 'RM')).toBe('rm')
    expect(beaconSymbol('', 'rm')).toBe('rm')
  })

  it('honours an explicit TRIG status', () => {
    expect(beaconSymbol('', 'TRIG')).toBe('trig')
    expect(beaconSymbol('', 'trig')).toBe('trig')
  })

  it('draws a working station as a reference mark for now', () => {
    // The reference sheet draws BASE -- a working station -- with the
    // reference-mark symbol. Whether SI 727's Fifth Schedule prescribes a
    // distinct symbol is not yet settled, so this deliberately does not invent
    // one.
    expect(beaconSymbol('', 'WS')).toBe('rm')
    expect(beaconSymbol('', 'ws')).toBe('rm')
  })

  it('falls back to the description when status says nothing about kind', () => {
    // F (fixed/control) and P (peg) predate these codes and are left alone, so
    // existing plans render exactly as before.
    expect(beaconSymbol('Reference mark', 'F')).toBe('rm')
    expect(beaconSymbol('12mm iron peg in concrete', 'P')).toBe('peg')
    expect(beaconSymbol('Trig beacon', '')).toBe('trig')
    expect(beaconSymbol('12mm iron peg', undefined)).toBe('peg')
  })
})

describe('buildWorkingPlanSpec — status-driven symbols', () => {
  it('marks RM15 and RM16 as reference marks from their status alone', () => {
    const { spec } = buildWorkingPlanSpec(ctx({
      beacons: beaconFCWithStatus([
        { name: 'RM15', y: -85643.50, x: 2144120.41, status: 'RM', description: '' },
        { name: 'RM16', y: -85623.81, x: 2144100.66, status: 'rm', description: '' },
        { name: 'BASE', y: -85778.60, x: 2144038.34, status: 'WS', description: '' },
        { name: 'SD4',  y: -85673.91, x: 2144027.08, status: 'P', description: '12mm iron peg' },
      ]),
      parcels: [parcel('404', ['RM15', 'RM16', 'BASE', 'SD4'])],
    }))
    const symbolOf = (n: string) => spec.beacons.find(b => b.name === n)!.symbol
    expect(symbolOf('RM15')).toBe('rm')
    expect(symbolOf('RM16')).toBe('rm')
    expect(symbolOf('BASE')).toBe('rm')
    expect(symbolOf('SD4')).toBe('peg')
  })
})
