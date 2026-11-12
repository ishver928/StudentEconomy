// The onboarding preferences for the current visitor, stored in a cookie (no auth in this prototype)
// and mirrored to a `users` row.
import { cookies } from 'next/headers';
import { isEducationLevel, type EducationLevel } from './education';

export { EDUCATION_LEVELS, isEducationLevel, type EducationLevel } from './education';

export const STUDENT_COOKIE = 'se_student';

export type Student = {
  id: string;
  firstName: string;
  school: string;
  level: EducationLevel;
};

export async function getStudent(): Promise<Student | null> {
  const raw = (await cookies()).get(STUDENT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Student>;
    if (typeof s.id !== 'string' || !isEducationLevel(s.level)) return null;
    return { id: s.id, firstName: s.firstName ?? '', school: s.school ?? '', level: s.level };
  } catch {
    return null;
  }
}
