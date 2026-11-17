import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export type Db = pg.Pool;

export function createPool(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) throw new Error('DATABASE_URL não definida');
  return new pg.Pool({ connectionString, max: 10 });
}

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Aplica, em ordem, os arquivos .sql ainda não aplicados. */
export async function migrate(db: Db, log: (msg: string) => void = () => {}): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`migração aplicada: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
