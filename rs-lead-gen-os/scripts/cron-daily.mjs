// Railway cron service entry point: asks the web service to run the Daily Lead Engine, then exits.
// Needs APP_URL (e.g. https://web-production-3079.up.railway.app) and CRON_SECRET (shared with web).
const url = `${(process.env.APP_URL || "").replace(/\/$/, "")}/api/cron/daily`;
if (!process.env.APP_URL || !process.env.CRON_SECRET) {
  console.error("[cron-daily] APP_URL and CRON_SECRET are required");
  process.exit(1);
}
const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
const body = await res.text();
console.log(`[cron-daily] ${res.status} ${body.slice(0, 2000)}`);
process.exit(res.ok ? 0 : 1);
