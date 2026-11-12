import Link from 'next/link';
import { SproutLogo } from '../sprout-logo';
import { query } from '@/lib/db';
import { getStudent } from '@/lib/student';
import { Nav } from './nav';
import { Onboarding } from './onboarding';
import { resetOnboarding } from './actions';

async function schoolSuggestions(): Promise<string[]> {
  try {
    const rows = await query<{ school: string }>(
      'SELECT DISTINCT school FROM users WHERE is_sample AND school IS NOT NULL ORDER BY school LIMIT 5',
    );
    return rows.map((r) => r.school);
  } catch {
    return [];
  }
}

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const student = await getStudent();

  return (
    <div className="se-app flex min-h-full flex-1 flex-col">
      <p role="status" className="bg-se-charcoal px-4 py-1.5 text-center text-sm font-bold tracking-wide text-se-cream">
        🧪 PayPal Sandbox — No Real Money
      </p>
      <header className="border-b-2 border-se-charcoal/10 bg-se-sky/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-3">
          <Link href="/" className="flex items-center gap-2 text-xl font-extrabold">
            <SproutLogo className="size-9" title="Sprout logo" /> Sprout
          </Link>
          {student && (
            <form action={resetOnboarding} className="flex items-center gap-2 text-sm">
              <span>Hi, {student.firstName || 'there'}!</span>
              <button type="submit" className="underline decoration-dotted hover:text-se-sage-dark">Change preferences</button>
            </form>
          )}
        </div>
        {student && <Nav />}
      </header>
      <main className="flex-1">
        {student ? children : <Onboarding schoolSuggestions={await schoolSuggestions()} />}
      </main>
      <footer className="px-4 py-6 text-center text-sm text-se-charcoal/60">
        Sprout 🌱 Small beginnings. Big opportunities. · Sandbox prototype · Demo-only identity (browser cookie, not real sign-in) · <Link href="/dashboard" className="underline">PayPal data dashboard</Link>
      </footer>
    </div>
  );
}
