import { money } from '../ui';

export function GoalProgress({ saved, target }: { saved: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm font-bold">
        <span>{money(saved)} raised</span>
        <span>{pct}% of {money(target)}</span>
      </div>
      <div className="mt-1 h-3.5 rounded-full bg-se-cream ring-1 ring-se-charcoal/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-se-sage" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-se-charcoal/65">{saved >= target ? 'Fully funded 🎉' : `${money(target - saved)} to go`}</p>
    </div>
  );
}

export const KIND_LABELS: Record<string, string> = { personal: '🌱 Personal', club: '🎪 Club', travel: '🎒 Travel' };
