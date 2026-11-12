'use client';
import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import type { DocAnalysis, DocItemKind, Plan, PlanRef } from '@/lib/navigator';
import { askNavigator, type NavigatorState } from './actions';

const EXAMPLE = "I'm a college student who wants to attend a hackathon, but I need $300 for travel and expenses. Help me make it happen.";
const DOC_EXAMPLE = 'Here is my financial aid letter. How much will I actually pay next year, and how can I close the gap?';
const KIND_ICON: Record<PlanRef['kind'], string> = { listing: '🛍️', goal: '🎯', event: '🎪', skill: '🎓' };
const KIND_NAME: Record<PlanRef['kind'], string> = { listing: 'Listing', goal: 'Funding goal', event: 'Event', skill: 'SkillSwap' };
const MAX_FILES = 3; // keep in sync with lib/pdf.ts (re-validated on the server)
const MAX_MB = 10;

export function Navigator({ liveAi }: { liveAi: boolean }) {
  const [state, action, pending] = useActionState<NavigatorState, FormData>(askNavigator, {});
  const [question, setQuestion] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    const next = [...files];
    let problem = '';
    for (const f of Array.from(list ?? [])) {
      if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) problem = `"${f.name}" isn't a PDF.`;
      else if (f.size > MAX_MB * 1024 * 1024) problem = `"${f.name}" is larger than ${MAX_MB} MB.`;
      else if (next.length >= MAX_FILES) problem = `You can attach up to ${MAX_FILES} PDFs per message.`;
      else if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
    setFileError(problem);
    if (picker.current) picker.current.value = '';
  }

  // Attachments live in React state (so chips can be removed) and are added to the form data here.
  function submit(form: FormData) {
    form.delete('pdfs');
    for (const f of files) form.append('pdfs', f);
    action(form);
  }

  return (
    <div className="grid gap-6">
      <form action={submit} className="se-card grid gap-3 p-6">
        <label htmlFor="question" className="text-lg font-extrabold">What do you want to make happen?</label>
        <textarea
          id="question"
          name="question"
          rows={3}
          maxLength={600}
          required={files.length === 0}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={files.length ? DOC_EXAMPLE : EXAMPLE}
          className="se-input"
        />
        <input ref={picker} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Attached PDFs">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}`} className="flex max-w-full items-center gap-1.5 rounded-full bg-se-sky/40 py-1 pl-3 pr-1 text-sm font-bold">
                <span aria-hidden>📄</span>
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 font-semibold text-se-charcoal/60">{f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => { setFiles(files.filter((_, j) => j !== i)); setFileError(''); }}
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-white/80 hover:bg-white"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileError && <p role="alert" className="text-sm font-semibold text-[#b5452f]">{fileError}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className="se-button" disabled={pending}>{pending ? (files.length ? 'Reading your documents…' : 'Planning…') : 'Plan it with the Navigator'}</button>
          <button
            type="button"
            className="se-pill bg-se-sky/40 hover:bg-se-sky/70 disabled:opacity-50"
            onClick={() => picker.current?.click()}
            disabled={pending || !liveAi || files.length >= MAX_FILES}
            title={liveAi ? `Attach up to ${MAX_FILES} PDFs, ${MAX_MB} MB each` : 'Document upload needs live AI (Claude)'}
          >
            📎 Attach PDFs
          </button>
          <button type="button" className="se-pill bg-se-cream" onClick={() => setQuestion(EXAMPLE)}>✨ Try the hackathon example</button>
          <span className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${liveAi ? 'bg-se-sage' : 'bg-se-lavender'}`}>
            {liveAi ? 'Live AI (Claude)' : 'Demo mode · rule-based, not a live AI'}
          </span>
        </div>
        <p className="text-xs text-se-charcoal/60">
          {liveAi
            ? `📄 Got an aid letter, cost breakdown, or budget? Attach up to ${MAX_FILES} PDFs (${MAX_MB} MB each). Sprout reads the text on our server and sends it to Claude (Anthropic's AI) to build your plan. Files aren't saved. Remove anything you don't want to share, like your student ID or SSN, before uploading.`
            : 'PDF upload is available when live AI (Claude) is turned on.'}
        </p>
        {state.error && <p role="alert" className="rounded-2xl bg-[#ffb3a7]/70 px-4 py-2 font-semibold">{state.error}</p>}
      </form>
      {pending && (
        <p className="se-card animate-pulse p-6 font-semibold">
          {files.length ? '📄 Reading your documents and crunching the numbers… this can take up to a minute.' : '🧭 Mapping your route across the islands…'}
        </p>
      )}
      {!pending && state.plan && <PlanView plan={state.plan} />}
    </div>
  );
}

