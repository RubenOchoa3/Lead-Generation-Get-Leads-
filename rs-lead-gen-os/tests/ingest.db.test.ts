// Integration test against a real Postgres. Set TEST_PSQL_ARGS (e.g. "-h /tmp -p 5433 -U postgres -d rs_os_test").
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PsqlDb } from "./helpers/psqlDb";
import { ingestBatch } from "../lib/ingest";
import { mapGetleadRow } from "../lib/providers/getlead";
import { outreachBlockers, checkSuppression } from "../lib/suppression";
import rows from "./fixtures/getlead-sample.json" with { type: "json" };

const args = process.env.TEST_PSQL_ARGS?.split(" ");
const opts = { queueThreshold: 65, requireVerifiedEmail: true };

describe("ingest against Postgres", { skip: !args && "TEST_PSQL_ARGS not set" }, () => {
  let db: PsqlDb;
  before(() => {
    const base = args!.filter((a, i, all) => all[i - 1] !== "-d" && a !== "-d").join(" ");
    execSync(`psql ${base} -q -c "drop database if exists rs_os_test" -c "create database rs_os_test"`);
    execSync(`psql ${base} -d rs_os_test -q -v ON_ERROR_STOP=1 -f db/migrations/001_init.sql`);
    db = new PsqlDb([...base.split(" "), "-d", "rs_os_test"]);
  });
  after(() => db?.close());

  const prospects = () => rows.map((r) => mapGetleadRow(r as never)!);

  it("saves real-shaped Getlead rows and queues qualified leads", async () => {
    await db.query("begin");
    const s = await ingestBatch(db, prospects(), opts);
    await db.query("commit");
    assert.deepEqual(s.errors, []);
    assert.equal(s.unique_businesses, 3);
    assert.equal(s.new_contacts, 3);
    assert.equal(s.verified_emails, 3);
    const orgs = (await db.query<{ n: number }>("select count(*)::int n from organizations")).rows[0].n;
    assert.equal(orgs, 3);
    assert.ok(s.queued >= 1, `queued ${s.queued}`);
  });

  it("does not create duplicates on re-import", async () => {
    await db.query("begin");
    const s = await ingestBatch(db, prospects(), opts);
    await db.query("commit");
    assert.equal(s.unique_businesses, 0);
    assert.equal(s.duplicates_removed, 3);
    assert.equal(s.new_contacts, 0);
    assert.equal(s.queued, 0);
    const n = (await db.query<{ o: number; c: number; q: number }>(
      "select (select count(*)::int from organizations) o, (select count(*)::int from contacts) c, (select count(*)::int from approval_queue) q")).rows[0];
    assert.deepEqual([n.o, n.c], [3, 3]);
  });

  it("dedupes by normalized name + address when the domain differs", async () => {
    const p = prospects()[1];
    p.company.domain = "other-domain.example"; p.company.website = null; p.company.externalId = null; p.company.name = "Sample Properties Inc.";
    p.contact = { fullName: "New Person", title: "Office Manager", email: "new@other-domain.example", emailStatus: "VALID" };
    await db.query("begin");
    const s = await ingestBatch(db, [p], opts);
    await db.query("commit");
    assert.equal(s.duplicates_removed, 1);
    assert.equal(s.new_contacts, 1); // new contact attached to existing org
  });

  it("suppresses janitorial competitors and never queues them", async () => {
    const p = prospects()[0];
    p.company = { ...p.company, name: "Sparkle Janitorial (fixture)", domain: "sparkle.example", website: "https://sparkle.example", externalId: "li-sparkle", street: "9 Clean Way", naicsCodes: ["561720"] };
    p.contact = { fullName: "Jan Itor", title: "Owner", email: "jan@sparkle.example", emailStatus: "VALID" };
    await db.query("begin");
    const s = await ingestBatch(db, [p], opts);
    await db.query("commit");
    assert.equal(s.suppressed, 1);
    assert.equal(s.queued, 0);
    const hit = await checkSuppression(db, "jan@sparkle.example");
    assert.equal(hit.suppressed, true);
  });

  it("blocks outreach until approved, and always blocks the R&S domain", async () => {
    const { rows: [c] } = await db.query<{ id: string; organization_id: string }>(
      "select c.id, c.organization_id from contacts c join approval_queue q on q.contact_id = c.id limit 1");
    assert.ok((await outreachBlockers(db, c.id)).some((r) => r.startsWith("not approved")));
    await db.query("update approval_queue set status = 'Approved' where organization_id = $1", [c.organization_id]);
    assert.deepEqual(await outreachBlockers(db, c.id), []);
    assert.equal((await checkSuppression(db, "ruben@rscentralvalleycleaning.com")).suppressed, true);
  });

  it("one-running-per-automation index prevents concurrent runs", async () => {
    await db.query("insert into automation_runs (automation_type) values ('daily_lead_engine')");
    await assert.rejects(db.query("insert into automation_runs (automation_type) values ('daily_lead_engine')"));
  });
});
