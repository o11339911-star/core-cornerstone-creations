import * as React from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { authCallbackUrl } from "@/lib/auth-origin";
import { toLatinDigits } from "@/lib/format";

const COOLDOWN_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Real "resend confirmation e-mail" control.
 * Uses Supabase Auth `resend` with the official in-app callback URL and a
 * client-side cooldown on top of Supabase's own rate limiting.
 */
export function ResendConfirmation({ email: initialEmail = "" }: { email?: string }) {
  const t = useT();
  const [email, setEmail] = React.useState(initialEmail);
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSent(false);

    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError(t("auth.invalidEmail"));
      return;
    }
    if (cooldown > 0) return;

    setPending(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: value,
      options: { emailRedirectTo: authCallbackUrl() },
    });
    setPending(false);

    if (resendError) {
      setError(
        resendError.status === 429 ? t("auth.resendTooMany") : t("auth.resendFailed"),
      );
      setCooldown(COOLDOWN_SECONDS);
      return;
    }

    setSent(true);
    setCooldown(COOLDOWN_SECONDS);
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="space-y-1.5 text-start">
        <Label htmlFor="resend-email" className="text-sm">
          {t("auth.email")}
        </Label>
        <Input
          id="resend-email"
          type="email"
          dir="ltr"
          className="h-11"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(toLatinDigits(event.target.value))}
          aria-invalid={Boolean(error)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p role="status" className="text-xs font-medium text-primary">
          {t("auth.resendSent")}
        </p>
      ) : null}

      <Button type="submit" className="min-h-11 w-full" disabled={pending || cooldown > 0}>
        {pending ? (
          <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="me-2 size-4" aria-hidden="true" />
        )}
        {cooldown > 0
          ? t("auth.resendWait").replace("{seconds}", String(cooldown))
          : t("auth.resend")}
      </Button>
    </form>
  );
}
