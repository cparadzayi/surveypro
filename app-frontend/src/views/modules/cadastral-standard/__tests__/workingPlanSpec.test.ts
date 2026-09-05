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
      'WORKING PLAN OF',
      'Stands 403-405 Brackenhurst Township',
      'of Stand 87 Brackenhurst Township',
      'Gwelo District',
    ])
  })

  it('omits the lines it has no data for', () => {
    expect(workingPlanTitle({ designation: 'Stand 405' })).toEqual(['WORKING PLAN OF', 'Stand 405'])
  })

  it('names the document, so the sheet is not mistaken for a survey record', () => {
    expect(workingPlanTitle({ designation: 'Stand 405' })[0]).toBe('WORKING PLAN OF')
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

  it('draws every point in the final coordinate list, not only ring vertices', () => {
    // The working plan is what the surveyor works from, so it shows the whole
    // computed coordinate list -- reference marks and control included, not
    // just the parcel corners. The renderer takes the figure extent from ring
    // vertices alone, so the extra points cannot shrink the figure.
    const { spec } = buildWorkingPlanSpec(ctx())
    const names = spec.beacons.map(b => b.name)
    expect(names).toEqual(expect.arrayContaining(['SD4', 'SD5', 'SD6', 'SD3', 'RM16', '49/T']))
  })

  it('still emits each point once when it is both a ring vertex and in the list', () => {
    const { spec } = buildWorkingPlanSpec(ctx())
    expect(spec.beacons.filter(b => b.name === 'SD4')).toHaveLength(1)
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

  it('never puts the surveyor name on the sheet, matching the diagram', () => {
    // The diagram renderer signs "Land Surveyor" with no name; the working plan
    // does the same. The name is on the certificate the surveyor signs, not
    // pre-printed by us.
    const { spec } = buildWorkingPlanSpec(ctx())
    expect(spec.certificate.line1).toBe('Surveyed in July 2026 by me,')
    expect(spec.certificate.line2).toBe('Land Surveyor')
    expect(JSON.stringify(spec)).not.toContain('A. Surveyor')
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

  it('recognises it by name even without the outsideFigureId', () => {
    // Superseded: this used to assert the opposite. Real data designates the
    // remainder "REM" and never sets the flag, so it was drawn as an ordinary
    // stand with a solid boundary. The name alone now identifies it.
    const { spec, skippedParcels } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'SD6']), outsideFigure],
    }))
    expect(spec.parcels.map(p => p.label)).toEqual(['404'])
    expect(spec.remainderLabel).toBe('REM')
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

  it('marks the site with a real station from inside it', () => {
    // Superseded: this was a synthetic 'SITE' point at the figure centroid. The
    // inset now shows an actual beacon, with its own name and sign, as the
    // reference sheet does with BASE.
    const { spec } = buildWorkingPlanSpec(ctx({ calibration: brackenhurstControl }))
    const names = spec.inset!.beacons.map(b => b.name)
    expect(names).not.toContain('SITE')
    // one entry beyond the four control points, drawn from the figure
    expect(spec.inset!.beacons).toHaveLength(5)
    expect(['SD4', 'SD5', 'SD6', 'SD3']).toContain(names[names.length - 1])
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
 * Status codes: F found, P placed, TRIG trigonometrical station,
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

  it('gives a survey station its own sign, marked and unmarked', () => {
    // Fifth Schedule: marked is a circle with a filled centre, unmarked a
    // filled dot. They are different signs, so WS and WSU are different codes.
    expect(beaconSymbol('', 'WS')).toBe('ws')
    expect(beaconSymbol('', 'ws')).toBe('ws')
    expect(beaconSymbol('', 'WSU')).toBe('wsu')
  })

  it('distinguishes a found beacon adopted from one not adopted', () => {
    // Concentric circles, and the same struck through. Drawing a rejected
    // beacon as an adopted one would misstate what the survey relied on.
    expect(beaconSymbol('', 'F')).toBe('found')
    expect(beaconSymbol('', 'FN')).toBe('foundNotAdopted')
  })

  it('maps placed beacons, trig stations and official control points', () => {
    expect(beaconSymbol('', 'P')).toBe('placed')
    expect(beaconSymbol('', 'TRIG')).toBe('trig')
    expect(beaconSymbol('', 'OCP')).toBe('ocp')
  })

  it('falls back to the description only when there is no status', () => {
    expect(beaconSymbol('Reference mark', '')).toBe('rm')
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
    expect(symbolOf('BASE')).toBe('ws')     // a working station, not a reference mark
    expect(symbolOf('SD4')).toBe('placed')
  })
})

/**
 * Surrounding properties come from the sides the surveyor tagged `contiguous`
 * on the map. That tag means "the neighbour along this side", and its label is
 * the neighbour's designation — the only place in the data model that records
 * one. Roads and servitudes are tagged on the same sides but are not
 * properties, so they are not labelled as such here.
 */
const sq = (stand: string, ids: string[], pts: Array<[number, number]>) => ({
  id: stand,
  stand,
  metadata: { cape_lo_points: ids.map((id, i) => ({ id, x: pts[i][0], y: pts[i][1], status: 'P', description: '' })) },
})

/** A square parcel, so "outside" is unambiguous. */
const squarePts: Array<[number, number]> = [
  [2144000, -85700], [2144100, -85700], [2144100, -85600], [2144000, -85600],
]
const squareBeacons = beaconFC([
  { name: 'Q1', x: 2144000, y: -85700 }, { name: 'Q2', x: 2144100, y: -85700 },
  { name: 'Q3', x: 2144100, y: -85600 }, { name: 'Q4', x: 2144000, y: -85600 },
])
const squareCtx = (annotations: any) => ctx({
  beacons: squareBeacons,
  parcels: [sq('404', ['Q1', 'Q2', 'Q3', 'Q4'], squarePts)],
  sideAnnotations: annotations,
})

describe('buildWorkingPlanSpec — surrounding properties', () => {
  it('labels a contiguous side with the neighbouring property', () => {
    const { spec } = buildWorkingPlanSpec(squareCtx({
      '404': [{ side: 'AB', role: 'contiguous', label: 'Stand 86' }],
    }))
    expect(spec.notes?.map(n => n.text)).toEqual(['Stand 86'])
  })

  it('places the label outside the parcel, not on top of the boundary', () => {
    const { spec } = buildWorkingPlanSpec(squareCtx({
      '404': [{ side: 'AB', role: 'contiguous', label: 'Stand 86' }],
    }))
    const note = spec.notes![0]
    // Side AB runs along Y = -85700; the centroid is at Y = -85650, so the
    // label must sit on the far side of AB from the centre.
    expect(note.Y).toBeLessThan(-85700)
    expect(note.X).toBeCloseTo(2144050, 0)   // centred on the side
  })

  it('letters roads and servitudes along their side, not as property names', () => {
    // They are adjoining features, not neighbours, so they are lettered along
    // the side (as the diagram does) rather than placed as a property name.
    const { spec } = buildWorkingPlanSpec(squareCtx({
      '404': [
        { side: 'AB', role: 'road', label: 'Main Road' },
        { side: 'BC', role: 'servitude', label: 'Water servitude', widthM: 3 },
      ],
    }))
    expect(spec.notes).toBeUndefined()
    expect(spec.roads?.map(r => r.name)).toEqual(['Main Road', 'Water servitude', '3,00m'])
  })

  it('gives the width its own label rather than gluing it to the name', () => {
    // One string per road looked tidier and was unplaceable. A surveyor letters
    // road names spaced out, so name + width + destinations ran to 40-odd
    // characters -- two thirds of the figure's width -- and no position on the
    // sheet was clear of everything. The renderer's search failed on every
    // candidate and dropped it on the stands. Separately, each part fits.
    const { spec } = buildWorkingPlanSpec(squareCtx({
      '404': [{ side: 'AB', role: 'road', label: 'Klein Road', widthM: 25.19 }],
    }))
    expect(spec.roads?.map(r => r.name)).toEqual(['Klein Road', '25,19m'])
    // both lettered along the same side, so they read as one annotation
    expect(spec.roads![1].from).toBe(spec.roads![0].from)
    expect(spec.roads![1].to).toBe(spec.roads![0].to)
  })

  it('names the side endpoints so the renderer can place the label', () => {
    const { spec } = buildWorkingPlanSpec(squareCtx({
      '404': [{ side: 'BC', role: 'road', label: 'Main Road' }],
    }))
    // Side BC is the second edge: Q2 -> Q3.
    expect(spec.roads![0].from).toBe('Q2')
    expect(spec.roads![0].to).toBe('Q3')
  })

  it('letters a servitude with no recorded width rather than dropping it', () => {
    // The diagram warns and draws the label only. Losing the servitude entirely
    // would understate what burdens the land.
    const { spec } = buildWorkingPlanSpec(squareCtx({
      '404': [{ side: 'AB', role: 'servitude', label: 'Right of way' }],
    }))
    expect(spec.roads?.map(r => r.name)).toEqual(['Right of way'])
  })

  it('emits no roads key when none were tagged', () => {
    expect(buildWorkingPlanSpec(squareCtx({})).spec.roads).toBeUndefined()
  })

  it('skips a road on a side id that no longer exists', () => {
    const { spec } = buildWorkingPlanSpec(squareCtx({
      '404': [{ side: 'ZZ', role: 'road', label: 'Ghost Road' }],
    }))
    expect(spec.roads).toBeUndefined()
  })

  it('ignores a contiguous side with no neighbour recorded', () => {
    const { spec } = buildWorkingPlanSpec(squareCtx({
      '404': [{ side: 'AB', role: 'contiguous' }, { side: 'BC', role: 'contiguous', label: '  ' }],
    }))
    expect(spec.notes).toBeUndefined()
  })

  it('labels every tagged side, across every parcel drawn', () => {
    const { spec } = buildWorkingPlanSpec(squareCtx({
      '404': [
        { side: 'AB', role: 'contiguous', label: 'Stand 86' },
        { side: 'CD', role: 'contiguous', label: 'Stand 88' },
      ],
    }))
    expect(spec.notes?.map(n => n.text).sort()).toEqual(['Stand 86', 'Stand 88'])
  })

  it('emits no notes key at all when nothing was tagged', () => {
    expect(buildWorkingPlanSpec(squareCtx(undefined)).spec.notes).toBeUndefined()
    expect(buildWorkingPlanSpec(squareCtx({})).spec.notes).toBeUndefined()
  })

  it('skips a side id that does not exist on the ring', () => {
    // Stale annotations survive a re-digitise; they must not place a label at
    // NaN, which would corrupt the whole sheet.
    const { spec } = buildWorkingPlanSpec(squareCtx({
      '404': [{ side: 'ZZ', role: 'contiguous', label: 'Nowhere' }],
    }))
    expect(spec.notes).toBeUndefined()
  })
})

/**
 * Adjoining features are tagged per side per parcel, so three stands abutting
 * one remainder each tag it, and the sheet ends up lettering the same neighbour
 * three times a few millimetres apart. Real output showed 'R E M. /' three
 * times (in two different spellings) and '86' twice.
 *
 * De-duplication is by name only. A name deliberately lettered ACROSS sides --
 * 'MAIN' on one, 'ROAD' on the next -- is two different names and must survive
 * untouched.
 */
describe('buildWorkingPlanSpec — one label per adjoining feature', () => {
  const twoParcels = (annotations: any) => ctx({
    beacons: beaconFC([
      { name: 'Q1', x: 2144000, y: -85700 }, { name: 'Q2', x: 2144100, y: -85700 },
      { name: 'Q3', x: 2144100, y: -85600 }, { name: 'Q4', x: 2144000, y: -85600 },
      { name: 'R1', x: 2144200, y: -85700 }, { name: 'R2', x: 2144200, y: -85600 },
    ]),
    parcels: [
      sq('404', ['Q1', 'Q2', 'Q3', 'Q4'], squarePts),
      sq('405', ['Q2', 'R1', 'R2', 'Q3'],
        [[2144100, -85700], [2144200, -85700], [2144200, -85600], [2144100, -85600]]),
    ],
    sideAnnotations: annotations,
  })

  it('marks an abutment on a side only the remaining extent holds', () => {
    // The remainder is not drawn as a stand, but its boundary IS drawn and its
    // sides are annotated like any other parcel's. Skipping its annotations
    // along with the rest of its handling lost every abutment on a side no
    // stand shares -- the offshoot on Brackenhurst's 87C simply stopped
    // appearing on the sheet.
    const { spec } = buildWorkingPlanSpec(ctx({
      beacons: beaconFC([
        { name: 'Q1', x: 2144000, y: -85700 }, { name: 'Q2', x: 2144100, y: -85700 },
        { name: 'Q3', x: 2144100, y: -85600 }, { name: 'Q4', x: 2144000, y: -85600 },
        { name: 'R1', x: 2144200, y: -85700 }, { name: 'R2', x: 2144200, y: -85600 },
      ]),
      parcels: [
        sq('404', ['Q1', 'Q2', 'Q3', 'Q4'], squarePts),
        // the remainder: R1-R2 is a side no stand shares
        { ...sq('REM', ['Q2', 'R1', 'R2', 'Q3'],
          [[2144100, -85700], [2144200, -85700], [2144200, -85600], [2144100, -85600]]),
        designation: 'REM' },
      ],
      // side BC of the remainder's ring is R1 -> R2
      sideAnnotations: { REM: [{ side: 'BC', role: 'contiguous', label: '88', end: 'from' }] },
    }))
    expect(spec.contiguous?.map(c => `${c.from}-${c.to}`)).toEqual(['R1-R2'])
    // and the remainder's ring travels with it, so the renderer can find the
    // side's owner -- no drawn stand contains both beacons
    expect(spec.remainderRing).toEqual(['Q2', 'R1', 'R2', 'Q3'])
  })

  it('letters a shared neighbour once, not once per parcel', () => {
    const { spec } = buildWorkingPlanSpec(twoParcels({
      '404': [{ side: 'AB', role: 'contiguous', label: 'Rem./' }],
      '405': [{ side: 'AB', role: 'contiguous', label: 'Rem./' }],
    }))
    expect(spec.notes?.map(n => n.text)).toEqual(['Rem./'])
  })

  it('treats two spellings of one name as the same neighbour', () => {
    // The real sheet carried 'R  E  M.  /' and 'R E M. /' as separate labels.
    const { spec } = buildWorkingPlanSpec(twoParcels({
      '404': [{ side: 'AB', role: 'contiguous', label: 'R  E  M.  /' }],
      '405': [{ side: 'AB', role: 'contiguous', label: 'R E M. /' }],
    }))
    expect(spec.notes).toHaveLength(1)
  })

  it('reads a name lettered around a corner as one road', () => {
    // Superseded: these were kept separate until the sheet showed 'M A I N' and
    // 'R O A D' as two labels, which reads as two roads.
    const { spec } = buildWorkingPlanSpec(twoParcels({
      '404': [
        { side: 'AB', role: 'road', label: 'M A I N' },
        { side: 'BC', role: 'road', label: 'R O A D' },
      ],
    }))
    expect(spec.roads?.map(r => r.name)).toEqual(['M A I N R O A D'])
  })

  it('letters a shared road once even when both parcels tag it', () => {
    const { spec } = buildWorkingPlanSpec(twoParcels({
      '404': [{ side: 'AB', role: 'road', label: 'Klein Road', widthM: 25.19 }],
      '405': [{ side: 'AB', role: 'road', label: 'Klein Road', widthM: 25.19 }],
    }))
    expect(spec.roads?.map(r => r.name)).toEqual(['Klein Road', '25,19m'])
  })

  it('keeps both widths when two roads happen to be the same width', () => {
    // De-duplication groups by road, not by label text. Grouping by text would
    // silently drop the second road's width, because '12,00m' is '12,00m'.
    const { spec } = buildWorkingPlanSpec(twoParcels({
      '404': [{ side: 'AB', role: 'road', label: 'Klein Road', widthM: 12 }],
      '405': [{ side: 'CD', role: 'road', label: 'Main Road', widthM: 12 }],
    }))
    expect(spec.roads?.map(r => r.name).filter(n => n === '12,00m')).toHaveLength(2)
  })

  it('does not confuse a road with a neighbour of the same name', () => {
    const { spec } = buildWorkingPlanSpec(twoParcels({
      '404': [
        { side: 'AB', role: 'contiguous', label: 'Kopje' },
        { side: 'BC', role: 'road', label: 'Kopje' },
      ],
    }))
    expect(spec.notes?.map(n => n.text)).toEqual(['Kopje'])
    expect(spec.roads?.map(r => r.name)).toEqual(['Kopje'])
  })
})

/**
 * A linear feature lettered across consecutive sides -- 'M A I N' on one and
 * 'R O A D' on the next, around a corner -- is ONE name and must read as one.
 *
 * Blind run-merging is unsafe: two genuinely different roads on consecutive
 * sides would become "Main Road Klein Road". The rule is that a run merges only
 * when at most one part names a feature type (Road, Street, Lane, ...). 'MAIN'
 * names none and 'ROAD' names one, so they are fragments of a single name;
 * 'Main Road' and 'Klein Road' each name one, so they are two roads.
 */
describe('buildWorkingPlanSpec — a name lettered across sides', () => {
  const oneParcel = (annotations: any) => ctx({
    beacons: squareBeacons,
    parcels: [sq('404', ['Q1', 'Q2', 'Q3', 'Q4'], squarePts)],
    sideAnnotations: annotations,
  })

  it('merges fragments of one road name into a single label', () => {
    const { spec } = buildWorkingPlanSpec(oneParcel({
      '404': [
        { side: 'AB', role: 'road', label: 'M A I N' },
        { side: 'BC', role: 'road', label: 'R O A D' },
      ],
    }))
    expect(spec.roads?.map(r => r.name)).toEqual(['M A I N R O A D'])
  })

  it('keeps two distinct roads on consecutive sides apart', () => {
    const { spec } = buildWorkingPlanSpec(oneParcel({
      '404': [
        { side: 'AB', role: 'road', label: 'Main Road' },
        { side: 'BC', role: 'road', label: 'Klein Road' },
      ],
    }))
    expect(spec.roads?.map(r => r.name).sort()).toEqual(['Klein Road', 'Main Road'])
  })

  it('never merges neighbouring properties — they are different owners', () => {
    const { spec } = buildWorkingPlanSpec(oneParcel({
      '404': [
        { side: 'AB', role: 'contiguous', label: '86' },
        { side: 'BC', role: 'contiguous', label: '88' },
      ],
    }))
    expect(spec.notes?.map(n => n.text).sort()).toEqual(['86', '88'])
  })

  it('carries the width once when a merged road has one', () => {
    const { spec } = buildWorkingPlanSpec(oneParcel({
      '404': [
        { side: 'AB', role: 'road', label: 'K L E I N' },
        { side: 'BC', role: 'road', label: 'R O A D', widthM: 25.19 },
      ],
    }))
    expect(spec.roads?.map(r => r.name)).toEqual(['K L E I N R O A D', '25,19m'])
  })
})

describe('buildWorkingPlanSpec — labels stay out of the figure', () => {
  it('pushes a neighbour name clear of every parcel, not just its own', () => {
    // The offset is a fraction of the parcel's own size, so on a plan of several
    // stands a name could land inside the NEXT stand along.
    const { spec } = buildWorkingPlanSpec(ctx({
      beacons: beaconFC([
        { name: 'Q1', x: 2144000, y: -85700 }, { name: 'Q2', x: 2144100, y: -85700 },
        { name: 'Q3', x: 2144100, y: -85600 }, { name: 'Q4', x: 2144000, y: -85600 },
        { name: 'R1', x: 2143900, y: -85700 }, { name: 'R2', x: 2143900, y: -85600 },
      ]),
      parcels: [
        sq('404', ['Q1', 'Q2', 'Q3', 'Q4'], squarePts),
        // an adjoining stand on the far side of edge Q4-Q1
        sq('403', ['R1', 'Q1', 'Q4', 'R2'],
          [[2143900, -85700], [2144000, -85700], [2144000, -85600], [2143900, -85600]]),
      ],
      sideAnnotations: { '404': [{ side: 'DA', role: 'contiguous', label: 'Rem./' }] },
    }))
    const note = spec.notes![0]
    const inside = (X: number, Y: number, ring: Array<[number, number]>) => {
      let hit = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j]
        if ((yi > Y) !== (yj > Y) && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) hit = !hit
      }
      return hit
    }
    const stand403: Array<[number, number]> = [
      [2143900, -85700], [2144000, -85700], [2144000, -85600], [2143900, -85600],
    ]
    expect(inside(note.X, note.Y, squarePts)).toBe(false)
    expect(inside(note.X, note.Y, stand403)).toBe(false)
  })
})

