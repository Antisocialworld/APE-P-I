import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await checkRateLimit(getClientIp(request));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      restaurant: { select: { id: true, name: true, cuisine: true } },
      customer: { select: { id: true, name: true, email: true } },
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Order not found" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: order });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await checkRateLimit(getClientIp(request));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { id } = await params;

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Order not found" } },
      { status: 404 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const allowedFields = ["status"];
  const updates: Record<string, string> = {};
  for (const key of Object.keys(body)) {
    if (!allowedFields.includes(key)) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: `Field '${key}' is not updatable` } },
        { status: 400 }
      );
    }
    updates[key] = body[key];
  }

  if (updates.status) {
    const validStatuses = ["PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];
    if (!validStatuses.includes(updates.status)) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: `Invalid status '${updates.status}'. Must be one of: ${validStatuses.join(", ")}` } },
        { status: 400 }
      );
    }
  }

  const order = await prisma.order.update({
    where: { id },
    data: updates,
    include: { items: true },
  });

  return NextResponse.json({ data: order });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await checkRateLimit(getClientIp(request));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { id } = await params;

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Order not found" } },
      { status: 404 }
    );
  }

  await prisma.order.delete({ where: { id } });

  return NextResponse.json({ data: { id } });
}
