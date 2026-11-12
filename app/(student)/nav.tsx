'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTIONS } from './sections';

export function Nav() {
  const pathname = usePathname();
  const links = [
    { href: '/', label: 'Home', emoji: '🏠' },
    { href: '/navigator', label: 'AI Navigator', emoji: '🧭' },
    ...SECTIONS,
    { href: '/goals', label: 'Funding Goals', emoji: '🎯' },
  ];

  return (
    <nav aria-label="Main" className="overflow-x-auto">
      <ul className="flex min-w-max gap-2 px-4 py-2 sm:justify-center">
        {links.map(({ href, label, emoji }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`se-pill ${active ? 'bg-se-charcoal text-se-cream' : 'bg-white/70 hover:bg-white'}`}
              >
                <span aria-hidden>{emoji}</span> {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
