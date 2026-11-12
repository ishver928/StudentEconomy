// Postgres pool for server code. Render requires SSL for external connections.
// The pool is cached on globalThis so dev hot reloads don't open new connections each time.
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

const globalForDb = globalThis as unknown as { pgPool?: Pool };

function pool(): Pool {
  if (globalForDb.pgPool) return globalForDb.pgPool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.local)');
  const local = /localhost|127\.0\.0\.1/.test(url);
  globalForDb.pgPool = new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 5,
  });
  return globalForDb.pgPool;
}

export async function query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}

// Runs `fn` inside BEGIN/COMMIT on one pooled connection; rolls back if it throws.
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
