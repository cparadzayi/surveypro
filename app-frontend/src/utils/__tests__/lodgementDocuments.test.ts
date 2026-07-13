import { describe, it, expect } from 'vitest';
import { LODGEMENT_DOCUMENTS, resolveLodgementDocuments } from '../lodgementDocuments';

describe('LODGEMENT_DOCUMENTS', () => {
  it('lists the 11 canonical items in order', () => {
    expect(LODGEMENT_DOCUMENTS).toEqual([
      'Field book',
      'Coordinate List and Calculations',
      'General Plan',
      'Working Plan',
      'Report on Survey',
      'Dispensation Certificate',
      'Checklist',
      'DSG Certificate (1/96)',
      'Permit/Instruction and layout',
      'Beacon receipt',
      'Searches',
    ]);
  });
});

describe('resolveLodgementDocuments', () => {
  it('ticks items whose keyword matches a file name, leaves others unticked', () => {
    const files = [
      'MAG1_FieldBook.pdf',
      'Comprehensive_Latest.pdf',      // coordinate/calc
      'GENERAL-PLAN-Maglas.pdf',
      'Report_on_Survey.pdf',
      'DSG-Certificate-1-96.pdf',
      'beacon-receipt.jpg',
    ];
    const result = resolveLodgementDocuments(files);
    const by = Object.fromEntries(result.map(r => [r.label, r.present]));
    expect(by['Field book']).toBe(true);
    expect(by['Coordinate List and Calculations']).toBe(true);
    expect(by['General Plan']).toBe(true);
    expect(by['Report on Survey']).toBe(true);
    expect(by['DSG Certificate (1/96)']).toBe(true);
    expect(by['Beacon receipt']).toBe(true);
    // not provided:
    expect(by['Working Plan']).toBe(false);
    expect(by['Dispensation Certificate']).toBe(false);
    expect(by['Checklist']).toBe(false);
    expect(by['Permit/Instruction and layout']).toBe(false);
    expect(by['Searches']).toBe(false);
  });

  it('returns all-unticked for an empty file list, preserving order', () => {
    const result = resolveLodgementDocuments([]);
    expect(result.map(r => r.label)).toEqual(LODGEMENT_DOCUMENTS);
    expect(result.every(r => r.present === false)).toBe(true);
  });
});
