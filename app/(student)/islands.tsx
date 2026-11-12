// The floating-island campus map on the homepage. Pure SVG + CSS (see .se-island in globals.css).
import Link from 'next/link';
import { SECTIONS } from './sections';

// A small landmark drawn on top of each island, in the same order as SECTIONS.
const LANDMARKS = [
  // Marketplace: striped market stall
  <g key="market">
    <rect x="-22" y="-30" width="44" height="26" rx="3" fill="#fff8ec" stroke="#3b3633" strokeWidth="2.5" />
    <path d="M-27 -30 h54 l-5 -12 h-44 z" fill="#ff8f7a" stroke="#3b3633" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M-16 -42 v12 M-5 -42 v12 M6 -42 v12 M17 -42 v12" stroke="#fff8ec" strokeWidth="4" />
    <rect x="-8" y="-20" width="16" height="16" rx="2" fill="#9fd3f0" stroke="#3b3633" strokeWidth="2" />
  </g>,
  // Community: two friendly houses
  <g key="community">
    <path d="M-28 -4 v-20 l12 -12 l12 12 v20 z" fill="#d7c4f0" stroke="#3b3633" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M2 -4 v-24 l13 -13 l13 13 v24 z" fill="#ffc9a8" stroke="#3b3633" strokeWidth="2.5" strokeLinejoin="round" />
    <rect x="-20" y="-16" width="8" height="12" rx="2" fill="#3b3633" />
    <circle cx="15" cy="-18" r="4.5" fill="#fff8ec" stroke="#3b3633" strokeWidth="2" />
  </g>,
  // Club Events: circus-style tent with a flag
  <g key="events">
    <path d="M-26 -4 l26 -36 l26 36 z" fill="#fff8ec" stroke="#3b3633" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M-13 -22 l13 18 l13 -18" fill="none" stroke="#ff8f7a" strokeWidth="4" />
    <path d="M0 -40 v-12 l10 4 l-10 4" fill="#ff8f7a" stroke="#3b3633" strokeWidth="2" strokeLinejoin="round" />
  </g>,
  // My Finances: piggy bank with a coin
  <g key="finances">
    <ellipse cx="0" cy="-18" rx="22" ry="15" fill="#ffc9a8" stroke="#3b3633" strokeWidth="2.5" />
    <circle cx="20" cy="-20" r="6" fill="#ffc9a8" stroke="#3b3633" strokeWidth="2.5" />
    <path d="M-12 -4 v4 M10 -4 v4" stroke="#3b3633" strokeWidth="4" strokeLinecap="round" />
    <circle cx="8" cy="-23" r="2" fill="#3b3633" />
    <rect x="-6" y="-34" width="10" height="3" rx="1.5" fill="#3b3633" />
    <circle cx="-1" cy="-44" r="7" fill="#ffd66b" stroke="#3b3633" strokeWidth="2.5" />
  </g>,
  // SkillSwap: stack of books with a lightbulb
  <g key="skills">
    <rect x="-22" y="-14" width="44" height="10" rx="2" fill="#9fd3f0" stroke="#3b3633" strokeWidth="2.5" />
    <rect x="-18" y="-24" width="38" height="10" rx="2" fill="#d7c4f0" stroke="#3b3633" strokeWidth="2.5" />
    <circle cx="0" cy="-40" r="9" fill="#ffd66b" stroke="#3b3633" strokeWidth="2.5" />
    <rect x="-4" y="-32" width="8" height="5" rx="1" fill="#3b3633" />
  </g>,
  // Travel: hot-air balloon tethered to the island
  <g key="travel">
    <path d="M-4 -12 l-4 -14 M4 -12 l4 -14" stroke="#3b3633" strokeWidth="2" />
    <rect x="-8" y="-12" width="16" height="9" rx="2" fill="#c98b5b" stroke="#3b3633" strokeWidth="2.5" />
    <circle cx="0" cy="-42" r="18" fill="#ff8f7a" stroke="#3b3633" strokeWidth="2.5" />
    <path d="M0 -60 c-9 8 -9 28 0 36 c9 -8 9 -28 0 -36" fill="#fff8ec" stroke="#3b3633" strokeWidth="2" />
  </g>,
];

