import { describe, it, expect } from 'vitest';
import { emptyNewSurveyorForm, NUMBER_FIELD, SURVEYOR_TYPE_OPTIONS, toNewSurveyor } from '../newSurveyorForm';

const filled = () => ({ ...emptyNewSurveyorForm(), name: ' T. Ndlovu ', email: ' tndlovu@example.com ', number: ' LS-1 ' });

describe('toNewSurveyor', () => {
  it('sends the number in the field its type uses, trimmed, and leaves blank fields out', () => {
    expect(toNewSurveyor(filled())).toEqual({ name: 'T. Ndlovu', email: 'tndlovu@example.com', surveyorType: 'registered', licenseNumber: 'LS-1' });
    expect(toNewSurveyor({ ...filled(), surveyorType: 'technician' })).toMatchObject({ registrationNumber: 'LS-1' });
    expect(toNewSurveyor({ ...filled(), surveyorType: 'student' })).toMatchObject({ studentNumber: 'LS-1' });
    expect(toNewSurveyor({ ...filled(), surveyorType: 'student' })).not.toHaveProperty('licenseNumber');
  });

  it('includes firm, phone and address only when typed', () => {
    const out = toNewSurveyor({ ...filled(), firm: ' Ndlovu Surveys ', phone: '', address: '  ' });
    expect(out.firm).toBe('Ndlovu Surveys');
    expect(out).not.toHaveProperty('phone');
    expect(out).not.toHaveProperty('address');
  });

  it('sends the institution for a student and for no one else', () => {
    expect(toNewSurveyor({ ...filled(), surveyorType: 'student', institution: ' NUST ' }).institution).toBe('NUST');
    expect(toNewSurveyor({ ...filled(), surveyorType: 'registered', institution: 'NUST' })).not.toHaveProperty('institution');
  });

  it('never sends a role, a password or a supervisor: the form has no such fields', () => {
    const keys = Object.keys(toNewSurveyor({ ...filled(), firm: 'F', phone: 'P', address: 'A' }));
    expect(keys.sort()).toEqual(['address', 'email', 'firm', 'licenseNumber', 'name', 'phone', 'surveyorType']);
  });
});

describe('the form’s types', () => {
  it('offers every type the server accepts, each with a number field', () => {
    expect(SURVEYOR_TYPE_OPTIONS.map((o) => o.value).sort()).toEqual(['in_training', 'registered', 'student', 'technician']);
    for (const o of SURVEYOR_TYPE_OPTIONS) expect(NUMBER_FIELD[o.value].field).toBeTruthy();
  });

  it('requires a licence number only of a registered surveyor', () => {
    expect(NUMBER_FIELD.registered.required).toBe(true);
    for (const t of ['in_training', 'technician', 'student'] as const) expect(NUMBER_FIELD[t].required).toBe(false);
  });
});
