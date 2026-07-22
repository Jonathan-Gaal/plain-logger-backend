# Plain Logger — Backend

The API backend for Plain Logger, an internal diagnostic tool for Tier-2
Technical Support Specialists. It parses raw JSON error logs from internal
microservices, looks the error code up deterministically against a
known-errors table, and returns two outputs: a technical **Specialist
Diagnostic** and a plain-language **Employee-Facing Message** for the
coworker who filed the ticket.

The lookup is a plain database query — no LLM/AI involved in the matching
path, so results are deterministic and hallucination-free.

**This is a pure API — there is no UI in this repo.** It's meant to be
paired with a separate `plain-logger-frontend` app that calls these
endpoints over HTTP.

## Quick start (zero config — runs locally out of the box)

Requires **Node.js 22 or newer** (`node --version` to check).

```bash
npm install
npm run db:init
npm run db:seed
npm run dev
```

That's it. No Supabase account, no `.env` file, no credentials. This creates
a local SQLite database at `./local.db`, seeds it with ~300 error_templates
and ~50 tickets, and starts the API at `http://localhost:3000`.

Verify it worked:
```bash
curl http://localhost:3000/api/tickets?limit=3
```
You should get back JSON with 3 tickets.

To wipe and reseed from scratch: `npm run db:reset`.

## Local mode vs. Supabase mode (how it works)

This app runs against two possible backends, chosen automatically — **no
code changes needed to switch**:

- **Local mode (default):** no `.env` file, or an `.env` file missing
  `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` → uses a SQLite
  file at `./local.db`, via Node's built-in `node:sqlite` module (Node 22+,
  zero npm dependencies, nothing to compile).
- **Supabase mode:** both of those env vars set → uses Supabase/Postgres,
  exactly as before.

The switch happens in `lib/db/index.ts` (`isSupabaseConfigured()`), and
every route handler calls the same `getDb()` function regardless of which
mode is active — see `lib/db/adapter.ts` for the shared interface and
`lib/db/sqlite-adapter.ts` / `lib/db/supabase-adapter.ts` for the two
implementations.

