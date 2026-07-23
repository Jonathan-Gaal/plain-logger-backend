// tests/tickets-unit.test.ts
//
// Pure unit tests for lib/tickets.ts — no server, no database, no network.
// Covers the matched/unmapped mapping that the new "Unmapped"/"Mapped"
// ticket filter (frontend) and the error-template linking flow rely on:
// a ticket's `matched` field must be exactly null when there's no joined
// template, and populated with the expected camelCase shape when there is.

import { describe, expect, it } from "vitest";
import { mapTicketRowToResponse, type TicketRow, type JoinedTemplateSummary } from "@/lib/tickets";

const BASE_ROW: TicketRow = {
  id: "ticket-1",
  ticket_number: "PL-1002",
  submitted_by: "m.chen",
  matched_template_id: null,
  parse_history_id: null,
  extracted_code: "THIRDPARTY_SDK_ERR_9921",
  status: "open",
  severity: "medium",
  assigned_specialist: null,
  resolution_note: null,
  is_test_data: false,
  created_at: "2026-07-17T11:26:00Z",
  updated_at: "2026-07-17T11:26:00Z",
  resolved_at: null,
};

describe("mapTicketRowToResponse", () => {
  it("maps matched to null when no template is joined", () => {
    const result = mapTicketRowToResponse(BASE_ROW, null);
    expect(result.matched).toBeNull();
  });

  it("maps a joined template into the matched field with camelCase keys", () => {
    const template: JoinedTemplateSummary = {
      error_code: "THIRDPARTY_SDK_ERR_9921",
      internal_system: "payments-sdk",
      specialist_diagnostic: "Third-party SDK returned a non-retryable error code.",
      employee_message: "We hit an issue with a third-party service.",
      is_self_service: false,
      self_service_steps: null,
    };

    const result = mapTicketRowToResponse(
      { ...BASE_ROW, matched_template_id: "template-1" },
      template
    );

    expect(result.matched).toEqual({
      internalSystem: "payments-sdk",
      specialistDiagnostic: "Third-party SDK returned a non-retryable error code.",
      employeeMessage: "We hit an issue with a third-party service.",
      isSelfService: false,
      selfServiceSteps: null,
    });
  });

  it("never emits snake_case keys in the response", () => {
    const result = mapTicketRowToResponse(BASE_ROW, null);
    for (const key of Object.keys(result)) {
      expect(key).not.toMatch(/_/);
    }
  });
});
