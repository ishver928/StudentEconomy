import type { Metadata } from 'next';
import Link from 'next/link';
import { getStudent } from '@/lib/student';
import { getConnections, type Connection } from '@/lib/travel-data';
import { DbError, PageHeader, SampleBadge } from '../../ui';
import { DemoNotice } from './demo-notice';

export const metadata: Metadata = { title: 'Messages' };

export default async function MessagesPage() {
  const student = await getStudent();
  if (!student) return null;
  let conns: Connection[];
  try {
    conns = await getConnections(student.id);
  } catch {
    return <div className="se-page"><PageHeader emoji="💬" title="Messages" /><DbError /></div>;
  }
  const accepted = conns.filter((c) => c.status === 'accepted');
  const pending = conns.filter((c) => c.status === 'pending');
  return (
    <div className="se-page max-w-3xl">
      <Link href="/community" className="mb-4 inline-block font-bold underline">← Community</Link>
      <PageHeader emoji="💬" title="Messages">Private chats with students you&apos;ve connected with through Travel.</PageHeader>
      <DemoNotice />
      {accepted.length === 0 ? (
        <div className="se-card grid gap-2 p-6 text-center">
          <p className="text-4xl" aria-hidden>🌱</p>
          <p className="font-bold">No conversations yet</p>
          <p className="text-sm text-se-charcoal/70">Save a trip with matching on, then connect with students going your way.</p>
          <Link href="/travel" className="se-button mx-auto mt-2 text-base">Find travel buddies</Link>
        </div>
      ) : (
        <ul className="grid gap-2">
          {accepted.map((c) => (
            <li key={c.id}>
              <Link href={`/community/messages/${c.id}`} className="se-card flex items-center gap-3 p-4 hover:-translate-y-0.5">
                <span aria-hidden className="grid size-11 place-items-center rounded-full bg-se-lavender text-lg font-extrabold">{c.name.charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">{c.name} {c.isSample && <SampleBadge />}</span>
                  <span className="block truncate text-sm text-se-charcoal/70">{c.tripLabel ? `Trip: ${c.tripLabel}` : 'Travel connection'}</span>
                </span>
                {c.lastMessageAt && <span className="text-xs text-se-charcoal/60">{new Date(c.lastMessageAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <p className="mt-4 text-sm text-se-charcoal/70">
          {pending.length} pending request{pending.length === 1 ? '' : 's'}. <Link href="/travel" className="font-bold underline">Review on Travel</Link>
        </p>
      )}
    </div>
  );
}
