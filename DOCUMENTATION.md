# APE-P-I — Documentation

This file is a deliberate addition beyond the brief's own minimum
requirement (which only asks for a README). It follows the same
8-section pattern used for the Four Build Assessments earlier this week,
split out so the README can stay short.

---

## 1. What This Is

APE-P-I is a REST API serving realistic food-delivery data. It models
five resources — Restaurant, MenuItem, Customer, Order, and OrderItem —
with genuine relational depth: a MenuItem is meaningless without its
parent Restaurant, an Order is meaningless without knowing which Customer
placed it and which Restaurant it's from, and an OrderItem is what
connects an Order to specific MenuItems at specific quantities.

It is not an application. There is no authentication for reading. There
is no admin panel, no landing page, no interface beyond a minimal
consumer app that calls the live API and displays the result. The API
is the product.

The stack is Next.js 15 (App Router) for the server, Prisma 6 for the
ORM, PostgreSQL 16 via Docker for local development, and
`@faker-js/faker` for seed data generation.

---

## 2. How To Run It

### Prerequisites
- Node.js 18+
- Docker (for local Postgres)

### Commands

```bash
# Start Postgres via Docker (port 5433 mapped to container's 5432)
docker compose up -d

# Install dependencies
npm install

# Copy environment template and edit with your DATABASE_URL
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Seed the database (clear-and-regenerate, idempotent)
npx prisma db seed

# Start the development server
npm run dev
```

The API responds at `http://localhost:3000/api/v1/`.

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://apepi:apepi_dev@localhost:5433/apepi?schema=public` |

`.env` is gitignored. `.env.example` contains only commented placeholders —
no real credentials are committed.

---

## 3. The Flow, Step By Step

### Request flow: GET /api/v1/restaurants?cuisine=Nigerian&limit=3&sort=rating&order=desc

1. **Rate limit check** (`src/lib/rateLimit.ts`): The client's IP is
   extracted from `x-forwarded-for` or `x-real-ip` headers. The
   `checkRateLimit()` function checks an in-memory Map. If the IP has
   exceeded 100 requests in the current 60-second window, the request
   is rejected immediately with HTTP 429 and a `Retry-After` header.

2. **Query parameter parsing** (`src/app/api/v1/restaurants/route.ts`):
   `limit`, `offset`, `sort`, `order`, `cuisine`, and `minRating` are
   read from `searchParams`. Defaults: limit=20, offset=0,
   sort=createdAt, order=desc.

3. **Input validation**: Negative offset returns 400. Unknown sort
   fields (anything not in `["name", "cuisine", "rating", "createdAt"]`)
   return 400. Order must be "asc" or "desc".

4. **Limit clamping**: If `limit` exceeds 100, it is silently clamped
   to 100 — the client gets 100 results, not an error.

5. **Database query** (`prisma.restaurant.findMany`): A `where` clause
   is built from the filters (cuisine exact match, minRating as `gte`).
   `take`, `skip`, and `orderBy` are applied. A parallel
   `prisma.restaurant.count` runs with the same `where` to get the
   total.

6. **Response envelope**: The result is wrapped in
   `{ data: [...], meta: { total, limit, offset, hasMore } }`.
   `hasMore` is `offset + limit < total`.

### Request flow: POST /api/v1/orders

1. **Rate limit check**: Same as above.

2. **JSON parsing**: Invalid JSON returns 400 with `Invalid JSON body`.

3. **Required field validation**: `restaurantId`, `customerId`, and
   `items` are required. Missing fields are named in the 422 response:
   `Missing required field: customerId, items`.

4. **Referential integrity checks**: The restaurant, customer, and each
   menu item are looked up individually. A missing restaurant returns 404
   `Restaurant not found`. A missing customer returns 404. A missing
   menu item returns 404 with the specific ID. A menu item that doesn't
   belong to the specified restaurant returns 400 with an explanation.

5. **Price snapshot**: Each menu item's current price is read from the
   database and stored on the OrderItem. The order `total` is computed
   as the sum of `price * quantity` across all items. The client never
   sends prices — they are always sourced from the MenuItem.

6. **Atomic creation**: The order and all its items are created in a
   single `prisma.order.create` call with a nested `items: { create }`.

7. **Response**: HTTP 201 with the full order including items.

---

## 4. The Data Model

Five models in `prisma/schema.prisma`, backed by PostgreSQL:

### Restaurant
| Column | Type | Notes |
|--------|------|-------|
| id | String | `@default(cuid())`, primary key |
| name | String | required |
| address | String | required |
| cuisine | String | required, indexed |
| rating | Float | required |
| imageUrl | String? | optional |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

### MenuItem
| Column | Type | Notes |
|--------|------|-------|
| id | String | `@default(cuid())`, primary key |
| name | String | required |
| description | String | required |
| price | Int | required (in smallest currency unit) |
| available | Boolean | `@default(true)` |
| restaurantId | String | FK → Restaurant, indexed |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

### Customer
| Column | Type | Notes |
|--------|------|-------|
| id | String | `@default(cuid())`, primary key |
| name | String | required |
| email | String | `@unique`, required |
| phone | String | required |
| address | String | required |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

