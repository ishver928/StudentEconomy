// Server-only PDF text extraction for the AI Navigator. Uploads are read in memory and never stored,
// written to disk, or logged. Document text is untrusted input: it is only ever passed to Claude as
// clearly delimited data (see lib/navigator.ts).
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_PDFS = 3;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 60;
const MAX_CHARS_PER_DOC = 60_000;

export type PdfDoc = { name: string; pages: number; pagesRead: number; text: string };
export class PdfError extends Error {}

// Display-safe file name: no paths, no markup, bounded length.
const cleanName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? 'document.pdf').replace(/[^\w .()&,-]/g, '_').slice(0, 80) || 'document.pdf';

export async function readPdfs(files: File[]): Promise<PdfDoc[]> {
  if (files.length > MAX_PDFS) throw new PdfError(`You can attach up to ${MAX_PDFS} PDFs per message.`);
  const docs: PdfDoc[] = [];
  for (const file of files) {
    const name = cleanName(file.name);
    if (file.size === 0) throw new PdfError(`"${name}" is empty.`);
    if (file.size > MAX_PDF_BYTES) throw new PdfError(`"${name}" is larger than 10 MB. Try exporting only the pages you need.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Check the actual file signature, not the browser-supplied type or extension.
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
    if (!head.includes('%PDF-')) throw new PdfError(`"${name}" isn't a valid PDF file.`);

    let pages: string[];
    let total: number;
    try {
      const pdf = await getDocumentProxy(bytes);
      total = pdf.numPages;
      if (total > MAX_PAGES) {
        await pdf.loadingTask.destroy();
        throw new PdfError(`"${name}" has ${total} pages. Please upload ${MAX_PAGES} pages or fewer (just the cost and aid pages is perfect).`);
      }
      ({ text: pages } = await extractText(pdf, { mergePages: false }));
      await pdf.loadingTask.destroy();
    } catch (err) {
      if (err instanceof PdfError) throw err;
      const kind = err instanceof Error ? err.name : '';
      throw new PdfError(kind === 'PasswordException'
        ? `"${name}" is password-protected. Remove the password and upload it again.`
        : `We couldn't read "${name}". It may be damaged; try re-saving it as a PDF.`);
    }

    // Keep whole pages until the per-document budget is reached; report how many were read.
    const kept: string[] = [];
    let chars = 0;
    for (const page of pages) {
      const clean = page.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (chars + clean.length > MAX_CHARS_PER_DOC && kept.length) break;
      kept.push(clean);
      chars += clean.length;
    }
    const readable = kept.join('').replace(/\s/g, '').length;
    if (readable < Math.max(40, 15 * kept.length)) {
      throw new PdfError(`"${name}" looks like a scanned image, so there's no readable text to analyze. Try a text-based PDF (for example, download it again from your school portal) or type the key numbers into your question.`);
    }
    docs.push({ name, pages: total, pagesRead: kept.length, text: kept.map((p, i) => `[Page ${i + 1}]\n${p}`).join('\n\n') });
  }
  return docs;
}

/** Every dollar amount written in the text, in cents (used to verify figures Claude reports). */
export function amountsInText(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g)) {
    out.add(Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0));
  }
  return out;
}
