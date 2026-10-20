// app-backend/src/services/marginStack.js
//
// The right-hand margin of a General Plan is a vertical stack: the Surveyor-
// General's "Approved" box on top, centred in the margin, then a gap, then the
// ENDORSEMENTS table. That is how the Bulawayo SG office draws it, and it takes
// the box out of the map area, where it used to be engine-placed and cost
// whitespace the schedule and figure furniture need.
//
// One module so the planner (PDF + DXF) and the DXF's own table drawer agree on
// the numbers: the DXF draws its endorsement rules itself and has to start them
// below the same shift the planner applies to the PDF's block.

/** Right margin width, 150 mm in PDF points. */
export const MARGIN_WIDTH_PT = 150 * 2.835;

/** Endorsement block height in the PDF. */
export const ENDORSEMENT_HEIGHT_PT = 150;

/** Clear space between the SG box's bottom edge and the ENDORSEMENTS top rule
 *  (~8.5 mm): enough that the two read as separate blocks. */
export const SG_ENDORSEMENT_GAP_PT = 24;

/** How far the endorsement table moves down to make room for the SG box. */
export function endorsementShiftPt(sgHeight) {
  return sgHeight + SG_ENDORSEMENT_GAP_PT;
}

/**
 * Slots for the margin stack, in the PDF planner frame (y down, origin top-left).
 * @param {{x:number,y:number,width:number,height:number}} mapBounds
 * @param {number} sgWidth  SG box width
 * @param {number} sgHeight SG box height
 */
export function marginStackSlots(mapBounds, sgWidth, sgHeight) {
  const left = mapBounds.x + mapBounds.width;
  return {
    sgSignature: {
      x: left + (MARGIN_WIDTH_PT - sgWidth) / 2,   // centred over the endorsement
      y: mapBounds.y,
      width: sgWidth,
      height: sgHeight,
    },
    endorsement: {
      x: left,
      y: mapBounds.y + endorsementShiftPt(sgHeight),
      width: MARGIN_WIDTH_PT,
      height: ENDORSEMENT_HEIGHT_PT,
    },
  };
}