function PlanView({ plan }: { plan: Plan }) {
  const goalHref = `/goals/new?${new URLSearchParams({ title: plan.goal.title, target: plan.goal.target, description: plan.goal.description, kind: plan.goal.kind })}`;
  return (
    <section aria-label="Your plan" className="grid gap-4">
      <div className="se-card p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-se-charcoal/60">
          {plan.mode === 'live' ? 'Generated by live AI (Claude)' : 'Demo mode: rule-based plan built from Sprout data (no live AI)'}
        </p>
        {plan.modeNote && <p className="mt-1 text-sm font-semibold text-se-charcoal/70">{plan.modeNote}</p>}
        <p className="mt-2 text-lg font-semibold">{plan.summary}</p>
        {plan.noMatches.length > 0 && (
          <p className="mt-2 text-sm text-se-charcoal/70">Sprout doesn&apos;t have matching {plan.noMatches.join(', ')} for this yet.</p>
        )}
        <Link href={goalHref} className="se-button mt-4 inline-block text-base">
          🎯 {plan.goal.target ? 'Create this funding goal' : 'Create a funding goal'}
        </Link>
      </div>

      {plan.documents.length > 0 && (
        <div className={`grid gap-4 ${plan.documents.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {plan.documents.map((d, i) => <DocumentCard key={i} doc={d} />)}
        </div>
      )}

      <ol className="grid gap-4">
        {plan.steps.map((s, i) => (
          <li key={i} className="se-card p-6">
            <h3 className="flex items-start gap-3 text-lg font-extrabold">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-se-peach">{i + 1}</span>
              {s.title}
            </h3>
            <p className="mt-2 text-se-charcoal/80">{s.detail}</p>
            {i === 0 && plan.steps[0].refs.length === 0 && (
              <Link href={goalHref} className="mt-2 inline-block font-bold underline">Open the pre-filled goal form →</Link>
            )}
            {s.refs.length > 0 && (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {s.refs.map((r) => (
                  <li key={`${r.kind}:${r.id}`}>
                    <Link href={r.href} className="flex h-full flex-col gap-1 rounded-2xl bg-se-cream p-3 ring-1 ring-se-charcoal/10 transition-transform hover:-translate-y-0.5">
                      <span className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                        <span className="rounded-full bg-se-sage px-2 py-0.5">✅ On Sprout</span>
                        <span className="rounded-full bg-white px-2 py-0.5">{KIND_ICON[r.kind]} {KIND_NAME[r.kind]}</span>
                        {r.isSample && <span className="rounded-full bg-se-lavender px-2 py-0.5">Fictional sample</span>}
                      </span>
                      <span className="font-extrabold">{r.title}</span>
                      <span className="text-sm text-se-charcoal/70">{r.meta}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {plan.tips.length > 0 && (
        <div className="se-card border-2 border-dashed border-se-lavender p-6">
          <h3 className="text-lg font-extrabold">💡 General suggestions</h3>
          <p className="text-sm text-se-charcoal/60">General ideas, not verified Sprout data. Check details before relying on them.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {plan.tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
      <p className="text-center text-xs text-se-charcoal/60">The Navigator only suggests. Every payment needs your explicit approval in PayPal sandbox.</p>
    </section>
  );
}

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const GOAL_CAP_DOLLARS = 10_000; // matches the funding-goal form limit
const GROUPS: { kinds: DocItemKind[]; label: string }[] = [
  { kinds: ['cost'], label: 'Costs' },
  { kinds: ['grant'], label: 'Grants & scholarships' },
  { kinds: ['loan', 'work_study'], label: 'Loans & work-study' },
];

function DocumentCard({ doc }: { doc: DocAnalysis }) {
  const t = doc.totals;
  const goalDollars = t ? Math.min(Math.ceil(t.gapCents / 100), GOAL_CAP_DOLLARS) : 0;
  const goalHref = `/goals/new?${new URLSearchParams({
    title: `${doc.title} gap`.slice(0, 80),
    target: String(goalDollars),
    description: `Covering the remaining gap from ${doc.title}${doc.period ? ` (${doc.period})` : ''}.`.slice(0, 500),
    kind: 'personal',
  })}`;
  return (
    <section className="se-card grid content-start gap-3 p-6" aria-label={`Analysis of ${doc.name}`}>
      <div>
        <h3 className="text-lg font-extrabold">📄 {doc.title}</h3>
        <p className="text-xs font-semibold text-se-charcoal/60">
          {doc.name} · {doc.pagesRead < doc.pages ? `first ${doc.pagesRead} of ${doc.pages} pages read` : `${doc.pages} page${doc.pages === 1 ? '' : 's'}`}
          {doc.period && ` · ${doc.period}`}
        </p>
      </div>

      {doc.items.length === 0 ? (
        <p className="rounded-2xl bg-se-cream p-3 text-sm">We couldn&apos;t find cost or aid figures in this document, so we didn&apos;t calculate anything from it.</p>
      ) : (
        <div className="rounded-2xl bg-se-cream p-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-se-charcoal/60">📄 From your document</p>
          {GROUPS.map((g) => {
            const rows = doc.items.filter((x) => g.kinds.includes(x.kind));
            return rows.length > 0 && (
              <div key={g.label} className="mt-2">
                <p className="text-sm font-extrabold">{g.label}</p>
                <ul className="text-sm">
                  {rows.map((x, i) => (
                    <li key={i} className="flex justify-between gap-3 border-b border-dashed border-se-charcoal/10 py-0.5">
                      <span>{x.label}{x.page && <span className="text-se-charcoal/50"> · p.{x.page}</span>}</span>
                      <span className="font-bold tabular-nums">{usd(x.cents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {t && (
        <div className="rounded-2xl bg-se-lavender/40 p-3 text-sm">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-se-charcoal/60">🧮 Sprout&apos;s estimate (calculated from the figures above)</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
            <dt>Total listed costs</dt><dd className="text-right font-bold tabular-nums">{usd(t.costCents)}</dd>
            <dt>− Grants &amp; scholarships</dt><dd className="text-right font-bold tabular-nums">{usd(t.grantCents)}</dd>
            <dt className="font-extrabold">Estimated out-of-pocket</dt><dd className="text-right font-extrabold tabular-nums">{usd(t.netCents)}</dd>
            {t.loanWorkCents > 0 && <><dt>− Loans &amp; work-study offered</dt><dd className="text-right font-bold tabular-nums">{usd(t.loanWorkCents)}</dd></>}
            <dt className="font-extrabold">Remaining gap</dt><dd className="text-right font-extrabold tabular-nums">{usd(t.gapCents)}</dd>
          </dl>
          {t.loanWorkCents > 0 && <p className="mt-1 text-xs text-se-charcoal/60">Loans must be repaid and work-study is earned over time, so the out-of-pocket figure is the real cost.</p>}
          {t.gapCents > 0 && (
            <Link href={goalHref} className="se-pill mt-3 bg-se-sage hover:bg-se-sage/70">
              🎯 Create a {usd(goalDollars * 100)} funding goal{t.gapCents > GOAL_CAP_DOLLARS * 100 ? ' (part of the gap)' : ''}
            </Link>
          )}
        </div>
      )}

      {doc.notes.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-se-charcoal/80">
          {doc.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      {doc.unverified > 0 && (
        <p className="text-xs text-se-charcoal/60">
          We left out {doc.unverified} figure{doc.unverified === 1 ? '' : 's'} we couldn&apos;t match exactly to the document text. Double-check it against your original.
        </p>
      )}
    </section>
  );
}
