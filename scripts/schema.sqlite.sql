-- Plain Logger SQLite schema (local dev only).
--
-- This is a SQLite-flavored translation of scripts/schema.sql (the
-- authoritative Postgres/Supabase DDL). Differences from the Postgres
-- version, and why:
--   - `uuid primary key default gen_random_uuid()` -> `id TEXT PRIMARY KEY`.
--     SQLite has no UUID type or server-side UUID generator; IDs are
--     generated in JS via crypto.randomUUID() before insert (see
--     lib/db/sqlite-adapter.ts) and stored as TEXT.
--   - `jsonb` -> `TEXT`. raw_payload is JSON.stringify'd before insert and
--     JSON.parse'd on read (see sqlite-adapter.ts normalizeHistoryRow).
--   - `timestamptz default now()` -> `TEXT default (datetime('now'))`.
--     Stored as ISO-ish text; good enough for local dev sorting/display.
--   - `boolean` -> `INTEGER` (0/1). SQLite has no native boolean type;
--     normalized back to true/false in JS on read.
--   - Foreign keys and check constraints are supported the same way, but
--     SQLite requires `PRAGMA foreign_keys = ON` per-connection (done in
--     sqlite-adapter.ts) since it's off by default for backward compat.
--
-- If you change scripts/schema.sql, mirror the change here by hand — there
-- is no automatic translation between the two.

CREATE TABLE IF NOT EXISTS error_templates (
  id TEXT PRIMARY KEY,
  error_code TEXT NOT NULL UNIQUE,
  internal_system TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_self_service INTEGER NOT NULL DEFAULT 0,
  self_service_steps TEXT,
  specialist_diagnostic TEXT NOT NULL,
  employee_message TEXT NOT NULL,
  escalate_to_dev INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (severity = 'low') OR (is_self_service = 0 AND self_service_steps IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_error_templates_code ON error_templates (error_code);

CREATE TABLE IF NOT EXISTS parse_history (
  id TEXT PRIMARY KEY,
  raw_payload TEXT NOT NULL,
  extracted_code TEXT,
  matched_template_id TEXT REFERENCES error_templates(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL CHECK (match_status IN ('matched', 'unmapped', 'invalid_payload')),
  is_test_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parse_history_created_at ON parse_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parse_history_is_test_data ON parse_history (is_test_data);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  submitted_by TEXT NOT NULL,
  matched_template_id TEXT REFERENCES error_templates(id) ON DELETE SET NULL,
  parse_history_id TEXT REFERENCES parse_history(id) ON DELETE SET NULL,
  extracted_code TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  assigned_specialist TEXT,
  resolution_note TEXT,
  is_test_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL)
    OR (status <> 'resolved' AND resolved_at IS NULL AND resolution_note IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_severity ON tickets (severity);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_is_test_data ON tickets (is_test_data);
