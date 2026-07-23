// app/api/error-templates/route.ts
//
// POST /api/error-templates — create a new error template
// Called when a specialist encounters an unmapped error code and wants to add it to the database

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { mapTicketRowToResponse } from "@/lib/tickets";
import { z } from "zod";
import { corsHeaders, handleOptions } from "@/lib/cors";

const CreateErrorTemplateSchema = z.object({
  error_code: z.string().min(1),
  internal_system: z.string().min(1),
  category: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  specialist_diagnostic: z.string().min(1),
  employee_message: z.string().min(1),
  self_service_steps: z.string().optional(),
  ticket_id: z.string().uuid().optional(),
});

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid_payload", message: "Request body is not valid JSON." },
      { status: 400, headers }
    );
  }

  const parsedRequest = CreateErrorTemplateSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        status: "invalid_payload",
        message: parsedRequest.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400, headers }
    );
  }

  const { error_code, severity, self_service_steps, ticket_id } = parsedRequest.data;

  // Validate constraint: only low severity can have self_service_steps
  if (severity !== "low" && self_service_steps) {
    return NextResponse.json(
      {
        status: "invalid_payload",
        message: "Self-service steps are only allowed for low severity errors.",
      },
      { status: 400, headers }
    );
  }

  const db = await getDb();
  const { data, error } = await db.createErrorTemplate({
    error_code: error_code,
    internal_system: parsedRequest.data.internal_system,
    category: parsedRequest.data.category,
    severity: severity,
    is_self_service: severity === "low",
    self_service_steps: severity === "low" ? self_service_steps || null : null,
    specialist_diagnostic: parsedRequest.data.specialist_diagnostic,
    employee_message: parsedRequest.data.employee_message,
    escalate_to_dev: severity !== "low",
  });

  if (error) {
    console.error("error-templates: DB error creating template:", error);
    return NextResponse.json(
      { status: "error", message: "Could not reach the database. Please try again." },
      { status: 500, headers }
    );
  }

  const templateId = data?.id ?? "";

  // If created from a ticket's "unmapped" view, link the ticket to its new
  // template so it moves out of the unmapped list without a manual re-parse.
  if (ticket_id && templateId) {
    const { data: ticketData, error: ticketError } = await db.updateTicket(ticket_id, {
      matched_template_id: templateId,
      updated_at: new Date().toISOString(),
    });

    if (ticketError) {
      console.error("error-templates: DB error linking ticket to template:", ticketError);
    } else if (ticketData) {
      return NextResponse.json(
        {
          status: "ok",
          id: templateId,
          ticket: mapTicketRowToResponse(ticketData, ticketData.error_templates),
        },
        { status: 201, headers }
      );
    }
  }

  return NextResponse.json(
    { status: "ok", id: templateId },
    { status: 201, headers }
  );
}
