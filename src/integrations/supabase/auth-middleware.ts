import { createMiddleware } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database";

function getServerSupabase(token?: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !key) {
    throw new Response("Supabase is not configured", { status: 500 });
  }

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // Act as the calling user so RLS and function grants apply as `authenticated`.
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
}


export const requireSupabaseAuth = createMiddleware().server(async ({ next, request }) => {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const anon = getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await anon.auth.getUser(token);
  const supabase = getServerSupabase(token);


  if (userError || !user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return next({
    context: {
      supabase,
      userId: user.id,
      claims: user,
    },
  });
});
