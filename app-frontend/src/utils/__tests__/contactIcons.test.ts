import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import jsPDF from 'jspdf';
import { CoverPageGenerator, type CoverPageInfo } from '../cover-page';
import { drawContactIcon, contactItemWidth, ICON_SIZE_MM, ICON_GAP_MM, type ContactIcon } from '../contactIcons';

// Every string written with text() is recorded. jsPDF defines text() inside its constructor, so it is wrapped
// on each instance by a subclass standing in for the library.
const written = vi.hoisted(() => [] as string[]);
vi.mock('jspdf', async (importOriginal) => {
  const mod: any = await importOriginal();
  const Real = mod.jsPDF ?? mod.default;
  class Recording extends Real {
    constructor(...args: any[]) {
      super(...args);
      const text = this.text.bind(this);
      this.text = (...a: any[]) => {
        for (const s of Array.isArray(a[0]) ? a[0] : [a[0]]) written.push(String(s));
        return text(...a);
      };
    }
  }
  return { ...mod, default: Recording, jsPDF: Recording };
});

const ICONS: ContactIcon[] = ['phone', 'email', 'address', 'website'];

const info: CoverPageInfo = {
  firmName: 'C PARADZAYI LAND SURVEYORS',
  firmSubtitle: 'Cadastral, Engineering, Topographic & Mining Surveyors',
  phone: '+263 774 003 137',
  email: 'cparadzayi@gmail.com',
  address: '6322 Hwari Matongo Street, Southview, Gweru, Zimbabwe',
  website: 'www.mataranyika.com',
  projectTitle: 'Maglas',
  surveyorName: 'C. Paradzayi',
  licenseNumber: 'PLS 123',
  surveyDate: '2026-01-01',
};

beforeEach(() => { written.length = 0; });
afterEach(() => vi.restoreAllMocks());

describe('letterhead contact icons', () => {
  it('writes no emoji or other non-Latin-1 character into the PDF text', () => {
    // The built-in font has no glyph for them: they printed as "Ø=ÜÞ" and spaced the rest of the line out.
    new CoverPageGenerator().generateCoverPage(info);
    for (const s of written) {
      for (const ch of s) expect(ch.codePointAt(0)!, `"${s}"`).toBeLessThanOrEqual(0xff);
    }
    // ...and the contact details are written exactly as given, with no icon character in front.
    for (const v of [info.phone, info.email, info.address, info.website]) expect(written).toContain(v);
  });

  it.each(ICONS)('draws the %s icon from shapes', (icon) => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const before = pdf.output().length;
    drawContactIcon(pdf, icon, 20, 30);
    expect(pdf.output().length).toBeGreaterThan(before);
  });

  it('draws an icon inside its square beside the text baseline', () => {
    // Every shape the icon issues stays within ICON_SIZE_MM of its left edge and level with the text.
    for (const icon of ICONS) {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const xs: number[] = [], ys: number[] = [];
      for (const fn of ['line', 'circle', 'ellipse', 'rect', 'roundedRect'] as const) {
        const real = (pdf as any)[fn].bind(pdf);
        vi.spyOn(pdf as any, fn).mockImplementation((...a: any[]) => {
          if (fn === 'line') { xs.push(a[0], a[2]); ys.push(a[1], a[3]); }
          else if (fn === 'circle' || fn === 'ellipse') { const rx = a[2], ry = fn === 'ellipse' ? a[3] : a[2]; xs.push(a[0] - rx, a[0] + rx); ys.push(a[1] - ry, a[1] + ry); }
          else { xs.push(a[0], a[0] + a[2]); ys.push(a[1], a[1] + a[3]); }
          return real(...a);
        });
      }
      drawContactIcon(pdf, icon, 20, 30);
      expect(Math.min(...xs), icon).toBeGreaterThanOrEqual(20 - 0.01);
      expect(Math.max(...xs), icon).toBeLessThanOrEqual(20 + ICON_SIZE_MM + 0.01);
      expect(Math.max(...ys), icon).toBeLessThanOrEqual(30 + 0.51);
      expect(Math.min(...ys), icon).toBeGreaterThanOrEqual(30 + 0.5 - ICON_SIZE_MM - 0.01);
    }
  });

  it('measures an item as icon, gap and text', () => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    pdf.setFontSize(9);
    expect(contactItemWidth(pdf, 'abc')).toBeCloseTo(ICON_SIZE_MM + ICON_GAP_MM + pdf.getTextWidth('abc'), 9);
  });
});
