# APE-P-I

A REST API serving realistic food-delivery data: restaurants, menu items,
orders, customers. Built with Next.js 15, Prisma 6, and PostgreSQL 16,
designed for eventual deployment to Vercel.

This is the API itself — no auth, no admin panel, no landing page. The
endpoints are the product.

## Quick Start

```bash
# 1. Start local Postgres
docker compose up -d

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env — set DATABASE_URL to your local Postgres

# 4. Run migrations
npx prisma migrate dev

# 5. Seed the database (generates ~40 restaurants, 300 customers, 500 orders)
npx prisma db seed

# 6. Start the dev server
npm run dev
```

API is live at `http://localhost:3000/api/v1/`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/restaurants` | List restaurants (paginated, filterable, sortable) |
| GET | `/api/v1/restaurants/:id` | Get one restaurant |
| GET | `/api/v1/restaurants/:id/menu` | Get menu items for a restaurant |
| POST | `/api/v1/orders` | Create an order |
| GET | `/api/v1/orders/:id` | Get an order |
| PATCH | `/api/v1/orders/:id` | Update order status |
| DELETE | `/api/v1/orders/:id` | Delete an order |

## Further Documentation

Full details — data model, concepts, design decisions, what went wrong,
what this doesn't handle — are in **[DOCUMENTATION.md](./DOCUMENTATION.md)**.
