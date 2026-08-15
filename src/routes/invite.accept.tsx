import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

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
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-bold text-foreground">{t("team.acceptTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("team.acceptSubtitle")}</p>

        {!token ? (
          <p className="mt-6 text-sm text-destructive">{t("team.missingToken")}</p>
        ) : signedIn === false ? (
          <Link
            to="/auth"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {t("auth.signIn")}
          </Link>
        ) : signedIn ? (
          <button
            type="button"
            onClick={() => void onAccept()}
            disabled={state === "working" || state === "done"}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {state === "working" ? t("common.loading") : t("team.acceptCta")}
          </button>
        ) : null}

        {state === "done" ? (
          <p className="mt-4 text-sm text-foreground">{t("team.acceptDone")}</p>
        ) : null}
        {state === "error" && message ? (
          <p className="mt-4 text-sm text-destructive">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
