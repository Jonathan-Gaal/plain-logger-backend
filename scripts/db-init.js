// scripts/db-init.js
//
// Creates the Plain Logger schema (error_templates, parse_history, tickets).
//
// MODE (auto-detected, no flags needed):
//   - No .env file, or missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     -> LOCAL MODE: creates a SQLite file at ./local.db using
//        scripts/schema.sqlite.sql, via Node's built-in `node:sqlite`
//        module. This is the zero-config default — `npm run db:init` works
//        immediately after `npm install`, no account or credentials needed.
//   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in .env
//     -> SUPABASE MODE: connects directly to Postgres via the `pg` package
//        using SUPABASE_DB_URL (required in this mode — the
//        @supabase/supabase-js client talks to PostgREST and cannot
//        execute arbitrary DDL) and applies scripts/schema.sql.
//
// Usage: npm run db:init

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function initSupabase() {
  const { Client } = require("pg");
  const connectionString = process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, so this is running in " +
        "Supabase mode, but SUPABASE_DB_URL is missing. Set it in your .env file — see " +
        ".env.example for where to find this in the Supabase dashboard (Project Settings -> " +
        "Database -> Connection string)."
    );
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("[supabase mode] Connected to database. Applying schema...");
    await client.query(schemaSql);
    console.log("Schema applied successfully: error_templates, parse_history, tickets.");
  } catch (err) {
    console.error("Failed to apply schema:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

function initSqlite() {
  const { DatabaseSync } = require("node:sqlite");

  const dbPath = path.join(process.cwd(), "local.db");
  const schemaPath = path.join(__dirname, "schema.sqlite.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  console.log(`[local mode] No Supabase env vars found — using SQLite at ${dbPath}`);

  const db = new DatabaseSync(dbPath);
  try {
    db.exec(schemaSql);
    console.log("Schema applied successfully: error_templates, parse_history, tickets.");
    console.log(`Local database file: ${dbPath}`);
  } catch (err) {
    console.error("Failed to apply schema:", err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

async function main() {
  if (isSupabaseConfigured) {
    await initSupabase();
  } else {
    if (!process.versions.node || Number(process.versions.node.split(".")[0]) < 22) {
      console.error(
        `Local SQLite mode requires Node.js 22 or newer (you have ${process.version}). ` +
          "Either upgrade Node, or set NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / " +
          "SUPABASE_DB_URL in .env to use Supabase mode instead."
      );
      process.exit(1);
    }
    initSqlite();
  }
}

main();
