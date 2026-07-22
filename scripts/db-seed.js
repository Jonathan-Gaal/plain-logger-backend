// scripts/db-seed.js
//
// Seeds error_templates with the rows in scripts/seed-data.js (18
// hand-written + ~282 programmatically generated, ~300 total), then seeds
// tickets with ~50 fictional tickets referencing those templates (see
// scripts/generate-tickets.js). Tickets are seeded second because they
// reference error_templates.id via foreign key.
//
// MODE (auto-detected, same rule as scripts/db-init.js):
//   - No .env / missing Supabase vars -> LOCAL MODE: writes directly into
//     ./local.db via node:sqlite. Zero config.
//   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set -> SUPABASE
//     MODE: writes via @supabase/supabase-js (unchanged from before).
//
// Idempotency: in Supabase mode, error_templates upserts on error_code
// (safe to re-run), but tickets does not (will fail on duplicate
// ticket_number unless the table is cleared first — see error message
// below). In local SQLite mode, both db:init and db:seed are safe to run
// repeatedly from scratch since local.db is just a file — delete it
// (`rm local.db`) and re-run db:init + db:seed for a clean slate.
//
// Usage: npm run db:init && npm run db:seed

require("dotenv").config();
const path = require("path");
const seedRows = require("./seed-data");
const { generateTickets } = require("./generate-tickets");

const TICKET_COUNT = 50;

const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Shared validation guards (run regardless of mode) ---

function validateSeedRows() {
  // Guard: every row must have non-empty diagnostic/message text. Empty
  // strings would silently defeat the product's purpose (a "matched" result
  // with nothing useful to show), so we fail loudly at seed time instead of
  // relying on the DB's `not null` constraint alone (which allows '').
  const invalidRows = seedRows.filter(
    (row) => !row.specialist_diagnostic?.trim() || !row.employee_message?.trim()
  );
  if (invalidRows.length > 0) {
    console.error(
      `${invalidRows.length} seed row(s) have empty specialist_diagnostic or employee_message:`,
      invalidRows.map((r) => r.error_code)
    );
    process.exit(1);
  }

  // Guard: only 'low' severity rows may be self-service, mirroring the DB
  // check constraint — fail fast here with a clearer message than a raw
  // constraint violation would give.
  const badSelfService = seedRows.filter((row) =>
    row.severity === "low"
      ? !row.is_self_service || !row.self_service_steps?.trim()
      : row.is_self_service || row.self_service_steps !== null
  );
  if (badSelfService.length > 0) {
    console.error(
      "Rows violate the self-service/severity rule (low severity must be self-service with steps; " +
        "anything else must not be):",
      badSelfService.map((r) => r.error_code)
    );
    process.exit(1);
  }
}

// --- Supabase mode ---

async function seedSupabase() {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, serviceRoleKey);

  console.log(`[supabase mode] Seeding ${seedRows.length} error_templates rows...`);

  const { data: templateData, error: templateError } = await supabase
    .from("error_templates")
    .upsert(seedRows, { onConflict: "error_code" })
    .select("id, error_code, severity");

  if (templateError) {
    console.error("error_templates seed failed:", templateError.message);
    process.exit(1);
  }
  console.log(`Seeded/updated ${templateData.length} error_templates rows.`);

  console.log(`Generating ${TICKET_COUNT} tickets referencing seeded templates...`);
  const ticketRows = generateTickets(templateData, TICKET_COUNT);

  const { data: ticketData, error: ticketError } = await supabase
    .from("tickets")
    .insert(ticketRows)
    .select("ticket_number");

  if (ticketError) {
    console.error(
      "tickets seed failed:",
      ticketError.message,
      "\nIf this is a duplicate ticket_number error from re-running db:seed, " +
        "truncate the tickets table first (e.g. `delete from tickets;` in the " +
        "Supabase SQL editor) and re-run."
    );
    process.exit(1);
  }

  console.log(`Seeded ${ticketData.length} tickets.`);
}

// --- Local SQLite mode ---

function seedSqlite() {
  const { DatabaseSync } = require("node:sqlite");
  const dbPath = path.join(process.cwd(), "local.db");

  console.log(`[local mode] Seeding ${seedRows.length} error_templates rows into ${dbPath}...`);

  const db = new DatabaseSync(dbPath);
  try {
    const insertTemplate = db.prepare(
      `INSERT INTO error_templates
         (id, error_code, internal_system, category, severity, is_self_service, self_service_steps, specialist_diagnostic, employee_message, escalate_to_dev, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(error_code) DO UPDATE SET
         internal_system = excluded.internal_system,
         category = excluded.category,
         severity = excluded.severity,
         is_self_service = excluded.is_self_service,
         self_service_steps = excluded.self_service_steps,
         specialist_diagnostic = excluded.specialist_diagnostic,
         employee_message = excluded.employee_message,
         escalate_to_dev = excluded.escalate_to_dev`
    );

    const insertedTemplates = [];
    db.exec("BEGIN");
    for (const row of seedRows) {
      // Look up existing id by error_code first (for upsert-by-id semantics
      // matching Supabase mode's onConflict behavior), else generate fresh.
      const existing = db
        .prepare("SELECT id FROM error_templates WHERE error_code = ?")
        .get(row.error_code);
      const id = existing ? existing.id : crypto.randomUUID();

      insertTemplate.run(
        id,
        row.error_code,
        row.internal_system,
        row.category,
        row.severity,
        row.is_self_service ? 1 : 0,
        row.self_service_steps,
        row.specialist_diagnostic,
        row.employee_message,
        row.escalate_to_dev ? 1 : 0
      );
      insertedTemplates.push({ id, error_code: row.error_code, severity: row.severity });
    }
    db.exec("COMMIT");

    console.log(`Seeded/updated ${insertedTemplates.length} error_templates rows.`);

    console.log(`Generating ${TICKET_COUNT} tickets referencing seeded templates...`);
    const ticketRows = generateTickets(insertedTemplates, TICKET_COUNT);

    const insertTicket = db.prepare(
      `INSERT INTO tickets
         (id, ticket_number, submitted_by, matched_template_id, parse_history_id, extracted_code, status, severity, assigned_specialist, resolution_note, is_test_data, created_at, updated_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    );

    db.exec("BEGIN");
    let insertedTicketCount = 0;
    try {
      for (const t of ticketRows) {
        insertTicket.run(
          crypto.randomUUID(),
          t.ticket_number,
          t.submitted_by,
          t.matched_template_id,
          t.parse_history_id,
          t.extracted_code,
          t.status,
          t.severity,
          t.assigned_specialist,
          t.resolution_note,
          t.created_at,
          t.updated_at,
          t.resolved_at
        );
        insertedTicketCount++;
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    console.log(`Seeded ${insertedTicketCount} tickets.`);
  } catch (err) {
    console.error("Local seed failed:", err.message);
    console.error(
      "If this is a duplicate ticket_number error from re-running db:seed, delete local.db " +
        "and re-run `npm run db:init && npm run db:seed` for a clean slate."
    );
    process.exit(1);
  } finally {
    db.close();
  }
}

async function main() {
  validateSeedRows();

  if (isSupabaseConfigured) {
    await seedSupabase();
  } else {
    seedSqlite();
  }
  console.log("Done.");
}

main();
