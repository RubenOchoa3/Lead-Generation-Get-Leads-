"""Classify unclassified replies in Supabase.

Two passes:
  1. Rules: Instantly's own status events (lead_interested, lead_not_interested,
     lead_out_of_office, lead_wrong_person, lead_unsubscribed) that arrived for the
     same lead settle the classification with no model call.
  2. Claude: anything still unknown is classified from the reply text.

Run as a Railway cron (e.g. every 30 min):  python -m services.collector.analyze_replies
Env: DATABASE_URL, ANTHROPIC_API_KEY (pass 2 only; skipped when unset).
"""
import json
import os

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ["DATABASE_URL"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5-5")

RULE_MAP = {
    "lead_interested": ("interested", "positive"),
    "lead_meeting_booked": ("interested", "positive"),
    "custom_label_any_positive": ("interested", "positive"),
    "lead_not_interested": ("not_interested", "negative"),
    "custom_label_any_negative": ("not_interested", "negative"),
    "lead_unsubscribed": ("unsubscribe", "negative"),
    "lead_out_of_office": ("out_of_office", "neutral"),
    "lead_wrong_person": ("wrong_person", "neutral"),
}

PROMPT = """You classify replies to a cold email from a commercial cleaning company offering a free
20-minute walkthrough. Return JSON only: {"classification": one of
["interested","not_interested","out_of_office","wrong_person","auto_reply","unsubscribe","unknown"],
"sentiment": one of ["positive","neutral","negative"], "summary": "<= 20 words"}.

Reply text:
"""


def classify_with_claude(text):
    if not ANTHROPIC_API_KEY or not text:
        return None
    import anthropic  # imported lazily so the rules pass works without the SDK

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model=MODEL, max_tokens=200,
        messages=[{"role": "user", "content": PROMPT + text[:4000]}],
    )
    raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
    try:
        return json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
    except (ValueError, json.JSONDecodeError):
        return {"classification": "unknown", "sentiment": "neutral", "summary": raw[:120]}


def main():
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        pending = conn.execute(
            "select e.id, e.lead_id, e.lead_email, e.body_text from email_events e "
            "left join replies r on r.event_id = e.id "
            "where e.event_type = 'reply_received' and r.id is null order by e.id"
        ).fetchall()
        done = {"rule": 0, "claude": 0, "skipped": 0}
        for ev in pending:
            # pass 1: an Instantly status event for the same lead decides it
            status = conn.execute(
                "select event_type from email_events where lead_email = %s and event_type = any(%s) "
                "order by event_ts desc limit 1",
                (ev["lead_email"], list(RULE_MAP.keys())),
            ).fetchone()
            if status:
                cls, sent = RULE_MAP[status["event_type"]]
                conn.execute(
                    "insert into replies (event_id, lead_id, classification, sentiment, summary, classified_by) "
                    "values (%s,%s,%s,%s,%s,'instantly_label') on conflict (event_id) do nothing",
                    (ev["id"], ev["lead_id"], cls, sent, f"Instantly status: {status['event_type']}"),
                )
                done["rule"] += 1
                continue
            # pass 2: Claude
            res = classify_with_claude(ev["body_text"])
            if not res:
                done["skipped"] += 1
                continue
            conn.execute(
                "insert into replies (event_id, lead_id, classification, sentiment, summary, classified_by) "
                "values (%s,%s,%s,%s,%s,'claude') on conflict (event_id) do nothing",
                (ev["id"], ev["lead_id"], res.get("classification", "unknown"),
                 res.get("sentiment", "neutral"), res.get("summary")),
            )
            if res.get("classification") == "interested":
                conn.execute("update leads set status = 'replied' where id = %s and status in ('new','contacted')",
                             (ev["lead_id"],))
            done["claude"] += 1
        conn.commit()
    print(json.dumps({"pending": len(pending), **done}))


if __name__ == "__main__":
    main()