/**
 * The Surveyor-General's examination docket asks the Working Plan for
 * "14. Area of property" -- singular. Per-stand areas are a GENERAL PLAN check
 * ("10. Area of stands checked"), so the working plan states one figure.
 *
 * Superseded: this block previously tested a full table of mutations, remainder,
 * total and difference against the parent, which the older paper checklist
 * ("Curvilinear and Rectilinear Area given plus Total Area") asked for.
 */
const withAreas = (parcels: any[], projectInfo: any = {}) => ctx({
  beacons: squareBeacons,
  parcels,
  projectInfo: { designation: 'Stands 403-405', ...projectInfo },
})
const stand = (label: string, area: number, extra: any = {}) => ({
  ...sq(label, ['Q1', 'Q2', 'Q3', 'Q4'], squarePts),
  area_m2: area,
  ...extra,
})

/**
 * An abutting neighbour is marked on the plan with short outward stubs at the
 * terminals it touches -- the same mark the diagram draws, produced by the same
 * shared helpers (contiguousMarks + edgeStrip) so the two documents agree.
 *
 * The stubs are NOT de-duplicated the way the neighbour NAMES are. A name
 * repeated on three sides is clutter; three abutments are three facts about
 * what adjoins the land, and dropping one would understate it.
 *
 * Superseded: this block previously tested an "area of property" figure. The
 * examination docket's area item is deferred and the line was removed.
 */
