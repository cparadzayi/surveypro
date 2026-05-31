/**
 * Tiny DXF R12 ASCII parser for test assertions.
 * NOT a complete parser — only the inspection operations the tests need.
 * Each DXF line pair is (group code on one line, value on the next).
 */

/** Walk the LAYER table and return how many times `name` appears. */
export function countLayerOnTable(dxf, name) {
  // LAYER table block bounded by "0\nTABLE\n2\nLAYER" .. "0\nENDTAB"
  const m = dxf.match(/\bTABLE\b\s*\n\s*2\s*\n\s*LAYER\b[\s\S]*?\bENDTAB\b/)
  if (!m) return 0
  // Each layer entry is "0\nLAYER\n2\n<name>\n..."; count occurrences of "2\n<name>" inside the table block.
  const re = new RegExp(`\\b2\\s*\\n\\s*${name}\\b`, 'g')
  return (m[0].match(re) || []).length
}

/**
 * Walk the ENTITIES section and count entities of `entityType` on `layerName`.
 * Each entity is "0\n<Type>\n8\n<Layer>\n...".
 */
export function entityCount(dxf, entityType, layerName) {
  const ents = extractEntitiesSection(dxf)
  if (!ents) return 0
  // Split by "0\n<Type>" prefixes; each fragment's "8\n<layer>" is the layer.
  const re = new RegExp(
    `\\b0\\s*\\n\\s*${entityType}\\b[\\s\\S]*?(?=\\b0\\s*\\n\\s*(?:[A-Z]+)\\b|$)`,
    'g'
  )
  let count = 0
  for (const frag of ents.match(re) || []) {
    if (new RegExp(`\\b8\\s*\\n\\s*${layerName}\\b`).test(frag)) count++
  }
  return count
}

/**
 * Find the first entity of `entityType` on `layerName` and return parsed
 * coordinate (x, y) from group codes 10 (x) and 20 (y).
 */
export function parseFirstEntityOf(dxf, entityType, layerName) {
  const ents = extractEntitiesSection(dxf)
  if (!ents) return null
  const re = new RegExp(
    `\\b0\\s*\\n\\s*${entityType}\\b[\\s\\S]*?(?=\\b0\\s*\\n\\s*(?:[A-Z]+)\\b|$)`,
    'g'
  )
  for (const frag of ents.match(re) || []) {
    if (!new RegExp(`\\b8\\s*\\n\\s*${layerName}\\b`).test(frag)) continue
    const x = (frag.match(/\b10\s*\n\s*(-?[\d.]+)/) || [])[1]
    const y = (frag.match(/\b20\s*\n\s*(-?[\d.]+)/) || [])[1]
    if (x != null && y != null) return { x: parseFloat(x), y: parseFloat(y) }
  }
  return null
}

function extractEntitiesSection(dxf) {
  const m = dxf.match(/\bSECTION\b\s*\n\s*2\s*\n\s*ENTITIES\b([\s\S]*?)\bENDSEC\b/)
  return m ? m[1] : null
}
