// lib/db/supabase-adapter.ts
//
// Supabase (Postgres)-backed DbAdapter — used automatically once
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set (see
// lib/db/index.ts isSupabaseConfigured). This is a thin wrapper: the actual
// queries are the same ones the route handlers used directly before the
// DbAdapter abstraction was introduced.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DbAdapter, QueryResult } from "./adapter";
import type { ErrorTemplateRow, ParseHistoryRow } from "@/lib/parse-log";
import type { TicketRow, JoinedTemplateSummary } from "@/lib/tickets";

function ok<T>(data: T): QueryResult<T> {
  return { data, error: null };
}

function fail<T>(error: unknown): QueryResult<T> {
  const message = error instanceof Error ? error.message : String(error);
  return { data: null, error: message };
}

export class SupabaseAdapter implements DbAdapter {
  private client: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async findTemplateByCode(errorCode: string): Promise<QueryResult<ErrorTemplateRow | null>> {
    try {
      const { data, error } = await this.client
        .from("error_templates")
        .select("*")
        .eq("error_code", errorCode)
        .maybeSingle();
      if (error) throw error;
      return ok(data as ErrorTemplateRow | null);
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
      const { data, error } = await this.client
        .from("parse_history")
        .insert({ ...fields, is_test_data: false })
        .select("id")
        .single();
      if (error) throw error;
      return ok({ id: data.id as string });
    } catch (err) {
      return fail(err);
    }
  }

  async listParseHistory(
    limit: number
  ): Promise<QueryResult<(ParseHistoryRow & { error_templates: ErrorTemplateRow | null })[]>> {
    try {
      const { data, error } = await this.client
        .from("parse_history")
        .select("*, error_templates(*)")
        .eq("is_test_data", false)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ok((data ?? []) as (ParseHistoryRow & { error_templates: ErrorTemplateRow | null })[]);
    } catch (err) {
      return fail(err);
    }
  }

  async deleteParseHistory(id: string): Promise<QueryResult<{ id: string }>> {
    try {
      const { error } = await this.client.from("parse_history").delete().eq("id", id);
      if (error) throw error;
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
      let query = this.client
        .from("tickets")
        .select(
          "*, error_templates(error_code, internal_system, specialist_diagnostic, employee_message, is_self_service, self_service_steps)"
        )
        .eq("is_test_data", false)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (statusFilter) query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return ok((data ?? []) as (TicketRow & { error_templates: JoinedTemplateSummary | null })[]);
    } catch (err) {
      return fail(err);
    }
  }

  async getTicketById(
    id: string
  ): Promise<QueryResult<(TicketRow & { error_templates: JoinedTemplateSummary | null }) | null>> {
    try {
      const { data, error } = await this.client
        .from("tickets")
        .select(
          "*, error_templates(error_code, internal_system, specialist_diagnostic, employee_message, is_self_service, self_service_steps)"
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return ok(data as (TicketRow & { error_templates: JoinedTemplateSummary | null }) | null);
    } catch (err) {
      return fail(err);
    }
  }

  async updateTicket(
    id: string,
    fields: Record<string, unknown>
  ): Promise<QueryResult<(TicketRow & { error_templates: JoinedTemplateSummary | null }) | null>> {
    try {
      const { data, error } = await this.client
        .from("tickets")
        .update(fields)
        .eq("id", id)
        .select(
          "*, error_templates(error_code, internal_system, specialist_diagnostic, employee_message, is_self_service, self_service_steps)"
        )
        .maybeSingle();
      if (error) throw error;
      return ok(data as (TicketRow & { error_templates: JoinedTemplateSummary | null }) | null);
    } catch (err) {
      return fail(err);
    }
  }
}
