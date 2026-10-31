import { generateDiagramDXF } from '../diagramDxf.js'

/**
 * The diagram DXF as Release 12, for tests of WHAT is drawn (placement, dashes, shading edges), which
 * read the file's entities with parsers written for that version. The version a surveyor gets (Release
 * 2000, with exact colours) is tested on its own in diagramDxfR2000.test.js.
 */
export const generateDiagramDXFr12 = (options, logger) => generateDiagramDXF({ ...options, dxfVersion: 'r12' }, logger)
