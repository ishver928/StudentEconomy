import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { getFinanceData, type FinanceData } from '@/lib/finance-data';
import { getStudent } from '@/lib/student';
import { DbError, PageHeader } from '../../ui';
import { FinanceStudio } from './finance-studio';

export const metadata: Metadata = { title: 'Financial Dashboard' };

export default async function FinanceDashboardPage() {
  await connection();
  const student = await getStudent();
  if (!student) return null; // the layout shows onboarding instead

  let data: FinanceData;
  try {
    data = await getFinanceData(student.id);
  } catch {
    return <div className="se-page"><PageHeader emoji="📊" title="Financial Dashboard" /><DbError /></div>;
  }
  const empty = data.transactions.length === 0 && data.goals.length === 0 && data.received.length === 0;

  return (
    <div className="se-page max-w-7xl">
      <Link href="/finances" className="mb-4 inline-block font-bold underline">← My Finances</Link>
      <PageHeader emoji="📊" title="Financial Command Center">
        Your spending, contributions, and funding goals in one interactive view. Filter by type or date, hover charts for details, and sort the tables.
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold">
        <span className="rounded-full bg-se-peach/80 px-3 py-1">🧪 PayPal Sandbox — No Real Money</span>
        <span className="rounded-full bg-se-sage/80 px-3 py-1">✅ Completed, PayPal-verified transactions only</span>
        <span className="rounded-full bg-se-lavender px-3 py-1">Goals marked “Fictional sample” are demo data</span>
        <span className="rounded-full bg-white/80 px-3 py-1">Built with AG Studio by AG Grid</span>
      </div>
      {empty ? (
        <div className="se-card grid gap-3 p-8 text-center">
          <p className="text-4xl" aria-hidden>🌱</p>
          <h2 className="text-xl font-extrabold">Nothing to chart yet</h2>
          <p className="text-se-charcoal/75">Your dashboard fills in after your first completed sandbox purchase, contribution, or funding goal.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/marketplace" className="se-button text-base">Browse the Marketplace</Link>
            <Link href="/goals" className="se-pill bg-se-cream">Explore Funding Goals</Link>
          </div>
        </div>
      ) : (
        <FinanceStudio data={data} licenseKey={process.env.AG_STUDIO} />
      )}
    </div>
  );
}
