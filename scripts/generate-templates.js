// scripts/generate-templates.js
//
// Programmatic generator for the bulk of error_templates seed data.
// Combines internal systems x categories x severities x message templates
// to produce ~280 varied, plausible rows on top of the ~18 hand-written
// "flagship" rows in seed-data.js (kept separately since they're the most
// carefully worded examples and used directly in tests/fixtures.ts).
//
// Every generated row follows the same rules as the hand-written ones:
//   - severity = 'low'  -> is_self_service = true, self_service_steps set,
//                          escalate_to_dev = false
//   - severity != 'low' -> is_self_service = false, self_service_steps null,
//                          escalate_to_dev = true
// This mirrors the DB check constraint (self_service_only_when_low) and the
// seed-time guard in db-seed.js.

const INTERNAL_SYSTEMS = [
  { system: "auth-service", category: "auth" },
  { system: "sso-gateway", category: "auth" },
  { system: "rbac-service", category: "auth" },
  { system: "fulfillment-api", category: "internal_api" },
  { system: "orders-api", category: "internal_api" },
  { system: "billing-api", category: "internal_api" },
  { system: "inventory-service", category: "internal_api" },
  { system: "reporting-api", category: "internal_api" },
  { system: "notifications-api", category: "internal_api" },
  { system: "job-queue", category: "queue" },
  { system: "email-dispatch-queue", category: "queue" },
  { system: "export-job-queue", category: "queue" },
  { system: "internal-db-layer", category: "db" },
  { system: "internal-dashboard-service", category: "db" },
  { system: "analytics-warehouse", category: "db" },
  { system: "internal-tool-gateway", category: "config" },
  { system: "internal-cache-layer", category: "config" },
  { system: "internal-crm-sync", category: "config" },
  { system: "internal-hr-sync", category: "config" },
  { system: "internal-payroll-gateway", category: "config" },
  { system: "internal-search-index", category: "internal_api" },
  { system: "internal-file-storage", category: "internal_api" },
  { system: "internal-audit-logger", category: "config" },
  { system: "internal-feature-flag-service", category: "config" },
  { system: "internal-metrics-collector", category: "db" },
];

const SEVERITIES = ["low", "medium", "high", "critical"];

