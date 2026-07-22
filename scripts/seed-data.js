// scripts/seed-data.js
//
// AI-generated seed data for error_templates: a plausible set of internal
// infrastructure/microservice error codes for a fictional company's internal
// tooling. This is course-assignment seed data, not a real internal wiki.
//
// specialist_diagnostic reads like an internal runbook note (engineer-to-
// engineer). employee_message reads like a message you'd send a coworker in
// Slack — plain language, no internal system names, no jargon.
//
// Only severity = 'low' rows have is_self_service = true / self_service_steps
// populated; everything else is self_service = false / steps = null and
// escalate_to_dev = true, per the DB constraint.

const { generateTemplates } = require("./generate-templates");

// Hand-written "flagship" rows: the most carefully worded examples,
// also referenced directly by tests/fixtures.ts. Kept separate from the
// programmatically generated bulk below for readability and because these
// specific error_code values are asserted on in tests.
const HAND_WRITTEN_TEMPLATES = [
  // ---- Auth / identity service ----
  {
    error_code: "AUTHSVC_TOKEN_EXPIRED",
    internal_system: "auth-service",
    category: "auth",
    severity: "low",
    is_self_service: true,
    self_service_steps:
      "Log out completely, then log back in. This clears the expired session token and issues a fresh one.",
    specialist_diagnostic:
      "Employee's internal SSO session token expired mid-request (idle timeout, default 8h). Not a bug — this is expected behavior. Do not escalate to dev. Point the employee to the self-service steps.",
    employee_message:
      "Looks like your login session timed out. Log out and log back in — that should fix it. Let us know if it happens again right after logging back in.",
    escalate_to_dev: false,
  },
  {
    error_code: "AUTHSVC_MFA_CHALLENGE_FAILED",
    internal_system: "auth-service",
    category: "auth",
    severity: "low",
    is_self_service: true,
    self_service_steps:
      "Double-check the code from your authenticator app (codes refresh every 30s). If your device clock is off, MFA codes can fail — enable automatic time sync on your phone and try again.",
    specialist_diagnostic:
      "MFA challenge rejected — usually a stale/mistyped TOTP code or device clock drift. Not a system fault. Do not escalate to dev. Confirm the employee isn't locked out (5 failed attempts trigger a 15-min lockout, distinct from this error).",
    employee_message:
      "Your login code didn't match — this usually happens if the code expired before you entered it, or your phone's clock is off. Try generating a fresh code and entering it right away.",
    escalate_to_dev: false,
  },
  {
    error_code: "AUTHSVC_RBAC_PERMISSION_DENIED",
    internal_system: "auth-service",
    category: "auth",
    severity: "low",
    is_self_service: true,
    self_service_steps:
      "Check whether you've submitted an access request for this tool in the internal access-request portal. If not, submit one — most role grants are approved within one business day.",
    specialist_diagnostic:
      "Employee's role doesn't have the RBAC permission required for this internal tool/action. Not a bug. Do not escalate to dev. Direct employee to the access-request portal rather than manually granting access yourself.",
    employee_message:
      "It looks like your account doesn't have access to this yet. You'll need to submit an access request through the internal access portal — most requests are approved within a business day.",
    escalate_to_dev: false,
  },
  {
    error_code: "AUTHSVC_SVC2SVC_CRED_INVALID",
    internal_system: "auth-service",
    category: "auth",
    severity: "high",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "Internal service-to-service credential (client cert or shared secret) failed validation between two internal microservices — likely an expired or rotated credential that wasn't updated in the dependent service's config. Escalate to the platform/auth team; this is an infrastructure config issue, not something the employee or specialist caused.",
    employee_message:
      "Thanks for flagging this — our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
    escalate_to_dev: true,
  },

  // ---- Internal API / microservice failures ----
  {
    error_code: "FULFILLAPI_INVENTORY_TIMEOUT",
    internal_system: "fulfillment-api",
    category: "timeout",
    severity: "medium",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "fulfillment-api's call to inventory-service exceeded its 5s timeout. Check inventory-service health dashboard first — if it's degraded, this is a known dependency issue. Escalate to the team owning inventory-service, not fulfillment-api.",
    employee_message:
      "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
    escalate_to_dev: true,
  },
  {
    error_code: "ORDERSAPI_5XX_DOWNSTREAM",
    internal_system: "orders-api",
    category: "internal_api",
    severity: "high",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "orders-api returned a 5xx after a downstream call to billing-api failed. Check billing-api's status page/logs for a concurrent incident before escalating further — if billing-api is already a known incident, link this ticket to it instead of opening a new escalation.",
    employee_message:
      "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
    escalate_to_dev: true,
  },
  {
    error_code: "REPORTINGAPI_PAGINATION_OVERFLOW",
    internal_system: "reporting-api",
    category: "internal_api",
    severity: "low",
    is_self_service: true,
    self_service_steps:
      "Narrow your report's date range (try 30 days or less) and re-run it. Very large date ranges can exceed the report engine's row limit.",
    specialist_diagnostic:
      "reporting-api's pagination cursor overflowed on an unusually large result set (typically a multi-year date range query). Not a bug — a known engine limit. Do not escalate to dev. Advise employee to narrow their query.",
    employee_message:
      "This report is likely covering too wide a date range for the system to process at once. Try narrowing it to 30 days or less and running it again.",
    escalate_to_dev: false,
  },

  // ---- Message queue / async job failures ----
  {
    error_code: "JOBQUEUE_DEAD_LETTER",
    internal_system: "job-queue",
    category: "queue",
    severity: "high",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "Job exceeded its retry limit (3) and landed in the dead-letter queue — likely a downstream dependency outage, not user error. Escalate to the platform team that owns job-queue; this is not resolvable by the employee or the specialist. Do not manually requeue without checking the DLQ payload for a poison-pill message first.",
    employee_message:
      "Thanks for flagging this — our team has been notified and is looking into it. We don't have an exact timeline yet, but keep an eye out for a follow-up message with an update.",
    escalate_to_dev: true,
  },
  {
    error_code: "JOBQUEUE_WORKER_CRASHED",
    internal_system: "job-queue",
    category: "queue",
    severity: "critical",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "Background worker process crashed mid-job (out-of-memory or unhandled exception, check worker logs for stack trace). If you have dashboard access, an immediate containment step is to check whether other workers in the pool are still healthy and manually pause intake for this job type until dev confirms it's safe to resume. Escalate to dev immediately — this can affect other employees' jobs in the same queue.",
    employee_message:
      "Our team has been notified and is investigating — this looks like a broader issue, not something specific to your request. We don't have a fixed timeline yet, but we'll follow up with an update.",
    escalate_to_dev: true,
  },
  {
    error_code: "JOBQUEUE_STALE_LOCK",
    internal_system: "job-queue",
    category: "queue",
    severity: "low",
    is_self_service: true,
    self_service_steps:
      "Wait about 2 minutes and re-submit the same request. Stale locks auto-expire and clear on their own.",
    specialist_diagnostic:
      "Job attempted to acquire a lock already held by a previous (now-completed) run that hadn't released cleanly yet. Self-clears within ~2 minutes via lock TTL expiry. Do not escalate to dev. Advise employee to simply retry shortly.",
    employee_message:
      "This looks like a temporary hiccup. Wait about 2 minutes and try submitting again — it should go through.",
    escalate_to_dev: false,
  },

  // ---- Database / connection layer ----
  {
    error_code: "DB_POOL_EXHAUSTED",
    internal_system: "internal-db-layer",
    category: "db",
    severity: "high",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "Connection pool for the internal database layer is exhausted — either a traffic spike or a connection leak in a recently deployed service. Escalate to the DB/infra team; check for any deploys in the last few hours as a likely correlated cause.",
    employee_message:
      "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
    escalate_to_dev: true,
  },
  {
    error_code: "DASHBOARD_REPLICA_LAG_STALE_READ",
    internal_system: "internal-dashboard-service",
    category: "db",
    severity: "low",
    is_self_service: true,
    self_service_steps:
      "Refresh the dashboard page in a minute or two — the data will catch up automatically. No need to resubmit anything.",
    specialist_diagnostic:
      "Read replica lag caused the dashboard to serve slightly stale data. Self-resolving as replication catches up (typically under 2 minutes). Do not escalate to dev unless lag persists beyond 15 minutes, which would indicate a stuck replica.",
    employee_message:
      "The dashboard might just be showing slightly outdated info for a moment. Give it a minute or two and refresh the page — it should catch up on its own.",
    escalate_to_dev: false,
  },
  {
    error_code: "DB_MIGRATION_LOCK_TIMEOUT",
    internal_system: "internal-db-layer",
    category: "db",
    severity: "medium",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "Query timed out waiting on a table lock, likely held by an in-progress schema migration. Check the deploy/migration calendar — if a migration is scheduled or running, this is expected and time-boxed. Escalate to dev only if no migration is currently active.",
    employee_message:
      "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
    escalate_to_dev: true,
  },

  // ---- Internal tooling / config errors ----
  {
    error_code: "FEATUREFLAG_MISCONFIG_500",
    internal_system: "internal-tool-gateway",
    category: "config",
    severity: "medium",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "A feature flag was toggled on for this employee's cohort without the corresponding backend support being deployed yet, causing a 500 on load. Escalate to the team that owns the flag — the fastest fix is usually flipping the flag back off for the affected cohort, but that requires flag-admin access.",
    employee_message:
      "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
    escalate_to_dev: true,
  },
  {
    error_code: "CACHE_STALE_INTERNAL_DATA",
    internal_system: "internal-cache-layer",
    category: "config",
    severity: "low",
    is_self_service: true,
    self_service_steps:
      "Do a hard refresh of the page (Ctrl+Shift+R or Cmd+Shift+R). This bypasses your browser cache and pulls the latest data.",
    specialist_diagnostic:
      "Internal cache layer served a stale entry past its expected TTL. A hard refresh on the client side typically resolves it immediately; if not, cache will naturally expire within 10 minutes. Do not escalate to dev unless staleness persists after a hard refresh.",
    employee_message:
      "The page might be showing cached (slightly outdated) info. Try a hard refresh — hold Ctrl+Shift+R (or Cmd+Shift+R on a Mac) — and it should show the latest data.",
    escalate_to_dev: false,
  },
  {
    error_code: "CRMSYNC_INTEGRATION_FAILURE",
    internal_system: "internal-crm-sync",
    category: "config",
    severity: "critical",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "Internal CRM sync job failed for a batch of records — likely an upstream API contract change from the CRM vendor. If you have sync-admin access, pause the sync job to prevent further partial-write corruption before dev picks this up. Escalate to dev immediately; this can cause data inconsistency across multiple employees' records if left running.",
    employee_message:
      "Our team has been notified and is investigating — this is a broader issue affecting more than just your request. We don't have a fixed timeline yet, but we'll follow up with an update.",
    escalate_to_dev: true,
  },

  // ---- Ambiguous / ugly real-world log shapes (exercise the "unmapped" path realistically) ----
  {
    error_code: "ERR_WRAPPED_ECONNRESET_UPSTREAM",
    internal_system: "internal-api-gateway",
    category: "internal_api",
    severity: "medium",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "This is a raw Node.js 'ECONNRESET' bubbling up from a third-party HTTP client library used by the internal API gateway, wrapped in a generic gateway error. Root cause is usually the upstream internal service closing the connection unexpectedly — check that service's uptime before escalating. Escalate to dev with the wrapped stack trace attached.",
    employee_message:
      "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
    escalate_to_dev: true,
  },
  {
    error_code: "LEGACY_BATCHPROC_EXITCODE_137",
    internal_system: "legacy-batch-processor",
    category: "internal_api",
    severity: "high",
    is_self_service: false,
    self_service_steps: null,
    specialist_diagnostic:
      "Exit code 137 from the legacy batch processor indicates the container was OOM-killed by the orchestrator, not an application-level failure. This system predates structured logging, so the raw payload is often just this exit code with no additional context. Escalate to the infra team owning the legacy-batch-processor container limits.",
    employee_message:
      "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
    escalate_to_dev: true,
  },
];


// Programmatically generate the remaining rows up to ~300 total, built from
// systems x categories x severities x message-template combinations (see
// scripts/generate-templates.js). This keeps the file readable at scale
// instead of ~300 hand-typed objects, while still respecting the same
// low-severity/self-service rule as the hand-written rows.
const TARGET_TOTAL_TEMPLATES = 300;
const existingCodes = HAND_WRITTEN_TEMPLATES.map((row) => row.error_code);
const generatedCount = Math.max(0, TARGET_TOTAL_TEMPLATES - HAND_WRITTEN_TEMPLATES.length);
const GENERATED_TEMPLATES = generateTemplates(generatedCount, existingCodes);

module.exports = [...HAND_WRITTEN_TEMPLATES, ...GENERATED_TEMPLATES];
