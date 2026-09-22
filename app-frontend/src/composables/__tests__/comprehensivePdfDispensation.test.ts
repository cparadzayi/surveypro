import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { appendDispensationCertificate } from '../useComprehensivePDF';
import type { DispensationInput } from '../useDispensationCertificate';

const dispensation: DispensationInput = {
  portion: 'developed',
  parcels: [{ id: 10, stand: '1620', area_m2: 174 }],
  servitudes: [
    { id: 's', subjectId: '10', side: 'AB', type: 'party-wall', fromBeacon: '1620a', toBeacon: '1620b' },
  ],
  header: { township: 'MAGLAS', dispensationClause: 'Reg 78', surveyorName: 'F.C.', date: '2026-07-14' },
};

/** A stand-in for the collated body. */
async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}

describe('appendDispensationCertificate', () => {
  it('appends the certificate and returns it as its own blob', async () => {
    const body = await makePdf(6);

    const result = await appendDispensationCertificate(body, dispensation);

    expect(result.dispensationBlob).toBeInstanceOf(Blob);
    const certPages = (await PDFDocument.load(await result.dispensationBlob!.arrayBuffer())).getPageCount();
    const mergedPages = (await PDFDocument.load(result.merged)).getPageCount();
    expect(mergedPages).toBe(6 + certPages);
  });

  it('returns the body untouched when no dispensation inputs are given', async () => {
    const body = await makePdf(6);
    const result = await appendDispensationCertificate(body, undefined);
    expect(result.dispensationBlob).toBeUndefined();
    expect((await PDFDocument.load(result.merged)).getPageCount()).toBe(6);
  });
});