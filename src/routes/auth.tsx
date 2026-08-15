import { createFileRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Layout for every /auth/* screen.
 * It MUST render <Outlet />, otherwise child routes such as
 * /auth/forgot-password silently render the parent screen instead.
 */
export const Route = createFileRoute("/auth")({
  // Auth pages depend on the browser-only Supabase session; skip SSR to avoid
  // hydration mismatches between the server shell and the client render.
  ssr: false,
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: () => <Outlet />,
});
