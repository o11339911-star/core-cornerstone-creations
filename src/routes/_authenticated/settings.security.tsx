import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, HeroBadge, PageHero, SectionCard } from "@/components/rakeez";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export const Route = createFileRoute("/_authenticated/settings/security")({
  component: SecuritySettingsPage,
  errorComponent: ErrorState,
});

function SecuritySettingsPage() {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ChangePasswordForm) => {
    setError(null);
    setSuccess(false);
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setError(t("auth.invalidCredentials"));
      setSubmitting(false);
      return;
    }

    // Verify the current password first.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: values.currentPassword,
    });

    if (signInError) {
      setError(t("auth.invalidCredentials"));
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: values.password,
    });

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    form.reset();
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-md space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title={t("common.security")}
        subtitle={t("auth.resetSubtitle")}
        badge={<HeroBadge tone="neutral">ركيز</HeroBadge>}
      />

      <SectionCard icon={ShieldCheck} title={t("auth.updatePassword")}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t("auth.currentPassword")}</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              className="min-h-11"
              {...form.register("currentPassword")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.newPassword")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              className="min-h-11"
              {...form.register("password")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              className="min-h-11"
              {...form.register("confirmPassword")}
            />
          </div>

          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {success && (
            <div className="rounded-md bg-success-soft p-3 text-sm text-success">
              {t("auth.passwordUpdated")}
            </div>
          )}

          <Button type="submit" className="min-h-11 w-full" disabled={submitting}>
            {submitting ? t("common.loading") : t("auth.updatePassword")}
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
