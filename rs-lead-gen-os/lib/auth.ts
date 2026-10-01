import { timingSafeEqual } from "node:crypto";

function safeEq(a: string, b: string) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

/** True when the request carries a valid machine secret (used by Claude imports and cron). */
export function hasMachineSecret(req: Request, ...envNames: string[]) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) return false;
  const token = h.slice(7);
  return envNames.some((n) => process.env[n] && safeEq(token, process.env[n]!));
}

/** Requests that reached a route with a Bearer header bypassed Basic auth in middleware — they MUST carry a valid secret. */
export function requireHumanOrMachine(req: Request, ...envNames: string[]) {
  const h = req.headers.get("authorization") || "";
  if (h.startsWith("Bearer ")) return hasMachineSecret(req, ...envNames);
  return true; // Basic auth already enforced by middleware
}
