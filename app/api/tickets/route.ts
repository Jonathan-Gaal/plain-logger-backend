// app/api/tickets/route.ts
//
// GET /api/tickets?status=open&limit=50
//
// Lists tickets, optionally filtered by status, live-joined with
// error_templates for tickets that matched a known error code. Unmapped
// tickets (matched_template_id null) are returned with matched: null.
//
// Uses getDb() from lib/db — works against local SQLite or Supabase
// transparently. See lib/db/index.ts.
//
// CORS: this API is consumed by a separate frontend origin. See lib/cors.ts
// — CORS_ALLOWED_ORIGINS in .env controls which origins are allowed.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { mapTicketRowToResponse } from "@/lib/tickets";
import { corsHeaders, handleOptions } from "@/lib/cors";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const VALID_STATUSES = ["open", "in_progress", "resolved"];

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders(request);

  const statusParam = request.nextUrl.searchParams.get("status");
  if (statusParam && !VALID_STATUSES.includes(statusParam)) {
    return NextResponse.json(
      {
        status: "invalid_payload",
        message: `Invalid status filter. Expected one of: ${VALID_STATUSES.join(", ")}.`,
      },
      { status: 400, headers }
    );
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const db = await getDb();
  const { data, error } = await db.listTickets(statusParam, limit);

  if (error) {
    console.error("tickets: DB error fetching tickets:", error);
    return NextResponse.json(
      { status: "error", message: "Could not reach the database. Please try again." },
      { status: 500, headers }
    );
  }

  const tickets = (data ?? []).map((row) => mapTicketRowToResponse(row, row.error_templates));

  return NextResponse.json({ status: "ok", tickets }, { status: 200, headers });
}
