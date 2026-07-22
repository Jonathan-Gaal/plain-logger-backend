// lib/supabase/client.ts
//
// Browser-safe Supabase client — anon key only. Safe to import from Client
// Components. Never import lib/supabase/server.ts (service-role) from here
// or from anything that ships to the browser.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check your .env file."
  );
}

export const supabaseBrowserClient = createClient(supabaseUrl, supabaseAnonKey);