### Order
| Column | Type | Notes |
|--------|------|-------|
| id | String | `@default(cuid())`, primary key |
| restaurantId | String | FK → Restaurant, indexed |
| customerId | String | FK → Customer, indexed |
| status | String | `@default("PENDING")`, indexed |
| total | Int | required |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

### OrderItem
| Column | Type | Notes |
|--------|------|-------|
| id | String | `@default(cuid())`, primary key |
| orderId | String | FK → Order, indexed |
| menuItemId | String | FK → MenuItem, indexed |
| quantity | Int | required |
| price | Int | snapshot at order time |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

### Constraints That Make Impossible States Impossible

- **Foreign keys with CASCADE deletes**: An OrderItem cannot reference a
  nonexistent Order or MenuItem — the FK constraint enforces this at the
  database level. Deleting a Restaurant cascades to its MenuItems and
  Orders. Deleting an Order cascades to its OrderItems.
- **Unique email**: The `@unique` constraint on Customer.email prevents
  two customers with the same email address.
- **Application-level validation in POST /orders**: The handler checks
  that the restaurant exists, the customer exists, each menu item exists,
  and each menu item belongs to the specified restaurant — before
  inserting anything. This prevents cross-restaurant orders.
- **OrderItem.price is a snapshot**: It is copied from MenuItem.price at
  creation time, so changing a menu item's price later does not alter
  historical orders.

---

## 5. The Concepts

### Generated Identifiers

**What**: Every model uses `@default(cuid())` for its primary key.
CUIDs are opaque, URL-safe strings like `cmua1utyg00139evo1atz4ozh`.

**Why needed**: Sequential integer IDs let anyone enumerate an entire
dataset by incrementing a number in the URL (`/orders/1`, `/orders/2`,
`/orders/3`...). This leaks the true scale of the business and makes
scraping trivial. A CUID carries no information and cannot be guessed.

**Implementation**: `@default(cuid())` in `prisma/schema.prisma` on
every model's `id` field. Prisma generates the CUID on insert.

**What was chosen against**: UUIDs were considered but CUIDs are shorter
and sort chronologically, which is a minor advantage for debugging.

### Offset Pagination

**What**: `limit` + `offset` query parameters. Default limit 20, max 100
(clamped, not rejected). Response includes `total` and `hasMore`.

**Why needed**: A client needs to page through results without loading
everything at once. Offset pagination lets a client jump to an arbitrary
page (page 1 to page 50 in one request).

**Implementation**: `take: limit, skip: offset` in Prisma queries. A
parallel `prisma.count()` with the same `where` clause provides the
total. `hasMore` is computed as `offset + limit < total`.

**What was chosen against**: Cursor pagination (`cursor` + `take`) was
considered. It is more performant on very large datasets and avoids
duplicate/skipped rows when data changes between pages, but it
sacrifices the ability to jump to an arbitrary page. Given this dataset
is a few hundred rows, offset's simplicity was judged worth its real,
known limitations.

### Response and Error Envelope

**What**: A single `{ data, meta }` shape for every success response,
and a single `{ error: { code, message } }` shape for every failure.

**Why needed**: Consistency. A client never has to special-case parsing
logic per endpoint. `meta` always carries `total`, `limit`, `offset`,
and `hasMore` so a client can build pagination controls without a
separate count request.

**Implementation**: Every route handler returns `NextResponse.json()`
with the same envelope structure. Error codes are strings like
`NOT_FOUND`, `BAD_REQUEST`, `UNPROCESSABLE_ENTITY`, `RATE_LIMITED`.
HTTP status codes are honest (400, 404, 422, 429 — never 500 for bad
input).

**What was chosen against**: Returning raw data without an envelope
was considered simpler, but it would require different parsing logic
for list vs. single-item responses and would make pagination impossible
to build client-side without a separate total-count endpoint.

### Rate Limiting as Config, Not Inline

**What**: IP-keyed rate limiting with limit and window stored in a
config object, not hardcoded in any handler.

**Why needed**: Protects the API from abuse. Making it config-driven
means the actual number is one line to find and change.

**Implementation**: `src/lib/config.ts` exports
`RATE_LIMIT = { requests: 100, windowMs: 60_000 }`. Every route
handler calls `checkRateLimit(ip)` from `src/lib/rateLimit.ts` at the
top. The rate limiter uses an in-memory `Map` — simple, no external
dependencies, sufficient for a single-server deployment.

**What was chosen against**: Redis-backed rate limiting was considered
but is unnecessary for a single Next.js server. A middleware approach
(Next.js middleware.ts) was considered but would apply to all routes
uniformly, making per-route limits harder later.

### Versioned Paths

**What**: All endpoints are under `/api/v1/...` from the first commit.

**Why needed**: Allows a future `/api/v2/` without breaking existing
clients. Even though there is only one version now, starting with
versioning costs almost nothing and removing it later is a breaking
change.

**Implementation**: The directory structure is
`src/app/api/v1/restaurants/route.ts` and
`src/app/api/v1/orders/route.ts`. Next.js App Router maps directory
paths to URL paths automatically.

