/**
 * db:migrate — applies schema.sql then seed.sql against DATABASE_URL.
 * Requires Node.js 18+ (for native WebSocket) and DATABASE_URL to be set.
 * Usage: npm run db:migrate
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, neonConfig } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
const seed   = readFileSync(join(__dirname, 'seed.sql'), 'utf8');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL environment variable is not set.');

// Pool uses WebSocket; Node 22 ships with globalThis.WebSocket built-in.
neonConfig.webSocketConstructor = (globalThis as Record<string, unknown>)['WebSocket'] as typeof WebSocket;

const pool = new Pool({ connectionString: url });

try {
  console.log('Applying schema…');
  await pool.query(schema);

  console.log('Applying seed data…');
  await pool.query(seed);

  console.log('Done ✓');
} finally {
  await pool.end();
}
