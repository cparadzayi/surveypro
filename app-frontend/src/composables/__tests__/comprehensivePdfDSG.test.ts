import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { appendDSGCertificate } from '../useComprehensivePDF';
import type { DSGCertificateData } from '../useDSGCertificate';

const dsg: DSGCertificateData = {
  surveyOf: 'STANDS 109-166, 257-267, 274, 278-281, 297-318 AD VALOREM TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A, SHABANI DISTRICT',
  surveyorName: 'O. SAUNYAMA',
  licenseNumber: 'LS/2024/001',
  statement1: 'The consistency of data has been checked directly from the General Plan.',
  statement2: 'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
  statement3: 'All beacons shown on the diagrams have been placed and checked.',
  statement4: 'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
  surveyorTitle: 'LAND SURVEYOR (Zim)',
  date: '2026-09-25',
};

/** A stand-in for the collated body. */
async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}

describe('appendDSGCertificate', () => {
  it('appends the certificate and returns it as its own blob', async () => {
    const body = await makePdf(6);

    const result = await appendDSGCertificate(body, dsg);

    expect(result.dsgBlob).toBeInstanceOf(Blob);
    const certPages = (await PDFDocument.load(await result.dsgBlob!.arrayBuffer())).getPageCount();
    const mergedPages = (await PDFDocument.load(result.merged)).getPageCount();
    expect(mergedPages).toBe(6 + certPages);
  });

  it('returns the body untouched when no DSG certificate data is given', async () => {
    const body = await makePdf(6);
    const result = await appendDSGCertificate(body, undefined);
    expect(result.dsgBlob).toBeUndefined();
    expect((await PDFDocument.load(result.merged)).getPageCount()).toBe(6);
  });
});