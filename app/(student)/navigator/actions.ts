'use server';
import { buildPlan, type Plan } from '@/lib/navigator';
import { getStudent } from '@/lib/student';

export type NavigatorState = { plan?: Plan; error?: string };

export async function askNavigator(_prev: NavigatorState, form: FormData): Promise<NavigatorState> {
  const student = await getStudent();
  if (!student) return { error: 'Please finish setting up your profile first.' };
  const question = String(form.get('question') ?? '').trim().slice(0, 600);
  if (question.length < 10) return { error: 'Tell the Navigator a bit more about your goal (at least 10 characters).' };
  try {
    return { plan: await buildPlan(question, student) };
  } catch {
    return { error: "The Navigator couldn't load StudentEconomy data right now. Please try again." };
  }
}
