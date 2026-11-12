import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { DbError, PageHeader, SampleBadge, SampleNotice, money } from '../ui';

export const metadata: Metadata = { title: 'SkillSwap' };

type Skill = {
  id: string; title: string; description: string | null; category: string | null;
  rate_cents: number | null; is_sample: boolean; display_name: string | null;
};

export default async function SkillSwapPage() {
  let skills: Skill[];
  try {
    // Show a provider name only when they have an opt-in community profile.
    skills = await query<Skill>(
      `SELECT s.id, s.title, s.description, s.category, s.rate_cents, s.is_sample, p.display_name
       FROM skills s LEFT JOIN profiles p ON p.user_id = s.user_id AND p.opt_in
       ORDER BY s.created_at DESC, s.id LIMIT 100`,
    );
  } catch {
    return <div className="se-page"><PageHeader emoji="🎓" title="SkillSwap" /><DbError /></div>;
  }

  return (
    <div className="se-page">
      <PageHeader emoji="🎓" title="SkillSwap">Trade what you know. Tutoring, design, career help, and more.</PageHeader>
      {skills.some((s) => s.is_sample) && <SampleNotice />}
      <ul className="grid gap-4 sm:grid-cols-2">
        {skills.map((s) => (
          <li key={s.id} className="se-card flex flex-col gap-2 p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold">{s.title}</h2>
              {s.rate_cents != null && <span className="shrink-0 rounded-full bg-se-sage px-3 py-1 text-sm font-extrabold">{money(s.rate_cents)}/hr</span>}
            </div>
            <p className="text-sm text-se-charcoal/75">{s.description}</p>
            <div className="mt-auto flex flex-wrap items-center gap-2 text-xs font-semibold">
              {s.category && <span className="rounded-full bg-se-lavender/70 px-2.5 py-0.5">{s.category}</span>}
              {s.display_name && <span>by {s.display_name}</span>}
              {s.is_sample && <SampleBadge />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