function IslandArt({ color, index }: { color: string; index: number }) {
  return (
    <svg viewBox="-60 -70 120 120" className="w-full" aria-hidden focusable="false">
      {/* rocky underside */}
      <path d="M-50 4 q50 70 100 0 z" fill="#c9a27e" stroke="#3b3633" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M-22 22 q22 20 44 0" fill="none" stroke="#a37f5f" strokeWidth="3" strokeLinecap="round" />
      {/* grassy top */}
      <ellipse cx="0" cy="2" rx="52" ry="14" fill={color} stroke="#3b3633" strokeWidth="2.5" />
      <ellipse cx="0" cy="-1" rx="40" ry="7" fill="#fff" opacity="0.35" />
      {LANDMARKS[index]}
    </svg>
  );
}

function Mascot() {
  // A simple geometric student: round head, graduation cap, backpack, waving arm.
  return (
    <svg viewBox="0 0 120 150" className="se-mascot w-24 sm:w-28" role="img" aria-label="StudentEconomy mascot waving hello">
      <rect x="30" y="72" width="60" height="56" rx="26" fill="#9fd3f0" stroke="#3b3633" strokeWidth="3" />
      <rect x="22" y="80" width="16" height="34" rx="7" fill="#b5d3a8" stroke="#3b3633" strokeWidth="3" />
      <g className="se-mascot-arm">
        <path d="M86 92 q18 -10 20 -32" fill="none" stroke="#3b3633" strokeWidth="9" strokeLinecap="round" />
        <path d="M86 92 q18 -10 20 -32" fill="none" stroke="#9fd3f0" strokeWidth="4" strokeLinecap="round" />
      </g>
      <circle cx="60" cy="50" r="30" fill="#ffd9bf" stroke="#3b3633" strokeWidth="3" />
      <circle cx="49" cy="52" r="3.5" fill="#3b3633" />
      <circle cx="71" cy="52" r="3.5" fill="#3b3633" />
      <circle cx="43" cy="60" r="4" fill="#ff8f7a" opacity="0.6" />
      <circle cx="77" cy="60" r="4" fill="#ff8f7a" opacity="0.6" />
      <path d="M53 62 q7 6 14 0" fill="none" stroke="#3b3633" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M28 24 l32 -14 l32 14 l-32 14 z" fill="#3b3633" />
      <rect x="44" y="26" width="32" height="10" rx="2" fill="#3b3633" />
      <path d="M90 25 v16" stroke="#ffd66b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="90" cy="43" r="3.5" fill="#ffd66b" />
    </svg>
  );
}

export function IslandWorld({ name }: { name: string }) {
  return (
    <section className="se-sky relative overflow-hidden" aria-labelledby="world-title">
      <div aria-hidden className="se-cloud left-[6%] top-10 w-28" />
      <div aria-hidden className="se-cloud right-[8%] top-24 w-36 [animation-delay:-8s]" />
      <div aria-hidden className="se-cloud left-[40%] bottom-8 w-24 [animation-delay:-16s]" />

      <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-8">
        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center sm:gap-5 sm:text-left">
          <Mascot />
          <div>
            <h1 id="world-title" className="text-3xl font-extrabold sm:text-5xl">Hi, {name}!</h1>
            <p className="mt-1 text-lg text-se-charcoal/80">Welcome to your floating campus. Pick an island to explore.</p>
          </div>
        </div>

        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 md:gap-x-10">
          {SECTIONS.map((s, i) => (
            <li key={s.href} className={i % 2 ? 'md:translate-y-10' : ''}>
              <Link href={s.href} className="se-island group block rounded-[2rem] text-center" style={{ animationDelay: `${-i * 0.9}s` }}>
                <IslandArt color={s.color} index={i} />
                <span className="mt-1 inline-block rounded-full bg-white/85 px-4 py-1 text-base font-extrabold shadow-sm sm:text-lg">
                  {s.label}
                </span>
                <span className="mt-1 block text-sm text-se-charcoal/75">{s.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
