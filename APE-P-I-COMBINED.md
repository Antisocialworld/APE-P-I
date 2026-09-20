# APE-P-I — Combined PRD + AGENT_RULES + SKILL

## Task
Task 1 of the Five Engineering Tasks brief: Build and Serve a
Consumable API. Time budget: 12–16 hours.

---

## PART 1 — PRD

### What This Is
APE-P-I, a REST API serving realistic food-delivery data (restaurants,
menu items, orders, customers), deployed to a public URL, consumable
by any client on the internet. A minimal consumer app calls the live,
deployed API and displays the result, proving it works from outside
its own codebase.

### What This Is Not
No authentication for reading. No interface beyond the minimal
consumer. No landing page. No admin panel. The API is the product.

### Resources (minimum shape)
- **Restaurant** — has many MenuItems, has many Orders.
- **MenuItem** — belongs to a Restaurant.
- **Customer** — places Orders.
- **Order** — belongs to a Restaurant and a Customer, contains many
  OrderItems.
- **OrderItem** — belongs to an Order, references a MenuItem.

All identifiers are generated (cuid/uuid), never sequential integers.

### Endpoints (versioned from the first commit, `/api/v1/...`)
```
GET    /api/v1/restaurants            list, paginated
GET    /api/v1/restaurants/:id        one item
GET    /api/v1/restaurants/:id/menu   nested resource
POST   /api/v1/orders                 create
GET    /api/v1/orders/:id             read
PATCH  /api/v1/orders/:id             partial update
DELETE /api/v1/orders/:id             remove
```

### List Endpoint Contract (every list endpoint)
- Pagination: `limit` + `offset`. Default limit 20, max 100. Response
  includes total count and whether there's a next page.
- Filtering on at least two fields (e.g. `?cuisine=nigerian&minPrice=1000`).
- Sorting: `?sort=price&order=desc`.

### Response Envelope (one shape, everywhere)
```json
{ "data": [...], "meta": { "total": 340, "limit": 20, "offset": 0, "hasMore": true } }
```

### Error Envelope (one shape, honest status codes)
```json
{ "error": { "code": "NOT_FOUND", "message": "Restaurant not found" } }
```

### Bad Input Handling
- `limit` over max → clamped, not honoured.
- Negative `offset` → 400 with a clear message.
- Unknown sort field → 400, not silently ignored.
- Malformed identifier → 404 or 400, never 500.
- POST missing a required field → 422, field named.

### Rate Limiting
Keyed on IP, config-driven (not hardcoded in the handler), returns
429 with a `Retry-After` header.

### Deployment
Vercel, managed Postgres, seed script run against production, env
vars set properly. Confirmed answering from a machine that isn't the
developer's own.

### Consumer
Smallest possible client calling the live, deployed URL (never
localhost): a list, a filter control, a "next page" button. Must
handle three states, not just the happy path: loading, a genuine
empty result (e.g. a filter that matches nothing, shown as a real
"no results" message, not a blank screen), and a failed API call
(shown as a real error message, not a silent failure or an
unhandled exception in the console).
Color palette: #E4DDD3 and #00A19B, used for every color decision
in the consumer app's UI (backgrounds, accents, buttons, active
states). No other colors introduced without a reason.

### Evidence Required
- Live API URL.
- Screenshot of curl hitting the live URL, showing a paginated
  response.
- Screenshot of the 429 after exceeding the rate limit.
- Screenshot of the consumer displaying live data.
- The seed script.

### Design Decisions To Document (README section)

**Why these resources.** Restaurant, MenuItem, Customer, Order, and
OrderItem were chosen because they mirror the brief's own worked
example exactly, and because the relationships between them are
genuine, not decorative: a MenuItem is meaningless without a parent
Restaurant, an Order is meaningless without knowing which Customer
placed it and which Restaurant it's from, and an OrderItem is what
actually connects an Order to specific MenuItems at specific
quantities. That's real relational depth, not five flat, unrelated
tables.

**Why generated identifiers.** Sequential integer IDs let anyone
enumerate an entire dataset just by incrementing a number in the URL
(`/orders/1`, `/orders/2`, `/orders/3`...), which both leaks the true
scale of the business (how many orders exist) and makes scraping the
whole dataset trivial. A generated ID (cuid/uuid) carries no
information and can't be guessed or walked sequentially.

**Why offset pagination over cursor.** Offset pagination (`limit` +
`offset`) was chosen for this task specifically because it lets a
client jump directly to an arbitrary page (page 1 to page 50 in one
request), which matters for a demo/consumer app with a visible page
number or "jump to page" control. The real, honest tradeoff: offset
pagination gets slower on very large offsets (the database still has
to count past every skipped row) and can show duplicate or skipped
rows if data changes between page loads, since it's counting rows
by position, not by a stable marker. Cursor pagination fixes both of
those (it pages from a stable, opaque reference point instead of a
raw count) but sacrifices the ability to jump to an arbitrary page.
Given this dataset is a few hundred rows, not millions, and the
consumer only needs "next page," not "jump to page 50," offset's
simplicity was judged worth its real, known limitations here.

