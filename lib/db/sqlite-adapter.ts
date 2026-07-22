// lib/db/sqlite-adapter.ts
//
// SQLite-backed DbAdapter for zero-config local development. Uses Node's
// built-in `node:sqlite` module (Node 22+) — no npm dependency, nothing to
// compile. The database file lives at ./local.db in the project root
// (gitignored — see .gitignore), created automatically by scripts/db-init.js
// on first run.
//
// SQLite doesn't have Postgres's `uuid`, `jsonb`, `timestamptz`, or `check`
// syntax identically, so scripts/schema.sqlite.sql is a separate,
// SQLite-flavored translation of scripts/schema.sql (see that file for the
// authoritative Postgres DDL — the two must be kept in sync by hand if the
// schema changes). UUIDs are generated in JS via crypto.randomUUID() rather
// than a DB-side default, since SQLite has no built-in UUID function.

import "server-only";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import type { DbAdapter, QueryResult } from "./adapter";
import type { ErrorTemplateRow, ParseHistoryRow } from "@/lib/parse-log";
import type { TicketRow, JoinedTemplateSummary } from "@/lib/tickets";

const DB_PATH = path.join(process.cwd(), "local.db");

let db: InstanceType<typeof DatabaseSync> | null = null;

function getConnection() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA foreign_keys = ON;");
  }
  return db;
}

function ok<T>(data: T): QueryResult<T> {
  return { data, error: null };
}

function fail<T>(error: unknown): QueryResult<T> {
  const message = error instanceof Error ? error.message : String(error);
  return { data: null, error: message };
}

/** SQLite stores booleans as 0/1 — normalize to real booleans on read. */
function normalizeTemplateRow(row: Record<string, unknown> | undefined): ErrorTemplateRow | null {
  if (!row) return null;
  return {
    ...(row as unknown as ErrorTemplateRow),
    is_self_service: Boolean(row.is_self_service),
    escalate_to_dev: Boolean(row.escalate_to_dev),
  };
}

function normalizeTemplateSummary(row: Record<string, unknown> | null | undefined): JoinedTemplateSummary | null {
  if (!row || row.error_code == null) return null;
  return {
    error_code: row.error_code as string,
    internal_system: row.internal_system as string,
    specialist_diagnostic: row.specialist_diagnostic as string,
    employee_message: row.employee_message as string,
    is_self_service: Boolean(row.is_self_service),
    self_service_steps: (row.self_service_steps as string | null) ?? null,
  };
}

function normalizeHistoryRow(row: Record<string, unknown>): ParseHistoryRow {
  return {
    ...(row as unknown as ParseHistoryRow),
    is_test_data: Boolean(row.is_test_data),
    raw_payload: typeof row.raw_payload === "string" ? JSON.parse(row.raw_payload as string) : row.raw_payload,
  };
}

function normalizeTicketRow(row: Record<string, unknown>): TicketRow {
  return {
    ...(row as unknown as TicketRow),
    is_test_data: Boolean(row.is_test_data),
  };
}

export class SqliteAdapter implements DbAdapter {
  async findTemplateByCode(errorCode: string): Promise<QueryResult<ErrorTemplateRow | null>> {
    try {
      const conn = getConnection();
      const stmt = conn.prepare("SELECT * FROM error_templates WHERE error_code = ?");
      const row = stmt.get(errorCode) as Record<string, unknown> | undefined;
      return ok(normalizeTemplateRow(row));
    } catch (err) {
      return fail(err);
    }
  }

  async insertParseHistory(fields: {
    raw_payload: unknown;
    extracted_code: string | null;
    matched_template_id: string | null;
    match_status: "matched" | "unmapped" | "invalid_payload";
  }): Promise<QueryResult<{ id: string }>> {
    try {
      const conn = getConnection();
      const id = crypto.randomUUID();
      const stmt = conn.prepare(
        `INSERT INTO parse_history (id, raw_payload, extracted_code, matched_template_id, match_status, is_test_data, created_at)
         VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`
      );
      stmt.run(
        id,
        JSON.stringify(fields.raw_payload),
        fields.extracted_code,
        fields.matched_template_id,
        fields.match_status
      );
      return ok({ id });
    } catch (err) {
      return fail(err);
    }
  }