describe('buildWorkingPlanSpec — contiguous abutment marks', () => {
  const oneParcel = (annotations: any) => ctx({
    beacons: squareBeacons,
    parcels: [sq('404', ['Q1', 'Q2', 'Q3', 'Q4'], squarePts)],
    sideAnnotations: annotations,
  })

  it('marks the side a neighbour abuts, by its terminal beacons', () => {
    const { spec } = buildWorkingPlanSpec(oneParcel({
      '404': [{ side: 'AB', role: 'contiguous', label: 'Rem./', end: 'both' }],
    }))
    expect(spec.contiguous).toEqual([{ from: 'Q1', to: 'Q2', end: 'both' }])
  })

  it('carries which terminal is abutted, so the stub matches the diagram', () => {
    const { spec } = buildWorkingPlanSpec(oneParcel({
      '404': [{ side: 'BC', role: 'contiguous', label: '86', end: 'from' }],
    }))
    expect(spec.contiguous).toEqual([{ from: 'Q2', to: 'Q3', end: 'from' }])
  })

  it('defaults to spanning the side when no terminal was recorded', () => {
    // Matches contiguousMarks: absent `end` means both, for data saved before
    // the field existed.
    const { spec } = buildWorkingPlanSpec(oneParcel({
      '404': [{ side: 'AB', role: 'contiguous', label: '86' }],
    }))
    expect(spec.contiguous![0].end).toBe('both')
  })

  it('marks every abutting side even when they share one neighbour name', () => {
    const { spec } = buildWorkingPlanSpec(oneParcel({
      '404': [
        { side: 'AB', role: 'contiguous', label: 'Rem./' },
        { side: 'CD', role: 'contiguous', label: 'Rem./' },
      ],
    }))
    expect(spec.contiguous).toHaveLength(2)      // both abutments marked
    expect(spec.notes).toHaveLength(1)           // but the name lettered once
  })

  it('marks nothing for roads and servitudes', () => {
    const { spec } = buildWorkingPlanSpec(oneParcel({
      '404': [
        { side: 'AB', role: 'road', label: 'Main Road' },
        { side: 'BC', role: 'servitude', label: 'Right of way', widthM: 3 },
      ],
    }))
    expect(spec.contiguous).toBeUndefined()
  })

  it('no longer states an area of property', () => {
    expect((buildWorkingPlanSpec(oneParcel({})).spec as any).areaOfProperty).toBeUndefined()
  })
})

