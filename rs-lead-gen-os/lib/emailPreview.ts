/** Render an Instantly email for one lead: fill {{field | fallback}} merge tags and turn the HTML into plain text. */
export function renderMerge(template: string, vars: Record<string, string | null | undefined>) {
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*(?:\|\s*([^}]*?))?\s*\}\}/g, (_m, k: string, fb?: string) => {
    const v = vars[k];
    return v && String(v).trim() ? String(v).trim() : (fb ?? "").trim();
  });
}

export function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>\s*<div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
