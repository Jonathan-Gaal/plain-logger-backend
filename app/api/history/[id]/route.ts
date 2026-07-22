// app/api/history/[id]/route.ts
//
// DELETE /api/history/:id
//
// Deletes a single parse_history row. Used by the frontend's history
// delete (CRUD) action.
//
// Uses getDb() from lib/db — works against local SQLite or Supabase
// transparently. See lib/db/index.ts.
//
// CORS: this API is consumed by a separate frontend origin. See lib/cors.ts
// — CORS_ALLOWED_ORIGINS in .env controls which origins are allowed.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { corsHeaders, handleOptions } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const headers = corsHeaders(request);
  const { id } = params;

  if (!id) {
    return NextResponse.json(
      { status: "invalid_payload", message: "Missing history entry id." },
      { status: 400, headers }
    );
  }

  const db = await getDb();
  const { data, error } = await db.deleteParseHistory(id);

  if (error) {
    console.error("history/[id]: DB error deleting parse_history row:", error);
    return NextResponse.json(
      { status: "error", message: "Could not reach the database. Please try again." },
      { status: 500, headers }
    );
  }

  return NextResponse.json({ status: "ok", deletedId: data?.id ?? id }, { status: 200, headers });
}