describe('buildWorkingPlanSpec — SR number', () => {
  it('carries the SR number from project setup onto the sheet', () => {
    const { spec } = buildWorkingPlanSpec(ctx({ projectInfo: { designation: 'Stand 405', srNo: 'SR 12345' } }))
    expect(spec.srNumber).toBe('SR 12345')
  })

  it('omits it when none has been captured', () => {
    expect(buildWorkingPlanSpec(ctx()).spec.srNumber).toBeUndefined()
    expect(buildWorkingPlanSpec(ctx({ projectInfo: { srNo: '   ' } })).spec.srNumber).toBeUndefined()
  })

  it('does not invent the "SR" prefix when the surveyor already typed it', () => {
    // Captured values vary: "12345", "SR 12345", "S.R. 12345". Prefixing blindly
    // would produce "SR SR 12345" on a statutory-adjacent sheet.
    expect(buildWorkingPlanSpec(ctx({ projectInfo: { srNo: '12345' } })).spec.srNumber).toBe('S.R. No. 12345')
    expect(buildWorkingPlanSpec(ctx({ projectInfo: { srNo: 'SR 12345' } })).spec.srNumber).toBe('SR 12345')
    expect(buildWorkingPlanSpec(ctx({ projectInfo: { srNo: 'S.R. No. 999' } })).spec.srNumber).toBe('S.R. No. 999')
  })
})

