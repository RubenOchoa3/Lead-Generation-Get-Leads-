// Push a JSON payload to a protected endpoint of the deployed app.
// Usage: APP_URL=https://… INGEST_SECRET=… node scripts/push.mjs <endpoint> <file.json>
//   endpoint: ingest/getlead | sync/infrastructure | research/<orgId>
import { readFile } from "node:fs/promises";

const [endpoint, file] = process.argv.slice(2);
if (!endpoint || !file || !process.env.APP_URL || !process.env.INGEST_SECRET) {
  console.error("Usage: APP_URL=… INGEST_SECRET=… node scripts/push.mjs <endpoint> <file.json>");
  process.exit(1);
}
const body = await readFile(file, "utf8");
const method = endpoint.startsWith("research/") ? "PUT" : "POST";
const res = await fetch(`${process.env.APP_URL.replace(/\/$/, "")}/api/${endpoint}`, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${process.env.INGEST_SECRET}` }, body,
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
