// tests/error-templates.test.ts
//
// API-level integration tests for POST /api/error-templates. Same strategy
// as tests/parse-log.test.ts and tests/tickets.test.ts: calls the running
// Next.js server over HTTP against seeded data (see README.md prerequisites).
//
// SELF-CLEANING CAVEAT: unlike parse_history, there is no DELETE endpoint
// for error_templates, so every template this suite creates is permanent —
// each test uses a unique, obviously-fake error_code (timestamped) so
// repeat runs never collide with each other or with seeded data. This
// mirrors the trade-off already accepted for other "harmless extra row"
// cases in this codebase; `npm run db:reset` clears it if it matters.
//
// The ticket-linking test is a one-way mutation for the same reason: once a
// ticket's matched_template_id is set, there's no public endpoint to unset
// it. It picks an unmapped seeded ticket and skips gracefully if none are
// left (e.g. after repeated runs) rather than failing the suite.

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function uniqueErrorCode(label: string): string {
  return `TEST_TEMPLATE_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function validTemplateBody(overrides: Record<string, unknown> = {}) {
  return {
    error_code: uniqueErrorCode("BASE"),
    internal_system: "test-system",
    category: "config",
    severity: "medium",
    specialist_diagnostic: "Test specialist diagnostic.",
    employee_message: "Test employee message.",
    ...overrides,
  };
}

async function createTemplate(body: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/api/error-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

describe("POST /api/error-templates", () => {
  it("creates a template and returns its id", async () => {
    const { status, json } = await createTemplate(validTemplateBody());

    expect(status).toBe(201);
    expect(json.status).toBe("ok");
    expect(typeof json.id).toBe("string");
    expect(json.id.length).toBeGreaterThan(0);
  });

  it("rejects a missing required field", async () => {
    const body = validTemplateBody();
    delete (body as Record<string, unknown>).internal_system;

    const { status, json } = await createTemplate(body);

    expect(status).toBe(400);
    expect(json.status).toBe("invalid_payload");
  });

  it("rejects an invalid severity value", async () => {
    const { status, json } = await createTemplate(
      validTemplateBody({ severity: "not_a_real_severity" })
    );

    expect(status).toBe(400);
    expect(json.status).toBe("invalid_payload");
  });

  it("rejects self_service_steps when severity is not low", async () => {
    const { status, json } = await createTemplate(
      validTemplateBody({ severity: "high", self_service_steps: "Do the thing." })
    );

    expect(status).toBe(400);
    expect(json.status).toBe("invalid_payload");
  });

  it("allows self_service_steps when severity is low", async () => {
    const { status, json } = await createTemplate(
      validTemplateBody({ severity: "low", self_service_steps: "Restart the widget." })
    );

    expect(status).toBe(201);
    expect(json.status).toBe("ok");
  });

  it("rejects a duplicate error_code", async () => {
    const body = validTemplateBody();
    const first = await createTemplate(body);
    expect(first.status).toBe(201);

    const second = await createTemplate(body);
    expect(second.status).not.toBe(201);
  });

  it("links the ticket to the new template when ticket_id is provided", async () => {
    const listRes = await fetch(`${BASE_URL}/api/tickets?limit=200`);
    const listJson = await listRes.json();
    const unmappedTicket = (listJson.tickets ?? []).find(
      (t: { matched: unknown }) => t.matched === null
    );

    if (!unmappedTicket) {
      console.warn(
        "Skipping: no unmapped ticket left in seed data (run `npm run db:reset` to restore)."
      );
      return;
    }

    const { status, json } = await createTemplate(
      validTemplateBody({ ticket_id: unmappedTicket.id })
    );

    expect(status).toBe(201);
    expect(json.status).toBe("ok");
    expect(json.ticket).toBeDefined();
    expect(json.ticket.id).toBe(unmappedTicket.id);
    expect(json.ticket.matched).not.toBeNull();
    expect(json.ticket.matched.internalSystem).toBe("test-system");

    // Confirm the link persisted, not just reflected in the response.
    const getRes = await fetch(`${BASE_URL}/api/tickets/${unmappedTicket.id}`);
    const getJson = await getRes.json();
    expect(getJson.ticket.matched).not.toBeNull();
  });
});
