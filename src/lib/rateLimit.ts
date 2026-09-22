import { NextRequest } from "next/server";
import { RATE_LIMIT } from "./config";
import { prisma } from "./prisma";

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "127.0.0.1";
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT.windowMs);

  const rows = await prisma.$queryRaw<{ count: bigint; window_start: Date }[]>`
    INSERT INTO "RateLimitEntry" (id, key, count, "windowStart")
    VALUES (gen_random_uuid(), ${ip}, 1, ${now})
    ON CONFLICT (key) DO UPDATE
    SET count = CASE
      WHEN "RateLimitEntry"."windowStart" < ${windowStart} THEN 1
      ELSE "RateLimitEntry".count + 1
    END,
    "windowStart" = CASE
      WHEN "RateLimitEntry"."windowStart" < ${windowStart} THEN ${now}
      ELSE "RateLimitEntry"."windowStart"
    END
    RETURNING count, "windowStart" as window_start
  `;

  if (rows.length === 0) {
    return { allowed: true };
  }

  const current = Number(rows[0].count);

  if (current > RATE_LIMIT.requests) {
    const ws = rows[0].window_start.getTime();
    const retryAfter = Math.ceil((ws + RATE_LIMIT.windowMs - now.getTime()) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
  }

  return { allowed: true };
}
