// Shared pg client config for the db/ scripts. Render requires SSL for external connections.
import pg from 'pg';

export function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.local)');
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
}
