import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '../../ui';
import { GoalForm } from './goal-form';

export const metadata: Metadata = { title: 'New funding goal' };

const str = (v: string | string[] | undefined, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

// Accepts optional ?title=&target=&description=&kind= so the AI Navigator can prefill the form.
export default async function NewGoalPage({ searchParams }: PageProps<'/goals/new'>) {
  const sp = await searchParams;
  const target = str(sp.target, 9);
  const kind = str(sp.kind, 10);
  return (
    <div className="se-page max-w-2xl">
      <Link href="/goals" className="mb-4 inline-block font-bold underline">← All funding goals</Link>
      <PageHeader emoji="🎯" title="Start a funding goal">Tell classmates what you are saving for. Contributions come in through PayPal sandbox.</PageHeader>
      <GoalForm
        defaults={{
          title: str(sp.title, 80),
          description: str(sp.description, 500),
          target: /^\d{1,6}(\.\d{1,2})?$/.test(target) ? target : '',
          kind: ['personal', 'club', 'travel'].includes(kind) ? kind : 'travel',
          plan: str(sp.plan, 64), // a travel plan to link the new goal to (ownership checked on save)
        }}
      />
    </div>
  );
}