**This means you can develop entirely locally, then deploy against
Supabase just by setting environment variables** (e.g. in your deploy
platform's dashboard) — nothing in the application code changes between
the two.

## Deploying with Supabase instead

1. **Create a Supabase project** at supabase.com.

2. **Copy `.env.example` to `.env`** and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from
     Project Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` — also under Project Settings → API. This
     key is privileged; see **Security notes** below.
   - `SUPABASE_DB_URL` — from Project Settings → Database → Connection
     string (use the URI/non-pooling string). Required because `db:init`
     runs raw `CREATE TABLE` statements in Supabase mode, and the Supabase
     JS client (which only talks to PostgREST) can't execute arbitrary DDL
     — only a direct Postgres connection can. Not used in local mode.
   - `CORS_ALLOWED_ORIGINS` — comma-separated list of origins allowed to
     call this API (your `plain-logger-frontend` app's local dev URL and
     deployed URL). CORS is closed by default until this is set.

3. Run the same commands as the quick start — `npm install && npm run
   db:init && npm run db:seed && npm run dev` (or `npm run build && npm run
   start` for production) — they'll now target Supabase instead of
   `local.db`, because the env vars are set.

## API endpoints

**Log parsing / audit trail:**
- `POST /api/parse-log` — parse a raw JSON log, look it up, record history
- `GET /api/history?limit=20` — recent parse history (live-joined with
  current error_templates data)
- `DELETE /api/history/:id` — remove one history entry

**Tickets (the active work queue):**
- `GET /api/tickets?status=open&limit=50` — list tickets, optionally
  filtered by status (`open` / `in_progress` / `resolved`), live-joined
  with error_templates for tickets that matched a known code
- `GET /api/tickets/:id` — fetch a single ticket
- `PATCH /api/tickets/:id` — update `status`, `assignedSpecialist`, and/or
  `resolutionNote`. `resolutionNote` is required when setting
  `status: "resolved"`, and is rejected with a 400 if provided alongside
  `status: "open"` / `"in_progress"` (the DB constraint only allows
  resolution fields on resolved tickets). `resolvedAt` is set/cleared
  server-side — it is not a client-writable field. One known edge case: if
  you omit `status` entirely but send `resolutionNote` on a ticket that is
  *not currently* resolved, Zod can't see the DB's current state to catch
  this — it will fail at the database constraint instead, surfacing as a
  500 rather than a 400. Safe (no bad data gets written), just a less
  precise error. Always include `status: "resolved"` explicitly when
  setting a resolution note.

See `lib/parse-log.ts`, `lib/tickets.ts`, and the route handlers under
`app/api/` for exact request/response shapes.

**tickets vs. parse_history:** these are two different things.
`parse_history` is a pure audit log — every time anyone parses a log via
`POST /api/parse-log`, a row is written, matched or not. `tickets` is the
actual support work queue — a curated set of issues specialists are
tracking through open → in_progress → resolved. A ticket can optionally
reference a `parse_history` row (`parseHistoryId`) and/or a matched
`error_templates` row, but creating a ticket from a parsed log is not
currently automated — the seed data populates `tickets` directly as a
standalone realistic snapshot (see **Seed data** below). There is
currently no `POST /api/tickets` endpoint to create a new ticket from the
API; ticket creation happens via seeding or direct DB access. Add one if
your frontend needs to create tickets at runtime.

## CORS

Every route handler attaches CORS headers via `lib/cors.ts`, gated on
`CORS_ALLOWED_ORIGINS`. Set it to a comma-separated list, e.g.:

```
CORS_ALLOWED_ORIGINS=http://localhost:3001,https://plain-logger-frontend.example.com
```

Requests from an Origin not in this list will not receive CORS headers and
will be blocked by the browser. Same-origin requests (server-to-server
calls, `curl`) aren't affected by CORS at all — the browser is what
enforces it.

## Seed data

`error_templates` (~300 rows) is built from two sources, combined in
`scripts/seed-data.js`:
- **18 hand-written rows** — the most carefully worded examples, covering
  auth, internal APIs, message queues, DB, and config categories. These are
  also referenced directly by `tests/fixtures.ts`, so don't delete or
  rename their `error_code` values without updating the tests.
- **~282 generated rows** — produced by `scripts/generate-templates.js`,
  which combines ~25 fictional internal systems × 5 categories × 4
  severities × message templates. Every generated row follows the same
  rule as the hand-written ones: `severity = 'low'` implies
  `isSelfService: true` with steps populated and `escalateToDev: false`;
  anything else implies the reverse.

`tickets` (~50 rows) is produced by `scripts/generate-tickets.js`, called
from `db-seed.js` *after* `error_templates` is seeded (tickets reference
template rows by their generated IDs). Roughly 40% open / 30% in_progress /
30% resolved, spread over the last ~3 weeks, with a handful of unmapped
tickets (no matching template) mixed in. **Note:** this generator uses
`Math.random()`, so re-running `db:seed` produces a different random mix
each time (in local mode this is easy to reset — `npm run db:reset`).

## Testing

```bash
npm test
```

**Important — Vitest here is NOT browser E2E.** Vitest is a unit/integration
test runner; it does not render pages, click buttons, or drive a browser
(there's no UI in this repo to click anyway). The test files call the
running server's Route Handlers directly over `fetch` and assert on the
JSON responses and resulting database rows — this is API-level integration
testing, which is the correct and sufficient way to verify this backend's
core logic.

`tests/parse-log-unit.test.ts` covers the pure extraction logic in
`lib/parse-log.ts` with no server or database required — these run instantly.

**Before running `npm test`:** start the app (`npm run dev`) and seed it
(`npm run db:init && npm run db:seed`) first — in local mode this just
means running the quick-start commands against `local.db`; in Supabase
mode, point `.env` at a **separate test project**, never shared dev/prod.
Set `TEST_BASE_URL` if your server isn't at the default
`http://localhost:3000`.

All test files work in either mode. `tests/parse-log.test.ts`'s
self-cleaning collects the `historyId` returned by every API call it makes
and, in `afterAll`, deletes each one via `DELETE /api/history/:id` — the
same public endpoint the tests already exercise, not a direct database
connection. Since it only ever talks to the running app over HTTP, it works
identically whether that app is backed by local SQLite or Supabase.

## Known limitations

- **No authentication.** This tool assumes it sits behind the company's
  existing internal network/VPN (or, for local dev, is simply not exposed
  anywhere), with the frontend as the only intended caller (enforced
  loosely via CORS in Supabase/deployed mode, which is a browser-side
  protection, not real access control). Add real auth before deploying
  anywhere it could be reached by untrusted clients.
- **History view is a live join, not a snapshot.** `GET /api/history` joins
  each `parse_history` row against the *current* `error_templates` row, not
  a copy of what that row looked like at parse time.
- **No nested/wrapped payload support.** Only top-level `error_code` or
  `code` keys are read.
- **SQLite schema is a hand-maintained translation.** `scripts/schema.sql`
  (Postgres) and `scripts/schema.sqlite.sql` (SQLite) must be kept in sync
  by hand if the schema ever changes — there's no automatic translation
  between them. See the comment at the top of `schema.sqlite.sql` for the
  specific differences (UUID handling, JSON storage, boolean representation).

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security and must never
  reach the browser. It's constructed only inside
  `lib/db/supabase-adapter.ts` (server-only) and used in `scripts/`.
- `SUPABASE_DB_URL` contains your database password — treat it with the
  same care as the service-role key.
- **CORS is not authentication.** `CORS_ALLOWED_ORIGINS` only stops
  *browsers* from letting a page on a different origin read the response —
  it does nothing to stop direct API calls from outside a browser context.
- `local.db` is gitignored and never committed — it's a local file
  containing your dev seed data, regenerable at any time via `db:reset`.

## Project structure

```
/app/api
  parse-log/route.ts          POST — parse a log, look it up, record history
  history/route.ts            GET — recent history (live-joined)
  history/[id]/route.ts       DELETE — remove one history entry
  tickets/route.ts            GET — list tickets (filterable by status)
  tickets/[id]/route.ts       GET / PATCH — fetch or update one ticket
/lib
  cors.ts                      CORS headers, gated on CORS_ALLOWED_ORIGINS
  parse-log.ts                 Pure extraction + DB-row-to-API mapping logic
  tickets.ts                   Pure ticket DB-row-to-API mapping logic
  schemas.ts                   Zod request validation (parse-log + tickets)
  /db
    index.ts                   isSupabaseConfigured() / getDbMode() — the mode switch
    adapter.ts                 DbAdapter interface + getDb() (cached, lazy-loaded)
    sqlite-adapter.ts           Local mode: node:sqlite-backed implementation
    supabase-adapter.ts         Supabase mode: @supabase/supabase-js-backed implementation
/scripts
  schema.sql                   Postgres DDL (source of truth for Supabase mode)
  schema.sqlite.sql            SQLite DDL (hand-translated, local mode)
  db-init.js                   Creates tables — auto-detects mode
  db-seed.js                   Seeds error_templates, then tickets — auto-detects mode
  seed-data.js                 18 hand-written rows + generated rows combined
  generate-templates.js        Programmatic generator for ~282 error_templates rows
  generate-tickets.js          Programmatic generator for ~50 tickets rows
/tests
  fixtures.ts                  Shared sample payloads (also the acceptance criteria)
  parse-log.test.ts            API-level integration tests (either mode)
  parse-log-unit.test.ts       Pure unit tests (no server/DB needed, either mode)
  tickets.test.ts              API-level integration tests for tickets (either mode)
```
