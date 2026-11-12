// The six areas of StudentEconomy, shared by the nav and the homepage islands.
export const SECTIONS = [
  { href: '/marketplace', label: 'Marketplace', emoji: '🛍️', blurb: 'Buy and sell campus gear', color: 'var(--se-peach)' },
  { href: '/community', label: 'Community', emoji: '🤝', blurb: 'Meet opt-in classmates', color: 'var(--se-lavender)' },
  { href: '/events', label: 'Club Events', emoji: '🎪', blurb: 'Fund and join club events', color: 'var(--se-sky)' },
  { href: '/finances', label: 'My Finances', emoji: '🐷', blurb: 'Track spending and goals', color: 'var(--se-sage)' },
  { href: '/skillswap', label: 'SkillSwap', emoji: '🎓', blurb: 'Trade skills and tutoring', color: 'var(--se-peach)' },
  { href: '/travel', label: 'Travel', emoji: '🎒', blurb: 'Plan trips home and away', color: 'var(--se-lavender)' },
] as const;
