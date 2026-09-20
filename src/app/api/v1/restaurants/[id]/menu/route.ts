import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";

const ALLOWED_SORT_FIELDS = ["name", "price", "createdAt"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { id } = await params;
  const { searchParams } = request.nextUrl;

  const restaurant = await prisma.restaurant.findUnique({ where: { id } });
  if (!restaurant) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Restaurant not found" } },
      { status: 404 }
    );
  }

  const limitParam = parseInt(searchParams.get("limit") || "20", 10);
  const offsetParam = parseInt(searchParams.get("offset") || "0", 10);
  const sort = searchParams.get("sort") || "name";
  const order = searchParams.get("order") || "asc";
  const minPrice = searchParams.get("minPrice");
  const available = searchParams.get("available");

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

  const limit = Math.min(limitParam, 100);

  const where: Record<string, unknown> = { restaurantId: id };
  if (minPrice) where.price = { gte: parseInt(minPrice, 10) };
  if (available !== null && available !== undefined) where.available = available === "true";

  const [data, total] = await Promise.all([
    prisma.menuItem.findMany({
      where,
      take: limit,
      skip: offsetParam,
      orderBy: { [sort]: order },
    }),
    prisma.menuItem.count({ where }),
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
