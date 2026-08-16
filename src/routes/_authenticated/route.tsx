import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AccountCompletionGate } from "@/components/account/account-completion-gate";
import { AuthenticatedAppShell } from "@/components/app-shell";
import { PolicyAcceptanceGate } from "@/components/legal/policy-acceptance-gate";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // جلسة محفوظة محليًا أولًا: لا نطرد المستخدم بسبب انقطاع شبكة أو تجديد رمز.
    const { data: local } = await supabase.auth.getSession();
    if (!local.session) throw redirect({ to: "/auth" });

    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return { user: data.user };

    // 401/403 = إبطال خادمي حقيقي؛ غير ذلك خطأ عابر تُعاد المصادقة عنده خادميًا.
    const status = (error as { status?: number } | null)?.status;
    if (status === 401 || status === 403) throw redirect({ to: "/auth" });
    return { user: local.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <PolicyAcceptanceGate>
      <AccountCompletionGate>
        <AuthenticatedAppShell>
          <Outlet />
        </AuthenticatedAppShell>
      </AccountCompletionGate>
    </PolicyAcceptanceGate>
  );
}



