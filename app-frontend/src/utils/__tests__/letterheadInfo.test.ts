import { describe, it, expect, vi, beforeEach } from 'vitest';
import jsPDF from 'jspdf';
import { coverFieldsFromLetterhead } from '../letterheadInfo';
import { CoverPageGenerator, type CoverPageInfo } from '../cover-page';
import type { Letterhead } from '../../services/letterhead';

// text() calls with where they were drawn; jsPDF defines text() in its constructor, so a subclass wraps it.
const drawn = vi.hoisted(() => [] as { text: string; x: number; y: number }[]);
vi.mock('jspdf', async (importOriginal) => {
  const mod: any = await importOriginal();
  const Real = mod.jsPDF ?? mod.default;
  class Recording extends Real {
    constructor(...args: any[]) {
      super(...args);
      const text = this.text.bind(this);
      this.text = (...a: any[]) => {
        if (typeof a[0] === 'string') drawn.push({ text: a[0], x: a[1], y: a[2] });
        return text(...a);
      };
    }
  }
  return { ...mod, default: Recording, jsPDF: Recording };
});

// A real 1 x 1 PNG.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const full: Letterhead = {
  firm: 'C Paradzayi Land Surveyors', subtitle: 'Cadastral Surveyors', phone: '+263 774 003 137',
  email: 'firm@example.com', website: 'www.example.com', address: '6322 Hwari Matongo Street',
  logo: { dataUrl: TINY_PNG, width: 1367, height: 1100 },
};

describe('coverFieldsFromLetterhead', () => {
  it('maps a filled-in letterhead, with the firm name in capitals', () => {
    expect(coverFieldsFromLetterhead(full)).toEqual({
      firmName: 'C PARADZAYI LAND SURVEYORS', firmSubtitle: 'Cadastral Surveyors', phone: '+263 774 003 137',
      email: 'firm@example.com', website: 'www.example.com', address: '6322 Hwari Matongo Street', logo: full.logo,
    });
  });

  it('leaves out what is blank instead of printing anything in its place', () => {
    const out = coverFieldsFromLetterhead({ ...full, subtitle: '  ', phone: '', website: '', address: '', logo: null });
    expect(out.firmSubtitle).toBeUndefined();
    expect(out.phone).toBeUndefined();
    expect(out.website).toBeUndefined();
    expect(out.address).toBeUndefined();
    expect(out.logo).toBeUndefined();
  });

  it('falls back to the sign-in address only for the e-mail', () => {
    expect(coverFieldsFromLetterhead({ ...full, email: '' }, 'me@sign.in').email).toBe('me@sign.in');
    expect(coverFieldsFromLetterhead({ ...full, email: 'firm@example.com' }, 'me@sign.in').email).toBe('firm@example.com');
  });

  it('carries no firm’s details of its own when there is no letterhead at all', () => {
    expect(coverFieldsFromLetterhead(null)).toEqual({
      firmName: undefined, firmSubtitle: undefined, phone: undefined, email: undefined, website: undefined, address: undefined, logo: undefined,
    });
  });
});

describe('the cover letter with a logo', () => {
  const base: CoverPageInfo = {
    ...coverFieldsFromLetterhead({ ...full, logo: null }),
    projectTitle: 'Maglas', surveyorName: 'C. Paradzayi', licenseNumber: 'PLS 123', surveyDate: '2026-01-01',
  };
  const textOf = (blob: Blob) => blob.arrayBuffer().then((b) => Buffer.from(b).toString('latin1'));
  const y = (text: string) => drawn.find((d) => d.text === text)!.y;

  beforeEach(() => { drawn.length = 0; });

  it('embeds the image only when there is a logo', async () => {
    const without = await textOf(new CoverPageGenerator().generateCoverPage(base));
    const withLogo = await textOf(new CoverPageGenerator().generateCoverPage({ ...base, logo: full.logo! }));
    expect(without).not.toContain('/Subtype /Image');
    expect(withLogo).toContain('/Subtype /Image');
  });

  it('starts the contact lines below the logo, which is taller than the header text', () => {
    new CoverPageGenerator().generateCoverPage(base);
    const noLogoY = y('+263 774 003 137');
    drawn.length = 0;
    new CoverPageGenerator().generateCoverPage({ ...base, logo: full.logo! });
    // a 22 mm logo from 6 mm above the name's baseline ends 16 mm below it; the contact lines clear it
    expect(y('+263 774 003 137')).toBeGreaterThan(noLogoY);
    expect(y('+263 774 003 137')).toBeGreaterThanOrEqual(20 - 6 + 22 + 3 - 1e-6);
  });

  it('scales a wide logo down to its width limit and keeps its shape', () => {
    const gen = new CoverPageGenerator() as any;
    const calls: number[][] = [];
    const pdf = { addImage: (_d: string, _f: string, x: number, y: number, w: number, h: number) => { calls.push([x, y, w, h]); } };
    gen.drawLogo(pdf, { dataUrl: TINY_PNG, width: 400, height: 100 }, 20); // 4:1, so width-limited to 40 mm
    expect(calls[0][2]).toBeCloseTo(40, 9);
    expect(calls[0][3]).toBeCloseTo(10, 9);
    gen.drawLogo(pdf, { dataUrl: TINY_PNG, width: 100, height: 400 }, 20); // tall, so height-limited to 22 mm
    expect(calls[1][3]).toBeCloseTo(22, 9);
    expect(calls[1][2]).toBeCloseTo(5.5, 9);
  });

  it('still produces the letter when the logo cannot be drawn', () => {
    const blob = new CoverPageGenerator().generateCoverPage({ ...base, logo: { dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10 } });
    expect(blob.size).toBeGreaterThan(0);
  });
});
