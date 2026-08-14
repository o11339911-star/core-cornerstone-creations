import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database";

const url = process.env["SUPABASE_URL"] ?? "";
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.warn(
    "[rakeez] Supabase service role is not configured. Connect a Supabase project via Project Settings → Integrations → Supabase.",
  );
}

export const supabaseAdmin = createClient<Database>(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
