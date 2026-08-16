import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tmpcheck")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env["SUPABASE_URL"]!;
        const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
        const h = { apikey: key, Authorization: `Bearer ${key}` };
        const r = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: h });
        const j = (await r.json()) as { users?: { id: string; email?: string }[] };
        const targets = (j.users ?? []).filter((u) => (u.email ?? "").includes("@rakeez-qa.invalid"));
        const out: string[] = [];
        for (const u of targets) {
          const d = await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: h });
          out.push(`deleted ${(u.email ?? "").replace(/@.*/, "@…")} ${d.status}`);
        }
        return new Response(JSON.stringify({ removed: out.length, out }, null, 2), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
