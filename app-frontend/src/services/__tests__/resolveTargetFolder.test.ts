import { describe, it, expect } from 'vitest';
import { resolveTargetFolder } from '../documentStorage';
import { getProjectDirectoryStructure } from '@/utils/project-directory';

const structure = getProjectDirectoryStructure('C:/proj');

describe('resolveTargetFolder', () => {
  it('routes each document type to its subfolder', () => {
    expect(resolveTargetFolder('field-book', structure)).toBe(structure.fieldBook);
    expect(resolveTargetFolder('coordinate-list', structure)).toBe(structure.coordinateList);
    expect(resolveTargetFolder('calculations-part1', structure)).toBe(structure.calculations);
    expect(resolveTargetFolder('area-computation', structure)).toBe(structure.calculations);
    expect(resolveTargetFolder('areas-consistency', structure)).toBe(structure.surveyRecord);
    expect(resolveTargetFolder('report-on-survey', structure)).toBe(structure.reports);
    expect(resolveTargetFolder('dsg-certificate', structure)).toBe(structure.certificates);
  });

  it('throws on an unknown document type', () => {
    expect(() => resolveTargetFolder('nope' as any, structure)).toThrow(/Unknown document type/);
  });
});
