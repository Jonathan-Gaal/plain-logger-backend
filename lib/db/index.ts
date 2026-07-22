// lib/db/index.ts
//
// Database abstraction layer. Route handlers import `getDb()` from here
// instead of talking to Supabase or SQLite directly. This lets the exact
// same route code run against two different backends:
//
//   - LOCAL MODE (default, zero config): a SQLite file at ./local.db,
//     using Node's built-in `node:sqlite` module (Node 22+, no npm
//     dependency, nothing to compile). This is what runs when you do
//     `npm install && npm run db:init && npm run db:seed && npm run dev`
//     with no .env file at all.
//   - SUPABASE MODE (deploy): the existing Postgres-backed Supabase client,
//     used automatically the moment NEXT_PUBLIC_SUPABASE_URL and
//     SUPABASE_SERVICE_ROLE_KEY are set in the environment. No code changes
//     needed to switch — just set the env vars (e.g. in your deploy
//     platform's dashboard) and redeploy.
//
// Mode is decided once per process and cached. See isSupabaseConfigured()
// for the exact rule.

import "server-only";

export type DbMode = "sqlite" | "supabase";

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getDbMode(): DbMode {
  return isSupabaseConfigured() ? "supabase" : "sqlite";
}

// Re-exported so route handlers only ever need one import.
export { getDb } from "./adapter";
export type { DbAdapter, QueryResult } from "./adapter";
