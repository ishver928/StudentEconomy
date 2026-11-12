import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { EDUCATION_LEVELS, isEducationLevel } from '@/lib/student';
import { DbError, PageHeader, SampleBadge, SampleNotice } from '../ui';

export const metadata: Metadata = { title: 'Community' };

type Profile = {
  id: string; display_name: string; school: string | null; education_level: string | null;
  major: string | null; bio: string | null; interests: string[]; is_sample: boolean;
};

export default async function CommunityPage() {
  let profiles: Profile[];
  try {
    // Only students who opted in are ever listed.
    profiles = await query<Profile>(
      `SELECT id, display_name, school, education_level, major, bio, interests, is_sample
       FROM profiles WHERE opt_in ORDER BY display_name LIMIT 100`,
    );
  } catch {
    return <div className="se-page"><PageHeader emoji="🤝" title="Community" /><DbError /></div>;
  }

  return (
    <div className="se-page">
      <PageHeader emoji="🤝" title="Community">Classmates who chose to share a profile. Find study buddies, mentors, and collaborators.</PageHeader>
      {profiles.some((p) => p.is_sample) && <SampleNotice />}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p) => (
          <li key={p.id} className="se-card flex flex-col gap-2 p-5">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-12 place-items-center rounded-full bg-se-lavender text-xl font-extrabold">
                {p.display_name.charAt(0)}
              </span>
              <div>
                <h2 className="text-lg font-extrabold">{p.display_name}</h2>
                <p className="text-xs text-se-charcoal/65">
                  {[p.major, isEducationLevel(p.education_level) ? EDUCATION_LEVELS[p.education_level] : null].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <p className="text-sm">{p.bio}</p>
            <div className="mt-auto flex flex-wrap gap-1.5 text-xs font-semibold">
              {p.interests.map((i) => <span key={i} className="rounded-full bg-se-sky/60 px-2.5 py-0.5">{i}</span>)}
              {p.is_sample && <SampleBadge />}
            </div>
            {p.school && <p className="text-xs text-se-charcoal/60">📍 {p.school}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
