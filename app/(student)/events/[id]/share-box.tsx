'use client';
import { useState, useSyncExternalStore } from 'react';

const noop = () => () => {};

export function ShareBox({ path }: { path: string }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => '');
  const url = `${origin}${path}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input readOnly value={url} aria-label="Event link" className="se-input min-w-0 flex-1 text-sm" onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="se-pill bg-se-sky/40 hover:bg-se-sky/70"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // The link is still selectable for a manual copy.
          }
        }}
      >
        {copied ? '✅ Copied' : '🔗 Copy link'}
      </button>
    </div>
  );
}
