/**
 * Render order for the MapLibre `parcels` GeoJSON source.
 *
 * Every parcel is drawn through ONE `parcels-fill` layer, so within that layer the
 * only thing deciding what sits on top is the position of the feature in the source's
 * features array -- later features draw over earlier ones. MapLibre then hands a click
 * the hits in top-down order (`topDownFeatureComparator` sorts feature indices
 * descending), so `e.features[0]` is whatever was drawn last at that point.
 *
 * The Outside Figure is the encapsulating pseudo-parcel: it geometrically contains the
 * stands, and the DB seeds it LAST. Left in that order it both hides the stands it
 * covers and swallows every click meant for them. Ordering it first is what makes the
 * real parcels visible and selectable, so this must be applied at EVERY site that feeds
 * the source -- not just the full rebuilds.
 */

import { isOutsideFigureParcelName } from '../../../services/parcelValidation'

/** Only the naming properties matter for ordering; the rest of the feature is opaque. */
export interface OrderableParcelFeature {
  properties?: { designation?: string | null; stand?: string | null } | null
}

/** The feature's parcel name, however the builder that made it spelled the property. */
function parcelName(feature: OrderableParcelFeature): string {
  return feature?.properties?.designation || feature?.properties?.stand || ''
}

/**
 * Return a new array with the Outside Figure features moved to the front, leaving the
 * relative order of everything else (and of the Outside Figures themselves) untouched.
 */
export function outsideFigureFirst<T extends OrderableParcelFeature>(features: T[]): T[] {
  const outsideFigures: T[] = []
  const stands: T[] = []
  for (const feature of features) {
    if (isOutsideFigureParcelName(parcelName(feature))) outsideFigures.push(feature)
    else stands.push(feature)
  }
  return [...outsideFigures, ...stands]
}
