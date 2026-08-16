/**
 * Supabase generated RPC argument types mark optional parameters as
 * `key?: string` (never `null`). Passing an explicit `null` therefore fails
 * typecheck even though Postgres accepts it. This helper drops every
 * null/undefined entry so optional RPC parameters fall back to their
 * database defaults.
 */
export function compactArgs<T extends Record<string, unknown>>(args: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out as T;
}
