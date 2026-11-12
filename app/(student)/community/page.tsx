import type { Metadata } from 'next';
import Link from 'next/link';
import { query } from '@/lib/db';
import { EDUCATION_LEVELS, getStudent, isEducationLevel } from '@/lib/student';
import { DbError, PageHeader, SampleBadge, SampleNotice } from '../ui';

export const metadata: Metadata = { title: 'Community' };

type Profile = {
  id: string; display_name: string; school: string | null; education_level: string | null;
  major: string | null; bio: string | null; interests: string[]; is_sample: boolean;
};

type SharedEvent = { event_id: string; title: string; starts_at: Date; names: string[]; samples: boolean };

export default async function CommunityPage() {
  const student = await getStudent();
  let profiles: Profile[];
  let shared: SharedEvent[] = [];
  try {
    // Only students who opted in are ever listed.
    profiles = await query<Profile>(
      `SELECT id, display_name, school, education_level, major, bio, interests, is_sample
       FROM profiles WHERE opt_in ORDER BY display_name LIMIT 100`,
    );
    // Opted-in students who RSVP'd to the same upcoming events as me (display names only).
    if (student) {
      shared = await query<SharedEvent>(
        `SELECT e.id AS event_id, e.title, e.starts_at, array_agg(DISTINCT pr.display_name) AS names, bool_and(pr.is_sample) AS samples
         FROM event_rsvps mine
         JOIN events e ON e.id = mine.event_id AND e.deleted_at IS NULL AND e.starts_at >= now() - interval '1 day'
         JOIN event_rsvps other ON other.event_id = e.id AND other.user_id <> $1
         JOIN profiles pr ON pr.user_id = other.user_id AND pr.opt_in
         WHERE mine.user_id = $1
         GROUP BY e.id, e.title, e.starts_at ORDER BY e.starts_at LIMIT 10`,
        [student.id],
      );
    }
  } catch {
    return <div className="se-page"><PageHeader emoji="🤝" title="Community" /><DbError /></div>;
  }

  return (
    <div className="se-page">
      <PageHeader emoji="🤝" title="Community">Classmates who chose to share a profile. Find study buddies, mentors, and collaborators.</PageHeader>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/community/messages" className="se-pill bg-se-sky">💬 Messages</Link>
        <Link href="/travel" className="se-pill bg-se-lavender">🎒 Find travel buddies</Link>
        <Link href="/events" className="se-pill bg-white">🎪 Browse events</Link>
      </div>
      {shared.length > 0 && (
        <section className="mb-8 grid gap-3" aria-labelledby="same-events">
          <h2 id="same-events" className="text-2xl font-extrabold">🎪 Going to the same events as you</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {shared.map((s) => (
              <li key={s.event_id} className="se-card grid gap-2 p-5">
                <Link href={`/events/${s.event_id}`} className="text-lg font-extrabold underline">{s.title}</Link>
                <p className="text-sm">{s.names.length} classmate{s.names.length === 1 ? '' : 's'} going: {s.names.join(', ')} {s.samples && <SampleBadge />}</p>
                <Link href={`/travel?event=${s.event_id}`} className="se-pill justify-self-start bg-se-sage">🎒 Plan travel together</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
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
