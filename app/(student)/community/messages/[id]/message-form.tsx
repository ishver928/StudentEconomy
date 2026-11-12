'use client';
import { useActionState, useEffect, useRef } from 'react';
import { sendMessage, type MessageState } from '../actions';

export function MessageForm({ connectionId }: { connectionId: string }) {
  const [state, action, pending] = useActionState<MessageState, FormData>(sendMessage, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.sent) form.current?.reset(); }, [state.sent]);
  return (
    <form ref={form} action={action} className="grid gap-2">
      <input type="hidden" name="connectionId" value={connectionId} />
      <label htmlFor="body" className="sr-only">Message</label>
      <textarea id="body" name="body" rows={2} maxLength={1000} required className="se-input" placeholder="Write a message…" />
      <div className="flex items-center gap-3">
        <button className="se-button text-base" disabled={pending}>{pending ? 'Sending…' : 'Send'}</button>
        {state.error && <p role="alert" className="text-sm font-semibold text-[#b5452f]">{state.error}</p>}
      </div>
    </form>
  );
}
