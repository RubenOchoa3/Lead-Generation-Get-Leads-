// Applies db/migrations/*.sql in order, once each, inside a transaction.
// Runs automatically before `next start` on Railway.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set — skipping migrations. The app will report the database as not configured.");
  process.exit(0);
}

const isInternal = /\.railway\.internal|localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({ connectionString: url, ssl: isInternal ? false : { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("select pg_advisory_lock(727001)"); // one migrator at a time
  await client.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("select name from schema_migrations");
  const done = new Set(rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const text = await readFile(path.join(dir, f), "utf8");
    console.log(`[migrate] applying ${f}`);
    await client.query("begin");
    try {
      await client.query(text);
      await client.query("insert into schema_migrations(name) values ($1)", [f]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  console.log("[migrate] up to date");
} finally {
  await client.query("select pg_advisory_unlock(727001)").catch(() => {});
  await client.end();
}
