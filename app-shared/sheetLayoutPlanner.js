/**
 * Shared sheet-layout planner for SI 727 survey plans.
 *
 * Consumed by both pdfkitGeoPDF.js (PDF) and dxfGenerator.js (DXF).
 * Returns block-position metadata; format-specific drawers/emitters render
 * entities at those positions.
 *
 * Spec: docs/superpowers/specs/2026-06-12-shared-layout-planner-design.md
 *
 * Pure module: no PDFKit, no DXF imports. Text measurement is injected.
 */

import {
  SCHEDULE_OF_AREAS,
  BEACON_DESCRIPTION,
  ENDORSEMENT_BLOCK,
} from './block-definitions.js';

/**
 * Plan the surrounding-block layout for one survey-plan sheet.
 *
 * @param {object}   args
 * @param {object}   args.metadata
 * @param {object}   args.parcels             - GeoJSON FeatureCollection
 * @param {object}   args.outsideFigureData   - { edges, coordinates }
 * @param {object}   args.beacons             - GeoJSON FeatureCollection
 * @param {object}   args.mapBounds           - { x, y, width, height } in PDF points
 * @param {object}   args.mapFeatureBounds    - polygon bbox in PDF points
 * @param {object}   args.scale               - { value, label }
 * @param {object}   args.extent              - ground extent
 * @param {Array}    [args.tickMarkBounds=[]] - pre-seeded obstacle bboxes
 * @param {object}   [args.figureBounds=null] - figure bbox in PDF points
 * @param {Array}    [args.polyPts=[]]        - closed polygon vertices in PDF points
 * @param {Function} args.measureText         - (str, { family, size }) => width in pt
 * @param {object}   args.logger              - { info, warn, error }
 * @returns {object} blockPositions
 */
export function planSheetLayout(args) {
  // STUB — replaced by lifted body in Task 3.
  throw new Error('planSheetLayout: not implemented');
}
