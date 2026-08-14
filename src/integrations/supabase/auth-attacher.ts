import { createMiddleware } from "@tanstack/react-start";

import { supabase } from "./client";

/**
 * Attaches the current Supabase session access token to outgoing server function
 * calls so that `requireSupabaseAuth` can validate the caller on the server.
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
