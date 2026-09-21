import { NextRequest } from "next/server";
import { RATE_LIMIT } from "./config";

const globalForRateLimit = globalThis as unknown as {
  hits: Map<string, { count: number; windowStart: number }>;
};

const hits = globalForRateLimit.hits || new Map<string, { count: number; windowStart: number }>();
globalForRateLimit.hits = hits;

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : request.headers.get("x-real-ip") || "127.0.0.1";
  console.log(`[RATE-LIMIT] ip=${ip} xff=${forwarded} keys=${hits.size}`);
  return ip;
}

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
