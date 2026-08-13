import { neon } from '@neondatabase/serverless';

/** Lazily-created NeonDB HTTP SQL client. Safe to call multiple times. */
let _sql: ReturnType<typeof neon> | null = null;

export function getDb(): ReturnType<typeof neon> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set.');
    _sql = neon(url);
  }
  return _sql;
}
