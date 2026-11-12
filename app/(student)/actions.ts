'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { STUDENT_COOKIE, isEducationLevel, type Student } from '@/lib/student';

const clean = (value: FormDataEntryValue | null, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function saveOnboarding(_prev: string | null, form: FormData): Promise<string | null> {
  const firstName = clean(form.get('firstName'), 40);
  const school = clean(form.get('school'), 120);
  const level = form.get('level');
  if (!school) return 'Please tell us your school.';
  if (!isEducationLevel(level)) return 'Please choose your education level.';

  const [row] = await query<{ id: string }>(
    'INSERT INTO users (first_name, school, education_level) VALUES ($1, $2, $3) RETURNING id',
    [firstName || null, school, level],
  );
  const student: Student = { id: row.id, firstName, school, level };
  (await cookies()).set(STUDENT_COOKIE, JSON.stringify(student), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  redirect('/');
}

export async function resetOnboarding() {
  (await cookies()).delete(STUDENT_COOKIE);
  redirect('/');
}
