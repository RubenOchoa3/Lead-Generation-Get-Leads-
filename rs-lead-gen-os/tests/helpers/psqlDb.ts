// Test-only Db implementation that talks to a real Postgres through a persistent `psql` session.
// Used where the `pg` npm package is unavailable; exercises the exact SQL the app runs.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Db } from "../../lib/db";

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function inline(text: string, params: unknown[] = []) {
  return text.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
}

export class PsqlDb implements Db {
  private p: ChildProcessWithoutNullStreams;
  private buf = "";
  private queue: Array<(out: string) => void> = [];
  private n = 0;
  constructor(args: string[]) {
    this.p = spawn("psql", [...args, "-At", "-q", "-v", "ON_ERROR_STOP=0"], { stdio: "pipe" });
    const onData = (d: Buffer) => {
      this.buf += d.toString();
      let idx: number;
      while ((idx = this.buf.indexOf("@@END@@")) !== -1) {
        const out = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 7).replace(/^\n/, "");
        this.queue.shift()?.(out);
      }
    };
    this.p.stdout.on("data", onData);
    this.p.stderr.on("data", onData);
  }
  async query<T>(text: string, params: unknown[] = []) {
    const sql = inline(text, params).trim().replace(/;\s*$/, "");
    const wrap = /^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql);
    const stmt = wrap ? `with __q as (${sql}) select coalesce(json_agg(__q), '[]') from __q;` : `${sql};`;
    this.n++;
    const out = await new Promise<string>((resolve) => {
      this.queue.push(resolve);
      this.p.stdin.write(`${stmt}\n\\echo @@END@@\n`);
    });
    if (/^ERROR:/m.test(out)) throw new Error(out.trim());
    if (!wrap) return { rows: [] as T[], rowCount: null };
    const rows = JSON.parse(out.trim() || "[]") as T[];
    return { rows, rowCount: rows.length };
  }
  close() { this.p.stdin.end(); }
}
