"""RS Lead Generation OS: email event collector.

Runs on Railway. Receives Instantly webhooks, stores every event in Supabase
(Postgres), links events to scored leads, and exposes a small metrics API.

Env:
  DATABASE_URL            Supabase Postgres connection string (service role / direct)
  INSTANTLY_WEBHOOK_TOKEN Shared secret; Instantly must send it in header
                          `x-rs-webhook-token` or `rs-webhook`
  PORT                    Provided by Railway
"""
import hashlib
import json
import os
from datetime import datetime, timezone

import psycopg
from fastapi import FastAPI, Header, HTTPException, Request
from psycopg.rows import dict_row

DATABASE_URL = os.environ["DATABASE_URL"]
WEBHOOK_TOKEN = os.environ.get("INSTANTLY_WEBHOOK_TOKEN", "")

app = FastAPI(title="RS Lead Gen collector", version="0.1")


def db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


# Instantly puts the useful fields at different keys depending on event type; be lenient.
def _get(payload, *keys, default=None):
    for k in keys:
        v = payload.get(k)
        if v not in (None, ""):
            return v
    return default


def _parse_ts(v):
    if not v:
        return None
    try:
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v / (1000 if v > 1e12 else 1), tz=timezone.utc)
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


@app.get("/health")
def health():
    with db() as conn:
        n = conn.execute("select count(*) as n from email_events").fetchone()["n"]
    return {"ok": True, "events": n}


@app.post("/api/webhooks/instantly")
async def instantly_webhook(
    request: Request,
    x_rs_webhook_token: str | None = Header(default=None),
    rs_webhook: str | None = Header(default=None),
):
    token = x_rs_webhook_token or rs_webhook or ""
    if not WEBHOOK_TOKEN or token != WEBHOOK_TOKEN:
        raise HTTPException(status_code=401, detail="bad webhook token")

    payload = await request.json()
    event_type = _get(payload, "event_type", "type", "event", default="unknown")
    campaign_id = _get(payload, "campaign_id", "campaign")
    campaign_name = _get(payload, "campaign_name")
    lead_email = (_get(payload, "lead_email", "email", "to_email", default="") or "").lower().strip()
    event_ts = _parse_ts(_get(payload, "timestamp", "event_timestamp", "created_at")) or datetime.now(timezone.utc)
    step = _get(payload, "step", "sequence_step")
    variant = _get(payload, "variant", "email_variant")
    from_account = _get(payload, "email_account", "from_email", "sender_email")
    subject = _get(payload, "subject", "email_subject")
    body_text = _get(payload, "reply_text", "reply_text_snippet", "text", "email_text")

    dedupe = hashlib.sha256(
        f"{event_type}|{lead_email}|{campaign_id}|{event_ts.isoformat()}|{step}".encode()
    ).hexdigest()

    with db() as conn:
        if campaign_id:
            conn.execute(
                "insert into campaigns (id, name) values (%s, %s) "
                "on conflict (id) do update set name = coalesce(excluded.name, campaigns.name)",
                (campaign_id, campaign_name),
            )
        lead_id = None
        if lead_email:
            row = conn.execute("select id from leads where email = %s", (lead_email,)).fetchone()
            if row:
                lead_id = row["id"]
            else:
                # Unknown to the scored lists: still keep it so nothing is lost.
                lead_id = conn.execute(
                    "insert into leads (email, full_name, list_name, source, email_status) "
                    "values (%s, %s, 'instantly_unmatched', 'instantly_webhook', 'UNKNOWN') "
                    "on conflict (email) do update set updated_at = now() returning id",
                    (lead_email, " ".join(filter(None, [_get(payload, "first_name", "firstName"),
                                                        _get(payload, "last_name", "lastName")])) or None),
                ).fetchone()["id"]
        inserted = conn.execute(
            "insert into email_events (event_type, event_ts, campaign_id, lead_email, lead_id, step, "
            "variant, from_account, subject, body_text, payload, dedupe_key) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict (dedupe_key) do nothing returning id",
            (event_type, event_ts, campaign_id, lead_email or None, lead_id,
             int(step) if str(step).isdigit() else None, variant, from_account, subject, body_text,
             json.dumps(payload), dedupe),
        ).fetchone()
        if lead_id:
            _advance_status(conn, lead_id, event_type)
        conn.commit()
    return {"ok": True, "stored": bool(inserted), "event_type": event_type}


STATUS_FOR_EVENT = {
    "email_sent": "contacted",
    "reply_received": "replied",
    "lead_interested": "replied",
    "lead_meeting_booked": "booked",
    "lead_closed": "booked",
    "lead_not_interested": "not_interested",
    "lead_unsubscribed": "not_interested",
}
STATUS_RANK = {"new": 0, "contacted": 1, "replied": 2, "booked": 3, "not_interested": 3}


def _advance_status(conn, lead_id, event_type):
    """Move a lead forward through the CLAUDE.md status ladder, never backward."""
    new = STATUS_FOR_EVENT.get(event_type)
    if not new:
        return
    cur = conn.execute("select status from leads where id = %s", (lead_id,)).fetchone()["status"]
    if STATUS_RANK.get(new, 0) > STATUS_RANK.get(cur, 0):
        conn.execute("update leads set status = %s where id = %s", (new, lead_id))


@app.get("/api/metrics")
def metrics():
    with db() as conn:
        out = {}
        for view in ("performance_by_business_type", "performance_by_title_tier",
                     "performance_by_score_band", "performance_by_step"):
            out[view] = conn.execute(f"select * from {view}").fetchall()
        out["totals"] = conn.execute(
            "select event_type, count(*) as n from email_events group by 1 order by 2 desc"
        ).fetchall()
    return out


@app.get("/api/replies")
def replies(limit: int = 50):
    with db() as conn:
        return conn.execute(
            "select e.id, e.event_ts, e.lead_email, l.full_name, l.title, c.name as company, "
            "e.subject, e.body_text, r.classification, r.summary "
            "from email_events e left join leads l on l.id = e.lead_id "
            "left join companies c on c.id = l.company_id left join replies r on r.event_id = e.id "
            "where e.event_type = 'reply_received' order by e.event_ts desc limit %s", (limit,)
        ).fetchall()
