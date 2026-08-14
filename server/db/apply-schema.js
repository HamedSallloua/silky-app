/**
 * Applies server/db/schema.sql using DATABASE_URL from .env
 *
 * Usage: npm run db:schema
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to silky-app/.env');
  process.exit(1);
}

/** True when the chunk contains at least one non-comment, non-blank line. */
function hasExecutableSql(sql) {
  return sql.split('\n').some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('--');
  });
}

/** Split SQL on semicolons, respecting single quotes and dollar-quoted blocks. */
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  let inSingleQuote = false;
  let dollarTag = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (!inSingleQuote && !dollarTag && ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      const sliceEnd = end === -1 ? sql.length : end;
      current += sql.slice(i, sliceEnd);
      i = sliceEnd;
      continue;
    }

    if (!inSingleQuote && ch === '$') {
      const match = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (match) {
        const tag = match[0];
        if (dollarTag === null) {
          dollarTag = tag;
        } else if (dollarTag === tag) {
          dollarTag = null;
        }
        current += tag;
        i += tag.length;
        continue;
      }
    }

    if (!dollarTag && ch === "'") {
      if (inSingleQuote && next === "'") {
        current += "''";
        i += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      current += ch;
      i++;
      continue;
    }

    if (!inSingleQuote && !dollarTag && ch === ';') {
      const trimmed = current.trim();
      if (trimmed && hasExecutableSql(trimmed)) {
        statements.push(trimmed);
      }
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const trimmed = current.trim();
  if (trimmed && hasExecutableSql(trimmed)) {
    statements.push(trimmed);
  }

  return statements;
}

const pool = new Pool({ connectionString: env.databaseUrl });

try {
  const sql = readFileSync(schemaPath, 'utf8');
  const statements = splitSqlStatements(sql);

  for (const statement of statements) {
    await pool.query(statement);
  }

  console.log(`Applied ${statements.length} statements from schema.sql`);
} catch (err) {
  console.error('Schema application failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
