import { NextResponse, type NextRequest } from "next/server";

/**
 * The dashboard holds prospect contact data, so every page and API is behind auth.
 * - People: HTTP Basic auth (APP_USER / APP_PASSWORD).
 * - Machines (Claude imports, cron): `Authorization: Bearer <INGEST_SECRET or CRON_SECRET>` — verified again in each route.
 * - /api/health returns only non-sensitive status and is public so Railway can health-check it.
 */
function eq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Only a Bearer token that matches a configured machine secret may skip Basic auth. */
function validMachineToken(auth: string) {
  const token = auth.slice(7);
  return [process.env.INGEST_SECRET, process.env.CRON_SECRET].some((s) => !!s && eq(token, s));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/api/health") return NextResponse.next();

  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ") && pathname.startsWith("/api/")) {
    if (validMachineToken(auth)) return NextResponse.next();
    return NextResponse.json({ error: "Invalid machine secret" }, { status: 401 });
  }

  const user = process.env.APP_USER || "rs";
  const pass = process.env.APP_PASSWORD;
  if (!pass) {
    // Fail closed in production; allow local dev without a password.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("APP_PASSWORD is not set on the server. Add it in Railway → Variables.", { status: 503 });
    }
    return NextResponse.next();
  }
  if (auth.startsWith("Basic ")) {
    let decoded = "";
    try { decoded = atob(auth.slice(6)); } catch { /* malformed header → 401 below */ }
    const i = decoded.indexOf(":");
    if (i > 0 && eq(decoded.slice(0, i), user) && eq(decoded.slice(i + 1), pass)) return NextResponse.next();
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="R&S Lead OS"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"] };
