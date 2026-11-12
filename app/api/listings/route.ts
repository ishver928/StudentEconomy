import { query } from '@/lib/db';

type Listing = {
  id: string; title: string; description: string | null; category: string; condition: string | null;
  price_cents: number; school: string | null; status: string; is_sample: boolean; created_at: Date;
};

// Available marketplace listings. Prices are in integer cents straight from the database.
export async function GET() {
  try {
    const listings = await query<Listing>(
      `SELECT id, title, description, category, condition, price_cents, school, status, is_sample, created_at
       FROM listings WHERE status = 'available' ORDER BY created_at DESC, id LIMIT 100`,
    );
    return Response.json({ listings, count: listings.length });
  } catch {
    return Response.json({ error: 'Could not load listings' }, { status: 503 });
  }
}
