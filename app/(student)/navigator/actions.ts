'use server';
import { buildPlan, DocumentAnalysisError, type Plan } from '@/lib/navigator';
import { MAX_PDFS, PdfError, readPdfs, type PdfDoc } from '@/lib/pdf';
import { getStudent } from '@/lib/student';

export type NavigatorState = { plan?: Plan; error?: string };

const DOC_QUESTION = 'Read my documents and build me a plan to cover my college costs.';

export async function askNavigator(_prev: NavigatorState, form: FormData): Promise<NavigatorState> {
  const student = await getStudent();
  if (!student) return { error: 'Please finish setting up your profile first.' };
  const files = form.getAll('pdfs').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_PDFS) return { error: `You can attach up to ${MAX_PDFS} PDFs per message.` };
  const question = String(form.get('question') ?? '').trim().slice(0, 600) || (files.length ? DOC_QUESTION : '');
  if (question.length < 10) return { error: 'Tell the Navigator a bit more about your goal (at least 10 characters).' };

  // PDFs are read in memory for this request only: never stored, never logged.
  let docs: PdfDoc[] = [];
  try {
    docs = await readPdfs(files);
  } catch (err) {
    return { error: err instanceof PdfError ? err.message : "We couldn't read your PDF. Please try again." };
  }
  try {
    return { plan: await buildPlan(question, student, docs) };
  } catch (err) {
    if (err instanceof DocumentAnalysisError) return { error: err.message };
    return { error: "The Navigator couldn't load Sprout data right now. Please try again." };
  }
}
