// lib/tickets.ts
//
// Pure, unit-testable functions for mapping tickets DB rows (snake_case) to
// API response shapes (camelCase). Mirrors the pattern in lib/parse-log.ts.

/** Shape of a row from the tickets table (snake_case, as Postgres returns it). */
export interface TicketRow {
  id: string;
  ticket_number: string;
  submitted_by: string;
  matched_template_id: string | null;
  parse_history_id: string | null;
  extracted_code: string | null;
  status: "open" | "in_progress" | "resolved";
  severity: "low" | "medium" | "high" | "critical";
  assigned_specialist: string | null;
  resolution_note: string | null;
  is_test_data: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

/** Minimal shape of a joined error_templates row, as returned by a `tickets` select with a join. */
export interface JoinedTemplateSummary {
  error_code: string;
  internal_system: string;
  specialist_diagnostic: string;
  employee_message: string;
  is_self_service: boolean;
  self_service_steps: string | null;
}

/**
 * Maps a ticket row (optionally with its joined error_templates row) to the
 * camelCase shape returned by the tickets API. Never spreads a raw Supabase
 * row into a response — see the naming-convention rule in the API routes.
 */
export function mapTicketRowToResponse(
  row: TicketRow,
  template: JoinedTemplateSummary | null
) {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    submittedBy: row.submitted_by,
    extractedCode: row.extracted_code,
    status: row.status,
    severity: row.severity,
    assignedSpecialist: row.assigned_specialist,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    matched: template
      ? {
          internalSystem: template.internal_system,
          specialistDiagnostic: template.specialist_diagnostic,
          employeeMessage: template.employee_message,
          isSelfService: template.is_self_service,
          selfServiceSteps: template.self_service_steps,
        }
      : null,
  };
}
