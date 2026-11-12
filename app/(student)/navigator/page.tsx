import type { Metadata } from 'next';
import { liveAiConfigured } from '@/lib/navigator';
import { PageHeader } from '../ui';
import { Navigator } from './navigator';

export const metadata: Metadata = { title: 'AI Navigator' };

export default function NavigatorPage() {
  return (
    <div className="se-page max-w-4xl">
      <PageHeader emoji="🧭" title="AI Opportunity Navigator">
        Tell us what you want to do and what it costs. We&apos;ll map a plan using real listings, funding goals, events, and skills on Sprout.
      </PageHeader>
      <Navigator liveAi={liveAiConfigured()} />
    </div>
  );
}
