/**
 * Phone alerts via ntfy (free; install the ntfy app and subscribe to the topic in NTFY_TOPIC).
 * Kept short on purpose — company, first name and what happened; details live in the dashboard.
 */
export async function notifyOwner(title: string, message: string, opts: { priority?: 3 | 4 | 5; click?: string; tags?: string } = {}) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;
  try {
    const res = await fetch(`${(process.env.NTFY_BASE || "https://ntfy.sh").replace(/\/$/, "")}/${encodeURIComponent(topic)}`, {
      method: "POST",
      body: message,
      headers: {
        Title: title.replace(/[^\x20-\x7E]/g, ""), // header must be ASCII
        Priority: String(opts.priority ?? 4),
        ...(opts.tags ? { Tags: opts.tags } : {}),
        ...(opts.click ? { Click: opts.click } : {}),
      },
    });
    return res.ok;
  } catch (e) {
    console.log(`[notify] failed: ${(e as Error).message}`);
    return false;
  }
}
