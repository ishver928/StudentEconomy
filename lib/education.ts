// Education levels offered at onboarding. Shared by client and server code.
export const EDUCATION_LEVELS = {
  community_college: 'Community college',
  undergraduate: 'Undergraduate',
  graduate: 'Graduate',
  doctoral: 'Doctoral',
} as const;

export type EducationLevel = keyof typeof EDUCATION_LEVELS;

export function isEducationLevel(value: unknown): value is EducationLevel {
  return typeof value === 'string' && value in EDUCATION_LEVELS;
}