/**
 * Docket item 10 is "Road names, widths OR destinations". The Fifth Schedule's
 * road sign letters the destinations at each end with arrowheads.
 *
 * R12 DXF has no UTF-8 and the file declares ANSI_1252, in which the arrow
 * characters do not exist -- so destinations are lettered with ASCII arrows
 * until the arrowheads are drawn as geometry.
 */
describe('buildWorkingPlanSpec — road destinations', () => {
  const road = (extra: any) => ctx({
    beacons: squareBeacons,
    parcels: [sq('404', ['Q1', 'Q2', 'Q3', 'Q4'], squarePts)],
    sideAnnotations: { '404': [{ side: 'AB', role: 'road', label: 'Main Road', ...extra }] },
  })

  const names = (extra: any) => buildWorkingPlanSpec(road(extra)).spec.roads!.map(r => r.name)

  it('letters both destinations along the road', () => {
    // Their own label, not glued to the name -- see the width test above for
    // why one long string could not be placed.
    expect(names({ destinationFrom: 'Gwelo', destinationTo: 'Gweru' }))
      .toEqual(['Main Road', '<- Gwelo   Gweru ->'])
  })

  it('letters a single destination without inventing the other', () => {
    expect(names({ destinationTo: 'Gweru' })).toEqual(['Main Road', 'Gweru ->'])
    expect(names({ destinationFrom: 'Gwelo' })).toEqual(['Main Road', '<- Gwelo'])
  })

  it('carries width and destinations together when both are recorded', () => {
    expect(names({ widthM: 25.19, destinationTo: 'Gweru' }))
      .toEqual(['Main Road', '25,19m', 'Gweru ->'])
  })

  it('is unchanged when no destination was recorded', () => {
    expect(names({ widthM: 25.19 })).toEqual(['Main Road', '25,19m'])
  })

  it('emits nothing the DXF code page cannot represent', () => {
    // A real arrow here would be written as UTF-8 into an ANSI_1252 file.
    const { spec } = buildWorkingPlanSpec(road({ destinationFrom: 'Gwelo', destinationTo: 'Gweru' }))
    expect(spec.roads!.every(r => [...r.name].every(c => c.charCodeAt(0) <= 255))).toBe(true)
  })
})

