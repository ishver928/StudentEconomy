import Link from 'next/link';
import { getStudent } from '@/lib/student';
import { SECTIONS } from './sections';

export default async function Home() {
  const student = await getStudent();
  return (
    <div className="se-page">
      <h1 className="text-3xl font-extrabold">Hi, {student?.firstName || 'there'}! 👋</h1>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="se-card block p-5 hover:-translate-y-1 transition-transform">
              <span className="text-2xl font-extrabold">{s.emoji} {s.label}</span>
              <p className="text-se-charcoal/75">{s.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
