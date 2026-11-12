// Applies db/schema.sql. Every statement is CREATE ... IF NOT EXISTS, so re-running is safe.
import { readFile } from 'node:fs/promises';
import { connect } from './client.mjs';

const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
if (/\b(DROP|TRUNCATE)\b|DELETE\s+FROM/i.test(sql.replace(/--.*$/gm, ''))) {
  throw new Error('Refusing to apply schema containing destructive statements');
}
const client = connect();
await client.connect();
try {
  await client.query(sql);
  console.log('Schema applied.');
} finally {
  await client.end();
}
