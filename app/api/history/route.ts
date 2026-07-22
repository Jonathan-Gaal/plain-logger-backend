// app/api/history/route.ts
//
// GET /api/history?limit=20
//
// Returns the most recent parse_history rows (excluding test data), live-
// joined with error_templates for matched rows. "Live-joined" means this
// always reflects the CURRENT state of error_templates, not a snapshot from
// when the log was originally parsed — a deliberate simplification (see
// README for the tradeoff this implies).
//
// Uses getDb() from lib/db — works against local SQLite or Supabase
// transparently. See lib/db/index.ts.
//
// CORS: this API is consumed by a separate frontend origin. See lib/cors.ts
// — CORS_ALLOWED_ORIGINS in .env controls which origins are allowed.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { mapHistoryRowToResponse } from "@/lib/parse-log";
import { corsHeaders, handleOptions } from "@/lib/cors";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders(request);

  const limitParam = request.nextUrl.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const db = await getDb();
  const { data, error } = await db.listParseHistory(limit);

  if (error) {
    console.error("history: DB error fetching parse_history:", error);
    return NextResponse.json(
      { status: "error", message: "Could not reach the database. Please try again." },
      { status: 500, headers }
    );
  }

  const history = (data ?? []).map((row) => mapHistoryRowToResponse(row, row.error_templates));

  return NextResponse.json({ status: "ok", history }, { status: 200, headers });
}
