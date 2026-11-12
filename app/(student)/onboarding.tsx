'use client';

import { useActionState } from 'react';
import { saveOnboarding } from './actions';
import { EDUCATION_LEVELS } from '@/lib/education';

// First-visit form. School suggestions come from the database, not hardcoded names.
export function Onboarding({ schoolSuggestions }: { schoolSuggestions: string[] }) {
  const [error, action, pending] = useActionState(saveOnboarding, null);

  return (
    <section className="mx-auto w-full max-w-lg px-4 py-10">
      <div className="se-card p-6 sm:p-8">
        <p className="text-sm font-bold uppercase tracking-wider text-se-sage-dark">Welcome aboard ✦</p>
        <h1 className="mt-1 text-3xl font-extrabold">Let&apos;s set up your campus world</h1>
        <p className="mt-2 text-se-charcoal/75">Three quick questions. No account needed.</p>

        <form action={action} className="mt-6 grid gap-5">
          <label className="grid gap-1.5">
            <span className="font-bold">First name <span className="font-normal text-se-charcoal/60">(optional)</span></span>
            <input name="firstName" maxLength={40} autoComplete="given-name" className="se-input" placeholder="What should we call you?" />
          </label>

          <label className="grid gap-1.5">
            <span className="font-bold">School</span>
            <input name="school" required maxLength={120} list="school-suggestions" className="se-input" placeholder="Type your school's name" />
            <datalist id="school-suggestions">
              {schoolSuggestions.map((s) => <option key={s} value={s} />)}
            </datalist>
            {schoolSuggestions.length > 0 && (
              <span className="text-sm text-se-charcoal/60">Examples (sample campuses): {schoolSuggestions.join(' · ')}</span>
            )}
          </label>

          <fieldset className="grid gap-2">
            <legend className="mb-1.5 font-bold">Education level</legend>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(EDUCATION_LEVELS).map(([value, label]) => (
                <label key={value} className="se-choice">
                  <input type="radio" name="level" value={value} required className="sr-only peer" />
                  <span className="peer-checked:bg-se-sky peer-checked:border-se-sky-dark peer-focus-visible:ring-4 peer-focus-visible:ring-se-lavender">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p role="alert" className="rounded-xl bg-se-peach/60 px-3 py-2 font-semibold">{error}</p>}

          <button type="submit" disabled={pending} className="se-button">
            {pending ? 'Saving…' : 'Enter my campus →'}
          </button>
        </form>
      </div>
    </section>
  );
}
