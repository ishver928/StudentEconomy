import type { Metadata } from 'next';
import { PageHeader } from '../ui';

export const metadata: Metadata = { title: 'Travel' };

const ideas = [
  { emoji: '🚌', title: 'Trip home for the holidays', detail: 'Set a savings goal and split rides with classmates.' },
  { emoji: '🏕️', title: 'Club road trips', detail: 'Pool contributions for competitions and conferences.' },
  { emoji: '✈️', title: 'Study abroad fund', detail: 'Save a little each week toward a semester away.' },
];

export default function TravelPage() {
  return (
    <div className="se-page">
      <PageHeader emoji="🎒" title="Travel">Plan trips and save for them together. Full trip planning is coming in a later phase.</PageHeader>
      <ul className="grid gap-4 md:grid-cols-3">
        {ideas.map((i) => (
          <li key={i.title} className="se-card p-6">
            <p className="text-4xl" aria-hidden>{i.emoji}</p>
            <h2 className="mt-2 text-lg font-extrabold">{i.title}</h2>
            <p className="mt-1 text-sm text-se-charcoal/75">{i.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
