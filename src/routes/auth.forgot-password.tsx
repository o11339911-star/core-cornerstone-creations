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
import { passwordResetUrl } from "@/lib/auth-origin";
import { isValidSaudiId, looksLikeEmail, normalizeNationalId } from "@/lib/identity-format";
import { requestPasswordResetFn } from "@/lib/auth-identity.functions";

/** بريد إلكتروني صالح أو هوية سعودية من عشرة أرقام بعد التطبيع إلى ASCII. */
const forgotSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .refine((v) =>
      looksLikeEmail(v)
        ? z.string().email().safeParse(v).success
        : isValidSaudiId(normalizeNationalId(v)),
    ),
});

type ForgotForm = z.infer<typeof forgotSchema>;

/** رسالة موحّدة لا تكشف وجود الحساب ولا البريد المرتبط. */
const NEUTRAL_MESSAGE = "إذا كان الحساب موجودًا فسيصل رابط الاستعادة إلى البريد المرتبط.";

export const Route = createFileRoute("/auth/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const t = useT();
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { identifier: "" },
  });

  const onSubmit = async (values: ForgotForm) => {
    setNotice(null);
    setSubmitting(true);

    // البريد أو الهوية يُحلّان داخل الخادم فقط؛ المتصفح لا يعرف البريد المرتبط.
    const identifier = looksLikeEmail(values.identifier)
      ? values.identifier.trim()
      : normalizeNationalId(values.identifier);

    try {
      const result = await requestPasswordResetFn({
        data: { identifier, redirectTo: passwordResetUrl() },
      });
      setSubmitting(false);
      if (!result.ok) {
        setNotice("محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.");
        return;
      }
    } catch {
      // حتى الأخطاء الخادمية تُعرض بالرسالة الموحّدة نفسها.
      setSubmitting(false);
    }

    setSent(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-card">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("auth.forgotTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              أدخل البريد الإلكتروني أو رقم الهوية المرتبط بحسابك.
            </p>
          </div>

          {sent ? (
            <div className="flex items-start gap-3 rounded-md bg-primary/10 p-4 text-sm text-foreground">
              <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{NEUTRAL_MESSAGE}</span>
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
              <div className="space-y-2">
                <Label htmlFor="identifier">البريد الإلكتروني أو رقم الهوية</Label>
                <Input
                  id="identifier"
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  dir="ltr"
                  className="h-11"
                  aria-describedby="forgot-hint"
                  aria-invalid={Boolean(form.formState.errors.identifier)}
                  {...form.register("identifier")}
                />
                <p id="forgot-hint" className="text-xs text-muted-foreground">
                  رقم الهوية عشرة أرقام يبدأ بـ 1 أو 2.
                </p>
                {form.formState.errors.identifier ? (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    أدخل بريدًا إلكترونيًا صحيحًا أو رقم هوية صحيحًا.
                  </p>
                ) : null}
              </div>

              {notice ? (
                <div
                  role="alert"
                  className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {notice}
                </div>
              ) : null}

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
