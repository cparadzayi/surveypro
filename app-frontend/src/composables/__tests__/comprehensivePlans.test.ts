/**
 * The Complete Survey Record carries the plans at its end: each stand's Diagram, then the Working Plan, every
 * sheet at its own paper size.
 */
import { describe, it, expect } from 'vitest'
import { PDFDocument, PageSizes } from 'pdf-lib'
import { appendPlans } from '../useComprehensivePDF'

const pdf = async (sizes: [number, number][]) => {
  const d = await PDFDocument.create()
  for (const s of sizes) d.addPage(s)
  return d.save()
}
// jsdom's Blob may lack arrayBuffer(); the composable only needs that one method.
const planBlob = (bytes: Uint8Array) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }) as unknown as Blob

describe('appendPlans', () => {
  it('adds every plan page after the body, in order, keeping each paper size', async () => {
    const body = await pdf([PageSizes.A4, PageSizes.A4])
    const diagram403 = await pdf([PageSizes.A4])
    const diagram404 = await pdf([PageSizes.A4])
    const workingPlan = await pdf([[PageSizes.A3[1], PageSizes.A3[0]]])   // A3 landscape
    const out = await PDFDocument.load(await appendPlans(body, [
      { label: 'Diagram of stand 403', blob: planBlob(diagram403) },
      { label: 'Diagram of stand 404', blob: planBlob(diagram404) },
      { label: 'Working Plan', blob: planBlob(workingPlan) },
    ]))
    expect(out.getPageCount()).toBe(5)
    const last = out.getPage(4).getSize()
    expect(Math.round(last.width)).toBe(Math.round(PageSizes.A3[1]))
    expect(Math.round(out.getPage(2).getSize().width)).toBe(Math.round(PageSizes.A4[0]))
  })

  it('leaves the record untouched when there are no plans', async () => {
    const body = await pdf([PageSizes.A4])
    expect(await appendPlans(body, [])).toBe(body)
    expect(await appendPlans(body, undefined)).toBe(body)
  })
})