**What was chosen against**: Omitting versioning (just `/api/...`) was
considered simpler, but the PRD explicitly required `/api/v1/...`.

---

## 6. What Went Wrong

### npm EBUSY Error During Scaffolding

**Symptom**: `npm install` failed with:
```
EBUSY: resource busy or locked, rmdir 'node_modules\@mapbox\node-pre-gyp'
```

**Investigation**: Checked for stuck node processes (`Get-Process node`).
Found 4 running node processes — all were `chrome-devtools-mcp` (MCP
tooling), not stuck npm processes. Checked the `node_modules` directory
structure — 324 directories present, key packages (`next`, `@faker-js/faker`)
existed but `prisma` CLI was missing.

**Cause**: Two concurrent npm install commands had been run in the prior
session. One was removing 431 packages (cleanup from a prior install)
while the other tried to access `@mapbox/node-pre-gyp` simultaneously.
The race condition caused the EBUSY error. The second problem was that
`create-next-app` failed silently because the project name `APE-P-I`
contained capital letters (npm naming restriction), so the full
scaffolding (tsconfig, next.config, src/) was never generated.

**Fix**: Manually created `tsconfig.json`, `next.config.ts`,
`src/app/layout.tsx`, and `src/app/page.tsx` instead of relying on
`create-next-app`. Reinstalled `prisma` CLI separately.

### Next.js 16 SWC Binary Incompatibility

**Symptom**: `npx next build` failed with:
```
Failed to load SWC binary for win32/x64
next-swc.win32-x64-msvc.node is not a valid Win32 application
```

**Investigation**: Checked the SWC binary's PE header — it was a valid
x64 binary (machine type 0x8664). Checked Node version: v24.16.0 (ABI
137). The SWC binary was compiled for an older Node ABI.

**Cause**: Node v24.16.0 is bleeding edge. Next.js 16's prebuilt SWC
binaries were not yet compiled for ABI 137 at the time of this build.

**Fix**: Downgraded from Next.js 16 to Next.js 15.5.25, which ships
SWC binaries compatible with Node v24. Build succeeded after downgrade.

### Prisma Version Mismatch

**Symptom**: `prisma generate` failed with:
```
Cannot find module '@prisma/client/runtime/query_engine_bg.postgresql.wasm-base64.js'
```

**Investigation**: Checked versions — `@prisma/client` was at 7.10.0
but `prisma` CLI was at 6.19.3. Major version mismatch.

**Cause**: The initial `npm install` had installed `@prisma/client` v7
(from `^7.10.0` in package.json), but a later install downgraded the
`prisma` CLI to v6 without matching the client.

**Fix**: Explicitly installed both at v6:
`npm install @prisma/client@6 prisma@6`. Both at 6.19.3, generate
succeeded.

---

## 7. What This Slice Does Not Handle

**This section is a documentation choice made beyond the brief's own
minimum requirement.** The Five Engineering Tasks brief only asks for a
README. This 8-section documentation file, and this section in
particular, are additions worth noting honestly.

### Not yet done

- **Deployment to Vercel**: The API runs locally but has not been
  deployed. A managed Postgres (Vercel Postgres, Neon, or Supabase)
  has not been provisioned. The seed script has not been run against
  production.

- **Consumer UI**: The brief calls for a minimal consumer app that
  calls the live deployed URL. This has not been built yet.

### Scope limits by design

- **No authentication on reads**: The PRD explicitly states "No
  authentication for reading." Anyone on the internet can call every
  endpoint. This is the product — an open, consumable API.

- **No cursor pagination**: Offset pagination was chosen for its
  simplicity and ability to jump to arbitrary pages. The known
  tradeoffs (slower on large offsets, possible duplicate/skipped rows)
  are accepted.

- **In-memory rate limiting only**: The rate limiter uses a JavaScript
  `Map` in `src/lib/rateLimit.ts`. This works for a single-server
  deployment but would not survive a serverless/edge deployment without
  an external store (Redis, etc.). For Vercel's serverless functions,
  this would need to be replaced.

- **Single consumer app only**: The brief requires one consumer, not
  a generic client SDK or multiple consumers.

- **No real payment or delivery tracking**: Order statuses are
  strings. There is no integration with payment processors or delivery
  services.

---

## 8. If I Built This Again

The biggest lesson from building this was that version-pinning
everything from the start would have saved hours. Installing
`next@latest` pulled v16, which doesn't work on Node v24 yet.
Installing `@prisma/client` without pinning the exact minor version
caused a mismatch with the prisma CLI. If I did this again, I would
pin exact versions in package.json from the first `npm install`, run
`npm ls` immediately after to verify the tree is consistent, and never
run two npm installs concurrently on the same `node_modules` — the
EBUSY race condition was entirely avoidable. On the architecture side,
the offset pagination approach is genuinely the right call for a dataset
this size, but I would add a note in the response meta about cache
invalidation risks if this were ever deployed to a serverless
environment where multiple instances share a database but not an
in-memory rate limiter.
