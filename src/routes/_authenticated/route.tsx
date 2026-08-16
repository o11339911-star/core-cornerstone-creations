import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AuthenticatedAppShell } from "@/components/app-shell";
import { PolicyAcceptanceGate } from "@/components/legal/policy-acceptance-gate";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <PolicyAcceptanceGate>
      <AuthenticatedAppShell>
        <Outlet />
      </AuthenticatedAppShell>
    </PolicyAcceptanceGate>
  );
}


