/**
 * db:migrate — applies schema.sql then seed.sql against DATABASE_URL via HTTP.
 * Uses the NeonDB HTTP driver (no WebSocket) — compatible with both pooler and
 * direct connection strings.
 * Usage: npm run db:migrate
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL environment variable is not set.');

const sql = neon(url);

/**
 * Build a TemplateStringsArray-compatible object from a plain string so the
 * neon HTTP function can accept raw SQL without tagged-template syntax.
 */
function tsa(text: string): TemplateStringsArray {
  return Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
}

/** Split a SQL file into individual executable statements. */
function splitSql(content: string): string[] {
  return content
    .replace(/--[^\n]*/g, '')  // strip single-line comments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runFile(label: string, filePath: string): Promise<void> {
  console.log(`${label}…`);
  const statements = splitSql(readFileSync(filePath, 'utf8'));
  for (const stmt of statements) {
    await sql(tsa(stmt));
  }
}

await runFile('Dropping existing schema', join(__dirname, 'reset.sql'));
await runFile('Applying schema', join(__dirname, 'schema.sql'));
await runFile('Applying seed data', join(__dirname, 'seed.sql'));

console.log('Done ✓');
