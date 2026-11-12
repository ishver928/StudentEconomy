'use client';
import { useFormStatus } from 'react-dom';

export function DeleteEventButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="se-pill bg-[#ffb3a7]/70 hover:bg-[#ffb3a7]"
      disabled={pending}
      onClick={(e) => { if (!confirm('Delete this event? This cannot be undone from the app.')) e.preventDefault(); }}
    >
      {pending ? 'Deleting…' : '🗑️ Delete event'}
    </button>
  );
}
