import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database";

const configuredUrl = import.meta.env["VITE_SUPABASE_URL"];
const configuredKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

if (!configuredUrl || !configuredKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[rakeez] Supabase is not configured. Connect a Supabase project via Project Settings → Integrations → Supabase.",
  );
}

// Use a placeholder URL/key only when the project is not yet connected so the
// app can still render. Real credentials are injected after connecting Supabase.
const url = configuredUrl || "http://localhost";
const key = configuredKey || "dummy";

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
