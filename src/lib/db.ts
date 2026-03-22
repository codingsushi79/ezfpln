import { Pool, type QueryResult, type QueryResultRow } from "pg";

let pool: Pool | null = null;
let schemaPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) {
      throw new Error(
        "DATABASE_URL must be set (PostgreSQL connection string, e.g. postgresql://user:pass@localhost:5432/ezflpln).",
      );
    }
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const p = getPool();
      await p.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));
      `);
      await p.query(`
        CREATE TABLE IF NOT EXISTS bridge_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          created_at BIGINT NOT NULL,
          last_used_at BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_bridge_tokens_user ON bridge_tokens(user_id);
      `);
      await p.query(`
        CREATE TABLE IF NOT EXISTS bridge_pairing_codes (
          code TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bridge_pairing_user ON bridge_pairing_codes(user_id);
      `);
    })();
  }
  await schemaPromise;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  await ensureSchema();
  return getPool().query<T>(text, params);
}