/**
 * The inset locates the survey among the national control. It used to mark the
 * site with a synthetic 'SITE' point at the figure centroid, which is not a
 * beacon and carries no symbol of its own. The reference sheet instead shows a
 * real station inside the site -- BASE, a working station -- so the inset now
 * picks an actual beacon and draws it with its own conventional sign.
 */
describe('buildWorkingPlanSpec — the inset marks a real station', () => {
  const cal = { pairs: [{ pointId: '50/T', controlNorthing: 2151238.71, controlEasting: -88963.45 }] }
  const beaconsWith = (statuses: Record<string, string>) => beaconFCWithStatus(
    Object.entries(statuses).map(([name, status], i) => ({
      name, status, x: 2144000 + i * 40, y: -85700 + i * 30, description: '',
    })),
  )

  it('prefers a working station, named and drawn as one', () => {
    const { spec } = buildWorkingPlanSpec(ctx({
      beacons: beaconsWith({ SD4: 'P', BASE: 'WS', SD5: 'P', SD6: 'P' }),
      parcels: [sq('404', ['SD4', 'BASE', 'SD5', 'SD6'], squarePts)],
      calibration: cal,
    }))
    const site = spec.inset!.beacons.find(b => b.symbol === 'ws')
    expect(site!.name).toBe('BASE')
    expect(spec.inset!.beacons.map(b => b.name)).not.toContain('SITE')
  })

  it('falls back to an unmarked station, then a reference mark', () => {
    const rmOnly = buildWorkingPlanSpec(ctx({
      beacons: beaconsWith({ SD4: 'P', RM16: 'RM', SD5: 'P', SD6: 'P' }),
      parcels: [sq('404', ['SD4', 'RM16', 'SD5', 'SD6'], squarePts)],
      calibration: cal,
    }))
    expect(rmOnly.spec.inset!.beacons.some(b => b.name === 'RM16')).toBe(true)
  })

  it('uses a boundary beacon when the site has no station at all', () => {
    const { spec } = buildWorkingPlanSpec(ctx({
      beacons: beaconsWith({ SD4: 'P', SD5: 'P', SD6: 'P', SD3: 'P' }),
      parcels: [sq('404', ['SD4', 'SD5', 'SD6', 'SD3'], squarePts)],
      calibration: cal,
    }))
    const names = spec.inset!.beacons.map(b => b.name)
    expect(names).not.toContain('SITE')
    expect(names.some(n => ['SD4', 'SD5', 'SD6', 'SD3'].includes(n))).toBe(true)
  })

  it('carries the station at its own coordinates, not the centroid', () => {
    const { spec } = buildWorkingPlanSpec(ctx({
      beacons: beaconsWith({ SD4: 'P', BASE: 'WS', SD5: 'P', SD6: 'P' }),
      parcels: [sq('404', ['SD4', 'BASE', 'SD5', 'SD6'], squarePts)],
      calibration: cal,
    }))
    const site = spec.inset!.beacons.find(b => b.name === 'BASE')!
    expect(site.X).toBe(2144040)      // BASE's own position
    expect(site.Y).toBe(-85670)
  })
})

