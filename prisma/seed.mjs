/**
 * Idempotent seed script for APE-P-I database.
 *
 * APPROACH: Clear-and-regenerate.
 * This script deletes all existing data (in foreign-key order) before
 * inserting fresh records every run. This was chosen over the "fixed
 * Faker seed + upsert" approach for two reasons:
 *
 * 1. Simplicity — no need to define natural unique keys for every
 *    resource or handle upsert conflicts.
 * 2. Determinism is not required here — the seed is meant to produce
 *    a realistic-looking dataset, not an identical one every time.
 *    If exact reproducibility matters later, a fixed seed value can
 *    be added to the Faker constructor.
 *
 * Safely re-runnable: yes. Running twice produces no duplicates because
 * all prior data is deleted first.
 */

import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

const CUISINES = [
  "Nigerian",
  "Chinese",
  "Italian",
  "Indian",
  "Mexican",
  "Japanese",
  "Thai",
  "American",
  "Ethiopian",
  "Mediterranean",
  "Fast Food",
  "Korean",
];

const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

const RESTAURANT_COUNT = 40;
const MENU_ITEMS_PER_RESTAURANT_MIN = 8;
const MENU_ITEMS_PER_RESTAURANT_MAX = 20;
const CUSTOMER_COUNT = 300;
const ORDER_COUNT = 500;
const ORDER_ITEMS_PER_ORDER_MIN = 1;
const ORDER_ITEMS_PER_ORDER_MAX = 6;

function randomPrice(min, max) {
  return Math.round(faker.number.float({ min, max, precision: 1 }) * 100);
}

async function main() {
  console.log("Seeding database...");

  // ── Clear existing data (foreign-key-safe order) ──
  console.log("  Clearing existing data...");
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.restaurant.deleteMany();

  // ── Restaurants ──
  console.log(`  Creating ${RESTAURANT_COUNT} restaurants...`);
  const restaurants = [];
  for (let i = 0; i < RESTAURANT_COUNT; i++) {
    restaurants.push(
      await prisma.restaurant.create({
        data: {
          name: faker.company.name(),
          address: faker.location.streetAddress(),
          cuisine: faker.helpers.arrayElement(CUISINES),
          rating: faker.number.float({ min: 2.5, max: 5.0, precision: 0.1 }),
          imageUrl: faker.image.url({ width: 640, height: 480 }),
        },
      })
    );
  }
  console.log(`    ${restaurants.length} restaurants created`);

  // ── Menu Items ──
  console.log("  Creating menu items...");
  let totalMenuItems = 0;
  const allMenuItems = [];

  for (const restaurant of restaurants) {
    const count = faker.number.int({
      min: MENU_ITEMS_PER_RESTAURANT_MIN,
      max: MENU_ITEMS_PER_RESTAURANT_MAX,
    });
    for (let j = 0; j < count; j++) {
      const item = await prisma.menuItem.create({
        data: {
          name: faker.commerce.productName(),
          description: faker.commerce.productDescription(),
          price: randomPrice(500, 15000),
          available: faker.datatype.boolean({ probability: 0.9 }),
          restaurantId: restaurant.id,
        },
      });
      allMenuItems.push({
        id: item.id,
        restaurantId: restaurant.id,
        price: item.price,
      });
      totalMenuItems++;
    }
  }
  console.log(`    ${totalMenuItems} menu items created`);

  // ── Customers ──
  console.log(`  Creating ${CUSTOMER_COUNT} customers...`);
  const customers = [];
  const usedEmails = new Set();
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    let email = faker.internet.email();
    while (usedEmails.has(email)) {
      email = faker.internet.email();
    }
    usedEmails.add(email);
    customers.push(
      await prisma.customer.create({
        data: {
          name: faker.person.fullName(),
          email,
          phone: faker.phone.number(),
          address: faker.location.streetAddress(),
        },
      })
    );
  }
  console.log(`    ${customers.length} customers created`);

  // ── Orders + Order Items ──
  console.log(`  Creating ${ORDER_COUNT} orders with items...`);
  let totalOrderItems = 0;

  for (let i = 0; i < ORDER_COUNT; i++) {
    const restaurant = faker.helpers.arrayElement(restaurants);
    const customer = faker.helpers.arrayElement(customers);
    const restaurantMenuItems = allMenuItems.filter(
      (mi) => mi.restaurantId === restaurant.id
    );
    if (restaurantMenuItems.length === 0) continue;

    const itemCount = faker.number.int({
      min: ORDER_ITEMS_PER_ORDER_MIN,
      max: Math.min(ORDER_ITEMS_PER_ORDER_MAX, restaurantMenuItems.length),
    });
    const selectedItems = faker.helpers.arrayElements(
      restaurantMenuItems,
      itemCount
    );

    let orderTotal = 0;
    const orderItemsData = selectedItems.map((mi) => {
      const quantity = faker.number.int({ min: 1, max: 5 });
      const itemTotal = mi.price * quantity;
      orderTotal += itemTotal;
      return {
        menuItemId: mi.id,
        quantity,
        price: mi.price,
      };
    });

    await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        customerId: customer.id,
        status: faker.helpers.arrayElement(ORDER_STATUSES),
        total: orderTotal,
        items: {
          create: orderItemsData,
        },
      },
    });
    totalOrderItems += orderItemsData.length;
  }
  console.log(`    ${ORDER_COUNT} orders created with ${totalOrderItems} order items`);

  console.log("\nSeeding complete.");
  console.log("  Restaurants:    ", restaurants.length);
  console.log("  Menu Items:     ", totalMenuItems);
  console.log("  Customers:      ", customers.length);
  console.log("  Orders:         ", ORDER_COUNT);
  console.log("  Order Items:    ", totalOrderItems);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
