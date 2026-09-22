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

  const existing = await prisma.rateLimitEntry.findUnique({ where: { key: ip } });

  if (!existing || existing.windowStart < windowStart) {
    await prisma.rateLimitEntry.upsert({
      where: { key: ip },
      create: { key: ip, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
    return { allowed: true };
  }

  if (existing.count >= RATE_LIMIT.requests) {
    const retryAfter = Math.ceil((existing.windowStart.getTime() + RATE_LIMIT.windowMs - now.getTime()) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
  }

  await prisma.rateLimitEntry.update({
    where: { key: ip },
    data: { count: { increment: 1 } },
  });

  return { allowed: true };
}
