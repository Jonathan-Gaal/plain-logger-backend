// tests/fixtures.ts
//
// Literal sample payloads used by the acceptance criteria (see project
// spec, Section 8). These double as the primary test fixtures rather than
// living only in documentation.

/** Sample 1 — matched, low severity, self-service. */
export const SAMPLE_LOW_SEVERITY_MATCHED = JSON.stringify({
  error_code: "AUTHSVC_TOKEN_EXPIRED",
  timestamp: "2026-07-22T10:00:00Z",
  service: "auth-service",
  employee_id: "internal-use-only",
});

/** Sample 2 — unmapped (valid JSON, well-formed code, no matching template). */
export const SAMPLE_UNMAPPED = JSON.stringify({
  code: "XYZ_NOT_A_REAL_CODE",
  message: "unexpected failure in internal-billing-sync",
});

/** Sample 3 — malformed / truncated JSON. */
export const SAMPLE_MALFORMED = '{"error_code": "AUTHSVC_TOKEN_EXPIRED",';

/** Sample 4 — alternate `code` key, high severity, not self-service. */
export const SAMPLE_HIGH_SEVERITY_ALT_KEY = JSON.stringify({
  code: "JOBQUEUE_DEAD_LETTER",
  trace: "worker-7 exceeded retry limit (3) on job fulfillment-sync-4821",
});

/** Valid JSON with no recognizable error_code/code key. */
export const SAMPLE_MISSING_CODE_KEY = JSON.stringify({
  message: "something failed",
  timestamp: "2026-07-22T10:00:00Z",
});

/** Payload that exceeds the 20,000 character limit. */
export const SAMPLE_OVER_LIMIT = "a".repeat(20001);
