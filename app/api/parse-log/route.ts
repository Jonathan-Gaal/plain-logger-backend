// app/api/parse-log/route.ts
//
// POST /api/parse-log
//
// Accepts a raw JSON log payload, extracts an error code, looks it up
// deterministically against error_templates, records the attempt in
// parse_history, and returns either a matched/unmapped result (200) or an
// error (400/500). See the API contract in the project spec for exact
// response shapes — this handler maps DB snake_case rows to camelCase JSON,
// never spreading a raw DB row into the response.
//
// Uses getDb() from lib/db, which transparently runs against local SQLite
// (zero-config default) or Supabase/Postgres (once configured via env
// vars) — this route doesn't know or care which. See lib/db/index.ts.
//
// CORS: this API is consumed by a separate frontend origin. See lib/cors.ts
// — CORS_ALLOWED_ORIGINS in .env controls which origins are allowed.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ParseLogRequestSchema } from "@/lib/schemas";
import { tryParseJson, extractErrorCode, mapTemplateRowToMatchedResponse } from "@/lib/parse-log";
import { corsHeaders, handleOptions } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);
  const db = await getDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid_payload", message: "Request body is not valid JSON." },
      { status: 400, headers }
    );
  }

  const parsedRequest = ParseLogRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    // Zod validation failures (empty payload, over 20,000 chars) are
    // rejected before we ever attempt to JSON.parse the log itself, and are
    // NOT written to parse_history — this guards against garbage/DoS-style
    // pastes bloating the audit log.
    return NextResponse.json(
      {
        status: "invalid_payload",
        message: parsedRequest.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400, headers }
    );
  }

  const { payload } = parsedRequest.data;

  const parseResult = tryParseJson(payload);
  if (!parseResult.ok) {
    await writeHistory(db, {
      raw_payload: { unparsable_raw_text: payload },
      extracted_code: null,
      matched_template_id: null,
      match_status: "invalid_payload",
    });
    return NextResponse.json(
      { status: "invalid_payload", message: "Payload is not valid JSON." },
      { status: 400, headers }
    );
  }

  const errorCode = extractErrorCode(parseResult.value);
  if (!errorCode) {
    await writeHistory(db, {
      raw_payload: parseResult.value,
      extracted_code: null,
      matched_template_id: null,
      match_status: "invalid_payload",
    });
    return NextResponse.json(
      {
        status: "invalid_payload",
        message: "No recognizable error key found. Expected a top-level \"error_code\" or \"code\" field.",
      },
      { status: 400, headers }
    );
  }

  const { data: templateRow, error: lookupError } = await db.findTemplateByCode(errorCode);
  if (lookupError) {
    console.error("parse-log: DB error looking up error_templates:", lookupError);
    return NextResponse.json(
      { status: "error", message: "Could not reach the database. Please try again." },
      { status: 500, headers }
    );
  }

  if (!templateRow) {
    const historyId = await writeHistory(db, {
      raw_payload: parseResult.value,
      extracted_code: errorCode,
      matched_template_id: null,
      match_status: "unmapped",
    });
    return NextResponse.json(
      {
        status: "unmapped",
        errorCode,
        specialistDiagnostic: null,
        employeeMessage: null,
        historyId,
      },
      { status: 200, headers }
    );
  }

  const historyId = await writeHistory(db, {
    raw_payload: parseResult.value,
    extracted_code: errorCode,
    matched_template_id: templateRow.id,
    match_status: "matched",
  });

  return NextResponse.json(
    { ...mapTemplateRowToMatchedResponse(templateRow), historyId },
    { status: 200, headers }
  );
}

/**
 * Writes a parse_history row. Returns the new row's id, or null if the
 * write failed — a history-write failure should not take down the whole
 * request, since the specialist still needs their lookup result. Errors are
 * logged server-side rather than swallowed silently.
 */
async function writeHistory(
  db: Awaited<ReturnType<typeof getDb>>,
  fields: {
    raw_payload: unknown;
    extracted_code: string | null;
    matched_template_id: string | null;
    match_status: "matched" | "unmapped" | "invalid_payload";
  }
): Promise<string | null> {
  const { data, error } = await db.insertParseHistory(fields);
  if (error) {
    console.error("parse-log: failed to write parse_history row:", error);
    return null;
  }
  return data?.id ?? null;
}
