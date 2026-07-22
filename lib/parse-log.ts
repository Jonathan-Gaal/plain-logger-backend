// lib/parse-log.ts
//
// Pure, unit-testable functions for extracting an error code from a raw log
// payload and mapping DB rows (snake_case) to API response shapes
// (camelCase). No I/O in this file — the Route Handler owns the DB calls
// and imports these helpers.

/** Error code extracted from a payload, or null if none could be found. */
export type ExtractedCode = string | null;

/**
 * Attempts to JSON.parse the raw payload string.
 * Returns { ok: true, value } on success or { ok: false } on failure —
 * deliberately not throwing, so callers can branch without try/catch.
 */
export function tryParseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const value = JSON.parse(raw);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

/**
 * Extracts an error code from a parsed JSON payload.
 *
 * Only top-level `error_code` or `code` keys are supported (checked in that
 * order). Nested/wrapped payloads (e.g. a JSON string embedded inside
 * another JSON value) are explicitly out of scope for v1 — see the product
 * spec's error-handling section. This keeps extraction simple and
 * deterministic rather than guessing at arbitrary nesting.
 */
export function extractErrorCode(parsed: unknown): ExtractedCode {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.error_code === "string" && obj.error_code.trim().length > 0) {
    return obj.error_code;
  }

  if (typeof obj.code === "string" && obj.code.trim().length > 0) {
    return obj.code;
  }

  return null;
}

/** Shape of a row from the error_templates table (snake_case, as Postgres returns it). */
export interface ErrorTemplateRow {
  id: string;
  error_code: string;
  internal_system: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  is_self_service: boolean;
  self_service_steps: string | null;
  specialist_diagnostic: string;
  employee_message: string;
  escalate_to_dev: boolean;
  created_at: string;
}

/**
 * Maps a DB row (snake_case) to the camelCase shape returned by the API.
 *
 * This mapping is required by the API contract: route handlers must never
 * spread a raw Supabase row into a response, since that would leak
 * snake_case column names into the JSON contract.
 */
export function mapTemplateRowToMatchedResponse(row: ErrorTemplateRow) {
  return {
    status: "matched" as const,
    errorCode: row.error_code,
    internalSystem: row.internal_system,
    severity: row.severity,
    isSelfService: row.is_self_service,
    selfServiceSteps: row.self_service_steps,
    specialistDiagnostic: row.specialist_diagnostic,
    employeeMessage: row.employee_message,
    escalateToDev: row.escalate_to_dev,
  };
}

/** Shape of a row from the parse_history table (snake_case). */
export interface ParseHistoryRow {
  id: string;
  raw_payload: unknown;
  extracted_code: string | null;
  matched_template_id: string | null;
  match_status: "matched" | "unmapped" | "invalid_payload";
  is_test_data: boolean;
  created_at: string;
}

/**
 * Maps a parse_history row, optionally live-joined with its error_templates
 * row, to the camelCase shape returned by GET /api/history.
 *
 * Per the API contract, this is a live join: if `template` is provided it
 * reflects the *current* state of error_templates, not a snapshot from when
 * the log was originally parsed.
 */
export function mapHistoryRowToResponse(
  row: ParseHistoryRow,
  template: ErrorTemplateRow | null
) {
  return {
    id: row.id,
    extractedCode: row.extracted_code,
    matchStatus: row.match_status,
    createdAt: row.created_at,
    internalSystem: template?.internal_system ?? null,
    severity: template?.severity ?? null,
    escalateToDev: template?.escalate_to_dev ?? null,
  };
}
