-- Plain Logger database schema.
-- This file is the source of truth for the DDL. scripts/db-init.js executes
-- these statements via a direct Postgres connection (SUPABASE_DB_URL) since
-- the Supabase JS client (PostgREST-based) cannot run arbitrary DDL.

create extension if not exists "pgcrypto";

create table if not exists error_templates (
  id uuid primary key default gen_random_uuid(),
  error_code text not null unique,                  -- e.g. "AUTHSVC_TOKEN_EXPIRED"
  internal_system text not null,                     -- e.g. "auth-service", "fulfillment-api", "job-queue"
  category text not null,                            -- e.g. "auth", "timeout", "queue", "db", "config"
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  is_self_service boolean not null default false,    -- true only when severity = 'low'
  self_service_steps text,                           -- null unless is_self_service = true
  specialist_diagnostic text not null,                -- engineer-to-engineer: root cause + resolve-or-escalate guidance
  employee_message text not null,                     -- plain language; content differs by severity
  escalate_to_dev boolean not null default false,      -- true whenever severity is medium/high/critical
  created_at timestamptz not null default now(),
  constraint self_service_only_when_low check (
    (severity = 'low') or (is_self_service = false and self_service_steps is null)
  )
);

create index if not exists idx_error_templates_code on error_templates (error_code);

create table if not exists parse_history (
  id uuid primary key default gen_random_uuid(),
  raw_payload jsonb not null,
  extracted_code text,                                -- null if extraction failed
  matched_template_id uuid references error_templates(id) on delete set null,
  match_status text not null check (match_status in ('matched', 'unmapped', 'invalid_payload')),
  is_test_data boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_parse_history_created_at on parse_history (created_at desc);
create index if not exists idx_parse_history_is_test_data on parse_history (is_test_data);

-- Tickets: the actual work queue of internal support tickets, distinct from
-- parse_history (which is a pure audit log of every parse attempt).
-- A ticket represents an employee's reported issue as it moves through
-- triage: open -> in_progress -> resolved. It references the matched
-- error_templates row (if any) so the specialist/employee messaging is
-- available, but can also exist for unmapped codes (matched_template_id
-- null) since specialists still need to track and resolve those manually.
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,                 -- human-readable, e.g. "PL-1042"
  submitted_by text not null,                          -- employee name/handle who filed it (fictional, seed data)
  matched_template_id uuid references error_templates(id) on delete set null,
  parse_history_id uuid references parse_history(id) on delete set null,
  extracted_code text,                                 -- denormalized copy of the code at ticket creation time
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  assigned_specialist text,                             -- null while unassigned (status = 'open')
  resolution_note text,                                 -- populated only when status = 'resolved'
  is_test_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,                              -- null unless status = 'resolved'
  constraint resolution_fields_only_when_resolved check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null and resolution_note is null)
  )
);

create index if not exists idx_tickets_status on tickets (status);
create index if not exists idx_tickets_severity on tickets (severity);
create index if not exists idx_tickets_created_at on tickets (created_at desc);
create index if not exists idx_tickets_is_test_data on tickets (is_test_data);
