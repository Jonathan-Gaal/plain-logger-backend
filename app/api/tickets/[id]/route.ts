// app/api/tickets/[id]/route.ts
//
// GET   /api/tickets/:id   — fetch a single ticket (with joined template, if matched)
// PATCH /api/tickets/:id   — update status / assignedSpecialist / resolutionNote
//
// Uses getDb() from lib/db — works against local SQLite or Supabase
// transparently. See lib/db/index.ts.
//
// CORS: this API is consumed by a separate frontend origin. See lib/cors.ts
// — CORS_ALLOWED_ORIGINS in .env controls which origins are allowed.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { mapTicketRowToResponse } from "@/lib/tickets";
import { UpdateTicketRequestSchema } from "@/lib/schemas";
import { corsHeaders, handleOptions } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const headers = corsHeaders(request);
  const { id } = params;

  const db = await getDb();
  const { data, error } = await db.getTicketById(id);

  if (error) {
    console.error("tickets/[id] GET: DB error:", error);
    return NextResponse.json(
      { status: "error", message: "Could not reach the database. Please try again." },
      { status: 500, headers }
    );
  }

  if (!data) {
    return NextResponse.json(
      { status: "not_found", message: "No ticket found with that id." },
      { status: 404, headers }
    );
  }

  return NextResponse.json(
    { status: "ok", ticket: mapTicketRowToResponse(data, data.error_templates) },
    { status: 200, headers }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const headers = corsHeaders(request);
  const { id } = params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid_payload", message: "Request body is not valid JSON." },
      { status: 400, headers }
    );
  }

  const parsedRequest = UpdateTicketRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        status: "invalid_payload",
        message: parsedRequest.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400, headers }
    );
  }

  const { status, assignedSpecialist, resolutionNote } = parsedRequest.data;

  // Map camelCase request fields to snake_case DB columns. resolved_at is
  // derived server-side (now()) rather than accepted from the client, to
  // keep the resolution_fields_only_when_resolved DB constraint satisfiable
  // without trusting client-supplied timestamps.
  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined) {
    updateFields.status = status;
    updateFields.resolved_at = status === "resolved" ? new Date().toISOString() : null;
    if (status !== "resolved") {
      updateFields.resolution_note = null;
    }
  }
  if (assignedSpecialist !== undefined) updateFields.assigned_specialist = assignedSpecialist;
  if (resolutionNote !== undefined) updateFields.resolution_note = resolutionNote;

  const db = await getDb();
  const { data, error } = await db.updateTicket(id, updateFields);

  if (error) {
    console.error("tickets/[id] PATCH: DB error:", error);
    return NextResponse.json(
      { status: "error", message: "Could not reach the database. Please try again." },
      { status: 500, headers }
    );
  }

  if (!data) {
    return NextResponse.json(
      { status: "not_found", message: "No ticket found with that id." },
      { status: 404, headers }
    );
  }

  return NextResponse.json(
    { status: "ok", ticket: mapTicketRowToResponse(data, data.error_templates) },
    { status: 200, headers }
  );
}
