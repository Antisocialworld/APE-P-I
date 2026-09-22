import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const ALLOWED_SORT_FIELDS = ["name", "cuisine", "rating", "createdAt"];
const ALLOWED_FILTERS = ["cuisine", "minRating"];

export async function GET(request: NextRequest) {
  const rl = await checkRateLimit(getClientIp(request));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { searchParams } = request.nextUrl;
  const limitParam = parseInt(searchParams.get("limit") || "20", 10);
  const offsetParam = parseInt(searchParams.get("offset") || "0", 10);
  const sort = searchParams.get("sort") || "createdAt";
  const order = searchParams.get("order") || "desc";
  const cuisine = searchParams.get("cuisine");
  const minRating = searchParams.get("minRating");

  if (offsetParam < 0) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "offset cannot be negative" } },
      { status: 400 }
    );
  }

  if (!ALLOWED_SORT_FIELDS.includes(sort)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: `Unknown sort field '${sort}'. Allowed: ${ALLOWED_SORT_FIELDS.join(", ")}` } },
      { status: 400 }
    );
  }

  if (order !== "asc" && order !== "desc") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "order must be 'asc' or 'desc'" } },
      { status: 400 }
    );
  }

  const limit = Math.min(limitParam, 100);

  const where: Record<string, unknown> = {};
  if (cuisine) where.cuisine = { contains: cuisine, mode: "insensitive" };
  if (minRating) where.rating = { gte: parseFloat(minRating) };

  const [data, total] = await Promise.all([
    prisma.restaurant.findMany({
      where,
      take: limit,
      skip: offsetParam,
      orderBy: { [sort]: order },
    }),
    prisma.restaurant.count({ where }),
  ]);

  return NextResponse.json({
    data,
    meta: {
      total,
      limit,
      offset: offsetParam,
      hasMore: offsetParam + limit < total,
    },
  });
}
