import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

/**
 * صفحة تعيين كلمة مرور جديدة.
 *
 * تصل إليها الروابط من بريد Supabase بأشكال مختلفة: `code` (PKCE)، أو
 * `token_hash`/`token` مع `type=recovery`، أو hash ضمني يحتوي access/refresh.
 * تُستهلك القيم هنا لإنشاء جلسة استرداد قبل تمكين زر التحديث، ثم تُمسح من
 * شريط العنوان فورًا. لا يُسجَّل أي رمز ولا يُرسل إلى أي جهة.
 */

const resetSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

type ResetForm = z.infer<typeof resetSchema>;

type Phase = "preparing" | "ready" | "expired" | "invalid" | "done";

export const Route = createFileRoute("/auth/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function isExpiredMessage(message: string): boolean {
  return /expired|already been used|invalid.*(otp|token)|otp_expired/i.test(message);
}

function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [phase, setPhase] = React.useState<Phase>("preparing");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const ran = React.useRef(false);

  const form = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const establish = async () => {
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);

      const failure =
        query.get("error_description") ??
        query.get("error") ??
        hash.get("error_description") ??
        hash.get("error");
      const code = query.get("code");
      const tokenHash = query.get("token_hash") ?? query.get("token");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      // امسح كل رمز من شريط العنوان قبل أي عملية أخرى.
      window.history.replaceState({}, "", "/auth/reset-password");

      if (failure) {
        setPhase(isExpiredMessage(failure) ? "expired" : "invalid");
        return;
      }

      try {
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) {
            setPhase(isExpiredMessage(sessionError.message) ? "expired" : "invalid");
            return;
          }
        } else if (tokenHash) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          });
          if (otpError) {
            setPhase(isExpiredMessage(otpError.message) ? "expired" : "invalid");
            return;
          }
        } else if (code) {
          const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
          if (codeError) {
            setPhase(isExpiredMessage(codeError.message) ? "expired" : "invalid");
            return;
          }
        }

        // قد يكون العميل قد التقط الرابط تلقائيًا (detectSessionInUrl) أو تكون
        // هناك جلسة استرداد سارية بالفعل: تحقق مع مهلة قصيرة قبل الحكم.
        let user = (await supabase.auth.getUser()).data.user;
        if (!user) {
          await new Promise((resolve) => window.setTimeout(resolve, 700));
          user = (await supabase.auth.getUser()).data.user;
        }

        setPhase(user ? "ready" : "expired");
      } catch {
        setPhase("invalid");
      }
    };

    void establish();
  }, []);

  const onSubmit = async (values: ResetForm) => {
    setError(null);
    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setSubmitting(false);
      setPhase("expired");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: values.password,
    });
    setSubmitting(false);

    if (updateError) {
      if (/session|jwt|missing/i.test(updateError.message)) {
        setPhase("expired");
        return;
      }
      setError(t("auth.resetUpdateFailed"));
      return;
    }

    setPhase("done");
    window.setTimeout(() => navigate({ to: "/select-account", replace: true }), 1500);
  };

  const passwordError = form.formState.errors.password;
  const confirmError = form.formState.errors.confirmPassword;
  const blocked = phase === "expired" || phase === "invalid";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-card">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("auth.resetTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {phase === "preparing"
                ? t("auth.resetPreparing")
                : phase === "ready"
                  ? t("auth.resetReady")
                  : t("auth.resetSubtitle")}
            </p>
          </div>

          {phase === "preparing" ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
            </div>
          ) : null}

          {blocked ? (
            <div className="space-y-4">
              <div
                role="alert"
                className="flex items-start gap-3 rounded-md bg-destructive/10 p-4 text-sm text-destructive"
              >
                <MailWarning className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <span>
                  {phase === "expired" ? t("auth.resetLinkExpired") : t("auth.resetLinkInvalid")}
                </span>
              </div>
              <Button asChild className="min-h-11 w-full">
                <Link to="/auth/forgot-password">{t("auth.requestNewResetLink")}</Link>
              </Button>
            </div>
          ) : null}

          {phase === "done" ? (
            <div className="flex items-start gap-3 rounded-md bg-primary/10 p-4 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{t("auth.passwordUpdated")}</span>
            </div>
          ) : null}

          {phase === "ready" ? (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.newPassword")}</Label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(passwordError)}
                  {...form.register("password")}
                />
                {passwordError ? (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {t("auth.passwordTooShort")}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  aria-invalid={Boolean(confirmError)}
                  {...form.register("confirmPassword")}
                />
                {confirmError ? (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {t("auth.passwordMismatch")}
                  </p>
                ) : null}
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {error}
                </div>
              )}

              <Button type="submit" className="min-h-11 w-full" disabled={submitting}>
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {t("common.loading")}
                  </span>
                ) : (
                  t("auth.updatePassword")
                )}
              </Button>
            </form>
          ) : null}

          <div className="text-center text-sm">
            <Link
              to="/auth"
              className="inline-flex min-h-11 items-center py-2 text-primary hover:underline"
            >
              {t("auth.backToSignIn")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
