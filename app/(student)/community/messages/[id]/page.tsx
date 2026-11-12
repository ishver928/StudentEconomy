import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isValidId } from '@/lib/checkout';
import { query } from '@/lib/db';
import { getStudent } from '@/lib/student';
import { DbError, PageHeader, SampleBadge } from '../../../ui';
import { DemoNotice } from '../demo-notice';
import { MessageForm } from './message-form';

export const metadata: Metadata = { title: 'Chat' };

export default async function ChatPage({ params }: PageProps<'/community/messages/[id]'>) {
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const student = await getStudent();
  if (!student) return null;

  let conn: { name: string; is_sample: boolean; trip: string | null } | undefined;
  let msgs: { id: string; mine: boolean; body: string; created_at: Date }[] = [];
  try {
    // Participants only, accepted connections only.
    [conn] = await query<{ name: string; is_sample: boolean; trip: string | null }>(
      `SELECT COALESCE(NULLIF(CASE WHEN pr.opt_in THEN pr.display_name END, ''), NULLIF(u.first_name, ''), 'A student') AS name,
              u.is_sample, tp.dest_label AS trip
       FROM connections c
       JOIN users u ON u.id = CASE WHEN c.from_user = $2 THEN c.to_user ELSE c.from_user END
       LEFT JOIN profiles pr ON pr.user_id = u.id
       LEFT JOIN travel_plans tp ON tp.id = CASE WHEN c.from_user = $2 THEN c.to_plan_id ELSE c.from_plan_id END
       WHERE c.id = $1 AND c.status = 'accepted' AND (c.from_user = $2 OR c.to_user = $2)`,
      [id, student.id],
    );
    if (conn) {
      msgs = await query<{ id: string; mine: boolean; body: string; created_at: Date }>(
        `SELECT id, (sender_id = $2) AS mine, body, created_at FROM messages WHERE connection_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [id, student.id],
      );
    }
  } catch {
    return <div className="se-page"><PageHeader emoji="💬" title="Chat" /><DbError /></div>;
  }
  if (!conn) notFound();

  return (
    <div className="se-page max-w-3xl">
      <Link href="/community/messages" className="mb-4 inline-block font-bold underline">← All messages</Link>
      <PageHeader emoji="💬" title={`Chat with ${conn.name}`}>{conn.trip ? `Coordinating travel to ${conn.trip}.` : 'Travel connection.'}</PageHeader>
      <DemoNotice />
      {conn.is_sample && <p className="mb-4 text-sm font-semibold"><SampleBadge /> {conn.name} is a fictional sample student and won&apos;t reply.</p>}
      <section className="se-card grid gap-3 p-4" aria-label="Messages">
        {msgs.length === 0 ? (
          <p className="py-6 text-center text-sm text-se-charcoal/70">Say hi and agree on a meeting spot, departure time, and how you&apos;ll split costs. 👋</p>
        ) : (
          <ol className="grid max-h-[55vh] gap-2 overflow-y-auto">
            {[...msgs].reverse().map((m) => (
              <li key={m.id} className={`max-w-[80%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${m.mine ? 'justify-self-end bg-se-sky/50' : 'justify-self-start bg-se-cream'}`}>
                {m.body}
                <span className="mt-0.5 block text-[10px] text-se-charcoal/55">
                  {new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}
                </span>
              </li>
            ))}
          </ol>
        )}
        <MessageForm connectionId={id} />
      </section>
    </div>
  );
}
