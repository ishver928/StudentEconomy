// Small shared building blocks for the student pages.
import type { ReactNode } from 'react';

export function PageHeader({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">
        <span aria-hidden>{emoji}</span> {title}
      </h1>
      {children && <p className="mt-2 max-w-2xl text-se-charcoal/75">{children}</p>}
    </header>
  );
}

export function SampleBadge() {
  return <span className="inline-block rounded-full bg-se-lavender px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">Sample data</span>;
}

export function SampleNotice() {
  return (
    <p className="mb-6 rounded-2xl border-2 border-dashed border-se-lavender bg-white/60 px-4 py-2 text-sm font-semibold">
      <SampleBadge /> Items marked “Sample data” are fictional demo records.
    </p>
  );
}

export function DbError() {
  return <p className="se-card p-4 font-semibold">We couldn&apos;t reach the database right now. Please try again shortly.</p>;
}

export const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