/**
 * Where an abutting neighbour is itself a parcel on this plan, its boundary is
 * already drawn -- the stub would mark a boundary the reader can already see.
 * Stubs are for neighbours that are NOT on the sheet.
 */
describe('buildWorkingPlanSpec — no stub on a shared subdivision boundary', () => {
  const twoStands = (annotations: any) => ctx({
    beacons: beaconFC([
      { name: 'Q1', x: 2144000, y: -85700 }, { name: 'Q2', x: 2144100, y: -85700 },
      { name: 'Q3', x: 2144100, y: -85600 }, { name: 'Q4', x: 2144000, y: -85600 },
      { name: 'R1', x: 2144200, y: -85700 }, { name: 'R2', x: 2144200, y: -85600 },
    ]),
    parcels: [
      sq('404', ['Q1', 'Q2', 'Q3', 'Q4'], squarePts),
      sq('405', ['Q2', 'R1', 'R2', 'Q3'],
        [[2144100, -85700], [2144200, -85700], [2144200, -85600], [2144100, -85600]]),
    ],
    sideAnnotations: annotations,
  })

  it('drops the stub where the neighbour is another parcel on the plan', () => {
    // Side Q2-Q3 of 404 is also side Q2-Q3 of 405.
    const { spec } = buildWorkingPlanSpec(twoStands({
      '404': [{ side: 'BC', role: 'contiguous', label: '405' }],
    }))
    expect(spec.contiguous).toBeUndefined()
  })

  it('keeps the stub where the neighbour is off the plan', () => {
    const { spec } = buildWorkingPlanSpec(twoStands({
      '404': [{ side: 'AB', role: 'contiguous', label: 'Rem./' }],
    }))
    expect(spec.contiguous).toEqual([{ from: 'Q1', to: 'Q2', end: 'both' }])
  })

  it('still letters the neighbour name on a shared boundary', () => {
    // The stub goes; the name stays, because the reader still needs to know
    // which parcel abuts.
    const { spec } = buildWorkingPlanSpec(twoStands({
      '404': [{ side: 'BC', role: 'contiguous', label: '405' }],
    }))
    expect(spec.notes?.map(n => n.text)).toEqual(['405'])
  })
})

/**
 * The remaining extent is not drawn as a stand -- its "Outside Figure" label
 * would sit across the sheet -- but its outer boundary still has to appear, or
 * the plan shows subdivisions floating in nothing.
 *
 * Only the sides NOT shared with a new subdivision: a shared side is already
 * drawn, solid, by the stand that shares it. The remainder's own sides are
 * pre-existing parent boundary, so they are dashed rather than solid.
 */
