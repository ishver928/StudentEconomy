import { query } from '@/lib/db';

// Reports database connectivity. Never echoes connection details or error messages.
export async function GET() {
  const started = Date.now();
  try {
    await query('SELECT 1');
    return Response.json({ status: 'ok', database: 'connected', latencyMs: Date.now() - started });
  } catch {
    return Response.json({ status: 'error', database: 'unreachable' }, { status: 503 });
  }
}
