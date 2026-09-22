import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const rl = await checkRateLimit(getClientIp(request));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
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

  const requiredFields = ["restaurantId", "customerId", "items"];
  const missing = requiredFields.filter((f) => !body[f]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: { code: "UNPROCESSABLE_ENTITY", message: `Missing required field: ${missing.join(", ")}` } },
      { status: 422 }
    );
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: { code: "UNPROCESSABLE_ENTITY", message: "Field 'items' must be a non-empty array" } },
      { status: 422 }
    );
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { id: body.restaurantId } });
  if (!restaurant) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Restaurant not found" } },
      { status: 404 }
    );
  }

  const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
  if (!customer) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Customer not found" } },
      { status: 404 }
    );
  }

  for (const item of body.items) {
    if (!item.menuItemId || !item.quantity) {
      return NextResponse.json(
        { error: { code: "UNPROCESSABLE_ENTITY", message: "Each item must have 'menuItemId' and 'quantity'" } },
        { status: 422 }
      );
    }
  }

  let total = 0;
  const itemsWithPrice = [];
  for (const item of body.items) {
    const menuItem = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
    if (!menuItem) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `MenuItem '${item.menuItemId}' not found` } },
        { status: 404 }
      );
    }
    if (menuItem.restaurantId !== body.restaurantId) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: `MenuItem '${item.menuItemId}' does not belong to this restaurant` } },
        { status: 400 }
      );
    }
    const itemTotal = menuItem.price * item.quantity;
    total += itemTotal;
    itemsWithPrice.push({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      price: menuItem.price,
    });
  }

  const order = await prisma.order.create({
    data: {
      restaurantId: body.restaurantId,
      customerId: body.customerId,
      status: body.status || "PENDING",
      total,
      items: {
        create: itemsWithPrice,
      },
    },
    include: { items: true },
  });

  return NextResponse.json({ data: order }, { status: 201 });
}
