import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

const forgotSchema = z.object({
  email: z.string().email(),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export const Route = createFileRoute("/auth/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const t = useT();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotForm) => {
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setSubmitting(false);

    if (error) {
      // Don't leak whether the email exists.
      setSent(true);
      return;
    }

    setSent(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-card">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("auth.forgotTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("auth.forgotSubtitle")}</p>
          </div>

          {sent ? (
            <div className="flex items-start gap-3 rounded-md bg-primary/10 p-4 text-sm text-foreground">
              <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{t("auth.resetSent")}</span>
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  dir="ltr"
                  className="h-11"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register("email")}
                />
                {form.formState.errors.email ? (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    البريد الإلكتروني غير صالح.
                  </p>
                ) : null}
              </div>

              <Button type="submit" className="min-h-11 w-full" disabled={submitting}>
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {t("common.loading")}
                  </span>
                ) : (
                  t("auth.sendResetLink")
                )}
              </Button>
            </form>
          )}

          <div className="text-center text-sm">
            <Link to="/auth" className="inline-flex min-h-11 items-center py-2 text-primary hover:underline">
              {t("auth.backToSignIn")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
