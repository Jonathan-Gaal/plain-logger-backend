// tests/tickets.test.ts
//
// API-level integration tests for the tickets endpoints. Same caveats as
// tests/parse-log.test.ts: this is NOT browser E2E, and requires a running
// server + seeded TEST Supabase project (see README.md prerequisites).
//
// Unlike parse-log, there is no POST /api/tickets to create fresh test
// tickets — ticket creation only happens via db:seed. So these tests
// operate against whatever tickets already exist from seeding, and are
// careful to restore any ticket they mutate back to its original state in
// afterEach, rather than deleting rows (since there's nothing to delete
// that this suite created).

import { afterEach, beforeAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

interface TicketSummary {
  id: string;
  ticketNumber: string;
  status: "open" | "in_progress" | "resolved";
  severity: string;
  assignedSpecialist: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
}

// Track (ticketId, original field values) for any ticket this suite PATCHes,
// so afterEach can restore it exactly — this suite doesn't own its own rows
// the way parse-log tests do, so "self-cleaning" here means "leave every
// ticket exactly as it was found," not "delete what I created."
let mutatedTicket: { id: string; original: Partial<TicketSummary> } | null = null;

async function getTickets(query = ""): Promise<{ status: number; json: { status: string; tickets?: TicketSummary[] } }> {
  const res = await fetch(`${BASE_URL}/api/tickets${query}`);
  const json = await res.json();
  return { status: res.status, json };
}

beforeAll(async () => {
  const { status, json } = await getTickets("?limit=1");
  if (status !== 200 || !json.tickets || json.tickets.length === 0) {
    throw new Error(
      "No tickets found via GET /api/tickets. Run `npm run db:init && npm run db:seed` " +
        "against your TEST Supabase project before running tests."
    );
  }
});

afterEach(async () => {
  if (!mutatedTicket) return;
  await fetch(`${BASE_URL}/api/tickets/${mutatedTicket.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: mutatedTicket.original.status,
      assignedSpecialist: mutatedTicket.original.assignedSpecialist,
      resolutionNote: mutatedTicket.original.resolutionNote ?? undefined,
    }),
  });
  mutatedTicket = null;
});

describe("GET /api/tickets", () => {
  it("lists tickets with camelCase fields, no raw snake_case DB columns", async () => {
    const { status, json } = await getTickets("?limit=10");

    expect(status).toBe(200);
    expect(json.status).toBe("ok");
    expect(json.tickets!.length).toBeGreaterThan(0);

    const ticket = json.tickets![0];
    const keys = Object.keys(ticket);
    for (const key of keys) {
      expect(key).not.toMatch(/_/);
    }
  });

  it("filters by status", async () => {
    const { status, json } = await getTickets("?status=open&limit=50");

    expect(status).toBe(200);
    for (const ticket of json.tickets ?? []) {
      expect(ticket.status).toBe("open");
    }
  });

  it("rejects an invalid status filter", async () => {
    const res = await fetch(`${BASE_URL}/api/tickets?status=not_a_real_status`);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.status).toBe("invalid_payload");
  });

  it("resolved tickets have a non-null resolvedAt and resolutionNote", async () => {
    const { json } = await getTickets("?status=resolved&limit=50");
    expect((json.tickets ?? []).length).toBeGreaterThan(0);

    for (const ticket of json.tickets ?? []) {
      expect(ticket.resolvedAt).not.toBeNull();
      expect(ticket.resolutionNote).not.toBeNull();
    }
  });

  it("open tickets have a null resolvedAt and resolutionNote", async () => {
    const { json } = await getTickets("?status=open&limit=50");
    expect((json.tickets ?? []).length).toBeGreaterThan(0);

    for (const ticket of json.tickets ?? []) {
      expect(ticket.resolvedAt).toBeNull();
      expect(ticket.resolutionNote).toBeNull();
    }
  });
});

describe("GET /api/tickets/:id", () => {
  it("fetches a single ticket by id", async () => {
    const { json: listJson } = await getTickets("?limit=1");
    const ticketId = listJson.tickets![0].id;

    const res = await fetch(`${BASE_URL}/api/tickets/${ticketId}`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ticket.id).toBe(ticketId);
  });

  it("returns 404 for a nonexistent id", async () => {
    const res = await fetch(`${BASE_URL}/api/tickets/00000000-0000-0000-0000-000000000000`);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.status).toBe("not_found");
  });
});

describe("PATCH /api/tickets/:id", () => {
  it("updates status from open to in_progress and assigns a specialist, then restores it", async () => {
    const { json: listJson } = await getTickets("?status=open&limit=1");
    const original = listJson.tickets![0];

    mutatedTicket = {
      id: original.id,
      original: {
        status: original.status,
        assignedSpecialist: original.assignedSpecialist,
        resolutionNote: original.resolutionNote,
      },
    };

    const res = await fetch(`${BASE_URL}/api/tickets/${original.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_progress", assignedSpecialist: "specialist.test" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ticket.status).toBe("in_progress");
    expect(json.ticket.assignedSpecialist).toBe("specialist.test");
    expect(json.ticket.resolvedAt).toBeNull();
  });

  it("requires resolutionNote when setting status to resolved", async () => {
    const { json: listJson } = await getTickets("?status=open&limit=1");
    const ticketId = listJson.tickets![0].id;

    const res = await fetch(`${BASE_URL}/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.status).toBe("invalid_payload");
  });

  it("rejects an empty patch body", async () => {
    const { json: listJson } = await getTickets("?limit=1");
    const ticketId = listJson.tickets![0].id;

    const res = await fetch(`${BASE_URL}/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.status).toBe("invalid_payload");
  });

  it("returns 404 when patching a nonexistent ticket", async () => {
    const res = await fetch(`${BASE_URL}/api/tickets/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedSpecialist: "specialist.test" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.status).toBe("not_found");
  });
});
