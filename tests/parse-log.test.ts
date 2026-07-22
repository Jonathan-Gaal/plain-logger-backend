// tests/parse-log.test.ts
//
// API-level integration tests for Plain Logger. IMPORTANT: these are NOT
// browser E2E tests — Vitest does not render pages or drive a browser. These
// tests call the running Next.js server's Route Handlers over HTTP
// (fetch against BASE_URL) and assert on the JSON responses and resulting
// database state. See README.md for why this is the right test strategy for
// this tool, and what would be needed for real browser E2E instead.
//
// PREREQUISITES:
//   1. `npm run dev` (or `npm run build && npm run start`) must be running.
//      Works in EITHER mode (see lib/db/index.ts) — local SQLite (default,
//      zero config) or Supabase, if you've set the env vars for that. If
//      using Supabase, point it at a TEST project — never shared dev/prod.
//   2. `npm run db:init` and `npm run db:seed` must have been run first
//      (against whichever mode/target `npm run dev` is using).
//
// SELF-CLEANING: the original design was to tag every test-written row with
// is_test_data = true and sweep it in afterAll via a direct DB connection.
// In practice, the production /api/parse-log route always writes
// is_test_data: false — it has no way to know a request came from a test,
// and a test-only backdoor flag on a production API is worse than the
// alternative. Instead, this suite collects the historyId returned by
// every API call it makes, and in afterAll deletes exactly those rows via
// DELETE /api/history/:id — the same public endpoint the tests already use
// individually, not a raw DB connection. This is what makes the suite work
// identically against either backend (SQLite or Supabase): it only ever
// talks to the app over HTTP, never to the database directly.

import { afterAll, describe, expect, it } from "vitest";
import {
  SAMPLE_LOW_SEVERITY_MATCHED,
  SAMPLE_UNMAPPED,
  SAMPLE_MALFORMED,
  SAMPLE_HIGH_SEVERITY_ALT_KEY,
  SAMPLE_MISSING_CODE_KEY,
  SAMPLE_OVER_LIMIT,
} from "./fixtures";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const createdHistoryIds: string[] = [];

afterAll(async () => {
  // Self-cleaning: delete every parse_history row this suite created,
  // identified by the ids collected as tests ran, via the same DELETE
  // /api/history/:id endpoint the tests themselves exercise. Failures here
  // are logged but don't fail the suite — a cleanup miss just leaves a
  // harmless extra history row, which is not a correctness problem for the
  // next test run against seeded data.
  for (const id of createdHistoryIds) {
    try {
      await fetch(`${BASE_URL}/api/history/${id}`, { method: "DELETE" });
    } catch (err) {
      console.warn(`Cleanup: failed to delete parse_history row ${id}:`, err);
    }
  }
});

async function parseLog(payload: string) {
  const res = await fetch(`${BASE_URL}/api/parse-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  const json = await res.json();
  if (json.historyId) createdHistoryIds.push(json.historyId);
  return { status: res.status, json };
}

describe("POST /api/parse-log", () => {
  it("matched, low severity: returns self-service steps and does not escalate", async () => {
    const { status, json } = await parseLog(SAMPLE_LOW_SEVERITY_MATCHED);

    expect(status).toBe(200);
    expect(json.status).toBe("matched");
    expect(json.severity).toBe("low");
    expect(json.isSelfService).toBe(true);
    expect(json.selfServiceSteps).toBeTruthy();
    expect(json.escalateToDev).toBe(false);
    expect(json.specialistDiagnostic).toMatch(/do not escalate/i);
  });

  it("matched, high severity (alternate `code` key): escalates and gives no self-service steps", async () => {
    const { status, json } = await parseLog(SAMPLE_HIGH_SEVERITY_ALT_KEY);

    expect(status).toBe(200);
    expect(json.status).toBe("matched");
    expect(json.errorCode).toBe("JOBQUEUE_DEAD_LETTER");
    expect(json.severity).toBe("high");
    expect(json.isSelfService).toBe(false);
    expect(json.selfServiceSteps).toBeNull();
    expect(json.escalateToDev).toBe(true);
    // Employee message must NOT reuse the specialist's technical text.
    expect(json.employeeMessage).not.toBe(json.specialistDiagnostic);
    expect(json.employeeMessage.toLowerCase()).not.toContain("dead-letter");
  });

  it("unmapped: recognized JSON, well-formed code, no matching template", async () => {
    const { status, json } = await parseLog(SAMPLE_UNMAPPED);

    expect(status).toBe(200);
    expect(json.status).toBe("unmapped");
    expect(json.errorCode).toBe("XYZ_NOT_A_REAL_CODE");
    expect(json.specialistDiagnostic).toBeNull();
    expect(json.employeeMessage).toBeNull();
  });

  it("malformed JSON returns 400 and is not matched", async () => {
    const res = await fetch(`${BASE_URL}/api/parse-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: SAMPLE_MALFORMED }),
    });
    const json = await res.json();
    if (json.historyId) createdHistoryIds.push(json.historyId);

    expect(res.status).toBe(400);
    expect(json.status).toBe("invalid_payload");
  });

  it("valid JSON missing both error_code and code returns 400", async () => {
    const { status, json } = await parseLog(SAMPLE_MISSING_CODE_KEY);

    expect(status).toBe(400);
    expect(json.status).toBe("invalid_payload");
  });

  it("payload over 20,000 chars is rejected and not written to history", async () => {
    const res = await fetch(`${BASE_URL}/api/parse-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: SAMPLE_OVER_LIMIT }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.status).toBe("invalid_payload");
    expect(json.historyId).toBeUndefined();
  });

  it("empty payload is rejected", async () => {
    const res = await fetch(`${BASE_URL}/api/parse-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "" }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.status).toBe("invalid_payload");
  });

  it("response JSON contains only camelCase keys, never raw snake_case DB columns", async () => {
    const { json } = await parseLog(SAMPLE_LOW_SEVERITY_MATCHED);
    const keys = Object.keys(json);

    for (const key of keys) {
      expect(key).not.toMatch(/_/);
    }
    // Spot-check the specific fields called out in the API contract.
    expect(json).not.toHaveProperty("internal_system");
    expect(json).not.toHaveProperty("is_self_service");
    expect(json).not.toHaveProperty("self_service_steps");
    expect(json).not.toHaveProperty("specialist_diagnostic");
    expect(json).not.toHaveProperty("employee_message");
    expect(json).not.toHaveProperty("escalate_to_dev");
  });
});

describe("GET /api/history and DELETE /api/history/:id", () => {
  it("a deleted history entry no longer appears in GET /api/history", async () => {
    const { json: parsed } = await parseLog(SAMPLE_LOW_SEVERITY_MATCHED);
    const historyId = parsed.historyId;
    expect(historyId).toBeTruthy();

    const deleteRes = await fetch(`${BASE_URL}/api/history/${historyId}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    // Remove from cleanup list since it's already deleted.
    const idx = createdHistoryIds.indexOf(historyId);
    if (idx >= 0) createdHistoryIds.splice(idx, 1);

    const getRes = await fetch(`${BASE_URL}/api/history?limit=100`);
    const getJson = await getRes.json();
    const stillPresent = getJson.history.some(
      (entry: { id: string }) => entry.id === historyId
    );
    expect(stillPresent).toBe(false);
  });
});
