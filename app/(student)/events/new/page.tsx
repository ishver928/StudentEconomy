import type { Metadata } from 'next';
import Link from 'next/link';
import { EVENT_CATEGORIES } from '@/lib/events';
import { PageHeader } from '../../ui';
import { createEvent } from '../actions';
import { EventForm } from '../event-form';

export const metadata: Metadata = { title: 'Create an event' };

export default function NewEventPage() {
  return (
    <div className="se-page max-w-2xl">
      <Link href="/events" className="mb-4 inline-block font-bold underline">← All events</Link>
      <PageHeader emoji="🎪" title="Create an event">Share what your club is planning. Add a funding goal so classmates can chip in through PayPal Sandbox.</PageHeader>
      <EventForm
        action={createEvent}
        categories={EVENT_CATEGORIES}
        submitLabel="Create event"
        defaults={{ title: '', clubName: '', description: '', school: '', location: '', startsAtIso: '', category: '', budget: '', lat: '', lng: '', goal: null }}
      />
    </div>
  );
}
