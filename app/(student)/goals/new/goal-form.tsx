'use client';
import { useActionState } from 'react';
import { createGoal, type GoalFormState } from '../actions';

export function GoalForm({ defaults }: { defaults: { title: string; target: string; description: string; kind: string } }) {
  const [state, action, pending] = useActionState<GoalFormState, FormData>(createGoal, {});
  return (
    <form action={action} className="se-card grid gap-4 p-6">
      <label className="grid gap-1 font-bold">
        Goal title
        <input name="title" required minLength={3} maxLength={80} defaultValue={defaults.title} className="se-input" placeholder="e.g. Hackathon travel fund" />
      </label>
      <label className="grid gap-1 font-bold">
        What is it for? <span className="text-sm font-semibold text-se-charcoal/60">(optional)</span>
        <textarea name="description" maxLength={500} rows={3} defaultValue={defaults.description} className="se-input" />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1 font-bold">
          Target ($)
          <input name="target" required inputMode="decimal" pattern="\d{1,6}(\.\d{1,2})?" defaultValue={defaults.target} className="se-input" placeholder="300" />
        </label>
        <label className="grid gap-1 font-bold">
          Type
          <select name="kind" defaultValue={defaults.kind} className="se-input">
            <option value="travel">🎒 Travel</option>
            <option value="personal">🌱 Personal</option>
            <option value="club">🎪 Club</option>
          </select>
        </label>
        <label className="grid gap-1 font-bold">
          Deadline <span className="text-sm font-semibold text-se-charcoal/60">(optional)</span>
          <input name="deadline" type="date" className="se-input" />
        </label>
      </div>
      {state.error && <p role="alert" className="rounded-2xl bg-[#ffb3a7]/70 px-4 py-2 font-semibold">{state.error}</p>}
      <button className="se-button justify-self-start" disabled={pending}>{pending ? 'Creating…' : 'Create goal'}</button>
    </form>
  );
}
