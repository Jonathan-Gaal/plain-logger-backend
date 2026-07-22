// scripts/generate-tickets.js
//
// Generates ~50 fictional tickets referencing rows already inserted into
// error_templates (via their id, looked up by error_code after seeding),
// with a realistic mix of status (open / in_progress / resolved) and
// severity, plus a handful of "unmapped" tickets (matched_template_id null,
// extracted_code set to something not in error_templates) since real
// specialists do have to track tickets for unrecognized codes too.
//
// This module exports a function rather than static data because it needs
// the actual UUIDs assigned to error_templates rows at seed time — it's
// called from db-seed.js after error_templates has been seeded.

const FICTIONAL_EMPLOYEES = [
  "j.rivera", "m.chen", "a.okafor", "s.patel", "d.nguyen", "k.oconnor",
  "l.martinez", "r.singh", "t.kowalski", "b.johansson", "c.dubois",
  "n.hassan", "e.andersson", "f.rossi", "h.kim", "p.silva", "v.petrov",
  "w.taylor", "g.moreau", "y.tanaka",
];

const SPECIALISTS = ["specialist.alvarez", "specialist.brooks", "specialist.chu", "specialist.diallo"];

const UNMAPPED_CODES = [
  "LEGACY_UNKNOWN_500",
  "THIRDPARTY_SDK_ERR_9921",
  "UNCAUGHT_EXCEPTION_GENERIC",
  "VENDOR_WEBHOOK_MALFORMED",
];

function pick(arr, i) {
  return arr[i % arr.length];
}

/**
 * @param {Array<{id: string, error_code: string, severity: string}>} templateRows
 *   rows already inserted into error_templates, as returned by a select.
 * @param {number} targetCount
 */
function generateTickets(templateRows, targetCount = 50) {
  if (templateRows.length === 0) {
    throw new Error("generateTickets: no error_templates rows provided — seed error_templates first.");
  }

  const tickets = [];
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Roughly: 40% open, 30% in_progress, 30% resolved — a plausible support
  // queue snapshot (more open/active than fully resolved, but not all open).
  const statusPlan = [];
  const openCount = Math.round(targetCount * 0.4);
  const inProgressCount = Math.round(targetCount * 0.3);
  const resolvedCount = targetCount - openCount - inProgressCount;
  for (let i = 0; i < openCount; i++) statusPlan.push("open");
  for (let i = 0; i < inProgressCount; i++) statusPlan.push("in_progress");
  for (let i = 0; i < resolvedCount; i++) statusPlan.push("resolved");

  // Reserve a handful of slots for unmapped tickets (no matched template).
  const unmappedSlots = Math.min(UNMAPPED_CODES.length, Math.round(targetCount * 0.08));

  let ticketNum = 1001;

  for (let i = 0; i < targetCount; i++) {
    const status = statusPlan[i];
    const isUnmapped = i < unmappedSlots;
    const daysAgo = Math.floor(Math.random() * 21); // spread over ~3 weeks
    const createdAt = new Date(now - daysAgo * DAY_MS - Math.floor(Math.random() * DAY_MS));

    let templateRow = null;
    let extractedCode;
    let severity;

    if (isUnmapped) {
      extractedCode = pick(UNMAPPED_CODES, i);
      // Unmapped tickets still need a severity for triage purposes, chosen
      // by the specialist manually since there's no template to infer it
      // from — skew toward medium/high since unrecognized errors tend to
      // get flagged as needing attention.
      severity = pick(["medium", "medium", "high", "low"], i);
    } else {
      templateRow = pick(templateRows, i * 7 + Math.floor(Math.random() * templateRows.length));
      extractedCode = templateRow.error_code;
      severity = templateRow.severity;
    }

    const assignedSpecialist =
      status === "open" ? null : pick(SPECIALISTS, i);

    const isResolved = status === "resolved";
    const updatedAt =
      status === "open"
        ? createdAt
        : new Date(createdAt.getTime() + Math.floor(Math.random() * 3) * DAY_MS + 60 * 60 * 1000);
    const resolvedAt = isResolved
      ? new Date(updatedAt.getTime() + Math.floor(Math.random() * 2) * DAY_MS)
      : null;

    tickets.push({
      ticket_number: `PL-${ticketNum++}`,
      submitted_by: pick(FICTIONAL_EMPLOYEES, i),
      matched_template_id: templateRow ? templateRow.id : null,
      parse_history_id: null, // not linked to a specific parse_history row in seed data
      extracted_code: extractedCode,
      status,
      severity,
      assigned_specialist: assignedSpecialist,
      resolution_note: isResolved
        ? isUnmapped
          ? "Manually investigated; root cause identified and fixed outside the known-errors table. Added a follow-up task to create an error_templates entry for this code."
          : "Resolved per the standard runbook guidance for this error code. Employee confirmed issue no longer occurring."
        : null,
      is_test_data: false,
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString(),
      resolved_at: resolvedAt ? resolvedAt.toISOString() : null,
    });
  }

  return tickets;
}

module.exports = { generateTickets };
