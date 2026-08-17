import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database";

/**
 * Service-role client.
 *
 * IMPORTANT: the worker runtime injects environment variables per request, so
 * reading `process.env` at module scope yields empty values in production and
 * makes every admin call fail with "supabaseKey is required.". The client is
 * therefore created lazily on first use and cached per key value.
 */
let cachedClient: SupabaseClient<Database> | null = null;
let cachedKey = "";

function createAdminClient(): SupabaseClient<Database> {
  const url = process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

  if (!url || !key) {
    throw new Error(
      "[rakeez] Supabase service role is not configured. Connect a Supabase project via Project Settings → Integrations → Supabase.",
    );
  }

  if (!cachedClient || cachedKey !== `${url}|${key}`) {
    cachedClient = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedKey = `${url}|${key}`;
  }

  return cachedClient;
}

/** Lazy proxy: behaves like a normal Supabase client, but resolves env at call time. */
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_target, property, receiver) {
    const client = createAdminClient();
    const value = Reflect.get(client as object, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return Reflect.has(createAdminClient() as object, property);
  },
});
