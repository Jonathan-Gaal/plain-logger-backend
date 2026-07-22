// lib/cors.ts
//
// CORS support for a backend-only API consumed by a separate frontend
// origin. The allowed origin is configurable via env var since the
// frontend's deployed URL (and local dev port) will differ across
// environments — never hardcode it.
//
// Usage in a route handler:
//   import { corsHeaders, handleOptions } from "@/lib/cors";
//   export async function OPTIONS(request: NextRequest) {
//     return handleOptions(request);
//   }
//   // ...then spread corsHeaders(request) into every NextResponse.json() call.

import { NextRequest, NextResponse } from "next/server";

/**
 * Comma-separated list of allowed origins, e.g.
 * "http://localhost:3001,https://plain-logger-frontend.vercel.app"
 * Defaults to allowing nothing (safer default) if unset — set this in .env
 * once the frontend's origin(s) are known.
 */
function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Returns the CORS headers to attach to a response, or an empty object if
 * the request's Origin isn't in the allowed list (or no Origin header is
 * present, e.g. same-origin/non-browser requests, which don't need CORS
 * headers at all).
 */
export function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedOrigins();

  if (!origin || !allowedOrigins.includes(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

/** Handles a CORS preflight OPTIONS request. */
export function handleOptions(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