describe('buildWorkingPlanSpec — remainder boundary', () => {
  // 404 occupies the left half; the remainder wraps the right half, sharing
  // exactly one side (Q2-Q3) with it.
  const withRemainder = (extra: any = {}) => ctx({
    beacons: beaconFC([
      { name: 'Q1', x: 2144000, y: -85700 }, { name: 'Q2', x: 2144100, y: -85700 },
      { name: 'Q3', x: 2144100, y: -85600 }, { name: 'Q4', x: 2144000, y: -85600 },
      { name: 'R1', x: 2144200, y: -85700 }, { name: 'R2', x: 2144200, y: -85600 },
    ]),
    parcels: [
      sq('404', ['Q1', 'Q2', 'Q3', 'Q4'], squarePts),
      {
        id: 99, stand: 'Outside Figure',
        metadata: {
          cape_lo_points: [['Q2', 2144100, -85700], ['R1', 2144200, -85700],
                           ['R2', 2144200, -85600], ['Q3', 2144100, -85600]]
            .map(([id, x, y]) => ({ id, x, y, status: 'P', description: '' })),
        },
      },
    ],
    outsideFigureId: 99,
    ...extra,
  })

  it('emits the remainder sides that no subdivision shares', () => {
    const { spec } = buildWorkingPlanSpec(withRemainder())
    const sides = spec.remainderBoundary!.map(s => `${s.from}-${s.to}`)
    expect(sides).toEqual(['Q2-R1', 'R1-R2', 'R2-Q3'])
  })

  it('leaves out the side the subdivision already draws', () => {
    // Q3-Q2 is 404's side Q2-Q3. Drawing it again, dashed, would contradict the
    // solid line already there.
    const { spec } = buildWorkingPlanSpec(withRemainder())
    const sides = spec.remainderBoundary!.map(s => [s.from, s.to].sort().join('-'))
    expect(sides).not.toContain('Q2-Q3')
  })

  it('still keeps the remainder out of the drawn parcels', () => {
    // Excluded by design, so it must not be reported as a failure either.
    const { spec, skippedParcels } = buildWorkingPlanSpec(withRemainder())
    expect(spec.parcels.map(p => p.label)).toEqual(['404'])
    expect(skippedParcels).toEqual([])
  })

  it('emits nothing when the project has no remainder', () => {
    const { spec } = buildWorkingPlanSpec(ctx())
    expect(spec.remainderBoundary).toBeUndefined()
  })

  it('emits nothing when the remainder has no resolvable ring', () => {
    const { spec } = buildWorkingPlanSpec(ctx({
      parcels: [sq('404', ['SD4', 'SD5', 'SD6'], squarePts), { id: 99, stand: 'Outside Figure', metadata: {} }],
      outsideFigureId: 99,
    }))
    expect(spec.remainderBoundary).toBeUndefined()
  })
})

/**
 * The remainder is recognised by designation as well as by the Outside Figure
 * flag. Real data designates it "REM"; getOutsideFigureParcel() only matches
 * "outside figure", so REM was drawn as an ordinary stand -- solid boundary and
 * all -- and no remainder boundary was emitted at all.
 */
describe('buildWorkingPlanSpec — recognising the remainder', () => {
  const withRem = (stand: string, extra: any = {}) => ctx({
    beacons: beaconFC([
      { name: 'Q1', x: 2144000, y: -85700 }, { name: 'Q2', x: 2144100, y: -85700 },
      { name: 'Q3', x: 2144100, y: -85600 }, { name: 'Q4', x: 2144000, y: -85600 },
      { name: 'R1', x: 2144200, y: -85700 }, { name: 'R2', x: 2144200, y: -85600 },
    ]),
    parcels: [
      sq('404', ['Q1', 'Q2', 'Q3', 'Q4'], squarePts),
      {
        id: 99, stand, designation: stand,
        metadata: {
          cape_lo_points: [['Q2', 2144100, -85700], ['R1', 2144200, -85700],
                           ['R2', 2144200, -85600], ['Q3', 2144100, -85600]]
            .map(([id, x, y]) => ({ id, x, y, status: 'P', description: '' })),
        },
      },
    ],
    ...extra,
  })

  it.each(['REM', 'Rem', 'REM.', 'Rem./', 'Remainder', 'Outside Figure'])(
    'treats %s as the remainder without needing the Outside Figure flag', (name) => {
      const { spec } = buildWorkingPlanSpec(withRem(name))
      expect(spec.parcels.map(p => p.label)).toEqual(['404'])
      expect(spec.remainderBoundary?.map(s => `${s.from}-${s.to}`))
        .toEqual(['Q2-R1', 'R1-R2', 'R2-Q3'])
    })

  it('still labels the remainder, which is part of the plan', () => {
    const { spec } = buildWorkingPlanSpec(withRem('REM'))
    expect(spec.remainderLabel).toBe('REM')
  })

  it('shortens the system wording to the cadastral abbreviation', () => {
    // "Outside Figure" is how the app flags it internally, not what belongs on
    // a plan; REM is the conventional abbreviation and is what a surveyor reads.
    expect(buildWorkingPlanSpec(withRem('Outside Figure')).spec.remainderLabel).toBe('REM')
  })

  it('does not mistake a stand whose name merely starts with those letters', () => {
    const { spec } = buildWorkingPlanSpec(withRem('REMBRANDT'))
    expect(spec.parcels.map(p => p.label).sort()).toEqual(['404', 'REMBRANDT'])
    expect(spec.remainderBoundary).toBeUndefined()
  })

  it('still honours an explicit Outside Figure id whatever the name', () => {
    const { spec } = buildWorkingPlanSpec(withRem('Portion A', { outsideFigureId: 99 }))
    expect(spec.parcels.map(p => p.label)).toEqual(['404'])
    expect(spec.remainderLabel).toBe('Portion A')
  })
})
