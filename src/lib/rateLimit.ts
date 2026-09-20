import { RATE_LIMIT } from "./config";

const hits = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT.windowMs) {
    hits.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  entry.count++;

  if (entry.count > RATE_LIMIT.requests) {
    const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT.windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}
