import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Phase 17-B — periodic duration scan.
 *
 * Protected by an HMAC signature over the raw request body using
 * DURATION_SCAN_SECRET. The secret is read from process.env inside the handler
 * only, so it never reaches any client bundle, and the comparison is
 * constant-time. Nothing about the secret is echoed back in responses.
 */
export const Route = createFileRoute("/api/public/cron/duration-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["DURATION_SCAN_SECRET"];
        if (!secret) {
          return new Response(JSON.stringify({ error: "not_configured" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }

        const body = await request.text();
        const provided = request.headers.get("x-duration-signature") ?? "";
        const expected = createHmac("sha256", secret).update(body).digest("hex");

        const providedBuf = Buffer.from(provided, "utf8");
        const expectedBuf = Buffer.from(expected, "utf8");
        const ok =
          providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
        if (!ok) {
          return new Response(JSON.stringify({ error: "invalid_signature" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("run_duration_scan");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: true, result: data }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
