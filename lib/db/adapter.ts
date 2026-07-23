// lib/db/adapter.ts
//
// The DbAdapter interface: the exact set of operations the route handlers
// need, expressed as named methods rather than a generic SQL passthrough.
// This is deliberately narrow and shaped around this app's five endpoints
// rather than being a general-purpose query builder — that keeps both
// backend implementations (sqlite-adapter.ts, supabase-adapter.ts) simple
// and makes it obvious when a new operation is added that both need updating.
//
// All methods take/return the same camelCase-free, snake_case DB row shapes
// used elsewhere in lib/ (ErrorTemplateRow, ParseHistoryRow, TicketRow) —
// the route handlers still own the snake_case -> camelCase mapping via
// lib/parse-log.ts and lib/tickets.ts. This adapter only deals with data
// access, not response shaping.

import type { ErrorTemplateRow, ParseHistoryRow } from "@/lib/parse-log";
import type { TicketRow, JoinedTemplateSummary } from "@/lib/tickets";

export interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

export interface DbAdapter {
  // --- error_templates ---
  findTemplateByCode(errorCode: string): Promise<QueryResult<ErrorTemplateRow | null>>;

  createErrorTemplate(fields: {
    error_code: string;
    internal_system: string;
    category: string;
    severity: "low" | "medium" | "high" | "critical";
    is_self_service: boolean;
    self_service_steps: string | null;
    specialist_diagnostic: string;
    employee_message: string;
    escalate_to_dev: boolean;
  }): Promise<QueryResult<{ id: string }>>;


  // --- parse_history ---
  insertParseHistory(fields: {
    raw_payload: unknown;
    extracted_code: string | null;
    matched_template_id: string | null;
    match_status: "matched" | "unmapped" | "invalid_payload";
  }): Promise<QueryResult<{ id: string }>>;

  listParseHistory(limit: number): Promise<
    QueryResult<(ParseHistoryRow & { error_templates: ErrorTemplateRow | null })[]>
  >;

  deleteParseHistory(id: string): Promise<QueryResult<{ id: string }>>;

  // --- tickets ---
  listTickets(
    statusFilter: string | null,
    limit: number
  ): Promise<QueryResult<(TicketRow & { error_templates: JoinedTemplateSummary | null })[]>>;

  getTicketById(
    id: string
  ): Promise<QueryResult<(TicketRow & { error_templates: JoinedTemplateSummary | null }) | null>>;

  updateTicket(
    id: string,
    fields: Record<string, unknown>
  ): Promise<QueryResult<(TicketRow & { error_templates: JoinedTemplateSummary | null }) | null>>;
}

let cachedAdapter: DbAdapter | null = null;

/**
 * Returns the active DbAdapter, chosen once per process based on whether
 * Supabase env vars are present (see lib/db/index.ts isSupabaseConfigured).
 * Cached after first call so we don't re-open a SQLite connection or
 * re-construct the Supabase client on every request.
 */
export async function getDb(): Promise<DbAdapter> {
  if (cachedAdapter) return cachedAdapter;

  const { isSupabaseConfigured } = await import("./index");

  if (isSupabaseConfigured()) {
    const { SupabaseAdapter } = await import("./supabase-adapter");
    cachedAdapter = new SupabaseAdapter();
  } else {
    const { SqliteAdapter } = await import("./sqlite-adapter");
    cachedAdapter = new SqliteAdapter();
  }

  return cachedAdapter;
}
