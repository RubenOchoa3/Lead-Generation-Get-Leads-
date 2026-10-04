// Integration test for pushing approved leads to a sender, against a real Postgres (TEST_PSQL_ARGS).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { PsqlDb } from "./helpers/psqlDb";
import { ingestBatch } from "../lib/ingest";
import { mapGetleadRow } from "../lib/providers/getlead";
import { decide } from "../lib/decisions";
import { pushApprovedToCampaign } from "../lib/outreach";
import { syncMailboxesFromSender } from "../lib/infrastructure";
import type { InstantlyLead, SenderClient } from "../lib/providers/instantly";
import rows from "./fixtures/getlead-sample.json" with { type: "json" };

const args = process.env.TEST_PSQL_ARGS?.split(" ");

/** Records calls; has no way to launch a campaign, mirroring the real adapter. */
function fakeSender() {
  const calls: { campaignId: string; leads: InstantlyLead[] }[] = [];
  const client: SenderClient = {
    async listCampaigns() { return [{ id: "camp-1", name: "V1", status: 0, email_list: ["a@send.cc"] }]; },
    async listAccounts() { return []; },
    async addLeads(campaignId, leads) { calls.push({ campaignId, leads }); return { uploaded: leads.length, skipped: 0, raw: {} }; },
  };
  return { client, calls };
}

describe("push approved leads to sender", { skip: !args && "TEST_PSQL_ARGS not set" }, () => {
  let db: PsqlDb;
  let orgs: { id: string; company_name: string }[];
  before(async () => {
    const base = args!.filter((a, i, all) => all[i - 1] !== "-d" && a !== "-d").join(" ");
    execSync(`psql ${base} -q -c "drop database if exists rs_os_test" -c "create database rs_os_test"`);
    execSync(`psql ${base} -d rs_os_test -q -v ON_ERROR_STOP=1 -f db/migrations/001_init.sql`);
    db = new PsqlDb([...base.split(" "), "-d", "rs_os_test"]);
    await db.query("begin");
    await ingestBatch(db, rows.map((r) => mapGetleadRow(r as never)!), { queueThreshold: 0, requireVerifiedEmail: false });
    await db.query("commit");
    orgs = (await db.query<{ id: string; company_name: string }>("select id, company_name from organizations order by company_name")).rows;
  });
  after(() => db?.close());

  it("preview adds nothing and only lists approved, unblocked leads", async () => {
    await decide(db, orgs[0].id, "approve");
    await decide(db, orgs[1].id, "reject");
    const { client, calls } = fakeSender();
    const r = await pushApprovedToCampaign(db, client, "camp-1", { dryRun: true });
    assert.equal(calls.length, 0);
    assert.equal(r.ready.length, 1);
    assert.equal(r.ready[0].company, orgs[0].company_name);
  });

  it("adds approved leads once and never twice", async () => {
    const { client, calls } = fakeSender();
    const first = await pushApprovedToCampaign(db, client, "camp-1", { dryRun: false });
    assert.equal(first.added, 1);
    assert.equal(calls[0].leads.length, 1);
    const n = (await db.query<{ n: number }>("select count(*)::int n from campaign_contacts")).rows[0].n;
    assert.equal(n, 1);
    const again = await pushApprovedToCampaign(db, client, "camp-1", { dryRun: false });
    assert.equal(again.ready.length, 0);
    assert.equal(calls.length, 1);
  });

  it("blocks suppressed leads even if approved", async () => {
    await decide(db, orgs[2].id, "approve");
    await db.query(`insert into suppression_list (organization_id, suppression_type, reason, source) values ($1, 'manual', 'test', 'test')`, [orgs[2].id]);
    const { client } = fakeSender();
    const r = await pushApprovedToCampaign(db, client, "camp-1", { dryRun: true });
    assert.equal(r.ready.length, 0);
    assert.equal(r.blocked.length, 1);
    assert.match(r.blocked[0].reasons.join(), /suppressed/);
  });

  it("rejects an unknown campaign", async () => {
    const { client } = fakeSender();
    await assert.rejects(pushApprovedToCampaign(db, client, "nope"), /not found/);
  });

  it("syncs sender mailboxes and never lists the protected business domain", async () => {
    const accounts = [
      { email: "a@send.cc", status: 1, warmup_status: 1, daily_limit: 30, stat_warmup_score: 92 },
      { email: "b@send.cc", status: 1, warmup_status: 0, daily_limit: 30 },
      { email: "rubenochoa@rscentralvalleycleaning.com", status: 1, warmup_status: 0, daily_limit: 20 },
    ];
    const r = await syncMailboxesFromSender(db, accounts, [{ name: "V1", email_list: ["A@send.cc"] }]);
    assert.deepEqual(r, { mailboxes: 2, domains: 1 });
    const rows = (await db.query<{ address: string; warmup_status: string; health: string | null; campaign: string | null }>(
      "select address, warmup_status, health, campaign from mailboxes order by address")).rows;
    assert.deepEqual(rows.map((x) => x.address), ["a@send.cc", "b@send.cc"]);
    assert.equal(rows[0].warmup_status, "Warming (score 92)");
    assert.equal(rows[0].health, "Healthy");
    assert.equal(rows[0].campaign, "V1");
    assert.equal(rows[1].campaign, null);
    const again = await syncMailboxesFromSender(db, accounts, []);
    assert.equal(again.mailboxes, 2);
    const n = (await db.query<{ n: number }>("select count(*)::int n from mailboxes")).rows[0].n;
    assert.equal(n, 2);
  });
});
