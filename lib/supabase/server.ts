// lib/supabase/server.ts
//
// SERVER-ONLY Supabase client — uses the service-role key, which bypasses
// row-level security. This file must NEVER be imported from a Client
// Component ("use client") or from anything under app/**/page.tsx that
// renders in the browser. Only import from Route Handlers (app/api/**/route.ts)
// and standalone Node scripts in scripts/.

import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check your .env file."
  );
}

export const supabaseServerClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    // No user sessions on the server client — it's a privileged, static
    // service-role connection used only within Route Handlers.
    persistSession: false,
  },
});
