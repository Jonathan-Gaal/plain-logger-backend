// tests/parse-log-unit.test.ts
//
// Pure unit tests for lib/parse-log.ts — no server, no database, no network.
// These run instantly and don't require any environment setup, unlike
// tests/parse-log.test.ts which needs a running server + test DB.

import { describe, expect, it } from "vitest";
import { tryParseJson, extractErrorCode } from "@/lib/parse-log";

describe("tryParseJson", () => {
  it("parses valid JSON", () => {
    const result = tryParseJson('{"error_code": "X"}');
    expect(result.ok).toBe(true);
  });

  it("fails gracefully on malformed JSON", () => {
    const result = tryParseJson('{"error_code": "X"');
    expect(result.ok).toBe(false);
  });
});

describe("extractErrorCode", () => {
  it("extracts from error_code key", () => {
    expect(extractErrorCode({ error_code: "AUTHSVC_TOKEN_EXPIRED" })).toBe(
      "AUTHSVC_TOKEN_EXPIRED"
    );
  });

  it("falls back to code key when error_code is absent", () => {
    expect(extractErrorCode({ code: "JOBQUEUE_DEAD_LETTER" })).toBe(
      "JOBQUEUE_DEAD_LETTER"
    );
  });

  it("prefers error_code over code when both are present", () => {
    expect(
      extractErrorCode({ error_code: "A", code: "B" })
    ).toBe("A");
  });

  it("returns null when neither key is present", () => {
    expect(extractErrorCode({ message: "oops" })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(extractErrorCode("just a string")).toBeNull();
    expect(extractErrorCode(null)).toBeNull();
    expect(extractErrorCode(["array"])).toBeNull();
  });

  it("returns null for empty-string code values", () => {
    expect(extractErrorCode({ error_code: "" })).toBeNull();
  });
});
