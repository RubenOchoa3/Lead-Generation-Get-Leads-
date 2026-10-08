import { Pool, type QueryResultRow } from "pg";

/** Minimal query interface so business logic can be tested against any Postgres client. */
export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

declare global {
  // eslint-disable-next-line no-var
  var __rsPool: Pool | undefined;
}

export class DbNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Add the Railway Postgres reference variable ${{Postgres.DATABASE_URL}} to the web service.");
  }
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new DbNotConfiguredError();
  if (!global.__rsPool) {
    const url = process.env.DATABASE_URL;
    // Railway private networking (postgres.railway.internal) does not use TLS; public proxy URLs do.
    const isInternal = /\.railway\.internal|localhost|127\.0\.0\.1/.test(url);
    global.__rsPool = new Pool({
      connectionString: url,
      max: 8,
      ssl: isInternal ? false : { rejectUnauthorized: false },
    });
  }
  return global.__rsPool;
}

export const db: Db = {
  query: (text, params) => getPool().query(text, params as unknown[]) as never,
};

export async function sql<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query<T>(text, params);
  return r.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await sql<T>(text, params);
  return rows[0] ?? null;
}

/** Run fn inside a transaction on a dedicated client. */
export async function tx<T>(fn: (c: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client as unknown as Db);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
