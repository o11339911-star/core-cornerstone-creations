import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { verifiedDestination } from "@/lib/auth-origin";

/**
 * Official Supabase Auth callback.
 *
 * Handles every shape Supabase can return: `token_hash` (+ `type`),
 * a PKCE `code`, or an implicit-flow hash fragment. Tokens are consumed and the
 * URL is scrubbed immediately so no access/refresh token or OTP survives in the
 * address bar, history, or any log. Redirection is same-origin only.
 */

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallbackPage,
});

type Phase = "verifying" | "success" | "expired" | "invalid";

type OtpType = "signup" | "email" | "recovery" | "invite" | "email_change" | "magiclink";

const OTP_TYPES: readonly OtpType[] = [
  "signup",
  "email",
  "recovery",
  "invite",
  "email_change",
  "magiclink",
];

function AuthCallbackPage() {
  const t = useT();
  const navigate = useNavigate();
  const [phase, setPhase] = React.useState<Phase>("verifying");
  const [destination, setDestination] = React.useState("/select-account");
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);

      // Scrub the URL before doing anything else.
      window.history.replaceState({}, "", "/auth/callback");

      const failure = query.get("error_description") ?? query.get("error") ?? hash.get("error_description") ?? hash.get("error");
      const rawType = query.get("type") ?? hash.get("type") ?? "signup";
      const type = (OTP_TYPES as readonly string[]).includes(rawType)
        ? (rawType as OtpType)
        : "signup";
      const next = verifiedDestination(
        query.get("next") ?? (type === "recovery" ? "/auth/reset-password" : null),
      );
      setDestination(next);

      if (failure) {
        setPhase(/expired|invalid/i.test(failure) ? "expired" : "invalid");
        return;
      }

      const tokenHash = query.get("token_hash") ?? query.get("token");
      const code = query.get("code");

      try {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
          if (error) {
            setPhase(/expired/i.test(error.message) ? "expired" : "invalid");
            return;
          }
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setPhase(/expired/i.test(error.message) ? "expired" : "invalid");
            return;
          }
        }

        // Implicit flow: supabase-js consumes the hash on init, so give it a
        // moment before deciding the link was bad.
        let user = (await supabase.auth.getUser()).data.user;
        if (!user && hash.get("access_token")) {
          await new Promise((resolve) => window.setTimeout(resolve, 600));
          user = (await supabase.auth.getUser()).data.user;
        }

        if (!user) {
          setPhase("invalid");
          return;
        }
        if (type !== "recovery" && !user.email_confirmed_at) {
          setPhase("invalid");
          return;
        }

        setPhase("success");
        window.setTimeout(() => navigate({ to: next as string, replace: true }), 1200);
      } catch {
        setPhase("invalid");
      }
    };

    void run();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-1.5 pb-4">
          <CardTitle className="text-lg">
            {phase === "verifying"
              ? t("auth.verifyingTitle")
              : phase === "success"
                ? t("auth.verifiedTitle")
                : t("auth.verifyFailedTitle")}
          </CardTitle>
          <CardDescription className="text-sm">
            {phase === "verifying"
              ? t("auth.verifyingBody")
              : phase === "success"
                ? t("auth.verifiedBody")
                : phase === "expired"
                  ? t("auth.verifyExpiredBody")
                  : t("auth.verifyInvalidBody")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {phase === "verifying" ? (
            <Loader2 className="mx-auto size-6 animate-spin text-primary" aria-hidden="true" />
          ) : null}

          {phase === "success" ? (
            <>
              <CheckCircle2 className="mx-auto size-6 text-primary" aria-hidden="true" />
              <Button className="min-h-11 w-full" onClick={() => navigate({ to: destination as string, replace: true })}>
                {t("auth.continueNow")}
              </Button>
            </>
          ) : null}

          {phase === "expired" || phase === "invalid" ? (
            <>
              <MailWarning className="mx-auto size-6 text-destructive" aria-hidden="true" />
              <ResendConfirmation />
              <Link to="/auth" className="inline-block min-h-11 py-2 text-sm text-primary hover:underline">
                {t("auth.backToSignIn")}
              </Link>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