**The envelope shape and why.** A single, consistent
`{ data, meta }` shape for every success response, and a single
`{ error: { code, message } }` shape for every failure, was chosen
so a client never has to guess or special-case parsing logic per
endpoint. `meta` always carries `total`, `limit`, `offset`, and
`hasMore` so a client can build real pagination controls (page
numbers, a disabled "next" button at the end) without a separate
request just to find out how much data exists.

---

## PART 2 — AGENT_RULES

### Git
Never commit/stage/push without explicit authorization. Read-only
git commands are always fine. Commit messages describe what changed,
never "update" or "fix." Incremental commit history required, not
one final commit.

### Scope discipline
Build only what's in this PRD. Treat "What This Is Not" as a hard
boundary. If unsure whether something is in scope, ask, don't guess.

### Color palette
#E4DDD3 and #00A19B are the only two colors used anywhere the
consumer app needs color, backgrounds, buttons, accents, active/
hover states. Do not introduce a third color, a default framework
color, or a browser default without checking first.

### Environment variables and secrets
Secrets written into `.env` by hand, never by the agent. Maintain
`.env.example` with commented placeholders only. Confirm `.env` is
gitignored before any commit is authorized. Verified by opening the
repo in a private browser window before submission, not from memory.

### Data
Seed script must be idempotent (safely re-runnable, no duplicates on
a second run) and must generate a few hundred records per resource,
not ten. Faker (`@faker-js/faker`) used to generate this, chosen
because it's code-controlled and naturally satisfies the
repeatability requirement, unlike a static downloaded dataset.

### Consistency
One response envelope shape, one error envelope shape, used on every
single endpoint without exception. No endpoint gets a "special"
shape.

### Documentation is not optional
README covers: resource table (before any code is written), full
endpoint documentation with curl examples, and the design-decisions
section named above.

### Evidence
Every "Evidence Required" item needs an actual screenshot or actual
command output, never a description of expected behaviour presented
as if confirmed.

### Sequencing
Design resources → schema → seed script → endpoints → bad-input
handling → rate limiting → docs → deploy → consumer. Verify each
step before building the next on top of it.

---

## PART 3 — SKILL (technical how-to)

### Generated identifiers
Use Prisma's `@default(cuid())` or `@default(uuid())` on every model's
`id` field. Never `@default(autoincrement())` — sequential integers
let anyone enumerate the entire dataset by incrementing a number in
the URL.

### Idempotent seeding
Two valid approaches, pick one and state which in the seed script's
own comments:
1. Clear existing data first (`prisma.order.deleteMany()`, etc.) then
   regenerate fresh, every run.
2. Use Faker's seed value (`faker.seed(12345)`) for deterministic
   output, then `upsert` on a natural unique key so re-running
   produces the same records rather than duplicates.

### Faker usage pattern
```javascript
import { faker } from '@faker-js/faker';

const restaurant = {
  id: faker.string.uuid(),
  name: faker.company.name(),
  address: faker.location.streetAddress(),
  cuisine: faker.helpers.arrayElement(['Nigerian', 'Chinese', 'Italian', 'Fast Food']),
  rating: faker.number.float({ min: 3.0, max: 5.0, precision: 0.1 }),
};
```

### Pagination + filtering + sorting, combined in one query
```javascript
const { limit = 20, offset = 0, sort = 'createdAt', order = 'desc', cuisine, minPrice } = query;
const clampedLimit = Math.min(parseInt(limit), 100);
if (parseInt(offset) < 0) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'offset cannot be negative' } });

const where = {
  ...(cuisine && { cuisine }),
  ...(minPrice && { price: { gte: parseInt(minPrice) } }),
};

const [data, total] = await Promise.all([
  prisma.restaurant.findMany({ where, take: clampedLimit, skip: parseInt(offset), orderBy: { [sort]: order } }),
  prisma.restaurant.count({ where }),
]);

return res.json({ data, meta: { total, limit: clampedLimit, offset: parseInt(offset), hasMore: parseInt(offset) + clampedLimit < total } });
```

### Rate limiting, config-driven
Store the limit and window in a config file/object, not inline in the
handler, so the actual number is one line to find and change:
```javascript
// config.js
export const RATE_LIMIT = { requests: 100, windowMs: 60_000 };
```

### Vercel deployment checklist
1. Push repo to GitHub.
2. Import into Vercel, connect a managed Postgres (Vercel Postgres,
   Neon, or Supabase).
3. Set `DATABASE_URL` in Vercel's own environment variable settings,
   never committed.
4. Run the seed script against the production database once, after
   first deploy.
5. Confirm the live URL answers from a phone on mobile data or a
   different machine, not just localhost.
