import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvitation } from "@/lib/team.functions";

export const Route = createFileRoute("/invite/accept")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  component: AcceptInvitePage,
  head: () => ({
    meta: [
      { title: "قبول دعوة الانضمام — ركيز" },
      {
        name: "description",
        content: "اقبل دعوة الانضمام إلى كيان في منصة ركيز باستخدام رابط الدعوة الخاص بك.",
      },
      { property: "og:title", content: "قبول دعوة الانضمام — ركيز" },
      { property: "og:description", content: "انضم إلى فريق الكيان عبر رابط الدعوة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AcceptInvitePage() {
  const t = useT();
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const accept = useServerFn(acceptInvitation);

  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  const [state, setState] = React.useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  async function onAccept() {
    setState("working");
    try {
      await accept({ data: { token } });
      setState("done");
      void navigate({ to: "/select-account" });
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <span
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-primary"
        >
          <MailCheck className="size-6" />
        </span>
        <h1 className="text-xl font-bold text-foreground">{t("team.acceptTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("team.acceptSubtitle")}</p>

        {!token ? (
          <p className="text-sm text-destructive">{t("team.missingToken")}</p>
        ) : signedIn === false ? (
          <Button asChild className="min-h-11 w-full">
            <Link to="/auth">{t("auth.signIn")}</Link>
          </Button>
        ) : signedIn ? (
          <Button
            type="button"
            onClick={() => void onAccept()}
            disabled={state === "working" || state === "done"}
            className="min-h-11 w-full"
          >
            {state === "working" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("common.loading")}
              </span>
            ) : (
              t("team.acceptCta")
            )}
          </Button>
        ) : null}

        {state === "done" ? <p className="text-sm text-foreground">{t("team.acceptDone")}</p> : null}
        {state === "error" && message ? <p className="text-sm text-destructive">{message}</p> : null}
      </div>
    </div>
  );
}
