// lib/schemas.ts
//
// Zod schemas for validating API request bodies.

import { z } from "zod";

export const ParseLogRequestSchema = z.object({
  payload: z
    .string()
    .min(1, "Payload cannot be empty")
    .max(20000, "Payload exceeds 20,000 character limit"),
});

export type ParseLogRequest = z.infer<typeof ParseLogRequestSchema>;

/**
 * PATCH /api/tickets/:id body. All fields optional (partial update), but at
 * least one must be present — enforced via .refine below rather than a
 * plain z.object so the error message is specific to this endpoint.
 *
 * status transitions are not restricted here (e.g. resolved -> open is
 * allowed) since specialists sometimes need to reopen a ticket. If
 * resolving, resolutionNote is required — enforced below since it can't be
 * expressed as a simple per-field rule.
 */
export const UpdateTicketRequestSchema = z
  .object({
    status: z.enum(["open", "in_progress", "resolved"]).optional(),
    assignedSpecialist: z.string().min(1).max(200).nullable().optional(),
    resolutionNote: z.string().min(1).max(5000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (status, assignedSpecialist, resolutionNote) must be provided.",
  })
  .refine((data) => data.status !== "resolved" || !!data.resolutionNote, {
    message: "resolutionNote is required when setting status to \"resolved\".",
    path: ["resolutionNote"],
  })
  .refine(
    (data) => !data.resolutionNote || data.status === "resolved" || data.status === undefined,
    {
      message:
        "resolutionNote can only be set together with status: \"resolved\" (or when the ticket is already resolved and status is omitted). " +
        "Providing resolutionNote alongside status: \"open\" or \"in_progress\" would violate the DB's resolution-fields constraint.",
      path: ["resolutionNote"],
    }
  );

export type UpdateTicketRequest = z.infer<typeof UpdateTicketRequestSchema>;