// One or more (specialist, employee, self_service_steps) message template
// per severity, per category. Multiple variants per (category, severity)
// pair let the generator produce different phrasing across systems instead
// of literally repeating the same three sentences 25 times.
const MESSAGE_VARIANTS = {
  auth: {
    low: [
      {
        specialist: (sys) =>
          `Employee's session/credential for ${sys} expired or desynced — expected behavior, not a bug. Do not escalate to dev. Point the employee to the self-service steps.`,
        employee:
          "Looks like your session timed out or got out of sync. Log out and log back in — that should fix it.",
        steps: "Log out completely, then log back in to refresh your session.",
      },
      {
        specialist: (sys) =>
          `Permission check failed for ${sys} — employee's role doesn't have the required grant yet. Not a bug. Do not escalate to dev. Direct them to the access-request portal.`,
        employee:
          "It looks like you don't have access to this yet. Submit a request through the internal access portal — most are approved within a business day.",
        steps: "Submit an access request via the internal access-request portal.",
      },
    ],
    medium: [
      {
        specialist: (sys) =>
          `${sys} rejected a service-to-service credential — likely expired or rotated without updating a dependent config. Escalate to the platform/auth team.`,
        employee:
          "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
      },
    ],
    high: [
      {
        specialist: (sys) =>
          `${sys} is intermittently failing auth checks for a subset of employees — likely a config drift or partial rollout issue. Escalate to the auth team immediately; this can lock out more employees if left unresolved.`,
        employee:
          "Our team has been notified and is investigating — this looks like a broader issue, not something specific to your account. We'll follow up with an update.",
      },
    ],
    critical: [
      {
        specialist: (sys) =>
          `${sys} is failing auth checks broadly — potential outage affecting many employees. If you have dashboard access, check whether a recent deploy correlates. Escalate to dev immediately.`,
        employee:
          "Our team has been notified and is investigating — this is a broader issue affecting more than just your request. We'll follow up with an update.",
      },
    ],
  },
  internal_api: {
    low: [
      {
        specialist: (sys) =>
          `${sys} returned a client-correctable error (bad input shape, oversized request, or similar) — not a system fault. Do not escalate to dev. Advise the employee per the self-service steps.`,
        employee:
          "This looks like it might be a formatting or size issue with your request. Try again with a smaller/simpler input.",
        steps: "Reduce the size or complexity of your request (e.g. narrower date range, fewer items) and retry.",
      },
    ],
    medium: [
      {
        specialist: (sys) =>
          `${sys}'s call to a downstream internal service exceeded its timeout. Check the downstream service's health dashboard before escalating — if it's already a known incident, link this ticket instead of opening a new escalation.`,
        employee:
          "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
      },
    ],
    high: [
      {
        specialist: (sys) =>
          `${sys} returned a 5xx after a downstream dependency failed. Escalate to the team owning the downstream service, not ${sys} itself, unless ${sys}'s own logic is clearly at fault.`,
        employee:
          "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
      },
    ],
    critical: [
      {
        specialist: (sys) =>
          `${sys} is failing broadly across requests — likely a full outage of a core dependency. Escalate to dev immediately; this affects more than one employee.`,
        employee:
          "Our team has been notified and is investigating — this is a broader issue affecting more than just your request. We'll follow up with an update.",
      },
    ],
  },
  queue: {
    low: [
      {
        specialist: (sys) =>
          `${sys} job hit a transient/self-clearing condition (stale lock, brief backpressure). Self-resolves within a couple minutes. Do not escalate to dev unless it persists beyond 10 minutes.`,
        employee:
          "This looks like a temporary hiccup. Wait a couple of minutes and try submitting again — it should go through.",
        steps: "Wait 2-5 minutes and resubmit the same request.",
      },
    ],
    medium: [
      {
        specialist: (sys) =>
          `${sys} job is retrying repeatedly without landing in the dead-letter queue yet — worth checking for a degraded downstream dependency before it escalates further.`,
        employee:
          "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
      },
    ],
    high: [
      {
        specialist: (sys) =>
          `${sys} job exceeded its retry limit and landed in the dead-letter queue — likely a downstream outage, not user error. Escalate to the platform team owning ${sys}; do not manually requeue without checking for a poison-pill payload first.`,
        employee:
          "Thanks for flagging this — our team has been notified and is looking into it. We don't have an exact timeline yet, but keep an eye out for a follow-up.",
      },
    ],
    critical: [
      {
        specialist: (sys) =>
          `${sys} worker pool crashed or is failing broadly — this can affect other employees' jobs in the same queue. Escalate to dev immediately; pause intake for this job type if you have access.`,
        employee:
          "Our team has been notified and is investigating — this looks like a broader issue, not something specific to your request. We'll follow up with an update.",
      },
    ],
  },
  db: {
    low: [
      {
        specialist: (sys) =>
          `${sys} served a stale read due to brief replication lag — self-resolves as replication catches up, typically under a couple minutes. Do not escalate to dev unless lag persists beyond 15 minutes.`,
        employee:
          "The data might be a moment behind. Give it a minute or two and refresh — it should catch up on its own.",
        steps: "Wait 1-2 minutes, then refresh the page.",
      },
    ],
    medium: [
      {
        specialist: (sys) =>
          `Query against ${sys} timed out waiting on a table lock, likely from an in-progress migration. Check the deploy/migration calendar before escalating — if a migration is active, this is expected and time-boxed.`,
        employee:
          "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
      },
    ],
    high: [
      {
        specialist: (sys) =>
          `${sys}'s connection pool is exhausted — check for a traffic spike or a connection leak from a recent deploy before escalating to the DB/infra team.`,
        employee:
          "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
      },
    ],
    critical: [
      {
        specialist: (sys) =>
          `${sys} is failing to serve queries broadly — potential primary/replica failure. Escalate to the DB/infra team immediately; this affects more than one employee.`,
        employee:
          "Our team has been notified and is investigating — this is a broader issue affecting more than just your request. We'll follow up with an update.",
      },
    ],
  },
  config: {
    low: [
      {
        specialist: (sys) =>
          `${sys} served a stale cached value past its expected TTL. A hard client-side refresh typically resolves it immediately. Do not escalate to dev unless staleness persists after a hard refresh.`,
        employee:
          "The page might be showing slightly outdated info. Try a hard refresh (Ctrl+Shift+R, or Cmd+Shift+R on a Mac) — it should show the latest data.",
        steps: "Hold Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac) to hard-refresh the page.",
      },
    ],
    medium: [
      {
        specialist: (sys) =>
          `A recent config/feature-flag change to ${sys} is causing errors for a subset of employees without full backend support deployed yet. Escalate to the team owning the flag/config.`,
        employee:
          "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
      },
    ],
    high: [
      {
        specialist: (sys) =>
          `${sys} integration is failing for a batch of records — likely an upstream contract change. Escalate to dev; check whether pausing the sync job is possible to avoid partial-write issues.`,
        employee:
          "Our team has been notified and is investigating. We don't have a fixed timeline yet, but we'll follow up with an update.",
      },
    ],
    critical: [
      {
        specialist: (sys) =>
          `${sys} misconfiguration is affecting a broad set of employees — potential data consistency risk if left running. Escalate to dev immediately; pause the affected job/integration if you have access.`,
        employee:
          "Our team has been notified and is investigating — this is a broader issue affecting more than just your request. We'll follow up with an update.",
      },
    ],
  },
};

