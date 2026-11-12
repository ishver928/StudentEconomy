// Sprout's logo: a tiny seedling with two rounded leaves on a smiling mound of soil.
// Same artwork as app/icon.svg (the favicon), inlined so it needs no image request.
export function SproutLogo({ className = 'size-9', title = 'Sprout' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      <circle cx="32" cy="32" r="30" fill="#eaf5e1" stroke="#b5d3a8" strokeWidth="2" />
      <path d="M32 45 V27" stroke="#5f8f52" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <ellipse cx="23" cy="21.5" rx="10" ry="6.5" transform="rotate(28 23 21.5)" fill="#a8d690" stroke="#4f7a45" strokeWidth="2.2" />
      <ellipse cx="41.5" cy="19.5" rx="11" ry="7" transform="rotate(-28 41.5 19.5)" fill="#c4e6b0" stroke="#4f7a45" strokeWidth="2.2" />
      <ellipse cx="32" cy="49" rx="16" ry="8.5" fill="#fff3df" stroke="#8a6a4f" strokeWidth="2" />
      <circle cx="27" cy="48" r="1.7" fill="#3b3633" />
      <circle cx="37" cy="48" r="1.7" fill="#3b3633" />
      <path d="M29.5 51 q2.5 2.2 5 0" stroke="#3b3633" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="23.5" cy="50.5" r="1.9" fill="#ffb3a0" opacity="0.8" />
      <circle cx="40.5" cy="50.5" r="1.9" fill="#ffb3a0" opacity="0.8" />
    </svg>
  );
}
