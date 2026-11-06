import type { NewSurveyor, SurveyorType } from '../composables/useSurveyors';

/** The "add surveyor" form's fields, as typed. */
export interface NewSurveyorForm {
  surveyorType: SurveyorType;
  name: string;
  email: string;
  number: string;
  firm: string;
  phone: string;
  address: string;
  institution: string;
}

export const emptyNewSurveyorForm = (): NewSurveyorForm => ({
  surveyorType: 'registered', name: '', email: '', number: '', firm: '', phone: '', address: '', institution: '',
});

export const SURVEYOR_TYPE_OPTIONS: { value: SurveyorType; label: string }[] = [
  { value: 'registered', label: 'Registered land surveyor' },
  { value: 'in_training', label: 'Surveyor in training' },
  { value: 'technician', label: 'Technician' },
  { value: 'student', label: 'Student' },
];

/** What the one identifying number is called for each type, and which server field it goes in. */
export const NUMBER_FIELD: Record<SurveyorType, { label: string; field: 'licenseNumber' | 'registrationNumber' | 'studentNumber'; required: boolean }> = {
  registered: { label: 'Licence number', field: 'licenseNumber', required: true },
  in_training: { label: 'Registration number', field: 'registrationNumber', required: false },
  technician: { label: 'Registration number', field: 'registrationNumber', required: false },
  student: { label: 'Student number', field: 'studentNumber', required: false },
};

/** The request body for a filled-in form: the number goes in the field its type uses, blanks are left out. */
export function toNewSurveyor(form: NewSurveyorForm): NewSurveyor {
  const out: NewSurveyor = { name: form.name.trim(), email: form.email.trim(), surveyorType: form.surveyorType };
  const number = form.number.trim();
  if (number) out[NUMBER_FIELD[form.surveyorType].field] = number;
  for (const f of ['firm', 'phone', 'address'] as const) if (form[f].trim()) out[f] = form[f].trim();
  if (form.surveyorType === 'student' && form.institution.trim()) out.institution = form.institution.trim();
  return out;
}