// Deterministic-ish code suffixes so generated codes read like real error
// enums rather than "SYSTEM_1", "SYSTEM_2".
const CODE_SUFFIXES_BY_CATEGORY = {
  auth: ["TOKEN_EXPIRED", "SESSION_INVALID", "PERMISSION_DENIED", "CRED_INVALID", "MFA_FAILED", "SSO_HANDOFF_FAILED"],
  internal_api: ["TIMEOUT", "5XX_DOWNSTREAM", "BAD_REQUEST_SHAPE", "RATE_LIMITED_INTERNAL", "PARTIAL_RESPONSE", "CONTRACT_MISMATCH"],
  queue: ["STALE_LOCK", "RETRY_EXCEEDED", "DEAD_LETTER", "WORKER_CRASHED", "BACKPRESSURE", "DUPLICATE_JOB"],
  db: ["REPLICA_LAG", "POOL_EXHAUSTED", "MIGRATION_LOCK_TIMEOUT", "QUERY_TIMEOUT", "DEADLOCK_DETECTED", "CONNECTION_REFUSED"],
  config: ["STALE_CACHE", "FLAG_MISCONFIG", "SYNC_FAILURE", "SCHEMA_DRIFT", "INTEGRATION_TIMEOUT", "VALIDATION_FAILURE"],
};

function systemCodePrefix(systemName) {
  return systemName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Generates ~targetCount rows by cycling through systems x severities x
 * message variants x code suffixes, until the target is reached or the
 * combination space is exhausted (whichever comes first). Deduplicates by
 * error_code to stay consistent with the unique constraint.
 */
function generateTemplates(targetCount, existingCodes) {
  const seenCodes = new Set(existingCodes);
  const rows = [];

  let suffixCursor = {};

  outer: for (const severity of SEVERITIES) {
    for (const { system, category } of INTERNAL_SYSTEMS) {
      const variants = MESSAGE_VARIANTS[category]?.[severity];
      if (!variants || variants.length === 0) continue;

      const suffixes = CODE_SUFFIXES_BY_CATEGORY[category];
      const cursorKey = `${category}:${severity}`;
      if (suffixCursor[cursorKey] === undefined) suffixCursor[cursorKey] = 0;

      for (const variant of variants) {
        const suffix = suffixes[suffixCursor[cursorKey] % suffixes.length];
        suffixCursor[cursorKey] += 1;

        const prefix = systemCodePrefix(system);
        let code = `${prefix}_${suffix}`;
        let attempt = 2;
        while (seenCodes.has(code)) {
          code = `${prefix}_${suffix}_${attempt}`;
          attempt += 1;
        }
        seenCodes.add(code);

        const isLow = severity === "low";
        rows.push({
          error_code: code,
          internal_system: system,
          category,
          severity,
          is_self_service: isLow,
          self_service_steps: isLow ? variant.steps : null,
          specialist_diagnostic: variant.specialist(system),
          employee_message: variant.employee,
          escalate_to_dev: !isLow,
        });

        if (rows.length >= targetCount) break outer;
      }
    }
  }

  // If we didn't hit the target on the first pass (limited variant count),
  // do additional passes reusing variants with a numeric suffix bump on the
  // code so error_code stays unique. This keeps the generator robust to
  // targetCount changes without needing more hand-written variants.
  let pass = 2;
  while (rows.length < targetCount && pass <= 20) {
    outer2: for (const severity of SEVERITIES) {
      for (const { system, category } of INTERNAL_SYSTEMS) {
        const variants = MESSAGE_VARIANTS[category]?.[severity];
        if (!variants || variants.length === 0) continue;
        const suffixes = CODE_SUFFIXES_BY_CATEGORY[category];

        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i];
          const suffix = suffixes[(i + pass) % suffixes.length];
          const prefix = systemCodePrefix(system);
          let code = `${prefix}_${suffix}_P${pass}`;
          let attempt = 2;
          while (seenCodes.has(code)) {
            code = `${prefix}_${suffix}_P${pass}_${attempt}`;
            attempt += 1;
          }
          seenCodes.add(code);

          const isLow = severity === "low";
          rows.push({
            error_code: code,
            internal_system: system,
            category,
            severity,
            is_self_service: isLow,
            self_service_steps: isLow ? variant.steps : null,
            specialist_diagnostic: variant.specialist(system),
            employee_message: variant.employee,
            escalate_to_dev: !isLow,
          });

          if (rows.length >= targetCount) break outer2;
        }
      }
    }
    pass += 1;
  }

  return rows;
}

module.exports = { generateTemplates };
