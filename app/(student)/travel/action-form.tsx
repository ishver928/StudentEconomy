'use client';
import { useActionState, type ReactNode } from 'react';
import type { ActionState } from './actions';

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** A small form wrapper for server actions: disables while pending and shows success/error text. */
export function ActionForm({ action, children, className = '', confirm }: { action: Action; children: ReactNode; className?: string; confirm?: string }) {
  const [state, run, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form
      action={run}
      className={className}
      onSubmit={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      <fieldset disabled={pending} className={`contents ${pending ? '[&_button]:opacity-60' : ''}`}>{children}</fieldset>
      {pending && <span className="text-xs font-semibold text-se-charcoal/60" role="status">Working…</span>}
      {state.error && <p role="alert" className="w-full text-sm font-semibold text-[#b5452f]">{state.error}</p>}
      {state.ok && <p role="status" className="w-full text-sm font-semibold text-se-sage-dark">{state.ok}</p>}
    </form>
  );
}