  async listParseHistory(
    limit: number
  ): Promise<QueryResult<(ParseHistoryRow & { error_templates: ErrorTemplateRow | null })[]>> {
    try {
      const conn = getConnection();
      // Fetched as two separate queries (history, then each row's template)
      // rather than a SQL JOIN — a wildcard join produces ambiguous/colliding
      // column names between parse_history and error_templates (both have
      // `id`, `created_at`), which node:sqlite's positional result API
      // doesn't disambiguate the way a JS object from Supabase's PostgREST
      // JOIN syntax does. N+1 queries against a local SQLite file is fine
      // for this use case (dev-only, small row counts, no network latency).
      const historyStmt = conn.prepare(
        `SELECT * FROM parse_history WHERE is_test_data = 0 ORDER BY created_at DESC LIMIT ?`
      );
      const historyRows = historyStmt.all(limit) as Record<string, unknown>[];

      const templateStmt = conn.prepare("SELECT * FROM error_templates WHERE id = ?");
      const results = historyRows.map((row) => {
        const history = normalizeHistoryRow(row);
        const template = history.matched_template_id
          ? normalizeTemplateRow(templateStmt.get(history.matched_template_id) as Record<string, unknown> | undefined)
          : null;
        return { ...history, error_templates: template };
      });

      return ok(results);
    } catch (err) {
      return fail(err);
    }
  }

  async deleteParseHistory(id: string): Promise<QueryResult<{ id: string }>> {
    try {
      const conn = getConnection();
      conn.prepare("DELETE FROM parse_history WHERE id = ?").run(id);
      return ok({ id });
    } catch (err) {
      return fail(err);
    }
  }

  async listTickets(
    statusFilter: string | null,
    limit: number
  ): Promise<QueryResult<(TicketRow & { error_templates: JoinedTemplateSummary | null })[]>> {
    try {
      const conn = getConnection();
      const query = statusFilter
        ? `SELECT * FROM tickets WHERE is_test_data = 0 AND status = ? ORDER BY created_at DESC LIMIT ?`
        : `SELECT * FROM tickets WHERE is_test_data = 0 ORDER BY created_at DESC LIMIT ?`;
      const stmt = conn.prepare(query);
      const rows = (statusFilter ? stmt.all(statusFilter, limit) : stmt.all(limit)) as Record<string, unknown>[];

      const templateStmt = conn.prepare(
        "SELECT error_code, internal_system, specialist_diagnostic, employee_message, is_self_service, self_service_steps FROM error_templates WHERE id = ?"
      );
      const results = rows.map((row) => {
        const ticket = normalizeTicketRow(row);
        const template = ticket.matched_template_id
          ? normalizeTemplateSummary(templateStmt.get(ticket.matched_template_id) as Record<string, unknown> | undefined)
          : null;
        return { ...ticket, error_templates: template };
      });

      return ok(results);
    } catch (err) {
      return fail(err);
    }
  }

  async getTicketById(
    id: string
  ): Promise<QueryResult<(TicketRow & { error_templates: JoinedTemplateSummary | null }) | null>> {
    try {
      const conn = getConnection();
      const row = conn.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as
        | Record<string, unknown>
        | undefined;
      if (!row) return ok(null);

      const ticket = normalizeTicketRow(row);
      const templateStmt = conn.prepare(
        "SELECT error_code, internal_system, specialist_diagnostic, employee_message, is_self_service, self_service_steps FROM error_templates WHERE id = ?"
      );
      const template = ticket.matched_template_id
        ? normalizeTemplateSummary(templateStmt.get(ticket.matched_template_id) as Record<string, unknown> | undefined)
        : null;

      return ok({ ...ticket, error_templates: template });
    } catch (err) {
      return fail(err);
    }
  }

  async updateTicket(
    id: string,
    fields: Record<string, unknown>
  ): Promise<QueryResult<(TicketRow & { error_templates: JoinedTemplateSummary | null }) | null>> {
    try {
      const conn = getConnection();
      const setClauses = Object.keys(fields)
        .map((key) => `${key} = ?`)
        .join(", ");
      const values = Object.values(fields).map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));

      if (setClauses.length > 0) {
        conn.prepare(`UPDATE tickets SET ${setClauses} WHERE id = ?`).run(...values, id);
      }

      return this.getTicketById(id);
    } catch (err) {
      return fail(err);
    }
  }
}
